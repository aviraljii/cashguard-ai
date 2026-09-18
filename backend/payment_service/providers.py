from __future__ import annotations

import hashlib
import hmac
import os
import uuid
from typing import Protocol


# ==================================================================
# PAYMENT PROVIDER CONTRACT
# ==================================================================


class PaymentProvider(Protocol):
    """
    Common interface that every payment provider must implement.
    """

    name: str

    def create_payment(
        self,
        amount: str,
        currency: str,
        idempotency_key: str,
    ) -> tuple[str, str]:
        """
        Create a payment instruction/reference.

        Returns:
            external_payment_id
            provider_reference
        """
        ...

    def verify_webhook(
        self,
        body: bytes,
        signature: str | None,
    ) -> bool:
        """
        Verify an incoming provider webhook.
        """
        ...


# ==================================================================
# ENVIRONMENT HELPERS
# ==================================================================


def _read_env(
    key: str,
    default: str = "",
) -> str:
    """
    Read an environment variable safely.

    Handles values such as:

        PAYMENT_WEBHOOK_SECRET=abc123
        PAYMENT_WEBHOOK_SECRET="abc123"
        PAYMENT_WEBHOOK_SECRET='abc123'
    """

    value = os.getenv(
        key,
        default,
    )

    if value is None:
        return ""

    value = str(value).strip()

    # Remove matching surrounding quotes.
    if len(value) >= 2:
        if (
            value[0] == '"'
            and value[-1] == '"'
        ):
            value = value[1:-1].strip()

        elif (
            value[0] == "'"
            and value[-1] == "'"
        ):
            value = value[1:-1].strip()

    return value


# ==================================================================
# NORMALIZATION HELPERS
# ==================================================================


def _normalize_provider_name(
    name: str | None,
) -> str:
    """
    Normalize provider name.
    """

    return (
        str(name or "")
        .strip()
        .lower()
    )


def _normalize_currency(
    currency: str | None,
) -> str:
    """
    Normalize currency to uppercase.
    """

    normalized = (
        str(currency or "")
        .strip()
        .upper()
    )

    if len(normalized) != 3:
        raise ValueError(
            "Currency must be a valid 3-letter code."
        )

    return normalized


def _validate_amount(
    amount: str | None,
) -> str:
    """
    Validate that amount is present.

    Detailed decimal validation is already handled
    by PaymentCreate/Pydantic. This provider-level
    check prevents accidental empty values.
    """

    normalized = (
        str(amount or "")
        .strip()
    )

    if not normalized:
        raise ValueError(
            "Payment amount is required."
        )

    return normalized


def _validate_idempotency_key(
    idempotency_key: str | None,
) -> str:
    """
    Normalize and validate idempotency key.
    """

    normalized = (
        str(idempotency_key or "")
        .strip()
    )

    if not normalized:
        raise ValueError(
            "Idempotency-Key is required."
        )

    return normalized


# ==================================================================
# SANDBOX PAYMENT PROVIDER
# ==================================================================


class SandboxPaymentProvider:
    """
    Development/testing payment provider.

    This provider does NOT create a real payment instruction.
    It only generates deterministic-looking sandbox references
    used by the local CashGuard-AI payment workflow.
    """

    name = "sandbox"

    # --------------------------------------------------------------
    # CREATE PAYMENT
    # --------------------------------------------------------------

    def create_payment(
        self,
        amount: str,
        currency: str,
        idempotency_key: str,
    ) -> tuple[str, str]:
        """
        Create a sandbox payment reference.

        Returns:
            (
                external_payment_id,
                provider_reference,
            )
        """

        normalized_amount = _validate_amount(
            amount
        )

        normalized_currency = _normalize_currency(
            currency
        )

        normalized_idempotency_key = (
            _validate_idempotency_key(
                idempotency_key
            )
        )

        # Explicitly keep these values validated even though
        # sandbox does not send them to a real provider.
        _ = normalized_amount
        _ = normalized_currency

        external_payment_id = (
            f"sandbox_{uuid.uuid4().hex}"
        )

        provider_reference = (
            f"sandbox:{normalized_idempotency_key}"
        )

        return (
            external_payment_id,
            provider_reference,
        )

    # --------------------------------------------------------------
    # VERIFY WEBHOOK
    # --------------------------------------------------------------

    def verify_webhook(
        self,
        body: bytes,
        signature: str | None,
    ) -> bool:
        """
        Verify a sandbox webhook signature.

        Development behavior:

        If PAYMENT_WEBHOOK_SECRET is not configured,
        the sandbox webhook is accepted.

        If PAYMENT_WEBHOOK_SECRET is configured,
        the request must contain a valid HMAC-SHA256
        hexadecimal signature.
        """

        secret = _read_env(
            "PAYMENT_WEBHOOK_SECRET"
        )

        # ----------------------------------------------------------
        # No secret configured
        # ----------------------------------------------------------

        if not secret:
            return True

        # ----------------------------------------------------------
        # Validate request body
        # ----------------------------------------------------------

        if not isinstance(
            body,
            bytes,
        ):
            return False

        # ----------------------------------------------------------
        # Validate signature
        # ----------------------------------------------------------

        if not signature:
            return False

        normalized_signature = (
            str(signature)
            .strip()
        )

        if not normalized_signature:
            return False

        # Support an optional "sha256=" prefix.
        if normalized_signature.lower().startswith(
            "sha256="
        ):
            normalized_signature = (
                normalized_signature[7:].strip()
            )

        # ----------------------------------------------------------
        # Generate expected HMAC
        # ----------------------------------------------------------

        expected_signature = (
            hmac.new(
                secret.encode("utf-8"),
                body,
                hashlib.sha256,
            ).hexdigest()
        )

        # ----------------------------------------------------------
        # Constant-time comparison
        # ----------------------------------------------------------

        return hmac.compare_digest(
            expected_signature,
            normalized_signature,
        )


# ==================================================================
# PROVIDER FACTORY
# ==================================================================


def get_provider(
    name: str | None,
) -> PaymentProvider | None:
    """
    Resolve a payment provider by name.

    Currently supported:

        sandbox

    Returns:
        PaymentProvider instance
        or None when provider is unsupported.
    """

    normalized_name = (
        _normalize_provider_name(
            name
        )
    )

    if normalized_name == "sandbox":
        return SandboxPaymentProvider()

    return None


# ==================================================================
# SUPPORTED PROVIDERS
# ==================================================================


def get_supported_providers() -> list[str]:
    """
    Return the currently configured provider names.

    Useful for health checks, documentation endpoints,
    or frontend capability checks.
    """

    return [
        "sandbox",
    ]


# ==================================================================
# PROVIDER AVAILABILITY
# ==================================================================


def is_provider_supported(
    name: str | None,
) -> bool:
    """
    Return True when the provider is supported.
    """

    return (
        get_provider(name)
        is not None
    )