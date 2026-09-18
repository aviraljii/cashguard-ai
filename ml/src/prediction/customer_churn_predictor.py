"""Point-in-time customer churn prediction."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import joblib

from ml.src.features.customer_churn_dataset import load_current_customer_features


def risk_category(churn_probability: float) -> str:
    """Operational priority bands for an uncalibrated model probability."""
    if churn_probability < .34:
        return "Low"
    if churn_probability < .67:
        return "Medium"
    return "High"


class CustomerChurnPredictor:
    """Load the selected churn model and rebuild current customer features."""

    def __init__(self, model_path: str | Path, metadata_path: str | Path | None = None):
        self.model_path = Path(model_path)
        if not self.model_path.exists():
            raise FileNotFoundError(f"Model file not found: {self.model_path}")
        self.model = joblib.load(self.model_path)
        metadata_path = Path(metadata_path) if metadata_path else self.model_path.with_name("customer_churn_metadata.json")
        if not metadata_path.exists():
            raise FileNotFoundError(f"Metadata file not found: {metadata_path}")
        self.metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        self.features = self.metadata["feature_columns"]

    def predict(self, customer_id: str) -> dict[str, Any]:
        features = load_current_customer_features(customer_id)
        probability = float(self.model.predict_proba(features[self.features])[:, 1][0])
        return {
            "customer_id": str(customer_id),
            "churn_probability": round(probability, 6),
            "churn_score": round(probability * 100, 2),
            "risk_category": risk_category(probability),
        }
