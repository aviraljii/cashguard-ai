"""Predictor for per-bank-transaction anomaly scores and evidence."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import joblib
import pandas as pd

from ml.src.features.transaction_anomaly_dataset import load_transaction_features, prepare_model_features


class TransactionAnomalyPredictor:
    """Load a persisted Isolation Forest pipeline and score one transaction ID."""

    def __init__(self, model_path: str | Path, metadata_path: str | Path | None = None):
        self.model_path = Path(model_path)
        if not self.model_path.exists():
            raise FileNotFoundError(f"Model file not found: {self.model_path}")
        self.model = joblib.load(self.model_path)
        metadata_path = Path(metadata_path) if metadata_path else self.model_path.with_name("transaction_anomaly_metadata.json")
        if not metadata_path.exists():
            raise FileNotFoundError(f"Metadata file not found: {metadata_path}")
        self.metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        self.features = self.metadata["feature_columns"]

    def _risk_category(self, score: float) -> str:
        thresholds = self.metadata["risk_score_thresholds"]
        if score >= thresholds["high"]:
            return "High"
        if score >= thresholds["medium"]:
            return "Medium"
        if score >= thresholds["low"]:
            return "Low"
        return "Normal"

    @staticmethod
    def _reasons(row: pd.Series, is_anomaly: bool) -> list[str]:
        reasons: list[str] = []
        count = float(row["historical_transaction_count_30d"] or 0)
        ratio = row["transaction_amount_relative_to_history"]
        zscore = row["transaction_amount_zscore"]
        category_share = row["category_share_of_type_30d"]
        if count >= 10 and pd.notna(ratio) and ratio >= 2:
            reasons.append(f"Amount is {float(ratio):.1f}x the preceding 30-day average for this category and direction.")
        if count >= 10 and pd.notna(zscore) and abs(float(zscore)) >= 3:
            direction = "above" if float(zscore) > 0 else "below"
            reasons.append(f"Amount is {abs(float(zscore)):.1f} historical standard deviations {direction} its prior category pattern.")
        if count >= 10 and pd.notna(category_share) and float(category_share) <= 0.05:
            reasons.append(f"This category represented only {float(category_share) * 100:.1f}% of same-direction transactions in the preceding 30 days.")
        if is_anomaly and count < 10:
            reasons.append("This category/direction has fewer than 10 prior 30-day transactions, so its historical pattern is limited.")
        if is_anomaly and not reasons:
            reasons.append("Isolation Forest found an unusual combination of the observed amount, category, direction, timing, and frequency features; no individual rule threshold was exceeded.")
        return reasons

    def predict(self, transaction_id: str) -> dict[str, Any]:
        raw = load_transaction_features()
        selected = raw.loc[raw["transaction_id"].astype(str) == str(transaction_id)]
        if selected.empty:
            raise ValueError(f"Transaction not found or is future-dated: {transaction_id}")
        row = selected.iloc[0]
        model_row = prepare_model_features(selected)
        score = float(-self.model.score_samples(model_row[self.features])[0])
        is_anomaly = score >= float(self.metadata["anomaly_score_threshold"])
        return {
            "transaction_id": str(row["transaction_id"]),
            "anomaly_score": round(score, 6),
            "is_anomaly": bool(is_anomaly),
            "risk_category": self._risk_category(score),
            "reasons": self._reasons(row, is_anomaly),
        }
