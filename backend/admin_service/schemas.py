from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


# ============================================================================
# COMMON CONFIG
# ============================================================================

class CashGuardBaseModel(BaseModel):
    """
    Common Pydantic configuration for the CashGuard-AI backend/admin layer.

    extra="allow":
        Keeps the API forward compatible with additional database fields,
        AI metadata, ML metadata and future platform fields.

    populate_by_name=True:
        Allows both normal field names and Pydantic aliases where applicable.
    """

    model_config = ConfigDict(
        extra="allow",
        populate_by_name=True,
    )


class AdminResponse(
    CashGuardBaseModel
):
    status: str = "success"


class PaginatedResponse(
    CashGuardBaseModel
):
    status: str = "success"
    total: int = 0
    limit: int = 100
    offset: int = 0


# ============================================================================
# ADMIN SUMMARY
# ============================================================================

class AdminSummary(
    CashGuardBaseModel
):
    """
    Platform-wide administrator KPI summary.
    """

    totalBusinesses: int = 0

    activeBusinesses: int = 0

    totalUsers: int = 0

    transactionsToday: int = 0

    paymentsToday: int = 0

    highRiskTransactions: int = 0

    aiRequestsToday: int = 0

    systemAlerts: int = 0


# ============================================================================
# BUSINESS MANAGEMENT
# ============================================================================

class BusinessAdminResponse(
    CashGuardBaseModel
):
    """
    Business information exposed to the Admin Control Centre.

    Owner fields are optional because the current database structure may
    not yet contain an explicit business -> owner relationship.

    Once the relationship is added, the backend can populate:

        owner
        ownerId
        ownerEmail
        ownerRole
    """

    # ------------------------------------------------------------------------
    # Identity
    # ------------------------------------------------------------------------

    id: str

    name: str = "Unnamed business"

    # ------------------------------------------------------------------------
    # OWNER
    # ------------------------------------------------------------------------

    owner: str = "—"

    ownerId: int | str | None = None

    ownerEmail: str | None = None

    ownerRole: str | None = None

    # ------------------------------------------------------------------------
    # BUSINESS PROFILE
    # ------------------------------------------------------------------------

    industry: str = "—"

    location: str = "—"

    city: str | None = None

    state: str | None = None

    gstin: str = "—"

    # ------------------------------------------------------------------------
    # BUSINESS METRICS
    # ------------------------------------------------------------------------

    users: int = 0

    transactions: int = 0

    outstanding: float = 0.0

    # ------------------------------------------------------------------------
    # RISK / BANKING / STATUS
    # ------------------------------------------------------------------------

    risk: str = "LOW"

    banking: str = "Unavailable"

    status: str = "ACTIVE"

    # ------------------------------------------------------------------------
    # ACTIVITY / AI
    # ------------------------------------------------------------------------

    lastActive: str | None = None

    ai: str = "Unavailable"

    # ------------------------------------------------------------------------
    # OPTIONAL METADATA
    # ------------------------------------------------------------------------

    metadata: dict[str, Any] = Field(
        default_factory=dict
    )


class BusinessStatusUpdateRequest(
    CashGuardBaseModel
):
    status: str = Field(
        default="ACTIVE",
        min_length=1,
        max_length=30,
    )


class BusinessAdminListResponse(
    PaginatedResponse
):
    businesses: list[
        BusinessAdminResponse
    ] = Field(
        default_factory=list
    )

    items: list[
        BusinessAdminResponse
    ] = Field(
        default_factory=list
    )

    data: list[
        BusinessAdminResponse
    ] = Field(
        default_factory=list
    )


# ============================================================================
# USER MANAGEMENT
# ============================================================================

