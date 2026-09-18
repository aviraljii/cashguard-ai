from __future__ import annotations

import json
import math
import os
from pathlib import Path
from typing import Any

import joblib
import mysql.connector
import pandas as pd
from dotenv import load_dotenv


# ============================================================================
# ENVIRONMENT
# ============================================================================

# payment_delay_predictor.py
#
# Path:
#   cashguard-ai/ml/src/prediction/payment_delay_predictor.py
#
# parents[0] = prediction
# parents[1] = src
# parents[2] = ml
# parents[3] = cashguard-ai

PROJECT_ROOT = Path(__file__).resolve().parents[3]

# Load the project/root .env without overriding already configured values.
load_dotenv(
    PROJECT_ROOT / ".env",
    override=False,
)


# ============================================================================
# RISK CATEGORY
# ============================================================================

def risk_category(
    probability: float,
) -> str:
    """
    Convert a probability in the range [0, 1]
    into a human-readable risk category.
    """

    try:
        probability = float(
            probability
        )
    except (
        TypeError,
        ValueError,
        OverflowError,
    ):
        probability = 0.0

    if not math.isfinite(
        probability
    ):
        probability = 0.0

    probability = max(
        0.0,
        min(
            1.0,
            probability,
        ),
    )

    if probability < 0.34:
        return "Low"

    if probability < 0.67:
        return "Medium"

    return "High"


# ============================================================================
# PAYMENT DELAY PREDICTOR
# ============================================================================

