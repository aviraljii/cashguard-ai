from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, AsyncIterator

from fastapi import (
    FastAPI,
    HTTPException,
    Query,
    Request,
    status,
)
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# ============================================================================
# AI / GENAI IMPORTS
# ============================================================================

from ai.schemas.insight_schemas import (
    InsightEnvelope,
    InsightRequest,
    UnifiedInsightRequest,
)
from ai.service.insight_service import InsightService
from ai.utils.llm_client import (
    LLMResponseError,
    LLMUnavailableError,
)

# ============================================================================
# ML IMPORTS
#
# Supports:
#
#   1. Starting from project root:
#        ml.api.main:app
#
#   2. Starting from inside ml:
#        api.main:app
# ============================================================================

try:
    from ml.api.schemas import (
        PaymentDelayPredictionRequest,
        PaymentDelayPredictionResponse,
    )
    from ml.src.prediction.cash_flow_predictor import (
        CashFlowPredictor,
    )
    from ml.src.prediction.payment_delay_predictor import (
        PaymentDelayPredictor,
    )

except ModuleNotFoundError:
    from api.schemas import (
        PaymentDelayPredictionRequest,
        PaymentDelayPredictionResponse,
    )
    from src.prediction.cash_flow_predictor import (
        CashFlowPredictor,
    )
    from src.prediction.payment_delay_predictor import (
        PaymentDelayPredictor,
    )


# ============================================================================
# LOGGING
# ============================================================================

logger = logging.getLogger("cashguard.ml.api")

if not logger.handlers:
    logging.basicConfig(
        level=logging.INFO,
        format=(
            "%(asctime)s | "
            "%(levelname)s | "
            "%(name)s | "
            "%(message)s"
        ),
    )


# ============================================================================
# PROJECT PATHS
# ============================================================================

# Expected structure:
#
# <project>/
# ├── ai/
# ├── ml/
# │   ├── api/
# │   │   ├── main.py
# │   │   └── schemas.py
# │   ├── models/
# │   └── src/
# │       └── prediction/
#
# __file__ = <project>/ml/api/main.py
#
# parents[0] = api
# parents[1] = ml
# parents[2] = project

ML_ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = ML_ROOT.parent
MODELS_DIR = ML_ROOT / "models"

PAYMENT_DELAY_MODEL_PATH = (
    MODELS_DIR / "payment_delay_risk_model.joblib"
)

CASH_FLOW_MODEL_PATH = (
    MODELS_DIR / "cash_flow_forecast_model.joblib"
)

CASH_FLOW_METADATA_PATH = (
    MODELS_DIR / "cash_flow_forecast_metadata.json"
)


# ============================================================================
# CASH FLOW SCHEMAS
# ============================================================================


class CashFlowForecastRequest(BaseModel):
    """
    Request body for Cash Flow ML forecasting.
    """

    business_id: str | None = Field(
        default=None,
        description=(
            "Business ID used to load the real "
            "business cash-flow history."
        ),
    )

    horizon_days: int = Field(
        default=7,
        ge=1,
        description=(
            "Forecast horizon. Supported values: 7, 30, 60, 90."
        ),
    )


class CashFlowForecastRow(BaseModel):
    """
    One forecasted Cash Flow day.

    The current trained model predicts net cash flow,
    therefore predicted_inflow and predicted_outflow
    may remain null.
    """

    forecast_date: str

    predicted_inflow: float | None = None

    predicted_outflow: float | None = None

    predicted_net_cash_flow: float


class CashFlowForecastResponse(BaseModel):
    """
    Structured Cash Flow ML forecast response.
    """

    business_id: str | None = None

    horizon_days: int

    forecast_days: int

    model: str

    target: str

    forecast: list[CashFlowForecastRow]


class CashFlowForecastSummaryResponse(BaseModel):
    """
    Compact Cash Flow ML forecast summary.
    """

    business_id: str | None = None

    horizon_days: int

    forecast_days: int

    model: str

    target: str

    total_predicted_net_cash_flow: float

    average_daily_predicted_net_cash_flow: float

    minimum_predicted_net_cash_flow: float

    maximum_predicted_net_cash_flow: float

    forecast: list[CashFlowForecastRow]


# ============================================================================
# CONSTANTS
# ============================================================================