class AdminUserResponse(
    CashGuardBaseModel
):
    """
    User information exposed to the Admin Control Centre.
    """

    # ------------------------------------------------------------------------
    # Identity
    # ------------------------------------------------------------------------

    id: int | str

    name: str = "User"

    email: str = ""

    # ------------------------------------------------------------------------
    # AUTHORIZATION
    # ------------------------------------------------------------------------

    role: str = "user"

    status: str = "Inactive"

    security: str = "Standard"

    # ------------------------------------------------------------------------
    # BUSINESS
    # ------------------------------------------------------------------------

    business: str = "—"

    businessId: int | str | None = None

    # ------------------------------------------------------------------------
    # ACTIVITY
    # ------------------------------------------------------------------------

    lastLogin: str | None = None

    created_at: str | None = None

    updated_at: str | None = None

    # ------------------------------------------------------------------------
    # OPTIONAL ACCOUNT INFORMATION
    # ------------------------------------------------------------------------

    isActive: bool | None = None

    metadata: dict[str, Any] = Field(
        default_factory=dict
    )


class UserStatusUpdateRequest(
    CashGuardBaseModel
):
    """
    Supports both:

        {
            "is_active": true
        }

    and:

        {
            "status": "Active"
        }
    """

    is_active: bool | None = None

    status: str | None = Field(
        default=None,
        max_length=30,
    )


class AdminUserListResponse(
    PaginatedResponse
):
    users: list[
        AdminUserResponse
    ] = Field(
        default_factory=list
    )

    items: list[
        AdminUserResponse
    ] = Field(
        default_factory=list
    )

    data: list[
        AdminUserResponse
    ] = Field(
        default_factory=list
    )


# ============================================================================
# PLATFORM HEALTH
# ============================================================================

class ServiceHealthResponse(
    CashGuardBaseModel
):
    name: str

    status: str = "Unknown"

    latency: str = "—"

    errorRate: str = "—"

    checked: str = "—"

    details: dict[str, Any] = Field(
        default_factory=dict
    )


class PlatformHealthResponse(
    CashGuardBaseModel
):
    status: str = "Unknown"

    database: str = "Unknown"

    services: list[
        ServiceHealthResponse
    ] = Field(
        default_factory=list
    )

    checked: str | None = None

    details: dict[str, Any] = Field(
        default_factory=dict
    )


# ============================================================================
# AI STATUS
# ============================================================================

class AIStatusResponse(
    CashGuardBaseModel
):
    """
    Runtime GenAI provider status.
    """

    status: str = "Unavailable"

    provider: str = "Ollama"

    baseUrl: str = ""

    connected: bool = False

    checked: str = ""

    details: dict[str, Any] = Field(
        default_factory=dict
    )

    model: str = ""

    available: bool = False

    configured: bool = False

    message: str = ""

    requestsToday: int = 0

    lastError: str | None = None


class AIConfigurationResponse(
    CashGuardBaseModel
):
    provider: str = "Ollama"

    model: str = ""

    baseUrl: str = ""

    configured: bool = False

    enabled: bool = False

    connected: bool = False

    temperature: float = 0.2

    maxTokens: int = 1000

    systemPromptConfigured: bool = False


# ============================================================================
# AI MODEL GOVERNANCE
# ============================================================================

class AIModelResponse(
    CashGuardBaseModel
):
    name: str

    version: str = "—"

    status: str = "Unavailable"

    predictions: str | int = "—"

    confidence: str | float | int | None = None

    trained: str | None = None

    source: str = "CashGuard-AI"

    provider: str | None = None

    modelType: str = "ML"

    task: str = "Prediction"

    enabled: bool = True

    metadata: dict[str, Any] = Field(
        default_factory=dict
    )


class AIModelListResponse(
    PaginatedResponse
):
    models: list[
        AIModelResponse
    ] = Field(
        default_factory=list
    )

    items: list[
        AIModelResponse
    ] = Field(
        default_factory=list
    )

    data: list[
        AIModelResponse
    ] = Field(
        default_factory=list
    )


# ============================================================================
# AI INSIGHTS
# ============================================================================

class AIInsightResponse(
    CashGuardBaseModel
):
    id: str

    title: str

    business: str = "—"

    businessId: str | None = None

    severity: str = "Info"

    recommendation: str = ""

    confidence: str | float | int | None = None

    model: str = "CashGuard-AI"

    created_at: str | None = None

    updated_at: str | None = None

    category: str = "Cash Flow"

    source: str = "AI"

    action: str | None = None

    financialImpact: float | None = None

    horizon: str | None = None

    metadata: dict[str, Any] = Field(
        default_factory=dict
    )


