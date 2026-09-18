from __future__ import annotations

import hashlib
import hmac
import os
from typing import Protocol


class BankingProvider(Protocol):
    name: str
    def verify_webhook(self, body: bytes, signature: str | None) -> bool: ...


class SandboxBankingProvider:
    """Development adapter. It never fabricates bank accounts or transactions."""
    name = "sandbox"

    def verify_webhook(self, body: bytes, signature: str | None) -> bool:
        secret = os.getenv("BANKING_WEBHOOK_SECRET")
        if not secret:
            return True
        expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
        return bool(signature) and hmac.compare_digest(expected, signature)


def get_provider(name: str) -> BankingProvider | None:
    return SandboxBankingProvider() if name == "sandbox" else None