SUPPORTED_HORIZONS = {7, 30, 60, 90}


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================


def clean_business_id(
    business_id: str | None,
) -> str | None:
    """
    Normalize an optional business ID.
    """

    if business_id is None:
        return None

    value = str(business_id).strip()

    return value or None


def validate_horizon(
    horizon_days: int,
) -> int:
    """
    Validate supported Cash Flow forecast horizons.
    """

    if horizon_days not in SUPPORTED_HORIZONS:
        supported = ", ".join(
            str(value)
            for value in sorted(SUPPORTED_HORIZONS)
        )

        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"horizon_days must be one of: {supported}."
            ),
        )

    return horizon_days


def safe_float(
    value: Any,
    default: float = 0.0,
) -> float:
    """
    Convert a value into a safe float.
    """

    try:
        if value is None:
            return default

        return float(value)

    except (TypeError, ValueError):
        return default


# ============================================================================
# APPLICATION LIFESPAN
# ============================================================================


@asynccontextmanager
async def lifespan(
    app: FastAPI,
) -> AsyncIterator[None]:
    """
    Load existing ML models once during application startup.

    No model training/retraining happens here.
    """

    # ------------------------------------------------------------------------
    # INITIAL STATE
    # ------------------------------------------------------------------------

    app.state.predictor = None
    app.state.model_error = None

    app.state.cash_flow_predictor = None
    app.state.cash_flow_model_error = None

    # ------------------------------------------------------------------------
    # MODEL DIRECTORY
    # ------------------------------------------------------------------------

    if not MODELS_DIR.exists():
        logger.warning(
            "ML models directory does not exist: %s",
            MODELS_DIR,
        )

    # ------------------------------------------------------------------------
    # PAYMENT DELAY MODEL
    # ------------------------------------------------------------------------

    try:
        app.state.predictor = PaymentDelayPredictor(
            model_path=PAYMENT_DELAY_MODEL_PATH,
        )

        logger.info(
            "Payment-delay model loaded successfully: %s",
            PAYMENT_DELAY_MODEL_PATH,
        )

    except Exception as exc:
        app.state.model_error = exc

        logger.exception(
            "Unable to load payment-delay prediction model."
        )

    # ------------------------------------------------------------------------
    # CASH FLOW MODEL
    # ------------------------------------------------------------------------

    try:
        app.state.cash_flow_predictor = CashFlowPredictor(
            model_path=CASH_FLOW_MODEL_PATH,
            metadata_path=CASH_FLOW_METADATA_PATH,
        )

        logger.info(
            "Cash-flow model loaded successfully: %s",
            CASH_FLOW_MODEL_PATH,
        )

    except Exception as exc:
        app.state.cash_flow_model_error = exc

        logger.exception(
            "Unable to load cash-flow prediction model."
        )

    # ------------------------------------------------------------------------
    # STARTUP LOGGING
    # ------------------------------------------------------------------------

    logger.info(
        "CashGuard-AI ML service startup completed."
    )

    logger.info(
        "ML root: %s",
        ML_ROOT,
    )

    logger.info(
        "Project root: %s",
        PROJECT_ROOT,
    )

    logger.info(
        "Models directory: %s",
        MODELS_DIR,
    )

    yield

    # ------------------------------------------------------------------------
    # SHUTDOWN
    # ------------------------------------------------------------------------

    logger.info(
        "CashGuard-AI ML service shutting down."
    )


# ============================================================================
# FASTAPI APPLICATION
# ============================================================================


app = FastAPI(
    title="CashGuard AI ML Service",
    version="1.3.0",
    description=(
        "CashGuard-AI machine-learning and GenAI service."
    ),
    lifespan=lifespan,
)


# ============================================================================
# CORS
# ============================================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=[
        "*",
    ],
    allow_headers=[
        "*",
    ],
    expose_headers=[
        "X-Request-ID",
    ],
)


# ============================================================================
# AI INSIGHT HELPER
# ============================================================================