class AIInsightListResponse(
    PaginatedResponse
):
    insights: list[
        AIInsightResponse
    ] = Field(
        default_factory=list
    )

    items: list[
        AIInsightResponse
    ] = Field(
        default_factory=list
    )

    data: list[
        AIInsightResponse
    ] = Field(
        default_factory=list
    )


# ============================================================================
# AI CHAT
# ============================================================================

class AIChatMessage(
    CashGuardBaseModel
):
    role: str = Field(
        default="user",
        min_length=1,
        max_length=30,
    )

    content: str = Field(
        ...,
        min_length=1,
        max_length=10000,
    )


class AIChatRequest(
    CashGuardBaseModel
):
    """
    Generic CashGuard AI request.

    business_id is optional because platform-level administrator
    requests may not belong to a specific business.
    """

    message: str = Field(
        ...,
        min_length=1,
        max_length=10000,
    )

    business_id: str | None = None

    conversation_id: str | None = None

    context: dict[str, Any] = Field(
        default_factory=dict
    )

    history: list[
        AIChatMessage
    ] = Field(
        default_factory=list
    )

    temperature: float = Field(
        default=0.2,
        ge=0.0,
        le=2.0,
    )

    max_tokens: int = Field(
        default=1000,
        ge=50,
        le=8000,
    )


class AIChatResponse(
    CashGuardBaseModel
):
    status: str = "success"

    answer: str = ""

    response: str = ""

    provider: str = "Ollama"

    model: str = ""

    conversation_id: str | None = None

    business_id: str | None = None

    confidence: float | None = None

    recommendations: list[str] = Field(
        default_factory=list
    )

    sources: list[str] = Field(
        default_factory=list
    )

    metadata: dict[str, Any] = Field(
        default_factory=dict
    )


# ============================================================================
# CASH FLOW AI
# ============================================================================

class CashFlowAIRequest(
    CashGuardBaseModel
):
    business_id: str

    forecast_days: int = Field(
        default=30,
        ge=1,
        le=365,
    )

    include_recommendations: bool = True

    include_risk: bool = True

    include_forecast: bool = True


class CashFlowForecastPoint(
    CashGuardBaseModel
):
    date: str

    inflow: float = 0.0

    outflow: float = 0.0

    net: float = 0.0

    projectedBalance: float | None = None

    lowerBound: float | None = None

    upperBound: float | None = None


class CashFlowAIResponse(
    CashGuardBaseModel
):
    status: str = "success"

    business_id: str

    current_balance: float = 0.0

    projected_balance: float | None = None

    cash_flow_status: str = "UNKNOWN"

    risk_level: str = "LOW"

    risk_score: float = 0.0

    forecast_days: int = 30

    confidence: float | None = None

    forecast: list[
        CashFlowForecastPoint
    ] = Field(
        default_factory=list
    )

    insights: list[str] = Field(
        default_factory=list
    )

    recommendations: list[str] = Field(
        default_factory=list
    )

    model: str = "CashGuard Cash Flow AI"

    model_version: str = "—"

    generated_at: str | None = None

    metadata: dict[str, Any] = Field(
        default_factory=dict
    )


# ============================================================================
# PAYMENT DELAY PREDICTION
# ============================================================================

class PaymentDelayPredictionRequest(
    CashGuardBaseModel
):
    payment_id: str | None = None

    invoice_id: str | None = None

    business_id: str | None = None

    customer_id: str | None = None

    amount: float = Field(
        default=0.0,
        ge=0.0,
    )

    due_date: str | None = None

    payment_date: str | None = None

    features: dict[str, Any] = Field(
        default_factory=dict
    )


class PaymentDelayPredictionResponse(
    CashGuardBaseModel
):
    status: str = "success"

    payment_id: str | None = None

    invoice_id: str | None = None

    business_id: str | None = None

    customer_id: str | None = None

    prediction: str = "UNKNOWN"

    risk_level: str = "LOW"

    risk_score: float = 0.0

    probability: float | None = None

    expected_delay_days: float | None = None

    confidence: float | None = None

    model: str = "Payment Delay Predictor"

    model_version: str = "—"

    signals: list[str] = Field(
        default_factory=list
    )

    recommendations: list[str] = Field(
        default_factory=list
    )

    created_at: str | None = None

    metadata: dict[str, Any] = Field(
        default_factory=dict
    )


