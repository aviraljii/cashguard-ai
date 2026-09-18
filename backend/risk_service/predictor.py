from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import joblib


# ------------------------------------------------------------------
# MODEL CONFIGURATION
# ------------------------------------------------------------------

MODEL_PATH = (
    Path(__file__).resolve().parent
    / "models"
    / "risk_model.joblib"
)


# ------------------------------------------------------------------
# PREDICTION RESULT
# ------------------------------------------------------------------

@dataclass
class RiskPrediction:
    risk_score: float
    risk_level: str
    probability: float | None
    model_version: str
    source: str


# ------------------------------------------------------------------
# CONSTANTS
# ------------------------------------------------------------------

MODEL_VERSION = "ml-model-v1"
RULE_VERSION = "rules-v1"

REQUIRED_FEATURES = (
    "payment_amount",
    "average_payment_amount",
    "amount_deviation_ratio",
    "failed_payment_count",
    "failed_payment_ratio",
    "transaction_count",
    "transaction_velocity_24h",
    "recent_transaction_count",
)


# ------------------------------------------------------------------
# HELPERS
# ------------------------------------------------------------------

def _safe_float(
    value: Any,
    default: float = 0.0,
) -> float:
    """
    Safely convert a value to float.
    """
    try:
        result = float(value)

        if result != result:  # NaN check
            return default

        return result

    except (TypeError, ValueError):
        return default


def _clamp(
    value: float,
    minimum: float,
    maximum: float,
) -> float:
    return max(
        minimum,
        min(
            value,
            maximum,
        ),
    )


def _risk_level(
    score: float,
) -> str:
    """
    Convert a 0-100 risk score into a risk level.
    """
    score = _clamp(
        score,
        0.0,
        100.0,
    )

    if score >= 80:
        return "CRITICAL"

    if score >= 60:
        return "HIGH"

    if score >= 30:
        return "MEDIUM"

    return "LOW"


# ------------------------------------------------------------------
# FALLBACK RULE-BASED SCORE
# ------------------------------------------------------------------

def _fallback_score(
    features: dict[str, float],
) -> float:
    """
    Transparent deterministic fallback.

    This is intentionally NOT represented as a trained ML prediction.
    """

    score = 0.0

    amount_deviation = _safe_float(
        features.get(
            "amount_deviation_ratio",
            0.0,
        )
    )

    failed_payment_ratio = _safe_float(
        features.get(
            "failed_payment_ratio",
            0.0,
        )
    )

    failed_payment_count = _safe_float(
        features.get(
            "failed_payment_count",
            0.0,
        )
    )

    transaction_velocity = _safe_float(
        features.get(
            "transaction_velocity_24h",
            0.0,
        )
    )

    # --------------------------------------------------------------
    # UNUSUAL PAYMENT AMOUNT
    # --------------------------------------------------------------

    if amount_deviation >= 2.0:
        score += 35

    elif amount_deviation >= 1.0:
        score += 20

    elif amount_deviation >= 0.5:
        score += 10

    # --------------------------------------------------------------
    # FAILED PAYMENT BEHAVIOR
    # --------------------------------------------------------------

    if failed_payment_ratio >= 0.5:
        score += 30

    elif failed_payment_ratio >= 0.25:
        score += 20

    elif failed_payment_ratio > 0:
        score += 10

    # --------------------------------------------------------------
    # REPEATED FAILURES
    # --------------------------------------------------------------

    if failed_payment_count >= 5:
        score += 20

    elif failed_payment_count >= 3:
        score += 10

    # --------------------------------------------------------------
    # HIGH TRANSACTION VELOCITY
    # --------------------------------------------------------------

    if transaction_velocity >= 20:
        score += 20

    elif transaction_velocity >= 10:
        score += 10

    return round(
        _clamp(
            score,
            0.0,
            100.0,
        ),
        2,
    )


# ------------------------------------------------------------------
# FEATURE VECTOR
# ------------------------------------------------------------------

def _build_feature_vector(
    features: dict[str, float],
) -> list[float]:
    """
    Build the exact feature order expected by the trained model.

    IMPORTANT:
    The order must remain aligned with model training.
    """

    return [
        _safe_float(
            features.get(
                "payment_amount",
                0.0,
            )
        ),
        _safe_float(
            features.get(
                "average_payment_amount",
                0.0,
            )
        ),
        _safe_float(
            features.get(
                "amount_deviation_ratio",
                0.0,
            )
        ),
        _safe_float(
            features.get(
                "failed_payment_count",
                0.0,
            )
        ),
        _safe_float(
            features.get(
                "failed_payment_ratio",
                0.0,
            )
        ),
        _safe_float(
            features.get(
                "transaction_count",
                0.0,
            )
        ),
        _safe_float(
            features.get(
                "transaction_velocity_24h",
                0.0,
            )
        ),
        _safe_float(
            features.get(
                "recent_transaction_count",
                0.0,
            )
        ),
    ]


# ------------------------------------------------------------------
# PROBABILITY EXTRACTION
# ------------------------------------------------------------------

