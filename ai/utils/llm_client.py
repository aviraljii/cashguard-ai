"""
CashGuard-AI LLM Client

Provides a small provider-compatible client for Ollama.

Supported environment variables:
    OLLAMA_API_KEY
    OLLAMA_BASE_URL
    OLLAMA_MODEL

Also supports:
    LLM_API_KEY
    LLM_BASE_URL
    LLM_MODEL

Secrets are never logged or returned in errors.
"""

from __future__ import annotations

import json
import os
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


class LLMUnavailableError(RuntimeError):
    """Raised when the LLM provider cannot be reached/configured."""


class LLMResponseError(RuntimeError):
    """Raised when the LLM provider returns an invalid response."""


def _clean_url(value: str | None) -> str:
    """
    Normalize the configured Ollama URL.

    Accepted examples:

        https://ollama.com
        https://ollama.com/
        https://ollama.com/api
        https://ollama.com/api/
    """

    url = (value or "").strip().rstrip("/")

    if not url:
        return "https://ollama.com/api"

    if url.endswith("/api"):
        return url

    return f"{url}/api"


def _safe_error_body(body: str) -> str:
    """
    Return a compact provider error without exposing secrets.
    """

    text = (body or "").strip()

    if not text:
        return "Provider returned an empty error response."

    # Keep logs/errors compact.
    if len(text) > 1000:
        text = text[:1000] + "... [truncated]"

    # Never expose common secret-like headers/fields.
    sensitive_keys = (
        "api_key",
        "apikey",
        "authorization",
        "token",
        "password",
        "secret",
    )

    try:
        parsed: Any = json.loads(text)

        def redact(value: Any) -> Any:
            if isinstance(value, dict):
                result: dict[str, Any] = {}

                for key, item in value.items():
                    key_lower = str(key).lower()

                    if any(
                        sensitive in key_lower
                        for sensitive in sensitive_keys
                    ):
                        result[key] = "***REDACTED***"
                    else:
                        result[key] = redact(item)

                return result

            if isinstance(value, list):
                return [redact(item) for item in value]

            return value

        return json.dumps(
            redact(parsed),
            ensure_ascii=False,
        )

    except json.JSONDecodeError:
        # Basic masking for non-JSON text.
        lowered = text.lower()

        for keyword in (
            "authorization:",
            "bearer ",
            "api_key=",
            "apikey=",
            "token=",
        ):
            index = lowered.find(keyword)

            if index >= 0:
                end = text.find(
                    "\n",
                    index,
                )

                if end < 0:
                    end = len(text)

                text = (
                    text[:index]
                    + keyword
                    + "***REDACTED***"
                    + text[end:]
                )

        return text