# ============================================================================
# ML STATUS
# ============================================================================

class MLStatusResponse(
    CashGuardBaseModel
):
    status: str = "Unavailable"

    paymentDelayModel: str = "Unavailable"

    cashFlowModel: str = "Unavailable"

    modelsDirectory: str = ""

    checked: str = ""

    available: bool = False

    payment_delay_model: str = "Unavailable"

    cash_flow_model: str = "Unavailable"

    models_endpoint: str = ""

    loadedModels: int = 0

    metadata: dict[str, Any] = Field(
        default_factory=dict
    )


# ============================================================================
# ML MODEL REGISTRY
# ============================================================================

class MLModelInfo(
    CashGuardBaseModel
):
    name: str

    version: str = "—"

    path: str = ""

    exists: bool = False

    loaded: bool = False

    status: str = "Unavailable"

    task: str = "Prediction"

    framework: str = "Unknown"

    metadata: dict[str, Any] = Field(
        default_factory=dict
    )


class MLModelRegistryResponse(
    CashGuardBaseModel
):
    status: str = "success"

    models: list[
        MLModelInfo
    ] = Field(
        default_factory=list
    )

    total: int = 0

    available: int = 0

    checked: str = ""


# ============================================================================
# TRANSACTION ANOMALIES
# ============================================================================

class TransactionAnomalyResponse(
    CashGuardBaseModel
):
    id: str

    business: str = "—"

    businessId: str | None = None

    amount: str | float | int = 0

    type: str = "Payment risk"

    risk: str = "LOW"

    score: str | float | int = 0

    reason: str = ""

    status: str = "New"

    created_at: str | None = None

    transaction_id: str | None = None

    payment_id: str | None = None

    model: str = "Risk Engine"

    confidence: float | None = None

    signals: list[str] = Field(
        default_factory=list
    )


class TransactionAnomalyListResponse(
    PaginatedResponse
):
    anomalies: list[
        TransactionAnomalyResponse
    ] = Field(
        default_factory=list
    )

    items: list[
        TransactionAnomalyResponse
    ] = Field(
        default_factory=list
    )

    data: list[
        TransactionAnomalyResponse
    ] = Field(
        default_factory=list
    )


# ============================================================================
# ALERTS
# ============================================================================

class AdminAlertResponse(
    CashGuardBaseModel
):
    id: str

    user_id: int | None = None

    risk_result_id: str | None = None

    type: str = "GENERAL"

    severity: str = "INFO"

    title: str = "Alert"

    message: str = ""

    entity_type: str | None = None

    entity_id: str | None = None

    status: str = "UNREAD"

    metadata: dict[str, Any] | None = None

    created_at: str | None = None

    read_at: str | None = None

    resolved_at: str | None = None

    category: str = "General"

    source: str = "CashGuard-AI"

    action_url: str | None = None


class AlertUpdateRequest(
    CashGuardBaseModel
):
    status: str | None = Field(
        default=None,
        max_length=30,
    )

    is_read: bool | None = None

    is_resolved: bool | None = None


class AdminAlertListResponse(
    PaginatedResponse
):
    alerts: list[
        AdminAlertResponse
    ] = Field(
        default_factory=list
    )

    items: list[
        AdminAlertResponse
    ] = Field(
        default_factory=list
    )

    data: list[
        AdminAlertResponse
    ] = Field(
        default_factory=list
    )


# ============================================================================
# AUDIT LOG
# ============================================================================

class AuditLogResponse(
    CashGuardBaseModel
):
    id: str

    actor_user_id: int | None = None

    event_type: str = "UNKNOWN"

    entity_type: str = "UNKNOWN"

    entity_id: str | None = None

    ip_address: str | None = None

    request_id: str | None = None

    metadata: dict[str, Any] | None = None

    created_at: str | None = None

    action: str = "Unknown action"

    actor: str = "Unknown"

    entity: str = "Unknown"


