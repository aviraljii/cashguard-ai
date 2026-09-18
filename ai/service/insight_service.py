from __future__ import annotations

import json
import logging
from typing import Any

from ai.prompts import PROMPTS
from ai.schemas.insight_schemas import Insight
from ai.utils.llm_client import (
    LLMClient,
    LLMResponseError,
    LLMUnavailableError,
)


# ============================================================================
# LOGGING
# ============================================================================

logger = logging.getLogger("cashguard.ai.insight_service")


# ============================================================================
# SERVICE
# ============================================================================

class InsightService:
    """
    CashGuard-AI structured insight generation service.

    Flow:
        frontend intelligence payload
            ↓
        domain-specific prompt
            ↓
        LLM
            ↓
        JSON parsing
            ↓
        normalization
            ↓
        Pydantic validation
            ↓
        Insight response
    """

    def __init__(
        self,
        client: LLMClient | None = None,
    ) -> None:
        self.client = client or LLMClient()

    # ------------------------------------------------------------------------
    # PUBLIC
    # ------------------------------------------------------------------------

    def generate(
        self,
        domain: str,
        intelligence: dict[str, Any],
    ) -> Insight:
        """
        Generate a validated structured insight.

        Raises:
            ValueError:
                Invalid request/domain/intelligence.

            LLMResponseError:
                Invalid or malformed LLM response.

            LLMUnavailableError:
                LLM provider unavailable.
        """

        # --------------------------------------------------------------------
        # INPUT VALIDATION
        # --------------------------------------------------------------------

        if not isinstance(
            intelligence,
            dict,
        ):
            raise ValueError(
                "intelligence must be an object."
            )

        if not intelligence:
            raise ValueError(
                "intelligence must be a non-empty object."
            )

        domain = str(
            domain
        ).strip()

        if not domain:
            raise ValueError(
                "domain must be provided."
            )

        if domain not in PROMPTS:
            raise ValueError(
                f"Unsupported AI insight domain: {domain}."
            )

        # --------------------------------------------------------------------
        # PROMPT RESOLUTION
        # --------------------------------------------------------------------

        prompt_builder = PROMPTS.get(
            domain,
        )

        if not callable(
            prompt_builder,
        ):
            raise ValueError(
                f"AI prompt is not configured for domain: {domain}."
            )

        try:
            prompt = prompt_builder(
                intelligence,
            )

        except Exception as exc:
            logger.exception(
                "Failed to build AI prompt | domain=%s",
                domain,
            )

            raise LLMResponseError(
                "Unable to build AI insight prompt."
            ) from exc

        # --------------------------------------------------------------------
        # LLM CALL
        # --------------------------------------------------------------------

        try:
            raw_response = self.client.complete(
                prompt,
            )

        except LLMUnavailableError:
            logger.error(
                "LLM unavailable | domain=%s",
                domain,
            )
            raise

        except LLMResponseError:
            logger.exception(
                "LLM client response error | domain=%s",
                domain,
            )
            raise

        except Exception as exc:
            logger.exception(
                "Unexpected LLM client error | domain=%s",
                domain,
            )

            raise LLMResponseError(
                "AI service failed while generating insight."
            ) from exc

        # --------------------------------------------------------------------
        # BASIC RESPONSE CHECK
        # --------------------------------------------------------------------

        if raw_response is None:
            raise LLMResponseError(
                "LLM returned an empty response."
            )

        if not isinstance(
            raw_response,
            str,
        ):
            raw_response = str(
                raw_response,
            )

        raw_response = raw_response.strip()

        if not raw_response:
            raise LLMResponseError(
                "LLM returned an empty response."
            )

        logger.debug(
            "LLM raw response | domain=%s | response=%s",
            domain,
            raw_response,
        )

        # --------------------------------------------------------------------
        # JSON EXTRACTION
        # --------------------------------------------------------------------

        parsed = self._parse_json_response(
            raw_response,
            domain,
        )

        # --------------------------------------------------------------------
        # NORMALIZATION
        # --------------------------------------------------------------------

        normalized = self._normalize_insight_payload(
            parsed,
            domain,
        )

        # --------------------------------------------------------------------
        # PYDANTIC VALIDATION
        # --------------------------------------------------------------------

        try:
            insight = Insight.model_validate(
                normalized,
            )

        except Exception as exc:
            logger.exception(
                (
                    "LLM insight validation failed "
                    "| domain=%s | payload=%s"
                ),
                domain,
                normalized,
            )

            raise LLMResponseError(
                "LLM returned an invalid structured insight."
            ) from exc

        return insight

    # ------------------------------------------------------------------------
    # JSON PARSER
    # ------------------------------------------------------------------------

    def _parse_json_response(
        self,
        raw_response: str,
        domain: str,
    ) -> dict[str, Any]:
        """
        Parse JSON safely.

        Supports:
            plain JSON
            ```json ... ```
            ``` ... ```
        """

        cleaned = (
            raw_response
            .strip()
        )

        # Remove markdown fences.
        if cleaned.startswith(
            "```"
        ):
            lines = cleaned.splitlines()

            if lines:
                lines = lines[1:]

            if (
                lines and
                lines[-1].strip().startswith(
                    "```"
                )
            ):
                lines = lines[:-1]

            cleaned = "\n".join(
                lines
            ).strip()

        # Remove accidental leading/trailing prose around JSON.
        if not (
            cleaned.startswith("{")
            and cleaned.endswith("}")
        ):
            start = cleaned.find("{")
            end = cleaned.rfind("}")

            if (
                start != -1
                and end != -1
                and end > start
            ):
                cleaned = cleaned[
                    start:end + 1
                ]

        try:
            data = json.loads(
                cleaned,
            )

        except json.JSONDecodeError as exc:
            logger.error(
                (
                    "Malformed LLM JSON "
                    "| domain=%s | raw=%s"
                ),
                domain,
                raw_response,
            )

            raise LLMResponseError(
                "LLM returned malformed JSON."
            ) from exc

        if not isinstance(
            data,
            dict,
        ):
            raise LLMResponseError(
                "LLM returned JSON, but the top-level value is not an object."
            )

        return data

    # ------------------------------------------------------------------------
    # NORMALIZER
    # ------------------------------------------------------------------------

    def _normalize_insight_payload(
        self,
        payload: dict[str, Any],
        domain: str,
    ) -> dict[str, Any]:
        """
        Normalize flexible LLM output into the Insight schema.

        This protects the API from common LLM formatting differences.
        """

        # Some models wrap the actual insight.
        if (
            isinstance(
                payload.get("insight"),
                dict,
            )
        ):
            payload = {
                **payload,
                **payload["insight"],
            }

        # Some models return `analysis`, `message`, etc.
        summary = self._first_text(
            payload,
            [
                "summary",
                "insight",
                "analysis",
                "overview",
                "message",
                "text",
            ],
        )

        confidence_note = self._first_text(
            payload,
            [
                "confidence_note",
                "confidenceNote",
                "confidence",
                "confidence_reason",
                "confidenceReason",
            ],
        )

        priority = self._optional_text(
            payload,
            [
                "priority",
                "priority_level",
                "priorityLevel",
                "severity",
            ],
        )

        risk_level = self._optional_text(
            payload,
            [
                "risk_level",
                "riskLevel",
                "risk",
            ],
        )

        trend = self._optional_text(
            payload,
            [
                "trend",
                "direction",
                "cash_flow_trend",
                "cashFlowTrend",
            ],
        )

        normalized: dict[str, Any] = {
            "domain": domain,

            "summary":
                summary
                or self._default_summary(
                    domain,
                ),

            "confidence_note":
                confidence_note
                or self._default_confidence_note(),

            "key_reasons":
                self._string_list(
                    payload,
                    [
                        "key_reasons",
                        "keyReasons",
                        "reasons",
                    ],
                ),

            "risks":
                self._string_list(
                    payload,
                    [
                        "risks",
                        "risk_factors",
                        "riskFactors",
                    ],
                ),

            "opportunities":
                self._string_list(
                    payload,
                    [
                        "opportunities",
                    ],
                ),

            "recommendations":
                self._string_list(
                    payload,
                    [
                        "recommendations",
                        "recommendation",
                    ],
                ),

            "priority":
                priority,

            "why_it_matters":
                self._optional_text(
                    payload,
                    [
                        "why_it_matters",
                        "whyItMatters",
                        "importance",
                    ],
                ),

            "collection_actions":
                self._string_list(
                    payload,
                    [
                        "collection_actions",
                        "collectionActions",
                    ],
                ),

            "trend":
                trend,

            "key_drivers":
                self._string_list(
                    payload,
                    [
                        "key_drivers",
                        "keyDrivers",
                        "drivers",
                    ],
                ),

            "inventory_risks":
                self._string_list(
                    payload,
                    [
                        "inventory_risks",
                        "inventoryRisks",
                    ],
                ),

            "why_flagged":
                self._string_list(
                    payload,
                    [
                        "why_flagged",
                        "whyFlagged",
                        "reasons_flagged",
                    ],
                ),

            "risk_level":
                risk_level,

            "recommended_actions":
                self._string_list(
                    payload,
                    [
                        "recommended_actions",
                        "recommendedActions",
                        "actions",
                        "next_actions",
                        "nextActions",
                    ],
                ),
        }

        # --------------------------------------------------------------------
        # FALLBACKS
        # --------------------------------------------------------------------

        if not normalized[
            "recommendations"
        ]:
            normalized[
                "recommendations"
            ] = self._string_list(
                payload,
                [
                    "recommended_actions",
                    "recommendedActions",
                    "actions",
                    "next_actions",
                    "nextActions",
                ],
            )

        if not normalized[
            "recommended_actions"
        ]:
            normalized[
                "recommended_actions"
            ] = list(
                normalized[
                    "recommendations"
                ]
            )

        if (
            normalized["priority"]
            is None
            and normalized[
                "risk_level"
            ]
        ):
            normalized[
                "priority"
            ] = self._priority_from_risk(
                normalized[
                    "risk_level"
                ]
            )

        if (
            normalized["risk_level"]
            is None
            and normalized[
                "priority"
            ]
        ):
            normalized[
                "risk_level"
            ] = self._risk_from_priority(
                normalized[
                    "priority"
                ]
            )

        if (
            normalized["trend"]
            is None
        ):
            normalized[
                "trend"
            ] = "stable"

        return normalized

    # ------------------------------------------------------------------------
    # VALUE HELPERS
    # ------------------------------------------------------------------------

    @staticmethod
    def _first_text(
        payload: dict[str, Any],
        keys: list[str],
    ) -> str | None:
        for key in keys:
            value = payload.get(
                key,
            )

            if isinstance(
                value,
                str,
            ):
                value = value.strip()

                if value:
                    return value

        return None

    @staticmethod
    def _optional_text(
        payload: dict[str, Any],
        keys: list[str],
    ) -> str | None:
        value = InsightService._first_text(
            payload,
            keys,
        )

        return value or None

    @staticmethod
    def _string_list(
        payload: dict[str, Any],
        keys: list[str],
    ) -> list[str]:
        for key in keys:
            value = payload.get(
                key,
            )

            if value is None:
                continue

            if isinstance(
                value,
                str,
            ):
                text = value.strip()

                if not text:
                    return []

                return [text]

            if isinstance(
                value,
                list,
            ):
                result: list[str] = []

                for item in value:
                    if isinstance(
                        item,
                        str,
                    ):
                        text = item.strip()

                        if text:
                            result.append(
                                text
                            )

                return result

        return []

    # ------------------------------------------------------------------------
    # DEFAULTS
    # ------------------------------------------------------------------------

    @staticmethod
    def _default_summary(
        domain: str,
    ) -> str:
        return (
            f"CashGuard-AI generated a "
            f"{domain.replace('_', ' ')} "
            f"analysis from the supplied business data."
        )

    @staticmethod
    def _default_confidence_note() -> str:
        return (
            "Insight generated from the currently available "
            "CashGuard-AI business data."
        )

    @staticmethod
    def _priority_from_risk(
        risk: str,
    ) -> str:
        normalized = (
            str(risk)
            .strip()
            .upper()
        )

        mapping = {
            "LOW": "LOW",
            "MEDIUM": "MEDIUM",
            "MODERATE": "MEDIUM",
            "HIGH": "HIGH",
            "CRITICAL": "CRITICAL",
        }

        return mapping.get(
            normalized,
            "MEDIUM",
        )

    @staticmethod
    def _risk_from_priority(
        priority: str,
    ) -> str:
        normalized = (
            str(priority)
            .strip()
            .upper()
        )

        mapping = {
            "LOW": "LOW",
            "MEDIUM": "MODERATE",
            "HIGH": "HIGH",
            "CRITICAL": "CRITICAL",
        }

        return mapping.get(
            normalized,
            "MODERATE",
        )