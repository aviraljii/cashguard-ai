"""Train, evaluate, and persist CashGuard cash-flow forecast models.

Models created:
1. cash_flow_forecast_model.joblib
   - target: net_cash_flow
   - keeps compatibility with the existing ML API

2. cash_flow_inflow_model.joblib
   - target: cash_inflow

3. cash_flow_outflow_model.joblib
   - target: cash_outflow

The training workflow uses chronological time-series splits and never
randomly shuffles observations.
"""

from __future__ import annotations

import json
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from sklearn.impute import SimpleImputer
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.pipeline import Pipeline
from xgboost import XGBRegressor


# ============================================================
# PROJECT PATHS
# ============================================================

ROOT = Path(__file__).resolve().parents[2]

if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


from ml.src.features.cash_flow_dataset import (  # noqa: E402
    FEATURE_COLUMNS,
    TARGET,
    build_feature_frame,
    load_daily_cash_flow,
)


MODEL_DIR = ROOT / "ml" / "models"
EVALUATION_DIR = ROOT / "ml" / "evaluation" / "cash_flow"
PROCESSED_DIR = ROOT / "ml" / "data" / "processed"

NET_MODEL_PATH = (
    MODEL_DIR / "cash_flow_forecast_model.joblib"
)

NET_METADATA_PATH = (
    MODEL_DIR / "cash_flow_forecast_metadata.json"
)

INFLOW_MODEL_PATH = (
    MODEL_DIR / "cash_flow_inflow_model.joblib"
)

OUTFLOW_MODEL_PATH = (
    MODEL_DIR / "cash_flow_outflow_model.joblib"
)

COMPONENT_METADATA_PATH = (
    MODEL_DIR / "cash_flow_component_forecast_metadata.json"
)

EVALUATION_PATH = (
    EVALUATION_DIR / "cash_flow_evaluation.json"
)

QUALITY_PATH = (
    EVALUATION_DIR / "cash_flow_data_quality.json"
)

DATASET_PATH = (
    PROCESSED_DIR / "daily_cash_flow_features.csv"
)

RANDOM_SEED = 42


# ============================================================
# TARGETS
# ============================================================

NET_TARGET = "net_cash_flow"
INFLOW_TARGET = "cash_inflow"
OUTFLOW_TARGET = "cash_outflow"

COMPONENT_TARGETS = (
    INFLOW_TARGET,
    OUTFLOW_TARGET,
)


# ============================================================
# FEATURE CONFIGURATION
# ============================================================

# Existing 12 production features.
BASE_FEATURE_COLUMNS = list(FEATURE_COLUMNS)

# Additional historical component features.
COMPONENT_LAG_FEATURES = [
    "cash_inflow_lag_1",
    "cash_inflow_lag_7",
    "cash_outflow_lag_1",
    "cash_outflow_lag_7",
]

COMPONENT_FEATURE_COLUMNS = (
    BASE_FEATURE_COLUMNS
    + COMPONENT_LAG_FEATURES
)


# ============================================================
# SEASONAL NAIVE BASELINE
# ============================================================

class SeasonalNaiveRegressor:
    """Seven-day seasonal-naive regression baseline."""

    def __init__(self, lag_column: str) -> None:
        self.lag_column = lag_column

    def fit(
        self,
        features: pd.DataFrame,
        target: pd.Series,
    ) -> "SeasonalNaiveRegressor":
        return self

    def predict(
        self,
        features: pd.DataFrame,
    ) -> np.ndarray:
        return features[
            self.lag_column
        ].to_numpy(dtype=float)


# ============================================================
# XGBOOST
# ============================================================

def build_xgboost(
    *,
    n_estimators: int = 350,
    max_depth: int = 3,
    learning_rate: float = 0.03,
    subsample: float = 0.9,
    colsample_bytree: float = 0.9,
) -> Pipeline:
    """Create a reproducible XGBoost pipeline."""

    return Pipeline(
        steps=[
            (
                "imputer",
                SimpleImputer(
                    strategy="median"
                ),
            ),
            (
                "model",
                XGBRegressor(
                    n_estimators=n_estimators,
                    max_depth=max_depth,
                    learning_rate=learning_rate,
                    subsample=subsample,
                    colsample_bytree=colsample_bytree,
                    objective="reg:squarederror",
                    random_state=RANDOM_SEED,
                    n_jobs=1,
                    tree_method="hist",
                ),
            ),
        ]
    )