def ai_insight(
    domain: str,
    payload: InsightRequest,
) -> InsightEnvelope:
    """
    Generate a validated GenAI insight.
    """

    try:
        result = InsightService().generate(
            domain,
            payload.intelligence,
        )

        return InsightEnvelope(
            insight=result,
        )

    except ValueError as exc:

        logger.info(
            "AI validation error | domain=%s | error=%s",
            domain,
            exc,
        )

        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc

    except LLMUnavailableError:

        logger.error(
            "LLM unavailable | domain=%s",
            domain,
        )

        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="LLM service is unavailable.",
        ) from None

    except LLMResponseError:

        logger.error(
            "LLM response error | domain=%s",
            domain,
        )

        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=(
                "LLM returned an invalid insight response."
            ),
        ) from None

    except Exception:

        logger.exception(
            "Unexpected AI insight error | domain=%s",
            domain,
        )

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to generate AI insight.",
        ) from None


# ============================================================================
# GENAI ROUTES
# ============================================================================


@app.post(
    "/ai/insight/customer",
    response_model=InsightEnvelope,
)
def customer_insight(
    payload: InsightRequest,
) -> InsightEnvelope:

    return ai_insight(
        "customer",
        payload,
    )


@app.post(
    "/ai/insight/invoice",
    response_model=InsightEnvelope,
)
def invoice_insight(
    payload: InsightRequest,
) -> InsightEnvelope:

    return ai_insight(
        "invoice_collection",
        payload,
    )


@app.post(
    "/ai/insight/inventory",
    response_model=InsightEnvelope,
)
def inventory_insight(
    payload: InsightRequest,
) -> InsightEnvelope:

    return ai_insight(
        "inventory",
        payload,
    )


@app.post(
    "/ai/insight/cash-flow",
    response_model=InsightEnvelope,
)
def cash_flow_insight(
    payload: InsightRequest,
) -> InsightEnvelope:
    """
    Generate AI explanation for structured Cash Flow intelligence.
    """

    return ai_insight(
        "cash_flow",
        payload,
    )


@app.post(
    "/ai/insight/sales",
    response_model=InsightEnvelope,
)
def sales_insight(
    payload: InsightRequest,
) -> InsightEnvelope:

    return ai_insight(
        "sales",
        payload,
    )


@app.post(
    "/ai/insight/anomaly",
    response_model=InsightEnvelope,
)
def anomaly_insight(
    payload: InsightRequest,
) -> InsightEnvelope:

    return ai_insight(
        "transaction_anomaly",
        payload,
    )


@app.post(
    "/ai/insight",
    response_model=InsightEnvelope,
)
def unified_insight(
    payload: UnifiedInsightRequest,
) -> InsightEnvelope:

    return ai_insight(
        payload.domain,
        payload,
    )


# ============================================================================
# PAYMENT DELAY PREDICTOR DEPENDENCY
# ============================================================================


def get_predictor(
    request: Request,
) -> PaymentDelayPredictor:
    """
    Return the loaded payment-delay predictor.
    """

    predictor = getattr(
        request.app.state,
        "predictor",
        None,
    )

    if predictor is None:
        model_error = getattr(
            request.app.state,
            "model_error",
            None,
        )

        logger.error(
            "Payment-delay model unavailable | error=%s",
            model_error,
        )

        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Payment-delay prediction model "
                "is currently unavailable."
            ),
        )

    return predictor


# ============================================================================
# CASH FLOW PREDICTOR DEPENDENCY
# ============================================================================


def get_cash_flow_predictor(
    request: Request,
) -> CashFlowPredictor:
    """
    Return the loaded Cash Flow predictor.
    """

    predictor = getattr(
        request.app.state,
        "cash_flow_predictor",
        None,
    )

    if predictor is None:
        model_error = getattr(
            request.app.state,
            "cash_flow_model_error",
            None,
        )

        logger.error(
            "Cash-flow model unavailable | error=%s",
            model_error,
        )

        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Cash-flow prediction model "
                "is currently unavailable."
            ),
        )

    return predictor


# ============================================================================
# HEALTH
# ============================================================================


@app.get("/health")
def health(
    request: Request,
) -> dict[str, Any]:
    """
    ML service readiness check.

    Returns HTTP 200 only when both ML models are loaded.
    """

    payment_ready = (
        getattr(
            request.app.state,
            "predictor",
            None,
        )
        is not None
    )

    cash_flow_ready = (
        getattr(
            request.app.state,
            "cash_flow_predictor",
            None,
        )
        is not None
    )

    if not payment_ready or not cash_flow_ready:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "status": "unhealthy",
                "payment_delay_model": (
                    "ready"
                    if payment_ready
                    else "unavailable"
                ),
                "cash_flow_model": (
                    "ready"
                    if cash_flow_ready
                    else "unavailable"
                ),
            },
        )

    return {
        "status": "healthy",
        "service": "CashGuard AI ML Service",
        "payment_delay_model": "ready",
        "cash_flow_model": "ready",
    }