def _extract_probability(
    model: Any,
    feature_vector: list[float],
) -> float | None:
    """
    Extract probability from a classifier when predict_proba exists.

    For binary classifiers, class 1 is treated as the positive/risk
    class when class information is available.

    Falls back safely to None.
    """

    if not hasattr(
        model,
        "predict_proba",
    ):
        return None

    try:
        probabilities = model.predict_proba(
            [feature_vector]
        )

        if probabilities is None:
            return None

        row = probabilities[0]

        if row is None or len(row) == 0:
            return None

        # Binary classifier with explicit classes.
        classes = getattr(
            model,
            "classes_",
            None,
        )

        if classes is not None:
            try:
                for index, class_value in enumerate(classes):
                    if str(class_value) in {
                        "1",
                        "1.0",
                        "true",
                        "True",
                        "risk",
                        "high",
                        "critical",
                    }:
                        return round(
                            _clamp(
                                float(row[index]),
                                0.0,
                                1.0,
                            ),
                            6,
                        )
            except Exception:
                pass

        # Standard binary classification fallback:
        # second class is normally the positive class.
        if len(row) >= 2:
            return round(
                _clamp(
                    float(row[1]),
                    0.0,
                    1.0,
                ),
                6,
            )

        # Single probability output.
        return round(
            _clamp(
                float(row[0]),
                0.0,
                1.0,
            ),
            6,
        )

    except Exception:
        return None


# ------------------------------------------------------------------
# MODEL PREDICTION NORMALIZATION
# ------------------------------------------------------------------

def _prediction_to_score(
    raw_prediction: Any,
    probability: float | None,
    model: Any,
) -> float:
    """
    Convert model output into a normalized 0-100 risk score.

    Supported cases:

    1. Probability-style output: 0..1
    2. Score-style output: 0..100
    3. Binary class output: 0 / 1

    For binary class models:
      class 0 -> lower risk
      class 1 -> higher risk
    """

    raw = _safe_float(
        raw_prediction,
        0.0,
    )

    classes = getattr(
        model,
        "classes_",
        None,
    )

    # --------------------------------------------------------------
    # BINARY CLASSIFICATION MODEL
    # --------------------------------------------------------------

    if classes is not None:
        try:
            class_values = list(classes)

            if len(class_values) == 2:
                if raw in {
                    _safe_float(class_values[0], -999),
                    _safe_float(class_values[1], -999),
                }:

                    # Most useful case:
                    # use positive-class probability where possible.
                    if probability is not None:
                        return round(
                            probability * 100.0,
                            2,
                        )

                    # Otherwise map positive class to 100.
                    positive_class = _safe_float(
                        class_values[1],
                        1.0,
                    )

                    if raw == positive_class:
                        return 100.0

                    return 0.0

        except Exception:
            pass

    # --------------------------------------------------------------
    # GENERIC 0..1 SCORE
    # --------------------------------------------------------------

    if 0.0 <= raw <= 1.0:
        return round(
            raw * 100.0,
            2,
        )

    # --------------------------------------------------------------
    # GENERIC 0..100 SCORE
    # --------------------------------------------------------------

    return round(
        _clamp(
            raw,
            0.0,
            100.0,
        ),
        2,
    )


# ------------------------------------------------------------------
# ML PREDICTOR
# ------------------------------------------------------------------

class RiskPredictor:
    """
    Risk prediction abstraction.

    Trained model:
        risk_service/models/risk_model.joblib

    Fallback:
        deterministic rules-based score.

    The fallback is explicitly marked as rules-based.
    """

    def __init__(
        self,
        model_path: Path = MODEL_PATH,
    ) -> None:
        self.model_path = Path(
            model_path
        )

        self.model: Any | None = None

        self.model_version = RULE_VERSION

        self._load_model()

    # ------------------------------------------------------------------
    # LOAD MODEL
    # ------------------------------------------------------------------

    def _load_model(self) -> None:
        """
        Load the trained model if available.

        API startup must never fail because the optional model artifact
        is missing or invalid.
        """

        self.model = None
        self.model_version = RULE_VERSION

        if not self.model_path.exists():
            return

        try:
            loaded_model = joblib.load(
                self.model_path
            )

            if loaded_model is None:
                return

            if not hasattr(
                loaded_model,
                "predict",
            ):
                return

            self.model = loaded_model
            self.model_version = MODEL_VERSION

        except Exception:
            self.model = None
            self.model_version = RULE_VERSION

    # ------------------------------------------------------------------
    # MODEL STATUS
    # ------------------------------------------------------------------

    @property
    def is_ml_available(self) -> bool:
        return self.model is not None

    # ------------------------------------------------------------------
    # PREDICT
    # ------------------------------------------------------------------

    def predict(
        self,
        features: dict[str, float],
    ) -> RiskPrediction:
        """
        Generate a risk prediction.

        The method first attempts the trained model.
        If the model fails at runtime, the deterministic rules fallback
        is used safely.
        """

        if not isinstance(
            features,
            dict,
        ):
            features = {}

        feature_vector = _build_feature_vector(
            features
        )

        # --------------------------------------------------------------
        # TRAINED MODEL
        # --------------------------------------------------------------

        if self.model is not None:
            try:
                prediction = self.model.predict(
                    [feature_vector]
                )

                if prediction is None or len(prediction) == 0:
                    raise ValueError(
                        "Risk model returned an empty prediction."
                    )

                raw_prediction = prediction[0]

                probability = _extract_probability(
                    self.model,
                    feature_vector,
                )

                score = _prediction_to_score(
                    raw_prediction,
                    probability,
                    self.model,
                )

                return RiskPrediction(
                    risk_score=score,
                    risk_level=_risk_level(
                        score
                    ),
                    probability=probability,
                    model_version=self.model_version,
                    source="ml",
                )

            except Exception:
                # Model exists but cannot produce a valid result.
                # Safely fall back to deterministic rules.
                pass

        # --------------------------------------------------------------
        # RULE-BASED FALLBACK
        # --------------------------------------------------------------

        score = _fallback_score(
            features
        )

        return RiskPrediction(
            risk_score=score,
            risk_level=_risk_level(
                score
            ),
            probability=None,
            model_version=RULE_VERSION,
            source="rules",
        )


# ------------------------------------------------------------------
# SINGLE SHARED PREDICTOR INSTANCE
# ------------------------------------------------------------------

predictor = RiskPredictor()