# ============================================================
# METRICS
# ============================================================

def calculate_metrics(
    actual: pd.Series,
    predicted: np.ndarray,
) -> dict[str, float]:
    """Calculate MAE, RMSE and R2."""

    actual_values = np.asarray(
        actual,
        dtype=float,
    )

    predicted_values = np.asarray(
        predicted,
        dtype=float,
    )

    return {
        "mae": round(
            float(
                mean_absolute_error(
                    actual_values,
                    predicted_values,
                )
            ),
            2,
        ),
        "rmse": round(
            float(
                mean_squared_error(
                    actual_values,
                    predicted_values,
                )
                ** 0.5
            ),
            2,
        ),
        "r2": round(
            float(
                r2_score(
                    actual_values,
                    predicted_values,
                )
            ),
            4,
        ),
    }


# ============================================================
# CHRONOLOGICAL SPLIT
# ============================================================

def chronological_split(
    data: pd.DataFrame,
) -> tuple[
    pd.DataFrame,
    pd.DataFrame,
    pd.DataFrame,
]:
    """60% train, 20% validation, 20% test by time."""

    ordered = (
        data
        .sort_values("date")
        .reset_index(drop=True)
    )

    if len(ordered) < 90:
        raise ValueError(
            "At least 90 feature-ready daily rows are required "
            "for train/validation/test."
        )

    train_end = int(
        len(ordered) * 0.60
    )

    validation_end = int(
        len(ordered) * 0.80
    )

    train_data = ordered.iloc[
        :train_end
    ].copy()

    validation_data = ordered.iloc[
        train_end:validation_end
    ].copy()

    test_data = ordered.iloc[
        validation_end:
    ].copy()

    if train_data.empty:
        raise ValueError(
            "Training split is empty."
        )

    if validation_data.empty:
        raise ValueError(
            "Validation split is empty."
        )

    if test_data.empty:
        raise ValueError(
            "Test split is empty."
        )

    return (
        train_data,
        validation_data,
        test_data,
    )


# ============================================================
# COMPONENT FEATURES
# ============================================================

def add_component_lag_features(
    features: pd.DataFrame,
) -> pd.DataFrame:
    """Add historical inflow/outflow lag features.

    All component lag features use only historical values.
    """

    enriched = (
        features
        .sort_values("date")
        .reset_index(drop=True)
        .copy()
    )

    enriched[
        "cash_inflow_lag_1"
    ] = (
        enriched[INFLOW_TARGET]
        .shift(1)
    )

    enriched[
        "cash_inflow_lag_7"
    ] = (
        enriched[INFLOW_TARGET]
        .shift(7)
    )

    enriched[
        "cash_outflow_lag_1"
    ] = (
        enriched[OUTFLOW_TARGET]
        .shift(1)
    )

    enriched[
        "cash_outflow_lag_7"
    ] = (
        enriched[OUTFLOW_TARGET]
        .shift(7)
    )

    return enriched


# ============================================================
# DATA QUALITY
# ============================================================

def validate_daily_data(
    daily: pd.DataFrame,
    features: pd.DataFrame,
) -> dict[str, Any]:
    """Validate daily cash-flow data."""

    required_columns = {
        "business_id",
        "date",
        INFLOW_TARGET,
        OUTFLOW_TARGET,
        NET_TARGET,
    }

    missing_columns = sorted(
        required_columns
        - set(daily.columns)
    )

    if missing_columns:
        raise ValueError(
            "Daily cash-flow dataset is missing columns: "
            + ", ".join(missing_columns)
        )

    expected_dates = pd.date_range(
        start=daily["date"].min(),
        end=daily["date"].max(),
        freq="D",
    )

    actual_dates = daily[
        "date"
    ].nunique()

    missing_dates = max(
        0,
        len(expected_dates) - actual_dates,
    )

    feature_columns_for_quality = list(
        dict.fromkeys(
            COMPONENT_FEATURE_COLUMNS
            + [
                NET_TARGET,
                INFLOW_TARGET,
                OUTFLOW_TARGET,
            ]
        )
    )

    missing_feature_columns = [
        column
        for column in feature_columns_for_quality
        if column not in features.columns
    ]

    if missing_feature_columns:
        raise ValueError(
            "Feature dataset is missing columns: "
            + ", ".join(
                missing_feature_columns
            )
        )

    return {
        "daily_rows": int(
            len(daily)
        ),
        "feature_ready_rows": int(
            len(features)
        ),
        "date_range": {
            "start": (
                daily["date"]
                .min()
                .date()
                .isoformat()
            ),
            "end": (
                daily["date"]
                .max()
                .date()
                .isoformat()
            ),
        },
        "missing_dates": int(
            missing_dates
        ),
        "duplicate_dates": int(
            daily["date"]
            .duplicated()
            .sum()
        ),
        "null_values_in_daily_data": int(
            daily.isna()
            .sum()
            .sum()
        ),
        "null_values_in_feature_data": int(
            features[
                feature_columns_for_quality
            ]
            .isna()
            .sum()
            .sum()
        ),
        "leakage_control": (
            "All rolling and lag features are based "
            "only on historical values through t-1."
        ),
    }