class LLMClient:
    """
    Lightweight Ollama API client.

    The client performs a real /api/chat request.
    """

    def __init__(
        self,
        api_key: str | None = None,
        model: str | None = None,
        base_url: str | None = None,
        timeout: int = 60,
    ) -> None:

        # ------------------------------------------------------
        # API KEY
        # ------------------------------------------------------

        self.api_key = (
            api_key
            or os.getenv("OLLAMA_API_KEY")
            or os.getenv("LLM_API_KEY")
        )

        # ------------------------------------------------------
        # MODEL
        # ------------------------------------------------------

        self.model = (
            model
            or os.getenv("OLLAMA_MODEL")
            or os.getenv("LLM_MODEL")
            or "gpt-oss:20b"
        ).strip()

        # ------------------------------------------------------
        # BASE URL
        # ------------------------------------------------------

        configured_base_url = (
            base_url
            or os.getenv("OLLAMA_BASE_URL")
            or os.getenv("LLM_BASE_URL")
            or "https://ollama.com/api"
        )

        self.base_url = _clean_url(
            configured_base_url
        )

        # ------------------------------------------------------
        # TIMEOUT
        # ------------------------------------------------------

        self.timeout = max(
            int(timeout),
            5,
        )

    # ==========================================================
    # HELPERS
    # ==========================================================

    def _chat_url(self) -> str:
        """
        Return the final Ollama chat endpoint.
        """

        return f"{self.base_url}/chat"

    def _build_payload(
        self,
        prompt: str,
    ) -> dict[str, Any]:
        """
        Build the Ollama chat request body.
        """

        clean_prompt = (
            prompt
            if isinstance(prompt, str)
            else str(prompt)
        ).strip()

        if not clean_prompt:
            raise ValueError(
                "LLM prompt cannot be empty."
            )

        return {
            "model": self.model,
            "messages": [
                {
                    "role": "user",
                    "content": clean_prompt,
                }
            ],
            "stream": False,
            "format": "json",
        }

    # ==========================================================
    # COMPLETE
    # ==========================================================

    def complete(
        self,
        prompt: str,
    ) -> str:
        """
        Send a prompt to Ollama and return the
        assistant content as a string.
        """

        # ------------------------------------------------------
        # CONFIGURATION VALIDATION
        # ------------------------------------------------------

        if not self.api_key:
            raise LLMUnavailableError(
                "Ollama API key is not configured. "
                "Set OLLAMA_API_KEY."
            )

        if not self.model:
            raise LLMUnavailableError(
                "LLM model is not configured."
            )

        # ------------------------------------------------------
        # REQUEST BODY
        # ------------------------------------------------------

        try:
            payload = self._build_payload(
                prompt
            )

            body = json.dumps(
                payload,
                ensure_ascii=False,
            ).encode("utf-8")

        except (TypeError, ValueError) as exc:
            raise LLMResponseError(
                f"Unable to build LLM request: {exc}"
            ) from exc

        # ------------------------------------------------------
        # HTTP REQUEST
        # ------------------------------------------------------

        request = Request(
            self._chat_url(),
            data=body,
            headers={
                "Authorization": (
                    f"Bearer {self.api_key}"
                ),
                "Content-Type": "application/json",
                "Accept": "application/json",
                "User-Agent": "CashGuard-AI/1.0",
            },
            method="POST",
        )

        # ------------------------------------------------------
        # PROVIDER CALL
        # ------------------------------------------------------

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
                    .strip()
                )

                http_status = getattr(
                    response,
                    "status",
                    200,
                )

        except HTTPError as exc:

            error_body = exc.read().decode(
                "utf-8",
                errors="replace",
            )

            safe_body = _safe_error_body(
                error_body
            )

            # Authentication/permission errors.
            if exc.code in (
                401,
                403,
            ):
                raise LLMUnavailableError(
                    "Ollama authentication failed "
                    f"(HTTP {exc.code}). "
                    "Check OLLAMA_API_KEY and model access."
                ) from None

            # Rate limit.
            if exc.code == 429:
                raise LLMUnavailableError(
                    "Ollama rate limit/quota was reached "
                    "(HTTP 429)."
                ) from None

            # Temporary provider errors.
            if exc.code >= 500:
                raise LLMUnavailableError(
                    "Ollama provider returned "
                    f"HTTP {exc.code}: {safe_body}"
                ) from None

            # Other API errors.
            raise LLMResponseError(
                "Ollama API returned "
                f"HTTP {exc.code}: {safe_body}"
            ) from None

        except URLError as exc:

            reason = getattr(
                exc,
                "reason",
                str(exc),
            )

            raise LLMUnavailableError(
                f"Unable to connect to Ollama API: {reason}"
            ) from None

        except TimeoutError:

            raise LLMUnavailableError(
                "Ollama API request timed out."
            ) from None

        except OSError as exc:

            raise LLMUnavailableError(
                f"Network error while calling Ollama API: {exc}"
            ) from None

        # ------------------------------------------------------
        # EMPTY RESPONSE
        # ------------------------------------------------------

        if not raw_response:
            raise LLMResponseError(
                "Ollama returned an empty response."
            )

        # ------------------------------------------------------
        # JSON RESPONSE
        # ------------------------------------------------------

        try:

            data = json.loads(
                raw_response
            )

        except json.JSONDecodeError as exc:

            raise LLMResponseError(
                "Ollama returned a non-JSON response."
            ) from exc

        # ------------------------------------------------------
        # PROVIDER ERROR PAYLOAD
        # ------------------------------------------------------

        if isinstance(data, dict):

            provider_error = data.get(
                "error"
            )

            if provider_error:
                raise LLMResponseError(
                    "Ollama returned an error: "
                    f"{_safe_error_body(str(provider_error))}"
                )

        # ------------------------------------------------------
        # EXPECTED OLLAMA RESPONSE
        #
        # Typical:
        #
        # {
        #   "message": {
        #       "role": "assistant",
        #       "content": "..."
        #   }
        # }
        # ------------------------------------------------------

        content: Any = None

        if isinstance(data, dict):

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

            # Additional compatible response shapes.
            if content is None:
                content = data.get(
                    "content"
                )

            if content is None:
                content = data.get(
                    "response"
                )

        # ------------------------------------------------------
        # CONTENT VALIDATION
        # ------------------------------------------------------

        if not isinstance(
            content,
            str,
        ):
            raise LLMResponseError(
                "Unexpected Ollama response format. "
                "Assistant content was not found."
            )

        content = content.strip()

        if not content:
            raise LLMResponseError(
                "Ollama returned empty assistant content."
            )

        # ------------------------------------------------------
        # SUCCESS
        # ------------------------------------------------------

        return content


# ==============================================================
# BACKWARD-COMPATIBLE DEFAULT CLIENT
# ==============================================================

default_llm_client = LLMClient()