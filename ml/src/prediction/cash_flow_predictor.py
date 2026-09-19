"""
Reusable predictor for CashGuard-AI daily cash-flow forecasting.

Models:
    1. Net cash flow
    2. Cash inflow
    3. Cash outflow

The predictor:
    - Loads persisted trained models.
    - Loads model metadata.
    - Loads real historical daily cash-flow data.
    - Builds future features using the existing feature builder.
    - Adds component lag features required by inflow/outflow models.
    - Recursively forecasts 7/30/60/90 calendar days.
    - Returns structured forecast records.

IMPORTANT:
    - This module NEVER retrains models.
    - This module NEVER fabricates component values.
    - Component predictions are returned only when their
      persisted models are available.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import joblib
import pandas as pd

from ml.src.features.cash_flow_dataset import (
    TARGET,
    build_future_feature_row,
    load_daily_cash_flow,
)


# ============================================================
# SUPPORTED HORIZONS
# ============================================================

SUPPORTED_HORIZONS = (
    7,
    30,
    60,
    90,
)


# ============================================================
# MODEL FILE NAMES
# ============================================================

NET_MODEL_FILENAME = (
    "cash_flow_forecast_model.joblib"
)

INFLOW_MODEL_FILENAME = (
    "cash_flow_inflow_model.joblib"
)

OUTFLOW_MODEL_FILENAME = (
    "cash_flow_outflow_model.joblib"
)

NET_METADATA_FILENAME = (
    "cash_flow_forecast_metadata.json"
)

COMPONENT_METADATA_FILENAME = (
    "cash_flow_component_forecast_metadata.json"
)


# ============================================================
# TARGETS
# ============================================================

INFLOW_TARGET = "cash_inflow"
OUTFLOW_TARGET = "cash_outflow"

NET_TARGET = "net_cash_flow"


# ============================================================
# FALLBACK COMPONENT FEATURES
# ============================================================

# These exactly match the features used by the new
# component-model training workflow.
#
# Metadata remains the primary source of truth. These are
# only used as a safe fallback when component metadata
# is unavailable.

DEFAULT_COMPONENT_EXTRA_FEATURES = [
    "cash_inflow_lag_1",
    "cash_inflow_lag_7",
    "cash_outflow_lag_1",
    "cash_outflow_lag_7",
]


# ============================================================
# PREDICTOR
# ============================================================

class CashFlowPredictor:
    """
    Load CashGuard cash-flow forecasting models and
    recursively generate future daily forecasts.

    The net model predicts:
        net_cash_flow

    The component models predict:
        cash_inflow
        cash_outflow

    All three models are independently persisted.
    """

    def __init__(
        self,
        model_path: str | Path,
        metadata_path: str | Path | None = None,
    ) -> None:

        # ========================================================
        # NET MODEL PATH
        # ========================================================

        self.model_path = (
            Path(model_path)
            .expanduser()
            .resolve()
        )

        if not self.model_path.exists():
            raise FileNotFoundError(
                "Cash-flow net model file not found: "
                f"{self.model_path}"
            )

        if not self.model_path.is_file():
            raise ValueError(
                "Cash-flow net model path is not a file: "
                f"{self.model_path}"
            )

        # ========================================================
        # LOAD NET MODEL
        # ========================================================

        try:
            self.model = joblib.load(
                self.model_path
            )
        except Exception as exc:
            raise RuntimeError(
                "Unable to load the persisted "
                f"Cash Flow net model: {self.model_path}"
            ) from exc

        if not hasattr(
            self.model,
            "predict",
        ):
            raise TypeError(
                "Loaded Cash Flow net model does not "
                "provide a predict() method."
            )

        # ========================================================
        # NET METADATA PATH
        # ========================================================

        if metadata_path is None:
            resolved_metadata_path = (
                self.model_path.with_name(
                    NET_METADATA_FILENAME
                )
            )
        else:
            resolved_metadata_path = (
                Path(metadata_path)
                .expanduser()
                .resolve()
            )

        self.metadata_path = (
            resolved_metadata_path
        )

        if not self.metadata_path.exists():
            raise FileNotFoundError(
                "Cash-flow metadata file not found: "
                f"{self.metadata_path}"
            )

        if not self.metadata_path.is_file():
            raise ValueError(
                "Cash-flow metadata path is not a file: "
                f"{self.metadata_path}"
            )

        # ========================================================
        # LOAD NET METADATA
        # ========================================================

        self.metadata = self._load_json(
            self.metadata_path,
            "cash-flow forecast metadata",
        )

        if not isinstance(
            self.metadata,
            dict,
        ):
            raise ValueError(
                "Cash-flow forecast metadata must contain "
                "a JSON object."
            )

        # ========================================================
        # NET FEATURE COLUMNS
        # ========================================================

        feature_columns = (
            self.metadata.get(
                "feature_columns"
            )
        )

        if not isinstance(
            feature_columns,
            list,
        ):
            raise ValueError(
                "Cash-flow forecast metadata must contain "
                "a 'feature_columns' list."
            )

        if not feature_columns:
            raise ValueError(
                "Cash-flow forecast metadata contains "
                "an empty feature_columns list."
            )

        self.features = self._clean_feature_list(
            feature_columns,
            "net cash-flow",
        )

        # ========================================================
        # COMPONENT MODEL PATHS
        # ========================================================

        self.inflow_model_path = (
            self.model_path.with_name(
                INFLOW_MODEL_FILENAME
            )
        )

        self.outflow_model_path = (
            self.model_path.with_name(
                OUTFLOW_MODEL_FILENAME
            )
        )

        self.component_metadata_path = (
            self.model_path.with_name(
                COMPONENT_METADATA_FILENAME
            )
        )

        # ========================================================
        # COMPONENT MODELS
        # ========================================================

        self.inflow_model = (
            self._load_optional_model(
                self.inflow_model_path,
                "cash inflow",
            )
        )

        self.outflow_model = (
            self._load_optional_model(
                self.outflow_model_path,
                "cash outflow",
            )
        )

        # ========================================================
        # COMPONENT METADATA
        # ========================================================

        self.component_metadata: dict[
            str,
            Any,
        ] = {}

        if (
            self.component_metadata_path.exists()
            and self.component_metadata_path.is_file()
        ):
            self.component_metadata = self._load_json(
                self.component_metadata_path,
                "cash-flow component metadata",
            )

            if not isinstance(
                self.component_metadata,
                dict,
            ):
                raise ValueError(
                    "Cash-flow component metadata must "
                    "contain a JSON object."
                )

        # ========================================================
        # COMPONENT FEATURE COLUMNS
        # ========================================================

        self.inflow_features = (
            self._get_component_features(
                INFLOW_TARGET
            )
        )

        self.outflow_features = (
            self._get_component_features(
                OUTFLOW_TARGET
            )
        )

        # Both component models should use the same
        # feature schema. Validate when both are present.
        if (
            self.inflow_model is not None
            and self.outflow_model is not None
        ):
            if (
                self.inflow_features
                != self.outflow_features
            ):
                raise ValueError(
                    "Cash inflow and cash outflow models "
                    "must use the same feature column order."
                )

    # ============================================================
    # JSON HELPERS
    # ============================================================

    @staticmethod
    def _load_json(
        path: Path,
        description: str,
    ) -> dict[str, Any]:
        """Load and validate a JSON object."""

        try:
            text = path.read_text(
                encoding="utf-8"
            )

            data = json.loads(
                text
            )

        except json.JSONDecodeError as exc:
            raise ValueError(
                f"{description} contains invalid JSON: "
                f"{path}"
            ) from exc

        except OSError as exc:
            raise RuntimeError(
                f"Unable to read {description}: "
                f"{path}"
            ) from exc

        if not isinstance(
            data,
            dict,
        ):
            raise ValueError(
                f"{description} must contain a JSON object."
            )

        return data

    @staticmethod
    def _clean_feature_list(
        features: list[Any],
        label: str,
    ) -> list[str]:
        """Normalize and validate feature names."""

        cleaned: list[str] = []

        for feature in features:

            name = str(
                feature
            ).strip()

            if not name:
                raise ValueError(
                    f"{label} model metadata contains "
                    "an empty feature name."
                )

            cleaned.append(
                name
            )

        return cleaned

    # ============================================================
    # MODEL HELPERS
    # ============================================================

    @staticmethod
    def _load_optional_model(
        path: Path,
        label: str,
    ) -> Any | None:
        """
        Load an optional persisted component model.

        Missing component models are allowed for backward
        compatibility, but invalid existing files fail clearly.
        """

        if not path.exists():
            return None

        if not path.is_file():
            raise ValueError(
                f"Cash-flow {label} model path is not a file: "
                f"{path}"
            )

        try:
            model = joblib.load(
                path
            )
        except Exception as exc:
            raise RuntimeError(
                f"Unable to load the persisted "
                f"cash-flow {label} model: {path}"
            ) from exc

        if not hasattr(
            model,
            "predict",
        ):
            raise TypeError(
                f"Loaded cash-flow {label} model does not "
                "provide a predict() method."
            )

        return model

    def _get_component_features(
        self,
        target_name: str,
    ) -> list[str]:
        """
        Resolve component feature columns.

        Primary source:
            cash_flow_component_forecast_metadata.json

        Fallback:
            net model features + component lag features
        """

        target_metadata = (
            self.component_metadata.get(
                target_name
            )
        )

        # The training metadata may alternatively store
        # component information under the plain model names.
        if not isinstance(
            target_metadata,
            dict,
        ):
            if target_name == INFLOW_TARGET:
                target_metadata = (
                    self.component_metadata.get(
                        "cash_inflow"
                    )
                )

            elif target_name == OUTFLOW_TARGET:
                target_metadata = (
                    self.component_metadata.get(
                        "cash_outflow"
                    )
                )

        if isinstance(
            target_metadata,
            dict,
        ):

            feature_columns = (
                target_metadata.get(
                    "feature_columns"
                )
            )

            if isinstance(
                feature_columns,
                list,
            ) and feature_columns:

                return self._clean_feature_list(
                    feature_columns,
                    target_name,
                )

        fallback = (
            list(self.features)
            + list(
                DEFAULT_COMPONENT_EXTRA_FEATURES
            )
        )

        return fallback

    # ============================================================
    # PROPERTIES
    # ============================================================

    @property
    def target(self) -> str:
        """Return the net model target."""

        return self.metadata.get(
            "target_column",
            NET_TARGET,
        )

    @property
    def model_name(self) -> str:
        """Return the net persisted model filename."""

        return self.model_path.name

    @property
    def model_metadata(self) -> dict[str, Any]:
        """Return a safe metadata copy."""

        metadata = dict(
            self.metadata
        )

        metadata[
            "component_models_loaded"
        ] = {
            "cash_inflow": (
                self.inflow_model is not None
            ),
            "cash_outflow": (
                self.outflow_model is not None
            ),
        }

        metadata[
            "component_feature_counts"
        ] = {
            "cash_inflow": len(
                self.inflow_features
            ),
            "cash_outflow": len(
                self.outflow_features
            ),
        }

        return metadata

    # ============================================================
    # VALIDATION
    # ============================================================

    def _validate_horizon(
        self,
        horizon_days: int,
    ) -> int:
        """Validate forecast horizon."""

        if isinstance(
            horizon_days,
            bool,
        ):
            raise ValueError(
                "horizon_days must be an integer."
            )

        try:
            normalized = int(
                horizon_days
            )
        except (
            TypeError,
            ValueError,
        ) as exc:
            raise ValueError(
                "horizon_days must be an integer."
            ) from exc

        if normalized not in SUPPORTED_HORIZONS:
            supported = ", ".join(
                str(value)
                for value in SUPPORTED_HORIZONS
            )

            raise ValueError(
                "horizon_days must be one of: "
                f"{supported}."
            )

        return normalized

    def _validate_history(
        self,
        history: pd.DataFrame,
    ) -> pd.DataFrame:
        """Validate real historical daily cash-flow data."""

        if not isinstance(
            history,
            pd.DataFrame,
        ):
            raise TypeError(
                "load_daily_cash_flow() must return "
                "a pandas DataFrame."
            )

        if history.empty:
            raise ValueError(
                "Cash-flow history is empty. "
                "Historical daily records are required."
            )

        required_columns = {
            "date",
            INFLOW_TARGET,
            OUTFLOW_TARGET,
            NET_TARGET,
        }

        missing = sorted(
            required_columns
            - set(history.columns)
        )

        if missing:
            raise ValueError(
                "Cash-flow history is missing required columns: "
                + ", ".join(missing)
            )

        normalized = history.copy()

        # --------------------------------------------------------
        # DATE
        # --------------------------------------------------------

        normalized["date"] = pd.to_datetime(
            normalized["date"],
            errors="coerce",
        )

        normalized = normalized.dropna(
            subset=["date"]
        )

        if normalized.empty:
            raise ValueError(
                "Cash-flow history contains no valid dates."
            )

        if getattr(
            normalized["date"].dt,
            "tz",
            None,
        ) is not None:
            normalized["date"] = (
                normalized["date"]
                .dt.tz_localize(None)
            )

        normalized["date"] = (
            normalized["date"]
            .dt.normalize()
        )

        # --------------------------------------------------------
        # NUMERIC CASH-FLOW COLUMNS
        # --------------------------------------------------------

        for column in [
            INFLOW_TARGET,
            OUTFLOW_TARGET,
            NET_TARGET,
        ]:

            normalized[column] = pd.to_numeric(
                normalized[column],
                errors="coerce",
            )

        if normalized[
            [
                INFLOW_TARGET,
                OUTFLOW_TARGET,
                NET_TARGET,
            ]
        ].isna().any().any():

            raise ValueError(
                "Cash-flow history contains null or "
                "non-numeric cash-flow values."
            )

        # --------------------------------------------------------
        # SORT + DUPLICATES
        # --------------------------------------------------------

        normalized = (
            normalized
            .sort_values("date")
            .drop_duplicates(
                subset=["date"],
                keep="last",
            )
            .reset_index(drop=True)
        )

        # --------------------------------------------------------
        # BUSINESS ID CONSISTENCY
        # --------------------------------------------------------

        if "business_id" in normalized.columns:

            business_ids = (
                normalized[
                    "business_id"
                ]
                .dropna()
                .astype(str)
                .unique()
            )

            if len(business_ids) > 1:
                raise ValueError(
                    "Cash-flow history contains multiple business IDs."
                )

        return normalized

    # ============================================================
    # MODEL INPUT
    # ============================================================

    @staticmethod
    def _build_model_input(
        features: dict[str, Any],
        feature_columns: list[str],
    ) -> pd.DataFrame:
        """
        Build one-row DataFrame using exact persisted
        training feature order.
        """

        row = pd.DataFrame(
            [features]
        )

        missing = [
            feature
            for feature in feature_columns
            if feature not in row.columns
        ]

        if missing:
            raise ValueError(
                "Future feature builder did not return all "
                "required model features. Missing: "
                + ", ".join(missing)
            )

        return row.loc[
            :,
            feature_columns,
        ]

    def _predict_model(
        self,
        model: Any,
        features: dict[str, Any],
        feature_columns: list[str],
        label: str,
    ) -> float:
        """Run one persisted model and validate output."""

        model_input = (
            self._build_model_input(
                features,
                feature_columns,
            )
        )

        try:
            prediction = model.predict(
                model_input
            )
        except Exception as exc:
            raise RuntimeError(
                f"Cash Flow {label} model prediction failed."
            ) from exc

        if prediction is None:
            raise RuntimeError(
                f"Cash Flow {label} model returned no prediction."
            )

        if len(prediction) != 1:
            raise RuntimeError(
                f"Cash Flow {label} model must return exactly "
                "one prediction for one future day."
            )

        try:
            value = float(
                prediction[0]
            )
        except (
            TypeError,
            ValueError,
        ) as exc:
            raise RuntimeError(
                f"Cash Flow {label} model returned "
                "a non-numeric prediction."
            ) from exc

        if pd.isna(value):
            raise RuntimeError(
                f"Cash Flow {label} model returned NaN."
            )

        return round(
            value,
            2,
        )

    # ============================================================
    # COMPONENT FEATURE BUILDER
    # ============================================================

    @staticmethod
    def _historical_value(
        history: pd.DataFrame,
        column: str,
        date_value: pd.Timestamp,
    ) -> float:
        """Get an exact historical value for a date."""

        matches = history.loc[
            history["date"] == date_value,
            column,
        ]

        if matches.empty:
            raise ValueError(
                f"Historical value missing for "
                f"{column} on {date_value.date()}."
            )

        value = matches.iloc[-1]

        numeric = float(
            value
        )

        if pd.isna(numeric):
            raise ValueError(
                f"Historical {column} is NaN on "
                f"{date_value.date()}."
            )

        return numeric

    def _add_component_lags(
        self,
        features: dict[str, Any],
        history: pd.DataFrame,
        forecast_date: pd.Timestamp,
    ) -> dict[str, Any]:
        """
        Add component lag features expected by the new
        inflow/outflow models.

        For forecast date t:
            lag_1 = value at t-1
            lag_7 = value at t-7
        """

        enriched = dict(
            features
        )

        previous_day = (
            forecast_date
            - pd.Timedelta(days=1)
        )

        seven_days_before = (
            forecast_date
            - pd.Timedelta(days=7)
        )

        enriched[
            "cash_inflow_lag_1"
        ] = self._historical_value(
            history,
            INFLOW_TARGET,
            previous_day,
        )

        enriched[
            "cash_inflow_lag_7"
        ] = self._historical_value(
            history,
            INFLOW_TARGET,
            seven_days_before,
        )

        enriched[
            "cash_outflow_lag_1"
        ] = self._historical_value(
            history,
            OUTFLOW_TARGET,
            previous_day,
        )

        enriched[
            "cash_outflow_lag_7"
        ] = self._historical_value(
            history,
            OUTFLOW_TARGET,
            seven_days_before,
        )

        return enriched

    # ============================================================
    # MAIN FORECAST
    # ============================================================

    def forecast(
        self,
        horizon_days: int,
        business_id: str | None = None,
    ) -> list[dict[str, Any]]:
        """
        Generate recursive daily forecasts.

        Returns:
            forecast_date
            predicted_inflow
            predicted_outflow
            predicted_net_cash_flow
        """

        validated_horizon = (
            self._validate_horizon(
                horizon_days
            )
        )

        # ========================================================
        # LOAD REAL HISTORY
        # ========================================================

        try:
            history = load_daily_cash_flow(
                business_id
            )
        except Exception as exc:
            raise RuntimeError(
                "Unable to load real daily cash-flow "
                "history for forecasting."
            ) from exc

        history = self._validate_history(
            history
        )

        # ========================================================
        # START DATE
        # ========================================================

        last_history_date = (
            history[
                "date"
            ].iloc[-1]
        )

        next_date = (
            last_history_date
            + pd.Timedelta(days=1)
        )

        results: list[
            dict[str, Any]
        ] = []

        # ========================================================
        # RECURSIVE FORECAST
        # ========================================================

        for offset in range(
            validated_horizon
        ):

            forecast_date = (
                next_date
                + pd.Timedelta(
                    days=offset
                )
            )

            # ----------------------------------------------------
            # BUILD EXISTING BASE FEATURES
            # ----------------------------------------------------

            try:
                base_features = (
                    build_future_feature_row(
                        history,
                        forecast_date,
                    )
                )
            except Exception as exc:
                raise RuntimeError(
                    "Unable to build future Cash Flow "
                    f"features for {forecast_date.date()}."
                ) from exc

            if not isinstance(
                base_features,
                dict,
            ):
                raise TypeError(
                    "build_future_feature_row() must return "
                    "a dictionary of model features."
                )

            # ----------------------------------------------------
            # NET PREDICTION
            # ----------------------------------------------------

            predicted_net = (
                self._predict_model(
                    model=self.model,
                    features=base_features,
                    feature_columns=self.features,
                    label="net cash-flow",
                )
            )

            # ----------------------------------------------------
            # COMPONENT PREDICTIONS
            # ----------------------------------------------------

            predicted_inflow: float | None = None
            predicted_outflow: float | None = None

            if (
                self.inflow_model is not None
                and self.outflow_model is not None
            ):

                component_features = (
                    self._add_component_lags(
                        base_features,
                        history,
                        forecast_date,
                    )
                )

                predicted_inflow = (
                    self._predict_model(
                        model=self.inflow_model,
                        features=component_features,
                        feature_columns=self.inflow_features,
                        label="cash-inflow",
                    )
                )

                predicted_outflow = (
                    self._predict_model(
                        model=self.outflow_model,
                        features=component_features,
                        feature_columns=self.outflow_features,
                        label="cash-outflow",
                    )
                )

            # ----------------------------------------------------
            # RESULT
            # ----------------------------------------------------

            results.append(
                {
                    "forecast_date": (
                        forecast_date
                        .date()
                        .isoformat()
                    ),
                    "predicted_inflow": (
                        predicted_inflow
                    ),
                    "predicted_outflow": (
                        predicted_outflow
                    ),
                    "predicted_net_cash_flow": (
                        predicted_net
                    ),
                }
            )

            # ----------------------------------------------------
            # RECURSIVE HISTORY UPDATE
            # ----------------------------------------------------

            # Component predictions are inserted into future
            # history so the next forecast day can use them
            # as lag/rolling inputs.

            if predicted_inflow is None:
                future_inflow = 0.0
            else:
                future_inflow = (
                    predicted_inflow
                )

            if predicted_outflow is None:
                future_outflow = 0.0
            else:
                future_outflow = (
                    predicted_outflow
                )

            future_row: dict[str, Any] = {
                "date": forecast_date,
                INFLOW_TARGET: future_inflow,
                OUTFLOW_TARGET: future_outflow,
                NET_TARGET: predicted_net,
            }

            if "business_id" in history.columns:
                future_row["business_id"] = (
                    history[
                        "business_id"
                    ].iloc[0]
                )

            history = pd.concat(
                [
                    history,
                    pd.DataFrame(
                        [future_row]
                    ),
                ],
                ignore_index=True,
            )

            history = (
                history
                .sort_values("date")
                .reset_index(drop=True)
            )

        return results

    # ============================================================
    # CONVENIENCE METHODS
    # ============================================================

    def forecast_7_days(
        self,
        business_id: str | None = None,
    ) -> list[dict[str, Any]]:
        """Forecast the next 7 days."""

        return self.forecast(
            horizon_days=7,
            business_id=business_id,
        )

    def forecast_30_days(
        self,
        business_id: str | None = None,
    ) -> list[dict[str, Any]]:
        """Forecast the next 30 days."""

        return self.forecast(
            horizon_days=30,
            business_id=business_id,
        )

    def forecast_60_days(
        self,
        business_id: str | None = None,
    ) -> list[dict[str, Any]]:
        """Forecast the next 60 days."""

        return self.forecast(
            horizon_days=60,
            business_id=business_id,
        )

    def forecast_90_days(
        self,
        business_id: str | None = None,
    ) -> list[dict[str, Any]]:
        """Forecast the next 90 days."""

        return self.forecast(
            horizon_days=90,
            business_id=business_id,
        )

    # ============================================================
    # SUMMARY
    # ============================================================

    def forecast_summary(
        self,
        horizon_days: int,
        business_id: str | None = None,
    ) -> dict[str, Any]:
        """Return aggregate forecast summary."""

        forecast_rows = self.forecast(
            horizon_days=horizon_days,
            business_id=business_id,
        )

        if not forecast_rows:
            return {
                "horizon_days": horizon_days,
                "forecast_days": 0,
                "total_predicted_inflow": 0.0,
                "total_predicted_outflow": 0.0,
                "total_predicted_net_cash_flow": 0.0,
                "average_daily_predicted_net_cash_flow": 0.0,
                "minimum_predicted_net_cash_flow": 0.0,
                "maximum_predicted_net_cash_flow": 0.0,
                "forecast": [],
            }

        net_values = [
            float(
                row[
                    "predicted_net_cash_flow"
                ]
            )
            for row in forecast_rows
        ]

        inflow_values = [
            float(
                row[
                    "predicted_inflow"
                ]
            )
            for row in forecast_rows
            if row[
                "predicted_inflow"
            ] is not None
        ]

        outflow_values = [
            float(
                row[
                    "predicted_outflow"
                ]
            )
            for row in forecast_rows
            if row[
                "predicted_outflow"
            ] is not None
        ]

        total_net = sum(
            net_values
        )

        average_net = (
            total_net
            / len(net_values)
        )

        minimum_net = min(
            net_values
        )

        maximum_net = max(
            net_values
        )

        return {
            "horizon_days": horizon_days,
            "forecast_days": len(
                forecast_rows
            ),
            "total_predicted_inflow": round(
                sum(inflow_values),
                2,
            ),
            "total_predicted_outflow": round(
                sum(outflow_values),
                2,
            ),
            "total_predicted_net_cash_flow": round(
                total_net,
                2,
            ),
            "average_daily_predicted_net_cash_flow": round(
                average_net,
                2,
            ),
            "minimum_predicted_net_cash_flow": round(
                minimum_net,
                2,
            ),
            "maximum_predicted_net_cash_flow": round(
                maximum_net,
                2,
            ),
            "forecast": forecast_rows,
        }


# ============================================================
# FACTORY
# ============================================================

def create_cash_flow_predictor(
    base_dir: str | Path | None = None,
) -> CashFlowPredictor:
    """
    Create a predictor using the project's standard model paths.

    The factory remains compatible with the existing ML API.
    """

    if base_dir is None:

        # cash_flow_predictor.py:
        #
        # ml/
        #   src/
        #     prediction/
        #
        # parents[0] = prediction
        # parents[1] = src
        # parents[2] = ml
        # parents[3] = project root

        project_root = (
            Path(__file__)
            .resolve()
            .parents[3]
        )

    else:
        project_root = (
            Path(base_dir)
            .expanduser()
            .resolve()
        )

    model_path = (
        project_root
        / "ml"
        / "models"
        / NET_MODEL_FILENAME
    )

    metadata_path = (
        project_root
        / "ml"
        / "models"
        / NET_METADATA_FILENAME
    )

    return CashFlowPredictor(
        model_path=model_path,
        metadata_path=metadata_path,
    )


# ============================================================
# OPTIONAL DIRECT TEST
# ============================================================

if __name__ == "__main__":

    predictor = (
        create_cash_flow_predictor()
    )

    forecast = (
        predictor.forecast(
            horizon_days=7
        )
    )

    print(
        json.dumps(
            forecast,
            indent=2,
        )
    )