# ============================================================================
# DETAILED MODEL HEALTH
# ============================================================================


@app.get("/health/models")
def model_health(
    request: Request,
) -> dict[str, Any]:
    """
    Detailed model readiness information.
    """

    payment_predictor = getattr(
        request.app.state,
        "predictor",
        None,
    )

    cash_predictor = getattr(
        request.app.state,
        "cash_flow_predictor",
        None,
    )

    payment_error = getattr(
        request.app.state,
        "model_error",
        None,
    )

    cash_flow_error = getattr(
        request.app.state,
        "cash_flow_model_error",
        None,
    )

    return {
        "service": "CashGuard-AI ML Service",

        "payment_delay": {
            "ready": payment_predictor is not None,
            "model_path": str(
                PAYMENT_DELAY_MODEL_PATH
            ),
            "error": (
                str(payment_error)
                if payment_error is not None
                else None
            ),
        },

        "cash_flow": {
            "ready": cash_predictor is not None,
            "model_path": str(
                CASH_FLOW_MODEL_PATH
            ),
            "metadata_path": str(
                CASH_FLOW_METADATA_PATH
            ),
            "error": (
                str(cash_flow_error)
                if cash_flow_error is not None
                else None
            ),
        },
    }


# ============================================================================
# PAYMENT DELAY PREDICTION
# ============================================================================


@app.post(
    "/predict/payment-delay",
    response_model=PaymentDelayPredictionResponse,
)
def predict_payment_delay(
    payload: PaymentDelayPredictionRequest,
    request: Request,
) -> PaymentDelayPredictionResponse:
    """
    Predict whether an eligible invoice will be paid late.
    """

    predictor = get_predictor(request)

    # ------------------------------------------------------------------------
    # VALIDATE INVOICE ID
    #
    # Pydantic already validates the request according to schemas.py.
    # This additional normalization prevents blank strings from reaching
    # the prediction layer.
    # ------------------------------------------------------------------------

    invoice_id = str(
        payload.invoice_id
    ).strip()

    if not invoice_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="invoice_id cannot be empty.",
        )

    # ------------------------------------------------------------------------
    # PREDICT
    # ------------------------------------------------------------------------

    try:
        result = predictor.predict(
            invoice_id=invoice_id,
        )

    except ValueError as exc:

        logger.info(
            (
                "Payment-delay prediction unavailable "
                "| invoice=%s | error=%s"
            ),
            invoice_id,
            exc,
        )

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                "Invoice was not found or does not have "
                "enough historical data for prediction."
            ),
        ) from exc

    except RuntimeError as exc:

        logger.exception(
            (
                "Payment-delay prediction runtime error "
                "| invoice=%s"
            ),
            invoice_id,
        )

        error_text = str(exc).lower()

        if (
            "database" in error_text
            or "mysql" in error_text
            or "connect" in error_text
        ):
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Database is currently unavailable.",
            ) from exc

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to generate payment-delay prediction.",
        ) from exc

    except Exception as exc:

        logger.exception(
            (
                "Unexpected payment-delay prediction error "
                "| invoice=%s"
            ),
            invoice_id,
        )

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to generate payment-delay prediction.",
        ) from exc

    # ------------------------------------------------------------------------
    # RESPONSE
    # ------------------------------------------------------------------------

    try:
        return PaymentDelayPredictionResponse(
            **result
        )

    except Exception as exc:

        logger.exception(
            "Invalid payment-delay prediction response."
        )

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=(
                "Prediction was generated but returned "
                "an invalid response format."
            ),
        ) from exc


# ============================================================================
# CASH FLOW FORECAST - POST
# ============================================================================