# ============================================================
# XGBOOST CANDIDATE SELECTION
# ============================================================

def train_xgboost_candidates(
    x_train: pd.DataFrame,
    y_train: pd.Series,
    x_validation: pd.DataFrame,
    y_validation: pd.Series,
) -> tuple[
    Pipeline,
    dict[str, Any],
]:
    """Train multiple conservative XGBoost candidates."""

    candidate_configs = [
        {
            "name": "xgboost_depth_3",
            "n_estimators": 350,
            "max_depth": 3,
            "learning_rate": 0.03,
            "subsample": 0.9,
            "colsample_bytree": 0.9,
        },
        {
            "name": "xgboost_depth_4",
            "n_estimators": 350,
            "max_depth": 4,
            "learning_rate": 0.03,
            "subsample": 0.9,
            "colsample_bytree": 0.9,
        },
        {
            "name": "xgboost_balanced",
            "n_estimators": 450,
            "max_depth": 3,
            "learning_rate": 0.025,
            "subsample": 0.9,
            "colsample_bytree": 0.85,
        },
    ]

    trained_candidates: list[
        tuple[
            Pipeline,
            dict[str, Any],
        ]
    ] = []

    for config in candidate_configs:

        model = build_xgboost(
            n_estimators=config[
                "n_estimators"
            ],
            max_depth=config[
                "max_depth"
            ],
            learning_rate=config[
                "learning_rate"
            ],
            subsample=config[
                "subsample"
            ],
            colsample_bytree=config[
                "colsample_bytree"
            ],
        )

        model.fit(
            x_train,
            y_train,
        )

        validation_prediction = (
            model.predict(
                x_validation
            )
        )

        validation_metrics = (
            calculate_metrics(
                y_validation,
                validation_prediction,
            )
        )

        trained_candidates.append(
            (
                model,
                {
                    "name": config["name"],
                    "metrics": validation_metrics,
                    "parameters": {
                        "n_estimators": config[
                            "n_estimators"
                        ],
                        "max_depth": config[
                            "max_depth"
                        ],
                        "learning_rate": config[
                            "learning_rate"
                        ],
                        "subsample": config[
                            "subsample"
                        ],
                        "colsample_bytree": config[
                            "colsample_bytree"
                        ],
                    },
                },
            )
        )

    selected_model, selected_details = min(
        trained_candidates,
        key=lambda item: (
            item[1]["metrics"]["rmse"]
        ),
    )

    return (
        selected_model,
        selected_details,
    )


# ============================================================
# TRAIN ONE TARGET
# ============================================================