class AuditLogListResponse(
    PaginatedResponse
):
    audit_logs: list[
        AuditLogResponse
    ] = Field(
        default_factory=list
    )

    items: list[
        AuditLogResponse
    ] = Field(
        default_factory=list
    )

    data: list[
        AuditLogResponse
    ] = Field(
        default_factory=list
    )


# ============================================================================
# DATA QUALITY
# ============================================================================

class DataQualityTableResult(
    CashGuardBaseModel
):
    table: str

    exists: bool = True

    rows: int = 0

    status: str = "Healthy"

    total_rows: int = 0

    null_rows: int = 0

    duplicate_rows: int = 0

    invalid_rows: int = 0

    score: float = 100.0


class DataQualityResponse(
    CashGuardBaseModel
):
    status: str = "Degraded"

    tablesChecked: int = 0

    tableResults: list[
        dict[str, Any]
    ] = Field(
        default_factory=list
    )

    tables: list[
        DataQualityTableResult
    ] = Field(
        default_factory=list
    )

    healthyTables: int = 0

    degradedTables: int = 0

    generatedAt: str | None = None


# ============================================================================
# ADMIN PLATFORM CONFIGURATION
# ============================================================================

class AdminConfigurationResponse(
    CashGuardBaseModel
):
    """
    Runtime configuration exposed safely to the Admin UI.

    Secrets/passwords/API keys must never be exposed here.
    """

    environment: str = "development"

    apiVersion: str = "1.0"

    aiEnabled: bool = False

    mlEnabled: bool = False

    bankingEnabled: bool = False

    paymentsEnabled: bool = False

    notificationsEnabled: bool = False

    reconciliationEnabled: bool = False

    riskEngineEnabled: bool = False

    alertsEnabled: bool = False

    auditLoggingEnabled: bool = True

    databaseConnected: bool = False

    configSource: str = "backend"


class AdminConfigurationUpdateRequest(
    CashGuardBaseModel
):
    aiEnabled: bool | None = None

    mlEnabled: bool | None = None

    bankingEnabled: bool | None = None

    paymentsEnabled: bool | None = None

    notificationsEnabled: bool | None = None

    reconciliationEnabled: bool | None = None

    riskEngineEnabled: bool | None = None

    alertsEnabled: bool | None = None


# ============================================================================
# RISK CONTROL
# ============================================================================

class CashFlowRiskResponse(
    CashGuardBaseModel
):
    business_id: str

    current_balance: float = 0.0

    expected_inflow: float = 0.0

    expected_outflow: float = 0.0

    projected_balance: float = 0.0

    risk_level: str = "LOW"

    risk_score: float = 0.0

    confidence: float | None = None

    payment_pressure: float = 0.0

    collection_pressure: float = 0.0

    liquidity_status: str = "STABLE"

    recommendations: list[str] = Field(
        default_factory=list
    )

    forecast: list[
        CashFlowForecastPoint
    ] = Field(
        default_factory=list
    )

    model: str = "CashGuard Risk Engine"

    generated_at: str | None = None


# ============================================================================
# SYSTEM STATUS
# ============================================================================

class SystemStatusResponse(
    CashGuardBaseModel
):
    status: str = "Unknown"

    api: str = "Unknown"

    database: str = "Unknown"

    ai: str = "Unknown"

    ml: str = "Unknown"

    banking: str = "Unknown"

    payments: str = "Unknown"

    notifications: str = "Unknown"

    risk: str = "Unknown"

    alerts: str = "Unknown"

    checked: str = ""

    details: dict[str, Any] = Field(
        default_factory=dict
    )


# ============================================================================
# ADMIN PAGINATION / GENERIC COLLECTIONS
# ============================================================================

class AdminBusinessCollection(
    PaginatedResponse
):
    items: list[
        BusinessAdminResponse
    ] = Field(
        default_factory=list
    )

    data: list[
        BusinessAdminResponse
    ] = Field(
        default_factory=list
    )

    businesses: list[
        BusinessAdminResponse
    ] = Field(
        default_factory=list
    )


