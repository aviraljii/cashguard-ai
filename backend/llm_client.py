from __future__ import annotations

import json
import os
import re
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


class LLMUnavailableError(RuntimeError):
    """Raised when the LLM provider cannot be reached or configured."""

    pass


class LLMResponseError(RuntimeError):
    """Raised when the LLM provider returns an invalid or unusable response."""

    pass


class LLMClient:
    """
    Small dependency-free client for Ollama-compatible chat APIs.

    Supported environment variables:

    LLM_API_KEY
    OLLAMA_API_KEY

    LLM_MODEL
    OLLAMA_MODEL

    LLM_BASE_URL
    OLLAMA_BASE_URL
    """

    def __init__(
        self,
        api_key: str | None = None,
        model: str | None = None,
        base_url: str | None = None,
        timeout: float = 60.0,
    ) -> None:
        self.api_key = (
            api_key
            or os.getenv("LLM_API_KEY")
            or os.getenv("OLLAMA_API_KEY")
        )

        self.model = (
            model
            or os.getenv("LLM_MODEL")
            or os.getenv("OLLAMA_MODEL")
            or "gpt-oss:20b"
        ).strip()

        self.base_url = self._clean_url(
            base_url
            or os.getenv("LLM_BASE_URL")
            or os.getenv("OLLAMA_BASE_URL")
            or "https://ollama.com/api"
        )

        try:
            self.timeout = max(
                1.0,
                float(timeout),
            )
        except (
            TypeError,
            ValueError,
        ):
            self.timeout = 60.0

    # ========================================================================
    # URL
    # ========================================================================

    @staticmethod
    def _clean_url(
        url: str | None,
    ) -> str:
        value = (
            url
            or ""
        ).strip().rstrip("/")

        if not value:
            return "https://ollama.com/api"

        # Accept:
        # https://ollama.com
        # https://ollama.com/
        # https://ollama.com/api
        # https://ollama.com/api/
        if value.endswith("/api"):
            return value

        return f"{value}/api"

    # ========================================================================
    # ERROR SANITIZATION
    # ========================================================================

    @staticmethod
    def _safe_error_body(
        body: str,
    ) -> str:
        """
        Return a bounded and sanitized provider error message.

        Never intentionally expose API keys or Bearer tokens.
        """
        if not body:
            return ""

        cleaned = body

        # Remove common secret-bearing JSON/header field labels.
        for key in (
            "Authorization",
            "authorization",
            "api_key",
            "apiKey",
            "access_token",
            "accessToken",
            "token",
        ):
            cleaned = cleaned.replace(
                key,
                "[REDACTED]",
            )

        # Remove common Bearer token values.
        cleaned = re.sub(
            r"Bearer\s+[A-Za-z0-9._~+/=-]+",
            "Bearer [REDACTED]",
            cleaned,
            flags=re.IGNORECASE,
        )

        # Keep logs/errors bounded.
        return cleaned[:1000]

    # ========================================================================
    # CONFIG STATUS
    # ========================================================================

    @property
    def configured(self) -> bool:
        return bool(
            self.api_key
        )

    # ========================================================================
    # REQUEST
    # ========================================================================

    def complete(
        self,
        prompt: str,
    ) -> str:
        """
        Send one non-streaming chat request.

        Returns the assistant content as a plain string.

        Raises:
            LLMUnavailableError:
                Provider is not configured/reachable.

            LLMResponseError:
                Provider returned an unusable response.
        """
        prompt_value = (
            prompt
            or ""
        ).strip()

        if not prompt_value:
            raise ValueError(
                "LLM prompt cannot be empty."
            )

        if not self.api_key:
            raise LLMUnavailableError(
                "LLM API key is not configured."
            )

        if not self.model:
            raise LLMUnavailableError(
                "LLM model is not configured."
            )

        payload: dict[str, Any] = {
            "model": self.model,
            "messages": [
                {
                    "role": "user",
                    "content": prompt_value,
                }
            ],
            "stream": False,
            "format": "json",
        }

        try:
            body = json.dumps(
                payload,
                ensure_ascii=False,
            ).encode("utf-8")
        except (
            TypeError,
            ValueError,
        ) as exc:
            raise LLMResponseError(
                "Failed to serialize the LLM request."
            ) from exc

        request = Request(
            f"{self.base_url}/chat",
            data=body,
            headers={
                "Authorization":
                    f"Bearer {self.api_key}",
                "Content-Type":
                    "application/json",
                "Accept":
                    "application/json",
                "User-Agent":
                    "CashGuard-AI-Paisa/1.0",
            },
            method="POST",
        )

        try:
            with urlopen(
                request,
                timeout=self.timeout,
            ) as response:
                raw_response = (
                    response
                    .read()
                    .decode(
                        "utf-8",
                        errors="replace",
                    )
                )

        except HTTPError as exc:
            # Never expose provider auth details.
            if exc.code in (
                401,
                403,
            ):
                raise LLMResponseError(
                    "LLM provider authentication failed."
                ) from exc

            error_body = ""

            try:
                error_body = (
                    exc.read()
                    .decode(
                        "utf-8",
                        errors="replace",
                    )
                )
            except Exception:
                error_body = ""

            if exc.code == 429:
                raise LLMResponseError(
                    "LLM provider rate limit reached."
                ) from exc

            safe_body = self._safe_error_body(
                error_body
            )

            if safe_body:
                raise LLMResponseError(
                    "LLM provider returned "
                    f"HTTP {exc.code}: {safe_body}"
                ) from exc

            raise LLMResponseError(
                "LLM provider returned "
                f"HTTP {exc.code}."
            ) from exc

        except (
            URLError,
            ConnectionError,
        ) as exc:
            raise LLMUnavailableError(
                "Unable to connect to LLM provider."
            ) from exc

        except TimeoutError as exc:
            raise LLMUnavailableError(
                "LLM provider request timed out."
            ) from exc

        except OSError as exc:
            raise LLMUnavailableError(
                "LLM provider network request failed."
            ) from exc

        if not raw_response.strip():
            raise LLMResponseError(
                "LLM provider returned an empty response."
            )

        # ====================================================================
        # PARSE JSON
        # ====================================================================

        try:
            data = json.loads(
                raw_response
            )
        except (
            json.JSONDecodeError,
            TypeError,
        ) as exc:
            raise LLMResponseError(
                "LLM provider returned invalid JSON."
            ) from exc

        if not isinstance(
            data,
            dict,
        ):
            raise LLMResponseError(
                "LLM provider returned an unexpected JSON structure."
            )

        # ====================================================================
        # OLLAMA-COMPATIBLE RESPONSE
        # ====================================================================

        content: Any = None

        message = data.get(
            "message"
        )

        if isinstance(
            message,
            dict,
        ):
            content = message.get(
                "content"
            )

        # Generic provider format.
        if content is None:
            content = data.get(
                "content"
            )

        # Ollama legacy/non-chat format.
        if content is None:
            response_value = data.get(
                "response"
            )

            if isinstance(
                response_value,
                str,
            ):
                content = response_value

        if isinstance(
            content,
            dict,
        ):
            # Some providers may return content as an object.
            content = json.dumps(
                content,
                ensure_ascii=False,
            )

        if not isinstance(
            content,
            str,
        ):
            raise LLMResponseError(
                "Unexpected LLM response format."
            )

        result = content.strip()

        if not result:
            raise LLMResponseError(
                "LLM provider returned empty assistant content."
            )

        return result


# ============================================================================
# DEFAULT CLIENT
# ============================================================================

default_llm_client = LLMClient()