"""
Reusable predictor for CashGuard-AI daily cash-flow forecasting.

This module:
    1. Loads the existing persisted Cash Flow ML model.
    2. Loads the model metadata.
    3. Loads real historical daily cash-flow data.
    4. Builds future features using the existing feature builder.
    5. Recursively forecasts 7/30/60/90 calendar days.
    6. Returns structured forecast records.

IMPORTANT:
    - Do NOT retrain the model here.
    - Do NOT modify the trained model.
    - Do NOT fabricate predicted inflow/outflow values.
    - The persisted model currently predicts net cash flow.
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
# PREDICTOR
# ============================================================


class CashFlowPredictor:
    """
    Load the existing CashGuard Cash Flow forecasting model
    and recursively generate future daily net-cash-flow forecasts.

    The persisted model predicts TARGET (net cash flow).
    Therefore predicted_inflow and predicted_outflow are
    intentionally left as None unless a separate model exists
    for those components.
    """

    def __init__(
        self,
        model_path: str | Path,
        metadata_path: str | Path | None = None,
    ) -> None:
        # --------------------------------------------------------
        # MODEL PATH
        # --------------------------------------------------------

        self.model_path = Path(
            model_path
        ).expanduser()

        if not self.model_path.exists():
            raise FileNotFoundError(
                f"Cash-flow model file not found: "
                f"{self.model_path}"
            )

        if not self.model_path.is_file():
            raise ValueError(
                f"Cash-flow model path is not a file: "
                f"{self.model_path}"
            )

        # --------------------------------------------------------
        # LOAD TRAINED MODEL
        # --------------------------------------------------------

        try:
            self.model = joblib.load(
                self.model_path
            )
        except Exception as exc:
            raise RuntimeError(
                "Unable to load the persisted "
                f"Cash Flow ML model: {self.model_path}"
            ) from exc

        if not hasattr(
            self.model,
            "predict",
        ):
            raise TypeError(
                "Loaded Cash Flow model does not "
                "provide a predict() method."
            )

        # --------------------------------------------------------
        # METADATA PATH
        # --------------------------------------------------------

        if metadata_path is None:
            resolved_metadata_path = (
                self.model_path.with_name(
                    "cash_flow_forecast_metadata.json"
                )
            )
        else:
            resolved_metadata_path = Path(
                metadata_path
            ).expanduser()

        self.metadata_path = (
            resolved_metadata_path
        )

        if not self.metadata_path.exists():
            raise FileNotFoundError(
                "Cash-flow model metadata file not found: "
                f"{self.metadata_path}"
            )

        if not self.metadata_path.is_file():
            raise ValueError(
                "Cash-flow metadata path is not a file: "
                f"{self.metadata_path}"
            )

        # --------------------------------------------------------
        # LOAD METADATA
        # --------------------------------------------------------

        try:
            metadata_text = (
                self.metadata_path.read_text(
                    encoding="utf-8"
                )
            )

            self.metadata = json.loads(
                metadata_text
            )
        except json.JSONDecodeError as exc:
            raise ValueError(
                "Cash-flow forecast metadata contains "
                "invalid JSON."
            ) from exc
        except OSError as exc:
            raise RuntimeError(
                "Unable to read cash-flow forecast metadata."
            ) from exc

        if not isinstance(
            self.metadata,
            dict,
        ):
            raise ValueError(
                "Cash-flow forecast metadata must "
                "contain a JSON object."
            )

        # --------------------------------------------------------
        # FEATURE COLUMNS
        # --------------------------------------------------------

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
                "Cash-flow forecast metadata must "
                "contain a 'feature_columns' list."
            )

        if not feature_columns:
            raise ValueError(
                "Cash-flow forecast metadata contains "
                "an empty feature_columns list."
            )

        cleaned_features: list[str] = []

        for feature in feature_columns:
            feature_name = str(
                feature
            ).strip()

            if not feature_name:
                raise ValueError(
                    "Cash-flow metadata contains "
                    "an empty feature column name."
                )

            cleaned_features.append(
                feature_name
            )

        self.features = cleaned_features

    # ============================================================
    # HELPERS
    # ============================================================

    @property
    def target(self) -> str:
        """
        Return the model target column used by
        the existing Cash Flow dataset.
        """
        return TARGET

    @property
    def model_name(self) -> str:
        """
        Return the persisted model filename.
        """
        return self.model_path.name

    @property
    def model_metadata(self) -> dict[str, Any]:
        """
        Return loaded metadata.

        A shallow copy prevents callers from accidentally
        modifying the internal metadata dictionary.
        """
        return dict(
            self.metadata
        )

    def _validate_horizon(
        self,
        horizon_days: int,
    ) -> int:
        """
        Validate and normalize the forecast horizon.
        """
        if isinstance(
            horizon_days,
            bool,
        ):
            raise ValueError(
                "horizon_days must be an integer."
            )

        try:
            normalized_horizon = int(
                horizon_days
            )
        except (
            TypeError,
            ValueError,
        ) as exc:
            raise ValueError(
                "horizon_days must be an integer."
            ) from exc

        if (
            normalized_horizon
            not in SUPPORTED_HORIZONS
        ):
            supported = ", ".join(
                str(value)
                for value in SUPPORTED_HORIZONS
            )

            raise ValueError(
                "horizon_days must be one of: "
                f"{supported}."
            )

        return normalized_horizon

    def _validate_history(
        self,
        history: pd.DataFrame,
    ) -> pd.DataFrame:
        """
        Validate the historical dataset returned by the
        existing Cash Flow feature/data layer.
        """
        if not isinstance(
            history,
            pd.DataFrame,
        ):
            raise TypeError(
                "load_daily_cash_flow() must return a pandas DataFrame."
            )

        if history.empty:
            raise ValueError(
                "Cash-flow history is empty. "
                "At least one historical daily record is required "
                "for forecasting."
            )

        if "date" not in history.columns:
            raise ValueError(
                "Cash-flow history must contain a 'date' column."
            )

        normalized = history.copy()

        # --------------------------------------------------------
        # DATE NORMALIZATION
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

        normalized = (
            normalized
            .sort_values("date")
            .drop_duplicates(
                subset=["date"],
                keep="last",
            )
            .reset_index(
                drop=True
            )
        )

        return normalized

    def _build_model_input(
        self,
        features: dict[str, Any],
    ) -> pd.DataFrame:
        """
        Build a one-row DataFrame in exactly the feature order
        recorded in the persisted metadata.
        """
        row = pd.DataFrame(
            [features]
        )

        missing = [
            feature
            for feature in self.features
            if feature not in row.columns
        ]

        if missing:
            raise ValueError(
                "Future feature builder did not return all "
                "required model features. Missing: "
                + ", ".join(missing)
            )

        # Keep EXACTLY the order used during training.
        return row.loc[
            :,
            self.features,
        ]

    def _predict_one(
        self,
        feature_row: dict[str, Any],
    ) -> float:
        """
        Run the existing persisted model for one future day.
        """
        model_input = (
            self._build_model_input(
                feature_row
            )
        )

        try:
            prediction = (
                self.model.predict(
                    model_input
                )
            )
        except Exception as exc:
            raise RuntimeError(
                "Cash Flow ML model prediction failed."
            ) from exc

        # --------------------------------------------------------
        # VALIDATE MODEL OUTPUT
        # --------------------------------------------------------

        if prediction is None:
            raise RuntimeError(
                "Cash Flow ML model returned no prediction."
            )

        if len(prediction) != 1:
            raise RuntimeError(
                "Cash Flow ML model must return exactly "
                "one prediction for one future day."
            )

        value = prediction[0]

        try:
            numeric_prediction = float(
                value
            )
        except (
            TypeError,
            ValueError,
        ) as exc:
            raise RuntimeError(
                "Cash Flow ML model returned a non-numeric prediction."
            ) from exc

        if pd.isna(
            numeric_prediction
        ):
            raise RuntimeError(
                "Cash Flow ML model returned NaN."
            )

        return round(
            numeric_prediction,
            2,
        )

    # ============================================================
    # MAIN FORECAST
    # ============================================================

    def forecast(
        self,
        horizon_days: int,
        business_id: str | None = None,
    ) -> list[dict[str, Any]]:
        """
        Generate a recursive daily forecast.

        Parameters
        ----------
        horizon_days:
            One of 7, 30, 60, or 90.

        business_id:
            Optional business ID passed directly to the
            existing load_daily_cash_flow() implementation.

        Returns
        -------
        list[dict[str, Any]]
            One result per forecast day.

        Example
        -------
        [
            {
                "forecast_date": "2026-08-31",
                "predicted_inflow": None,
                "predicted_outflow": None,
                "predicted_net_cash_flow": 12500.50
            }
        ]
        """

        validated_horizon = (
            self._validate_horizon(
                horizon_days
            )
        )

        # --------------------------------------------------------
        # LOAD REAL HISTORY
        # --------------------------------------------------------

        try:
            history = (
                load_daily_cash_flow(
                    business_id
                )
            )
        except Exception as exc:
            raise RuntimeError(
                "Unable to load real daily cash-flow history "
                "for forecasting."
            ) from exc

        history = (
            self._validate_history(
                history
            )
        )

        # --------------------------------------------------------
        # START DATE
        # --------------------------------------------------------

        last_history_date = (
            history["date"].iloc[-1]
        )

        next_date = (
            last_history_date
            + pd.Timedelta(
                days=1
            )
        )

        results: list[
            dict[str, Any]
        ] = []

        # --------------------------------------------------------
        # RECURSIVE FORECAST
        # --------------------------------------------------------

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
            # BUILD FUTURE FEATURES
            # ----------------------------------------------------

            try:
                features = (
                    build_future_feature_row(
                        history,
                        forecast_date,
                    )
                )
            except Exception as exc:
                raise RuntimeError(
                    "Unable to build future Cash Flow "
                    "features for "
                    f"{forecast_date.date()}."
                ) from exc

            if not isinstance(
                features,
                dict,
            ):
                raise TypeError(
                    "build_future_feature_row() must return "
                    "a dictionary of model features."
                )

            # ----------------------------------------------------
            # MODEL PREDICTION
            # ----------------------------------------------------

            prediction = (
                self._predict_one(
                    features
                )
            )

            # ----------------------------------------------------
            # RESULT
            #
            # The existing model predicts net cash flow only.
            # Therefore inflow/outflow remain None intentionally.
            # ----------------------------------------------------

            result = {
                "forecast_date": (
                    forecast_date
                    .date()
                    .isoformat()
                ),
                "predicted_inflow": None,
                "predicted_outflow": None,
                "predicted_net_cash_flow": prediction,
            }

            results.append(
                result
            )

            # ----------------------------------------------------
            # RECURSIVE HISTORY UPDATE
            #
            # Future prediction becomes the target for the next
            # forecast step, preserving the existing recursive
            # forecasting design.
            # ----------------------------------------------------

            future_row = pd.DataFrame(
                [
                    {
                        "date": forecast_date,
                        "cash_inflow": None,
                        "cash_outflow": None,
                        TARGET: prediction,
                    }
                ]
            )

            history = pd.concat(
                [
                    history,
                    future_row,
                ],
                ignore_index=True,
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
        """
        Return a compact summary derived ONLY from the model's
        predicted net cash-flow values.

        No fabricated inflow/outflow estimates are generated.
        """
        forecast_rows = self.forecast(
            horizon_days=horizon_days,
            business_id=business_id,
        )

        if not forecast_rows:
            return {
                "horizon_days": horizon_days,
                "forecast_days": 0,
                "total_predicted_net_cash_flow": 0.0,
                "average_daily_predicted_net_cash_flow": 0.0,
                "minimum_predicted_net_cash_flow": 0.0,
                "maximum_predicted_net_cash_flow": 0.0,
                "forecast": [],
            }

        values = [
            float(
                row[
                    "predicted_net_cash_flow"
                ]
            )
            for row in forecast_rows
        ]

        total_net = sum(
            values
        )

        average_net = (
            total_net /
            len(values)
        )

        minimum_net = min(
            values
        )

        maximum_net = max(
            values
        )

        return {
            "horizon_days": horizon_days,
            "forecast_days": len(
                forecast_rows
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

    This keeps path resolution in one place while remaining
    compatible with the existing model layout.
    """

    if base_dir is None:
        # cash_flow_predictor.py
        # is:
        #
        # ml/
        #   src/
        #     prediction/
        #
        # Therefore:
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
        / "cash_flow_forecast_model.joblib"
    )

    metadata_path = (
        project_root
        / "ml"
        / "models"
        / "cash_flow_forecast_metadata.json"
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

    forecast = predictor.forecast(
        horizon_days=7
    )

    print(
        json.dumps(
            forecast,
            indent=2,
        )
    )