class AdminUserCollection(
    PaginatedResponse
):
    items: list[
        AdminUserResponse
    ] = Field(
        default_factory=list
    )

    data: list[
        AdminUserResponse
    ] = Field(
        default_factory=list
    )

    users: list[
        AdminUserResponse
    ] = Field(
        default_factory=list
    )


class AdminAIInsightCollection(
    PaginatedResponse
):
    items: list[
        AIInsightResponse
    ] = Field(
        default_factory=list
    )

    data: list[
        AIInsightResponse
    ] = Field(
        default_factory=list
    )

    insights: list[
        AIInsightResponse
    ] = Field(
        default_factory=list
    )


class AdminAIModelCollection(
    PaginatedResponse
):
    items: list[
        AIModelResponse
    ] = Field(
        default_factory=list
    )

    data: list[
        AIModelResponse
    ] = Field(
        default_factory=list
    )

    models: list[
        AIModelResponse
    ] = Field(
        default_factory=list
    )


class AdminAlertCollection(
    PaginatedResponse
):
    items: list[
        AdminAlertResponse
    ] = Field(
        default_factory=list
    )

    data: list[
        AdminAlertResponse
    ] = Field(
        default_factory=list
    )

    alerts: list[
        AdminAlertResponse
    ] = Field(
        default_factory=list
    )


class AdminAuditCollection(
    PaginatedResponse
):
    items: list[
        AuditLogResponse
    ] = Field(
        default_factory=list
    )

    data: list[
        AuditLogResponse
    ] = Field(
        default_factory=list
    )

    audit_logs: list[
        AuditLogResponse
    ] = Field(
        default_factory=list
    )


class AdminAnomalyCollection(
    PaginatedResponse
):
    items: list[
        TransactionAnomalyResponse
    ] = Field(
        default_factory=list
    )

    data: list[
        TransactionAnomalyResponse
    ] = Field(
        default_factory=list
    )

    anomalies: list[
        TransactionAnomalyResponse
    ] = Field(
        default_factory=list
    )


# ============================================================================
# EXPORTS
# ============================================================================

__all__ = [
    # Common
    "CashGuardBaseModel",
    "AdminResponse",
    "PaginatedResponse",

    # Summary
    "AdminSummary",

    # Business
    "BusinessAdminResponse",
    "BusinessStatusUpdateRequest",
    "BusinessAdminListResponse",
    "AdminBusinessCollection",

    # Users
    "AdminUserResponse",
    "UserStatusUpdateRequest",
    "AdminUserListResponse",
    "AdminUserCollection",

    # Health
    "ServiceHealthResponse",
    "PlatformHealthResponse",
    "SystemStatusResponse",

    # AI
    "AIStatusResponse",
    "AIConfigurationResponse",
    "AIModelResponse",
    "AIModelListResponse",
    "AdminAIModelCollection",
    "AIInsightResponse",
    "AIInsightListResponse",
    "AdminAIInsightCollection",
    "AIChatMessage",
    "AIChatRequest",
    "AIChatResponse",

    # Cash flow AI
    "CashFlowAIRequest",
    "CashFlowForecastPoint",
    "CashFlowAIResponse",
    "CashFlowRiskResponse",

    # Payment delay AI / ML
    "PaymentDelayPredictionRequest",
    "PaymentDelayPredictionResponse",

    # ML
    "MLStatusResponse",
    "MLModelInfo",
    "MLModelRegistryResponse",

    # Anomalies
    "TransactionAnomalyResponse",
    "TransactionAnomalyListResponse",
    "AdminAnomalyCollection",

    # Alerts
    "AdminAlertResponse",
    "AlertUpdateRequest",
    "AdminAlertListResponse",
    "AdminAlertCollection",

    # Audit
    "AuditLogResponse",
    "AuditLogListResponse",
    "AdminAuditCollection",

    # Data quality
    "DataQualityTableResult",
    "DataQualityResponse",

    # Configuration
    "AdminConfigurationResponse",
    "AdminConfigurationUpdateRequest",
]