@app.post(
    "/predict/cash-flow",
    response_model=CashFlowForecastResponse,
)
def predict_cash_flow(
    payload: CashFlowForecastRequest,
    request: Request,
) -> CashFlowForecastResponse:
    """
    Generate Cash Flow forecast using the existing trained model.
    """

    horizon_days = validate_horizon(
        payload.horizon_days
    )

    predictor = get_cash_flow_predictor(
        request
    )

    business_id = clean_business_id(
        payload.business_id
    )

    try:
        forecast = predictor.forecast(
            horizon_days=horizon_days,
            business_id=business_id,
        )

    except ValueError as exc:

        logger.info(
            (
                "Cash-flow forecast validation error "
                "| business_id=%s "
                "| horizon=%s "
                "| error=%s"
            ),
            business_id,
            horizon_days,
            exc,
        )

        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc

    except RuntimeError as exc:

        logger.exception(
            "Cash-flow forecast runtime error."
        )

        if "database" in str(exc).lower():
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Database is currently unavailable.",
            ) from exc

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to generate Cash Flow forecast.",
        ) from exc

    except Exception as exc:

        logger.exception(
            (
                "Unexpected Cash-flow forecast error "
                "| business_id=%s"
            ),
            business_id,
        )

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to generate Cash Flow forecast.",
        ) from exc

    # ------------------------------------------------------------------------
    # RESPONSE ROWS
    # ------------------------------------------------------------------------

    try:
        response_rows = [
            CashFlowForecastRow(
                **row
            )
            for row in forecast
        ]

    except Exception as exc:

        logger.exception(
            "Cash-flow predictor returned invalid forecast rows."
        )

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Cash Flow forecast response is invalid.",
        ) from exc

    return CashFlowForecastResponse(
        business_id=business_id,
        horizon_days=horizon_days,
        forecast_days=len(response_rows),
        model=str(
            predictor.model_name
        ),
        target=str(
            predictor.target
        ),
        forecast=response_rows,
    )


# ============================================================================
# CASH FLOW FORECAST - GET
# ============================================================================


@app.get(
    "/predict/cash-flow",
    response_model=CashFlowForecastResponse,
)
def get_cash_flow_forecast(
    request: Request,
    business_id: str | None = Query(
        default=None,
        description=(
            "Business ID whose real cash-flow "
            "history should be used."
        ),
    ),
    horizon_days: int = Query(
        default=7,
        ge=1,
        description=(
            "Forecast horizon. Supported values: 7, 30, 60, 90."
        ),
    ),
) -> CashFlowForecastResponse:
    """
    GET version of Cash Flow forecasting.

    Example:

        /predict/cash-flow
        ?business_id=<BUSINESS_ID>
        &horizon_days=7
    """

    horizon_days = validate_horizon(
        horizon_days
    )

    predictor = get_cash_flow_predictor(
        request
    )

    business_id = clean_business_id(
        business_id
    )

    try:
        forecast = predictor.forecast(
            horizon_days=horizon_days,
            business_id=business_id,
        )

    except ValueError as exc:

        logger.info(
            "GET cash-flow validation error | error=%s",
            exc,
        )

        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc

    except RuntimeError as exc:

        logger.exception(
            "GET cash-flow runtime error."
        )

        if "database" in str(exc).lower():
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Database is currently unavailable.",
            ) from exc

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to generate Cash Flow forecast.",
        ) from exc

    except Exception as exc:

        logger.exception(
            "Unexpected GET cash-flow forecast error."
        )

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to generate Cash Flow forecast.",
        ) from exc

    try:
        rows = [
            CashFlowForecastRow(
                **row
            )
            for row in forecast
        ]

    except Exception as exc:

        logger.exception(
            "Invalid GET cash-flow forecast response."
        )

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Cash Flow forecast response is invalid.",
        ) from exc

    return CashFlowForecastResponse(
        business_id=business_id,
        horizon_days=horizon_days,
        forecast_days=len(rows),
        model=str(
            predictor.model_name
        ),
        target=str(
            predictor.target
        ),
        forecast=rows,
    )


# ============================================================================
# CASH FLOW FORECAST SUMMARY
# ============================================================================