def train_target_model(
    *,
    target_name: str,
    feature_columns: list[str],
    train_data: pd.DataFrame,
    validation_data: pd.DataFrame,
    test_data: pd.DataFrame,
    baseline_lag_column: str,
    always_use_xgboost: bool = False,
) -> tuple[
    Pipeline | SeasonalNaiveRegressor,
    dict[str, Any],
]:
    """Train and evaluate a target model."""

    x_train = train_data[
        feature_columns
    ]

    y_train = train_data[
        target_name
    ]

    x_validation = validation_data[
        feature_columns
    ]

    y_validation = validation_data[
        target_name
    ]

    x_test = test_data[
        feature_columns
    ]

    y_test = test_data[
        target_name
    ]

    # --------------------------------------------------------
    # Seasonal naive
    # --------------------------------------------------------

    baseline = SeasonalNaiveRegressor(
        baseline_lag_column
    )

    baseline.fit(
        x_train,
        y_train,
    )

    baseline_validation = (
        baseline.predict(
            x_validation
        )
    )

    baseline_test = (
        baseline.predict(
            x_test
        )
    )

    baseline_metrics = {
        "validation": calculate_metrics(
            y_validation,
            baseline_validation,
        ),
        "test": calculate_metrics(
            y_test,
            baseline_test,
        ),
    }

    # --------------------------------------------------------
    # XGBoost
    # --------------------------------------------------------

    xgb_model, xgb_details = (
        train_xgboost_candidates(
            x_train,
            y_train,
            x_validation,
            y_validation,
        )
    )

    xgb_validation = (
        xgb_model.predict(
            x_validation
        )
    )

    xgb_test = (
        xgb_model.predict(
            x_test
        )
    )

    xgb_metrics = {
        "validation": calculate_metrics(
            y_validation,
            xgb_validation,
        ),
        "test": calculate_metrics(
            y_test,
            xgb_test,
        ),
        "selection": xgb_details,
    }

    # --------------------------------------------------------
    # Select production model.
    # --------------------------------------------------------

    if always_use_xgboost:
        selected_name = "xgboost"

    else:
        if (
            xgb_metrics["validation"]["rmse"]
            <= baseline_metrics[
                "validation"
            ]["rmse"]
        ):
            selected_name = "xgboost"
        else:
            selected_name = "seasonal_naive"

    return (
        xgb_model
        if selected_name == "xgboost"
        else baseline,
        {
            "target": target_name,
            "selected_model": selected_name,
            "seasonal_naive": baseline_metrics,
            "xgboost": xgb_metrics,
            "feature_columns": feature_columns,
            "feature_count": len(
                feature_columns
            ),
        },
    )


# ============================================================
# FINAL MODEL REFIT
# ============================================================

def refit_xgboost(
    details: dict[str, Any],
    x: pd.DataFrame,
    y: pd.Series,
) -> Pipeline:
    """Refit selected XGBoost model using final training data."""

    params = details[
        "xgboost"
    ][
        "selection"
    ][
        "parameters"
    ]

    model = build_xgboost(
        n_estimators=params[
            "n_estimators"
        ],
        max_depth=params[
            "max_depth"
        ],
        learning_rate=params[
            "learning_rate"
        ],
        subsample=params[
            "subsample"
        ],
        colsample_bytree=params[
            "colsample_bytree"
        ],
    )

    model.fit(
        x,
        y,
    )

    return model


# ============================================================
# MAIN TRAINING WORKFLOW
# ============================================================