class PaymentDelayPredictor:
    """
    Payment-delay prediction service.

    The trained model and metadata are loaded once when
    the service starts.

    Supported prediction inputs:
        - internal database invoice ID
        - human-readable invoice number
        - direct feature dictionary

    No model training or retraining happens here.
    """

    def __init__(
        self,
        model_path: str | Path,
        metadata_path: str | Path | None = None,
    ) -> None:

        # --------------------------------------------------------------------
        # MODEL PATH
        # --------------------------------------------------------------------

        self.model_path = Path(
            model_path
        ).resolve()

        if not self.model_path.is_file():
            raise FileNotFoundError(
                f"Model file not found: {self.model_path}"
            )

        try:
            self.model = joblib.load(
                self.model_path
            )
        except Exception as exc:
            raise RuntimeError(
                f"Failed to load payment-delay model: {exc}"
            ) from exc

        # --------------------------------------------------------------------
        # METADATA PATH
        # --------------------------------------------------------------------

        self.metadata_path = (
            Path(
                metadata_path
            ).resolve()
            if metadata_path
            else self.model_path.with_name(
                "payment_delay_model_metadata.json"
            )
        )

        if not self.metadata_path.is_file():
            raise FileNotFoundError(
                f"Metadata file not found: {self.metadata_path}"
            )

        try:
            self.metadata = json.loads(
                self.metadata_path.read_text(
                    encoding="utf-8"
                )
            )
        except json.JSONDecodeError as exc:
            raise ValueError(
                f"Invalid metadata JSON: {self.metadata_path}"
            ) from exc
        except OSError as exc:
            raise RuntimeError(
                f"Unable to read model metadata: {exc}"
            ) from exc

        if not isinstance(
            self.metadata,
            dict,
        ):
            raise ValueError(
                "Payment-delay model metadata must be a JSON object."
            )

        # --------------------------------------------------------------------
        # FEATURE COLUMNS
        # --------------------------------------------------------------------

        raw_features = self.metadata.get(
            "feature_columns"
        )

        if (
            not isinstance(
                raw_features,
                list,
            )
            or not raw_features
        ):
            raise ValueError(
                "Payment-delay model metadata must contain "
                "a non-empty 'feature_columns' list."
            )

        self.features: list[str] = []

        for feature in raw_features:
            normalized_feature = str(
                feature
            ).strip()

            if (
                normalized_feature
                and normalized_feature
                not in self.features
            ):
                self.features.append(
                    normalized_feature
                )

        if not self.features:
            raise ValueError(
                "Payment-delay model metadata contains no valid features."
            )

        # --------------------------------------------------------------------
        # MODEL VALIDATION
        # --------------------------------------------------------------------

        if not hasattr(
            self.model,
            "predict_proba",
        ):
            raise TypeError(
                "Loaded payment-delay model does not support "
                "predict_proba()."
            )

        # Keep this for compatibility with trained sklearn estimators.
        model_classes = getattr(
            self.model,
            "classes_",
            None,
        )

        if model_classes is not None:
            try:
                if len(model_classes) < 2:
                    raise TypeError(
                        "Payment-delay model must contain at least "
                        "two prediction classes."
                    )
            except TypeError:
                raise
            except Exception:
                pass

    # =========================================================================
    # DATABASE CONNECTION
    # =========================================================================

    def _get_connection(self):
        """
        Create a MySQL database connection using environment variables.
        """

        host = os.getenv(
            "DB_HOST",
            "127.0.0.1",
        )

        try:
            port = int(
                os.getenv(
                    "DB_PORT",
                    "3406",
                )
            )
        except (
            TypeError,
            ValueError,
        ) as exc:
            raise RuntimeError(
                "DB_PORT must be a valid integer."
            ) from exc

        database = os.getenv(
            "DB_NAME",
            "cashguard_ai",
        )

        user = os.getenv(
            "DB_USER",
            "root",
        )

        password = os.getenv(
            "DB_PASSWORD",
            "",
        )

        try:
            return mysql.connector.connect(
                host=host,
                port=port,
                database=database,
                user=user,
                password=password,
                connection_timeout=10,
            )
        except mysql.connector.Error as exc:
            raise RuntimeError(
                f"Unable to connect to MySQL database: {exc}"
            ) from exc

    # =========================================================================
    # SAFE HELPERS
    # =========================================================================

    @staticmethod
    def _safe_text(
        value: Any,
        default: str = "",
    ) -> str:
        """
        Safely normalize text values.
        """

        if value is None:
            return default

        try:
            text = str(
                value
            ).strip()
        except Exception:
            return default

        return (
            text
            if text
            else default
        )

    @staticmethod
    def _safe_float(
        value: Any,
        default: float = 0.0,
    ) -> float:
        """
        Safely normalize numeric values.
        """

        try:
            number = float(
                value
            )
        except (
            TypeError,
            ValueError,
            OverflowError,
        ):
            return default

        if not math.isfinite(
            number
        ):
            return default

        return number

    # =========================================================================
    # FETCH INVOICE FEATURES
    # =========================================================================

    def get_invoice_features(
        self,
        invoice_id: str,
    ) -> dict[str, Any]:
        """
        Rebuild the same feature logic used during training
        for one invoice.

        invoice_id may be:
            - internal database ID
            - human-readable invoice number

        Example:
            INV-2026-00482

        The SQL only uses real data from MySQL.
        """

        normalized_invoice_id = self._safe_text(
            invoice_id
        )

        if not normalized_invoice_id:
            raise ValueError(
                "invoice_id is required."
            )

        query = """
        WITH payment_totals AS (
            SELECT
                invoice_id,
                SUM(amount) AS paid_amount,
                MAX(payment_date) AS last_payment_date
            FROM invoice_payments
            GROUP BY invoice_id
        ),

        labelled_invoice AS (
            SELECT
                i.id,
                i.invoice_number,
                i.customer_id,
                i.invoice_date AS as_of_date,
                i.total_amount AS invoice_amount,
                COALESCE(
                    c.payment_terms_days,
                    0
                ) AS payment_terms_days
            FROM invoices AS i
            INNER JOIN customers AS c
                ON c.id = i.customer_id
            WHERE
                (
                    CAST(i.id AS CHAR) = %s
                    OR CAST(i.invoice_number AS CHAR) = %s
                )
                AND LOWER(
                    COALESCE(
                        i.status,
                        ''
                    )
                ) <> 'void'
                AND i.invoice_date <= CURRENT_DATE
            ORDER BY
                i.invoice_date DESC
            LIMIT 1
        ),

        historical_invoices AS (
            SELECT
                li.id AS labelled_invoice_id,
                h.id AS historical_invoice_id,
                h.total_amount,
                h.due_date,
                hp.last_payment_date,

                COALESCE(
                    SUM(
                        CASE
                            WHEN ip.payment_date < li.as_of_date
                            THEN ip.amount
                            ELSE 0
                        END
                    ),
                    0
                ) AS paid_before_snapshot

            FROM labelled_invoice AS li

            INNER JOIN invoices AS h
                ON h.customer_id = li.customer_id
                AND h.invoice_date < li.as_of_date
                AND LOWER(
                    COALESCE(
                        h.status,
                        ''
                    )
                ) <> 'void'
                AND h.invoice_date <= CURRENT_DATE

            LEFT JOIN payment_totals AS hp
                ON hp.invoice_id = h.id

            LEFT JOIN invoice_payments AS ip
                ON ip.invoice_id = h.id
                AND ip.payment_date < li.as_of_date

            GROUP BY
                li.id,
                h.id,
                h.total_amount,
                h.due_date,
                hp.last_payment_date
        )

        SELECT
            li.id AS invoice_id,

            li.invoice_number,

            li.invoice_amount,

            li.payment_terms_days,

            COUNT(
                hi.historical_invoice_id
            ) AS historical_invoice_count,

            COALESCE(
                SUM(
                    hi.total_amount
                ),
                0
            ) AS historical_total_invoice_value,

            COALESCE(
                AVG(
                    hi.total_amount
                ),
                0
            ) AS historical_average_invoice_amount,

            COALESCE(
                SUM(
                    CASE
                        WHEN hi.last_payment_date IS NOT NULL
                        AND hi.last_payment_date < li.as_of_date
                        THEN 1
                        ELSE 0
                    END
                ),
                0
            ) AS historical_paid_invoice_count,

            COALESCE(
                SUM(
                    CASE
                        WHEN hi.last_payment_date IS NOT NULL
                        AND hi.last_payment_date < li.as_of_date
                        AND hi.last_payment_date > hi.due_date
                        THEN 1
                        ELSE 0
                    END
                ),
                0
            ) AS historical_late_payment_count,

            COALESCE(
                (
                    SUM(
                        CASE
                            WHEN hi.last_payment_date IS NOT NULL
                            AND hi.last_payment_date < li.as_of_date
                            AND hi.last_payment_date > hi.due_date
                            THEN 1
                            ELSE 0
                        END
                    )
                    /
                    NULLIF(
                        SUM(
                            CASE
                                WHEN hi.last_payment_date IS NOT NULL
                                AND hi.last_payment_date < li.as_of_date
                                THEN 1
                                ELSE 0
                            END
                        ),
                        0
                    )
                ),
                0
            ) AS historical_late_payment_rate,

            COALESCE(
                AVG(
                    CASE
                        WHEN hi.last_payment_date IS NOT NULL
                        AND hi.last_payment_date < li.as_of_date
                        THEN GREATEST(
                            DATEDIFF(
                                hi.last_payment_date,
                                hi.due_date
                            ),
                            0
                        )
                        ELSE 0
                    END
                ),
                0
            ) AS historical_average_payment_delay_days,

            COALESCE(
                MAX(
                    CASE
                        WHEN hi.last_payment_date IS NOT NULL
                        AND hi.last_payment_date < li.as_of_date
                        THEN GREATEST(
                            DATEDIFF(
                                hi.last_payment_date,
                                hi.due_date
                            ),
                            0
                        )
                        ELSE 0
                    END
                ),
                0
            ) AS historical_max_payment_delay_days,

            COALESCE(
                SUM(
                    GREATEST(
                        hi.total_amount
                        - hi.paid_before_snapshot,
                        0
                    )
                ),
                0
            ) AS historical_outstanding_amount,

            COALESCE(
                (
                    SUM(
                        GREATEST(
                            hi.total_amount
                            - hi.paid_before_snapshot,
                            0
                        )
                    )
                    /
                    NULLIF(
                        SUM(
                            hi.total_amount
                        ),
                        0
                    )
                ),
                0
            ) AS historical_outstanding_ratio

        FROM labelled_invoice AS li

        INNER JOIN historical_invoices AS hi
            ON hi.labelled_invoice_id = li.id

        GROUP BY
            li.id,
            li.invoice_number,
            li.invoice_amount,
            li.payment_terms_days

        HAVING
            COUNT(
                hi.historical_invoice_id
            ) >= 3
            AND
            SUM(
                CASE
                    WHEN hi.last_payment_date IS NOT NULL
                    AND hi.last_payment_date < li.as_of_date
                    THEN 1
                    ELSE 0
                END
            ) >= 2
        """

        connection = None
        cursor = None

        try:
            connection = self._get_connection()

            cursor = connection.cursor(
                dictionary=True
            )

            cursor.execute(
                query,
                (
                    normalized_invoice_id,
                    normalized_invoice_id,
                ),
            )

            row = cursor.fetchone()

            if row is None:
                raise ValueError(
                    "Invoice was not found or does not have "
                    "enough historical data for prediction: "
                    f"{normalized_invoice_id}"
                )

            result = dict(
                row
            )

            # --------------------------------------------------------------
            # Normalize DB values.
            # --------------------------------------------------------------

            numeric_columns = [
                "invoice_amount",
                "payment_terms_days",
                "historical_invoice_count",
                "historical_total_invoice_value",
                "historical_average_invoice_amount",
                "historical_paid_invoice_count",
                "historical_late_payment_count",
                "historical_late_payment_rate",
                "historical_average_payment_delay_days",
                "historical_max_payment_delay_days",
                "historical_outstanding_amount",
                "historical_outstanding_ratio",
            ]

            for column in numeric_columns:
                if column in result:
                    result[column] = self._safe_float(
                        result[column]
                    )

            return result

        except ValueError:
            raise

        except mysql.connector.Error as exc:
            raise RuntimeError(
                "Database error while loading invoice features: "
                f"{exc}"
            ) from exc

        except Exception as exc:
            raise RuntimeError(
                "Unable to load invoice features: "
                f"{exc}"
            ) from exc

        finally:
            if cursor is not None:
                try:
                    cursor.close()
                except Exception:
                    pass

            if connection is not None:
                try:
                    connection.close()
                except Exception:
                    pass

    # =========================================================================
    # FEATURE NORMALIZATION
    # =========================================================================

    def _normalize_features(
        self,
        customer_features: dict[str, Any],
    ) -> dict[str, Any]:
        """
        Normalize database/model input values into safe Python values.

        All model features are expected to be numeric unless metadata
        explicitly contains a non-numeric field.
        """

        normalized: dict[str, Any] = dict(
            customer_features
        )

        for feature in self.features:

            if feature not in normalized:
                continue

            value = normalized.get(
                feature
            )

            if value is None:
                continue

            # --------------------------------------------------------------
            # Preserve identifier/text metadata.
            # These should normally not appear in a numeric model,
            # but keeping them as text prevents accidental corruption.
            # --------------------------------------------------------------

            if feature in {
                "invoice_id",
                "invoice_number",
            }:
                normalized[feature] = self._safe_text(
                    value
                )
                continue

            # --------------------------------------------------------------
            # Numeric feature.
            # --------------------------------------------------------------

            numeric_value = self._safe_float(
                value,
                default=float("nan"),
            )

            if math.isnan(
                numeric_value
            ):
                raise ValueError(
                    f"Feature '{feature}' must be numeric. "
                    f"Received: {value!r}"
                )

            normalized[feature] = numeric_value

        return normalized

    # =========================================================================
    # PREPARE MODEL INPUT
    # =========================================================================

    def _prepare_model_input(
        self,
        customer_features: dict[str, Any],
    ) -> pd.DataFrame:
        """
        Build a one-row DataFrame in exactly the metadata feature order.
        """

        missing = [
            feature
            for feature in self.features
            if feature not in customer_features
            or customer_features.get(feature) is None
        ]

        if missing:
            raise ValueError(
                "Missing required features: "
                + ", ".join(missing)
            )

        data: dict[str, list[Any]] = {}

        for feature in self.features:
            value = customer_features.get(
                feature
            )

            if feature in {
                "invoice_id",
                "invoice_number",
            }:
                # A production numeric model should not normally contain
                # these fields. Keep explicit validation rather than silently
                # turning an identifier into meaningless numeric data.
                raise ValueError(
                    f"Identifier field '{feature}' cannot be used "
                    "as a numeric ML feature."
                )

            numeric_value = self._safe_float(
                value,
                default=float("nan"),
            )

            if math.isnan(
                numeric_value
            ):
                raise ValueError(
                    f"Feature '{feature}' contains an invalid "
                    f"numeric value: {value!r}"
                )

            data[feature] = [
                numeric_value
            ]

        model_input = pd.DataFrame(
            data,
            columns=self.features,
        )

        # Final validation.
        if model_input.empty:
            raise ValueError(
                "Prepared model input is empty."
            )

        if list(
            model_input.columns
        ) != self.features:
            raise RuntimeError(
                "Model feature order does not match metadata."
            )

        return model_input

    # =========================================================================
    # PREDICT
    # =========================================================================

    def predict(
        self,
        invoice_id: str | None = None,
        customer_features: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """
        Generate a payment-delay prediction.

        Either:
            - invoice_id
        OR:
            - customer_features

        must be supplied.
        """

        # --------------------------------------------------------------------
        # NORMALIZE INVOICE ID
        # --------------------------------------------------------------------

        normalized_invoice_id = (
            self._safe_text(
                invoice_id
            )
            if invoice_id is not None
            else None
        )

        if not normalized_invoice_id:
            normalized_invoice_id = None

        # --------------------------------------------------------------------
        # BUILD FEATURES FROM DATABASE
        # --------------------------------------------------------------------

        if normalized_invoice_id is not None:
            customer_features = (
                self.get_invoice_features(
                    normalized_invoice_id
                )
            )

        # --------------------------------------------------------------------
        # VALIDATE INPUT
        # --------------------------------------------------------------------

        if customer_features is None:
            raise ValueError(
                "Provide either invoice_id or customer_features."
            )

        if not isinstance(
            customer_features,
            dict,
        ):
            raise TypeError(
                "customer_features must be a dictionary."
            )

        # --------------------------------------------------------------------
        # NORMALIZE FEATURES
        # --------------------------------------------------------------------

        customer_features = (
            self._normalize_features(
                customer_features
            )
        )

        # --------------------------------------------------------------------
        # PREPARE MODEL INPUT
        # --------------------------------------------------------------------

        model_input = (
            self._prepare_model_input(
                customer_features
            )
        )

        # --------------------------------------------------------------------
        # MODEL PREDICTION
        # --------------------------------------------------------------------

        try:
            probabilities = (
                self.model.predict_proba(
                    model_input
                )
            )
        except Exception as exc:
            raise RuntimeError(
                "Payment-delay model prediction failed: "
                f"{exc}"
            ) from exc

        # --------------------------------------------------------------------
        # VALIDATE MODEL OUTPUT
        # --------------------------------------------------------------------

        if probabilities is None:
            raise RuntimeError(
                "Payment-delay model returned no prediction probabilities."
            )

        try:
            probability_array = list(
                probabilities
            )
        except TypeError as exc:
            raise RuntimeError(
                "Payment-delay model returned an invalid "
                "probability structure."
            ) from exc

        if not probability_array:
            raise RuntimeError(
                "Payment-delay model returned an empty prediction."
            )

        prediction_row = probability_array[0]

        try:
            row_values = list(
                prediction_row
            )
        except TypeError as exc:
            raise RuntimeError(
                "Payment-delay model returned an invalid prediction row."
            ) from exc

        if len(
            row_values
        ) < 2:
            raise RuntimeError(
                "Payment-delay model must return probabilities "
                "for both classes."
            )

        # --------------------------------------------------------------------
        # DETERMINE DELAY-RISK CLASS
        # --------------------------------------------------------------------

        risk_index = 1

        classes = getattr(
            self.model,
            "classes_",
            None,
        )

        if classes is not None:
            try:
                class_list = list(
                    classes
                )

                if len(
                    class_list
                ) >= 2:
                    # Prefer the positive / delayed class when it is
                    # represented as 1 or common positive labels.
                    positive_candidates = {
                        1,
                        "1",
                        True,
                        "true",
                        "yes",
                        "late",
                        "delayed",
                        "delay",
                        "high",
                    }

                    matched_index = None

                    for index, class_value in enumerate(
                        class_list
                    ):
                        normalized_class = str(
                            class_value
                        ).strip().lower()

                        if (
                            class_value in positive_candidates
                            or normalized_class
                            in positive_candidates
                        ):
                            matched_index = index
                            break

                    if matched_index is not None:
                        risk_index = matched_index

                    elif len(
                        class_list
                    ) == 2:
                        # Preserve conventional binary classifier behavior.
                        risk_index = 1

            except Exception:
                risk_index = 1

        if risk_index >= len(
            row_values
        ):
            risk_index = 1

        probability = self._safe_float(
            row_values[risk_index],
            default=float("nan"),
        )

        if math.isnan(
            probability
        ):
            raise RuntimeError(
                "Payment-delay model returned an invalid "
                "probability value."
            )

        probability = max(
            0.0,
            min(
                1.0,
                probability,
            ),
        )

        # --------------------------------------------------------------------
        # RESOLVE RESPONSE INVOICE ID
        # --------------------------------------------------------------------

        resolved_invoice_id = (
            normalized_invoice_id
            or self._safe_text(
                customer_features.get(
                    "invoice_id"
                )
            )
        )

        # --------------------------------------------------------------------
        # RESPONSE
        # --------------------------------------------------------------------

        risk_score = int(
            round(
                probability * 100
            )
        )

        return {
            "invoice_id": resolved_invoice_id,
            "risk_probability": round(
                probability,
                4,
            ),
            "risk_score": risk_score,
            "risk_category": risk_category(
                probability
            ),
        }