@app.get(
    "/predict/cash-flow/summary",
    response_model=CashFlowForecastSummaryResponse,
)
def get_cash_flow_forecast_summary(
    request: Request,
    business_id: str | None = Query(
        default=None,
        description=(
            "Business ID whose real cash-flow "
            "history should be used."
        ),
    ),
    horizon_days: int = Query(
        default=7,
        ge=1,
        description=(
            "Forecast horizon. Supported values: 7, 30, 60, 90."
        ),
    ),
) -> CashFlowForecastSummaryResponse:
    """
    Return a compact summary of the Cash Flow ML forecast.
    """

    horizon_days = validate_horizon(
        horizon_days
    )

    predictor = get_cash_flow_predictor(
        request
    )

    business_id = clean_business_id(
        business_id
    )

    try:
        summary = predictor.forecast_summary(
            horizon_days=horizon_days,
            business_id=business_id,
        )

    except ValueError as exc:

        logger.info(
            "Cash-flow summary validation error | error=%s",
            exc,
        )

        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc

    except RuntimeError as exc:

        logger.exception(
            "Cash-flow summary runtime error."
        )

        if "database" in str(exc).lower():
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Database is currently unavailable.",
            ) from exc

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=(
                "Unable to generate Cash Flow forecast summary."
            ),
        ) from exc

    except Exception as exc:

        logger.exception(
            "Unexpected cash-flow forecast summary error."
        )

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=(
                "Unable to generate Cash Flow forecast summary."
            ),
        ) from exc

    # ------------------------------------------------------------------------
    # SAFE SUMMARY VALUES
    # ------------------------------------------------------------------------

    try:
        rows = [
            CashFlowForecastRow(
                **row
            )
            for row in summary.get(
                "forecast",
                [],
            )
        ]

        total_predicted = safe_float(
            summary.get(
                "total_predicted_net_cash_flow"
            )
        )

        average_daily_predicted = safe_float(
            summary.get(
                "average_daily_predicted_net_cash_flow"
            )
        )

        minimum_predicted = safe_float(
            summary.get(
                "minimum_predicted_net_cash_flow"
            )
        )

        maximum_predicted = safe_float(
            summary.get(
                "maximum_predicted_net_cash_flow"
            )
        )

    except Exception as exc:

        logger.exception(
            "Invalid cash-flow forecast summary response."
        )

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=(
                "Cash Flow forecast summary response is invalid."
            ),
        ) from exc

    return CashFlowForecastSummaryResponse(
        business_id=business_id,

        horizon_days=int(
            summary.get(
                "horizon_days",
                horizon_days,
            )
        ),

        forecast_days=int(
            summary.get(
                "forecast_days",
                len(rows),
            )
        ),

        model=str(
            predictor.model_name
        ),

        target=str(
            predictor.target
        ),

        total_predicted_net_cash_flow=total_predicted,

        average_daily_predicted_net_cash_flow=(
            average_daily_predicted
        ),

        minimum_predicted_net_cash_flow=(
            minimum_predicted
        ),

        maximum_predicted_net_cash_flow=(
            maximum_predicted
        ),

        forecast=rows,
    )


# ============================================================================
# CASH FLOW MODEL INFO
# ============================================================================


@app.get(
    "/predict/cash-flow/model",
)
def cash_flow_model_info(
    request: Request,
) -> dict[str, Any]:
    """
    Return safe metadata about the loaded Cash Flow model.
    """

    predictor = get_cash_flow_predictor(
        request
    )

    metadata = getattr(
        predictor,
        "model_metadata",
        {},
    )

    features = getattr(
        predictor,
        "features",
        [],
    )

    return {
        "model": str(
            predictor.model_name
        ),

        "target": str(
            predictor.target
        ),

        "feature_count": len(
            features
        ),

        "feature_columns": list(
            features
        ),

        "metadata_file": getattr(
            getattr(
                predictor,
                "metadata_path",
                None,
            ),
            "name",
            CASH_FLOW_METADATA_PATH.name,
        ),

        "supported_horizons": [
            7,
            30,
            60,
            90,
        ],

        "metadata_keys": sorted(
            str(key)
            for key in metadata.keys()
        ),
    }


# ============================================================================
# ROOT
# ============================================================================


@app.get("/")
def root() -> dict[str, Any]:
    """
    Basic service information endpoint.
    """

    return {
        "service": "CashGuard AI ML Service",
        "version": "1.3.0",
        "status": "running",
        "docs": "/docs",
        "health": "/health",
        "health_models": "/health/models",
    }