def train(
    business_id: str | None = None,
) -> dict[str, Any]:
    """Train all cash-flow forecasting models."""

    MODEL_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )

    EVALUATION_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )

    PROCESSED_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )

    # ========================================================
    # 1. LOAD REAL DAILY CASH-FLOW DATA
    # ========================================================

    daily = load_daily_cash_flow(
        business_id
    )

    if daily.empty:
        raise ValueError(
            "No daily cash-flow data was returned."
        )

    required_daily_columns = [
        "business_id",
        "date",
        INFLOW_TARGET,
        OUTFLOW_TARGET,
        NET_TARGET,
    ]

    missing_daily_columns = [
        column
        for column in required_daily_columns
        if column not in daily.columns
    ]

    if missing_daily_columns:
        raise ValueError(
            "Missing required daily columns: "
            + ", ".join(
                missing_daily_columns
            )
        )

    daily = daily.copy()

    daily["date"] = pd.to_datetime(
        daily["date"],
        errors="coerce",
    )

    if daily["date"].isna().any():
        raise ValueError(
            "Daily cash-flow data contains invalid dates."
        )

    daily["date"] = (
        daily["date"]
        .dt.tz_localize(None)
        if getattr(
            daily["date"].dt,
            "tz",
            None,
        ) is not None
        else daily["date"]
    )

    daily["date"] = (
        daily["date"]
        .dt.normalize()
    )

    for column in [
        INFLOW_TARGET,
        OUTFLOW_TARGET,
        NET_TARGET,
    ]:
        daily[column] = pd.to_numeric(
            daily[column],
            errors="coerce",
        )

    if daily[
        [
            INFLOW_TARGET,
            OUTFLOW_TARGET,
            NET_TARGET,
        ]
    ].isna().any().any():
        raise ValueError(
            "Cash-flow target data contains null or non-numeric values."
        )

    daily = (
        daily
        .sort_values("date")
        .reset_index(drop=True)
    )

    resolved_business_id = str(
        daily[
            "business_id"
        ].iloc[0]
    )

    if business_id is not None:
        if (
            resolved_business_id
            != str(business_id)
        ):
            raise ValueError(
                "Loaded business_id does not match requested business_id."
            )

    # ========================================================
    # 2. BUILD EXISTING FEATURE FRAME
    # ========================================================

    # Important:
    # build_feature_frame already returns:
    # cash_inflow
    # cash_outflow
    # net_cash_flow
    # and the existing 12 ML features.
    features = build_feature_frame(
        daily
    )

    features = (
        features
        .sort_values("date")
        .reset_index(drop=True)
        .copy()
    )

    features["date"] = pd.to_datetime(
        features["date"],
        errors="coerce",
    )

    if features["date"].isna().any():
        raise ValueError(
            "Feature frame contains invalid dates."
        )

    features["date"] = (
        features["date"]
        .dt.tz_localize(None)
        if getattr(
            features["date"].dt,
            "tz",
            None,
        ) is not None
        else features["date"]
    )

    features["date"] = (
        features["date"]
        .dt.normalize()
    )

    # ========================================================
    # 3. ADD COMPONENT LAGS
    # ========================================================

    features = add_component_lag_features(
        features
    )

    # ========================================================
    # 4. DATA QUALITY
    # ========================================================

    quality_before = validate_daily_data(
        daily,
        features,
    )

    # Existing base model can be trained on its own feature
    # readiness. Component lags require 7 historical days.
    required_training_columns = list(
        dict.fromkeys(
            BASE_FEATURE_COLUMNS
            + COMPONENT_LAG_FEATURES
            + [
                NET_TARGET,
                INFLOW_TARGET,
                OUTFLOW_TARGET,
            ]
        )
    )

    missing_training_columns = [
        column
        for column in required_training_columns
        if column not in features.columns
    ]

    if missing_training_columns:
        raise ValueError(
            "Training frame is missing columns: "
            + ", ".join(
                missing_training_columns
            )
        )

    # Remove rows where lag features are unavailable.
    feature_data = (
        features
        .dropna(
            subset=required_training_columns
        )
        .copy()
    )

    feature_data = (
        feature_data
        .sort_values("date")
        .reset_index(drop=True)
    )

    if feature_data.empty:
        raise ValueError(
            "No feature-ready rows remain after lag generation."
        )

    quality = {
        **quality_before,
        "final_training_rows": int(
            len(feature_data)
        ),
        "final_training_date_range": [
            (
                feature_data["date"]
                .min()
                .date()
                .isoformat()
            ),
            (
                feature_data["date"]
                .max()
                .date()
                .isoformat()
            ),
        ],
        "component_lag_rows_removed": int(
            len(features)
            - len(feature_data)
        ),
    }

    if quality["missing_dates"]:
        raise ValueError(
            f"Missing calendar dates detected: "
            f"{quality['missing_dates']}"
        )

    if quality["duplicate_dates"]:
        raise ValueError(
            f"Duplicate dates detected: "
            f"{quality['duplicate_dates']}"
        )

    if quality["null_values_in_daily_data"]:
        raise ValueError(
            "Null values detected in daily cash-flow data."
        )

    # ========================================================
    # 5. SAVE PROCESSED DATA
    # ========================================================

    feature_data.to_csv(
        DATASET_PATH,
        index=False,
    )

    QUALITY_PATH.write_text(
        json.dumps(
            quality,
            indent=2,
        ),
        encoding="utf-8",
    )

    # ========================================================
    # 6. CHRONOLOGICAL SPLIT
    # ========================================================

    train_data, validation_data, test_data = (
        chronological_split(
            feature_data
        )
    )

    # ========================================================
    # 7. TRAIN NET CASH FLOW MODEL
    # ========================================================

    net_model_template, net_results = (
        train_target_model(
            target_name=NET_TARGET,
            feature_columns=BASE_FEATURE_COLUMNS,
            train_data=train_data,
            validation_data=validation_data,
            test_data=test_data,
            baseline_lag_column="net_cash_flow_lag_7",
            always_use_xgboost=False,
        )
    )

    # ========================================================
    # 8. TRAIN INFLOW MODEL
    # ========================================================

    inflow_model_template, inflow_results = (
        train_target_model(
            target_name=INFLOW_TARGET,
            feature_columns=COMPONENT_FEATURE_COLUMNS,
            train_data=train_data,
            validation_data=validation_data,
            test_data=test_data,
            baseline_lag_column="cash_inflow_lag_7",
            always_use_xgboost=True,
        )
    )

    # ========================================================
    # 9. TRAIN OUTFLOW MODEL
    # ========================================================

    outflow_model_template, outflow_results = (
        train_target_model(
            target_name=OUTFLOW_TARGET,
            feature_columns=COMPONENT_FEATURE_COLUMNS,
            train_data=train_data,
            validation_data=validation_data,
            test_data=test_data,
            baseline_lag_column="cash_outflow_lag_7",
            always_use_xgboost=True,
        )
    )

    # ========================================================
    # 10. REFIT FINAL NET MODEL
    # ========================================================

    fit_data = pd.concat(
        [
            train_data,
            validation_data,
        ],
        ignore_index=True,
    )

    if (
        net_results["selected_model"]
        == "xgboost"
    ):
        final_net_model = refit_xgboost(
            net_results,
            fit_data[
                BASE_FEATURE_COLUMNS
            ],
            fit_data[NET_TARGET],
        )
    else:
        final_net_model = SeasonalNaiveRegressor(
            "net_cash_flow_lag_7"
        )

        final_net_model.fit(
            fit_data[
                BASE_FEATURE_COLUMNS
            ],
            fit_data[NET_TARGET],
        )

    # ========================================================
    # 11. REFIT FINAL INFLOW MODEL
    # ========================================================

    final_inflow_model = refit_xgboost(
        inflow_results,
        fit_data[
            COMPONENT_FEATURE_COLUMNS
        ],
        fit_data[
            INFLOW_TARGET
        ],
    )

    # ========================================================
    # 12. REFIT FINAL OUTFLOW MODEL
    # ========================================================

    final_outflow_model = refit_xgboost(
        outflow_results,
        fit_data[
            COMPONENT_FEATURE_COLUMNS
        ],
        fit_data[
            OUTFLOW_TARGET
        ],
    )

    # ========================================================
    # 13. SAVE MODELS
    # ========================================================

    joblib.dump(
        final_net_model,
        NET_MODEL_PATH,
    )

    joblib.dump(
        final_inflow_model,
        INFLOW_MODEL_PATH,
    )

    joblib.dump(
        final_outflow_model,
        OUTFLOW_MODEL_PATH,
    )

    # ========================================================
    # 14. METADATA
    # ========================================================

    trained_at = datetime.now(
        UTC
    ).isoformat()

    train_range = [
        (
            train_data["date"]
            .min()
            .date()
            .isoformat()
        ),
        (
            train_data["date"]
            .max()
            .date()
            .isoformat()
        ),
    ]

    validation_range = [
        (
            validation_data["date"]
            .min()
            .date()
            .isoformat()
        ),
        (
            validation_data["date"]
            .max()
            .date()
            .isoformat()
        ),
    ]

    test_range = [
        (
            test_data["date"]
            .min()
            .date()
            .isoformat()
        ),
        (
            test_data["date"]
            .max()
            .date()
            .isoformat()
        ),
    ]

    net_metadata = {
        "model_name": (
            "xgboost_regressor"
            if net_results[
                "selected_model"
            ] == "xgboost"
            else "seasonal_naive_lag_7"
        ),
        "target_column": NET_TARGET,
        "feature_columns": BASE_FEATURE_COLUMNS,
        "business_id": resolved_business_id,
        "training_date_range": train_range,
        "validation_date_range": validation_range,
        "test_date_range": test_range,
        "evaluation_metrics": {
            "seasonal_naive": net_results[
                "seasonal_naive"
            ],
            "xgboost": net_results[
                "xgboost"
            ],
        },
        "trained_at_utc": trained_at,
        "component_models": {
            "cash_inflow": {
                "model_name": "xgboost_regressor",
                "model_file": INFLOW_MODEL_PATH.name,
                "target_column": INFLOW_TARGET,
                "feature_columns": COMPONENT_FEATURE_COLUMNS,
            },
            "cash_outflow": {
                "model_name": "xgboost_regressor",
                "model_file": OUTFLOW_MODEL_PATH.name,
                "target_column": OUTFLOW_TARGET,
                "feature_columns": COMPONENT_FEATURE_COLUMNS,
            },
        },
        "cash_balance_limitation": (
            "No verified current cash balance is used "
            "or forecast. Models forecast daily cash-flow "
            "components and net cash flow."
        ),
        "shortage_detection_limitation": (
            "Cash-shortage detection requires a verified "
            "minimum cash threshold."
        ),
        "component_forecast_limitation": (
            "Dedicated inflow and outflow models are "
            "trained separately. The prediction service "
            "must load these models to expose component "
            "forecast values."
        ),
    }

    NET_METADATA_PATH.write_text(
        json.dumps(
            net_metadata,
            indent=2,
        ),
        encoding="utf-8",
    )

    component_metadata = {
        "model_type": "xgboost_regressor",
        "business_id": resolved_business_id,
        "trained_at_utc": trained_at,
        "training_date_range": train_range,
        "validation_date_range": validation_range,
        "test_date_range": test_range,
        "feature_columns": COMPONENT_FEATURE_COLUMNS,
        "cash_inflow": inflow_results,
        "cash_outflow": outflow_results,
    }

    COMPONENT_METADATA_PATH.write_text(
        json.dumps(
            component_metadata,
            indent=2,
        ),
        encoding="utf-8",
    )

    # ========================================================
    # 15. FINAL EVALUATION FILE
    # ========================================================

    result = {
        "success": True,
        "business_id": resolved_business_id,
        "trained_at_utc": trained_at,
        "data_quality": quality,
        "split_rows": {
            "train": int(
                len(train_data)
            ),
            "validation": int(
                len(validation_data)
            ),
            "test": int(
                len(test_data)
            ),
        },
        "date_ranges": {
            "train": train_range,
            "validation": validation_range,
            "test": test_range,
        },
        "net_cash_flow": {
            "selected_model": net_results[
                "selected_model"
            ],
            "target": NET_TARGET,
            "feature_count": len(
                BASE_FEATURE_COLUMNS
            ),
            "feature_columns": BASE_FEATURE_COLUMNS,
            "evaluation": net_results,
            "model_file": NET_MODEL_PATH.name,
        },
        "cash_inflow": {
            "target": INFLOW_TARGET,
            "feature_count": len(
                COMPONENT_FEATURE_COLUMNS
            ),
            "feature_columns": COMPONENT_FEATURE_COLUMNS,
            "evaluation": inflow_results,
            "model_file": INFLOW_MODEL_PATH.name,
        },
        "cash_outflow": {
            "target": OUTFLOW_TARGET,
            "feature_count": len(
                COMPONENT_FEATURE_COLUMNS
            ),
            "feature_columns": COMPONENT_FEATURE_COLUMNS,
            "evaluation": outflow_results,
            "model_file": OUTFLOW_MODEL_PATH.name,
        },
        "output_files": {
            "net_model": str(
                NET_MODEL_PATH
            ),
            "inflow_model": str(
                INFLOW_MODEL_PATH
            ),
            "outflow_model": str(
                OUTFLOW_MODEL_PATH
            ),
            "net_metadata": str(
                NET_METADATA_PATH
            ),
            "component_metadata": str(
                COMPONENT_METADATA_PATH
            ),
            "evaluation": str(
                EVALUATION_PATH
            ),
            "quality": str(
                QUALITY_PATH
            ),
            "dataset": str(
                DATASET_PATH
            ),
        },
    }

    EVALUATION_PATH.write_text(
        json.dumps(
            result,
            indent=2,
        ),
        encoding="utf-8",
    )

    return result


# ============================================================
# CLI
# ============================================================

if __name__ == "__main__":
    try:
        output = train()

        print(
            json.dumps(
                output,
                indent=2,
            )
        )

    except Exception as exc:
        print(
            json.dumps(
                {
                    "success": False,
                    "error": type(exc).__name__,
                    "message": str(exc),
                },
                indent=2,
            ),
            file=sys.stderr,
        )
        raise