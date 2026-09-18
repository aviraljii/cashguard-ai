import os
from typing import Any

import requests
from dotenv import load_dotenv

load_dotenv()


class OllamaService:
    def __init__(self) -> None:
        self.base_url = os.getenv(
            "OLLAMA_BASE_URL",
            "https://ollama.com",
        ).rstrip("/")

        self.api_key = os.getenv("OLLAMA_API_KEY")

        self.model = os.getenv(
            "OLLAMA_MODEL",
            "gpt-oss:20b",
        )

        if not self.api_key:
            raise RuntimeError(
                "OLLAMA_API_KEY is missing from .env"
            )

    def generate(
        self,
        prompt: str,
        system_prompt: str | None = None,
    ) -> dict[str, Any]:

        payload: dict[str, Any] = {
            "model": self.model,
            "prompt": prompt,
            "stream": False,
        }

        if system_prompt:
            payload["system"] = system_prompt

        response = requests.post(
            f"{self.base_url}/api/generate",
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=120,
        )

        response.raise_for_status()

        data = response.json()

        return {
            "model": data.get(
                "model",
                self.model,
            ),
            "response": data.get(
                "response",
                "",
            ),
            "done": data.get(
                "done",
                False,
            ),
        }


ollama_service = OllamaService()