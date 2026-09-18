'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'

import type { ReactNode } from 'react'

import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowUpRight,
  BrainCircuit,
  Building2,
  Check,
  CheckCircle2,
  ChevronRight,
  Database,
  Download,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  Users,
  Wallet,
  X,
} from 'lucide-react'

/* ============================================================================
 * TYPES
 * ========================================================================== */

type AdminSummary = {
  total_businesses: number
  active_businesses: number
  total_users: number
  transactions_today: number
  payments_today: number
  high_risk_transactions: number
  ai_requests_today: number
  system_alerts: number
}

type BusinessAdmin = {
  id: string
  name: string
  owner: string
  industry: string
  location: string
  users: number
  transactions: number
  outstanding: number
  risk: string
  banking: string
  status: string
  last_active: string | null
  gstin: string
  ai: string
}

type AdminUser = {
  id: string
  name: string
  business: string
  role: string
  email: string
  last_login: string | null
  status: string
  security: string
}

type ServiceHealth = {
  name: string
  status: string
  latency: string
  error_rate: string
  checked: string
}

type AIModel = {
  name: string
  version: string
  status: string
  predictions: number
  confidence: number | null
  trained: string | null
  source: string
}

type AIInsight = {
  id: string
  title: string
  business: string
  severity: string
  recommendation: string
  confidence: number | null
  model: string
  created_at: string | null
}

type TransactionAnomaly = {
  id: string
  business: string
  amount: number
  type: string
  risk: string
  score: number
  reason: string
  status: string
  created_at: string | null
}

type AlertRecord = {
  id: string
  title: string
  message: string
  severity: string
  status: string
  category: string
  created_at: string | null
}

type AuditRecord = {
  id: string
  action: string
  actor: string
  entity: string
  entity_id: string
  created_at: string | null
  ip_address: string
}

type DataQuality = {
  table: string
  total_rows: number
  null_rows: number
  duplicate_rows: number
  invalid_rows: number
  score: number
}

type AIStatus = {
  available: boolean
  provider: string
  model: string
  configured: boolean
  message: string
}

type MLStatus = {
  available: boolean
  payment_delay_model: string
  cash_flow_model: string
  models_endpoint: string
}

type AdminTab =
  | 'Overview'
  | 'Businesses'
  | 'Users'
  | 'Platform Health'
  | 'AI Control Centre'
  | 'Anomalies'
  | 'Alerts & Audit'
  | 'Configuration'

type StatusTone =
  | 'success'
  | 'warning'
  | 'danger'
  | 'neutral'

/* ============================================================================
 * CONFIGURATION
 * ========================================================================== */

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL ||
  'http://127.0.0.1:8000'
).replace(
  /\/+$/,
  '',
)

const AUTH_TOKEN_KEYS = [
  'access_token',
  'accessToken',
  'token',
  'auth_token',
  'jwt_token',
  'jwt',
  'cashguard_access_token',
  'cashguard_token',
] as const

const AUTH_OBJECT_KEYS = [
  'auth',
  'session',
  'authData',
  'auth_data',
  'currentUser',
  'current_user',
  'userSession',
  'cashguard_session',
] as const

/* ============================================================================
 * AUTH HELPERS
 * ========================================================================== */

function cleanToken(
  value: unknown,
): string {
  if (
    typeof value !== 'string'
  ) {
    return ''
  }

  return value
    .trim()
    .replace(
      /^Bearer\s+/i,
      '',
    )
    .trim()
}

function extractToken(
  value: unknown,
): string {
  if (!value) {
    return ''
  }

  if (
    typeof value === 'string'
  ) {
    const direct =
      cleanToken(value)

    if (direct) {
      return direct
    }

    try {
      return extractToken(
        JSON.parse(value),
      )
    } catch {
      return ''
    }
  }

  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value)
  ) {
    return ''
  }

  const record =
    value as Record<
      string,
      unknown
    >

  const directKeys = [
    'access_token',
    'accessToken',
    'token',
    'jwt',
    'jwt_token',
    'cashguard_access_token',
    'cashguard_token',
  ]

  for (
    const key of directKeys
  ) {
    const token =
      cleanToken(
        record[key],
      )

    if (token) {
      return token
    }
  }

  const nestedKeys = [
    'data',
    'auth',
    'session',
    'tokens',
    'credentials',
  ]

  for (
    const key of nestedKeys
  ) {
    const token =
      extractToken(
        record[key],
      )

    if (token) {
      return token
    }
  }

  return ''
}

function getAuthToken(): string {
  if (
    typeof window === 'undefined'
  ) {
    return ''
  }

  const storages: Storage[] = [
    window.localStorage,
    window.sessionStorage,
  ]

  for (
    const storage of storages
  ) {
    for (
      const key of AUTH_TOKEN_KEYS
    ) {
      try {
        const token =
          extractToken(
            storage.getItem(key),
          )

        if (token) {
          return token
        }
      } catch {
        // Ignore storage errors.
      }
    }
  }

  for (
    const storage of storages
  ) {
    for (
      const key of AUTH_OBJECT_KEYS
    ) {
      try {
        const token =
          extractToken(
            storage.getItem(key),
          )

        if (token) {
          return token
        }
      } catch {
        // Ignore storage errors.
      }
    }
  }

  return ''
}

/* ============================================================================
 * API ERROR
 * ========================================================================== */

class AdminApiError extends Error {
  readonly status: number
  readonly endpoint: string
  readonly payload: unknown

  constructor(
    message: string,
    status: number,
    endpoint: string,
    payload: unknown = null,
  ) {
    super(message)

    this.name = 'AdminApiError'
    this.status = status
    this.endpoint = endpoint
    this.payload = payload

    Object.setPrototypeOf(
      this,
      AdminApiError.prototype,
    )
  }
}

/* ============================================================================
 * GENERIC HELPERS
 * ========================================================================== */

function isRecord(
  value: unknown,
): value is Record<
  string,
  unknown
> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value)
  )
}

function stringValue(
  value: unknown,
): string {
  if (
    typeof value === 'string'
  ) {
    return value.trim()
  }

  if (
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return String(value)
  }

  return ''
}

function numberValue(
  value: unknown,
): number {
  if (
    typeof value === 'number' &&
    Number.isFinite(value)
  ) {
    return value
  }

  if (
    typeof value === 'string'
  ) {
    const normalized =
      value
        .replace(
          /[₹,%\s]/g,
          '',
        )
        .trim()

    if (!normalized) {
      return 0
    }

    const parsed =
      Number(normalized)

    return Number.isFinite(
      parsed,
    )
      ? parsed
      : 0
  }

  return 0
}

function nullableString(
  value: unknown,
): string | null {
  const result =
    stringValue(value)

  return result || null
}

function booleanValue(
  value: unknown,
  fallback = false,
): boolean {
  if (
    value === undefined ||
    value === null
  ) {
    return fallback
  }

  if (
    value === true ||
    value === 1
  ) {
    return true
  }

  if (
    value === false ||
    value === 0
  ) {
    return false
  }

  if (
    typeof value === 'string'
  ) {
    return [
      'true',
      '1',
      'yes',
      'active',
      'enabled',
      'available',
      'healthy',
      'ready',
    ].includes(
      value
        .trim()
        .toLowerCase(),
    )
  }

  return fallback
}

function extractArray<T>(
  value: unknown,
): T[] {
  if (
    Array.isArray(value)
  ) {
    return value as T[]
  }

  if (
    !isRecord(value)
  ) {
    return []
  }

  const possibleKeys = [
    'items',
    'data',
    'results',
    'records',
    'businesses',
    'users',
    'services',
    'models',
    'insights',
    'anomalies',
    'alerts',
    'audit_logs',
    'tableResults',
    'table_results',
  ]

  for (
    const key of possibleKeys
  ) {
    const candidate =
      value[key]

    if (
      Array.isArray(candidate)
    ) {
      return candidate as T[]
    }
  }

  return []
}

function normalizeConfidence(
  value: unknown,
): number | null {
  if (
    value === undefined ||
    value === null ||
    value === ''
  ) {
    return null
  }

  const numeric =
    numberValue(value)

  if (
    numeric <= 1
  ) {
    return numeric
  }

  return numeric / 100
}

/* ============================================================================
 * NORMALIZERS
 * ========================================================================== */

function normalizeSummary(
  value: unknown,
): AdminSummary {
  const record =
    isRecord(value)
      ? value
      : {}

  return {
    total_businesses:
      numberValue(
        record.total_businesses ??
          record.totalBusinesses ??
          record.total_business,
      ),

    active_businesses:
      numberValue(
        record.active_businesses ??
          record.activeBusinesses ??
          record.active_business,
      ),

    total_users:
      numberValue(
        record.total_users ??
          record.totalUsers,
      ),

    transactions_today:
      numberValue(
        record.transactions_today ??
          record.transactionsToday,
      ),

    payments_today:
      numberValue(
        record.payments_today ??
          record.paymentsToday,
      ),

    high_risk_transactions:
      numberValue(
        record.high_risk_transactions ??
          record.highRiskTransactions,
      ),

    ai_requests_today:
      numberValue(
        record.ai_requests_today ??
          record.aiRequestsToday,
      ),

    system_alerts:
      numberValue(
        record.system_alerts ??
          record.systemAlerts,
      ),
  }
}

function normalizeBusiness(
  value: unknown,
): BusinessAdmin | null {
  if (
    !isRecord(value)
  ) {
    return null
  }

  const id =
    stringValue(
      value.id ??
        value.business_id ??
        value.businessId,
    )

  if (!id) {
    return null
  }

  return {
    id,

    name:
      stringValue(
        value.name ??
          value.business_name ??
          value.businessName ??
          value.display_name ??
          value.company_name,
      ) ||
      'Unnamed business',

    owner:
      stringValue(
        value.owner ??
          value.owner_name ??
          value.ownerName ??
          value.contact_name,
      ) ||
      '—',

    industry:
      stringValue(
        value.industry ??
          value.business_type ??
          value.businessType ??
          value.type,
      ) ||
      '—',

    location:
      stringValue(
        value.location ??
          value.city ??
          value.state ??
          value.address,
      ) ||
      '—',

    users:
      numberValue(
        value.users ??
          value.user_count ??
          value.users_count,
      ),

    transactions:
      numberValue(
        value.transactions ??
          value.transaction_count ??
          value.transactions_count,
      ),

    outstanding:
      numberValue(
        value.outstanding ??
          value.outstanding_amount ??
          value.balance_due,
      ),

    risk:
      stringValue(
        value.risk ??
          value.risk_level,
      ) ||
      'LOW',

    banking:
      stringValue(
        value.banking ??
          value.banking_status,
      ) ||
      'Unavailable',

    status:
      stringValue(
        value.status ??
          value.state,
      ) ||
      'ACTIVE',

    last_active:
      nullableString(
        value.last_active ??
          value.lastActive ??
          value.last_activity ??
          value.updated_at ??
          value.updatedAt,
      ),

    gstin:
      stringValue(
        value.gstin ??
          value.GSTIN ??
          value.gst_number ??
          value.gst_no,
      ) ||
      '—',

    ai:
      stringValue(
        value.ai ??
          value.ai_status,
      ) ||
      'Unavailable',
  }
}

function normalizeUser(
  value: unknown,
): AdminUser | null {
  if (
    !isRecord(value)
  ) {
    return null
  }

  const id =
    stringValue(
      value.id ??
        value.user_id ??
        value.userId,
    )

  if (!id) {
    return null
  }

  let status =
    stringValue(
      value.status ??
        value.state,
    )

  if (!status) {
    status =
      booleanValue(
        value.is_active,
        true,
      )
        ? 'Active'
        : 'Inactive'
  }

  return {
    id,

    name:
      stringValue(
        value.name ??
          value.full_name ??
          value.fullName,
      ) ||
      'Unnamed user',

    business:
      stringValue(
        value.business ??
          value.business_name ??
          value.businessName ??
          value.business_id,
      ) ||
      '—',

    role:
      stringValue(
        value.role ??
          value.user_role,
      ) ||
      'user',

    email:
      stringValue(
        value.email,
      ) ||
      '—',

    last_login:
      nullableString(
        value.last_login ??
          value.lastLogin ??
          value.last_login_at ??
          value.updated_at,
      ),

    status,

    security:
      stringValue(
        value.security ??
          value.security_status ??
          value.mfa_status,
      ) ||
      'Standard',
  }
}

function normalizeService(
  value: unknown,
): ServiceHealth | null {
  if (
    !isRecord(value)
  ) {
    return null
  }

  const name =
    stringValue(
      value.name ??
        value.service ??
        value.service_name,
    )

  if (!name) {
    return null
  }

  return {
    name,

    status:
      stringValue(
        value.status,
      ) ||
      'Unknown',

    latency:
      stringValue(
        value.latency ??
          value.latency_ms,
      ) ||
      '—',

    error_rate:
      stringValue(
        value.error_rate ??
          value.errorRate,
      ) ||
      '—',

    checked:
      stringValue(
        value.checked ??
          value.checked_at ??
          value.timestamp,
      ) ||
      '—',
  }
}

function normalizeModel(
  value: unknown,
): AIModel | null {
  if (
    !isRecord(value)
  ) {
    return null
  }

  const name =
    stringValue(
      value.name ??
        value.model_name ??
        value.modelName,
    )

  if (!name) {
    return null
  }

  return {
    name,

    version:
      stringValue(
        value.version ??
          value.model_version,
      ) ||
      '—',

    status:
      stringValue(
        value.status,
      ) ||
      'Unknown',

    predictions:
      numberValue(
        value.predictions ??
          value.prediction_count,
      ),

    confidence:
      normalizeConfidence(
        value.confidence ??
          value.confidence_score,
      ),

    trained:
      nullableString(
        value.trained ??
          value.last_trained ??
          value.trained_at,
      ),

    source:
      stringValue(
        value.source,
      ) ||
      'Backend AI service',
  }
}

function normalizeInsight(
  value: unknown,
  index: number,
): AIInsight | null {
  if (
    !isRecord(value)
  ) {
    return null
  }

  return {
    id:
      stringValue(
        value.id ??
          value.insight_id ??
          value.insightId,
      ) ||
      `insight-${index + 1}`,

    title:
      stringValue(
        value.title ??
          value.headline ??
          value.name,
      ) ||
      'AI insight',

    business:
      stringValue(
        value.business ??
          value.business_name ??
          value.businessName,
      ) ||
      'Platform',

    severity:
      stringValue(
        value.severity ??
          value.priority,
      ) ||
      'Info',

    recommendation:
      stringValue(
        value.recommendation ??
          value.message ??
          value.description,
      ) ||
      'No recommendation supplied.',

    confidence:
      normalizeConfidence(
        value.confidence ??
          value.confidence_score,
      ),

    model:
      stringValue(
        value.model ??
          value.model_name ??
          value.model_version,
      ) ||
      'CashGuard-AI',

    created_at:
      nullableString(
        value.created_at ??
          value.createdAt,
      ),
  }
}

function normalizeAnomaly(
  value: unknown,
): TransactionAnomaly | null {
  if (
    !isRecord(value)
  ) {
    return null
  }

  const id =
    stringValue(
      value.id ??
        value.anomaly_id ??
        value.anomalyId,
    )

  if (!id) {
    return null
  }

  const features =
    isRecord(value.features)
      ? value.features
      : {}

  return {
    id,

    business:
      stringValue(
        value.business ??
          value.business_name ??
          value.businessName,
      ) ||
      '—',

    amount:
      numberValue(
        value.amount ??
          value.payment_amount ??
          features.payment_amount,
      ),

    type:
      stringValue(
        value.type ??
          value.transaction_type,
      ) ||
      'Payment risk',

    risk:
      stringValue(
        value.risk ??
          value.risk_level,
      ) ||
      'LOW',

    score:
      numberValue(
        value.score ??
          value.risk_score,
      ),

    reason:
      stringValue(
        value.reason ??
          value.description,
      ) ||
      'Elevated risk detected.',

    status:
      stringValue(
        value.status,
      ) ||
      'New',

    created_at:
      nullableString(
        value.created_at ??
          value.createdAt,
      ),
  }
}

function normalizeAlert(
  value: unknown,
): AlertRecord | null {
  if (
    !isRecord(value)
  ) {
    return null
  }

  const id =
    stringValue(
      value.id ??
        value.alert_id ??
        value.alertId,
    )

  if (!id) {
    return null
  }

  return {
    id,

    title:
      stringValue(
        value.title ??
          value.name ??
          value.headline,
      ) ||
      'Business alert',

    message:
      stringValue(
        value.message ??
          value.description ??
          value.body,
      ) ||
      'Attention required.',

    severity:
      stringValue(
        value.severity ??
          value.priority,
      ) ||
      'Info',

    status:
      stringValue(
        value.status ??
          value.state,
      ) ||
      'UNREAD',

    category:
      stringValue(
        value.category ??
          value.type,
      ) ||
      'General',

    created_at:
      nullableString(
        value.created_at ??
          value.createdAt ??
          value.timestamp,
      ),
  }
}

function normalizeAudit(
  value: unknown,
): AuditRecord | null {
  if (
    !isRecord(value)
  ) {
    return null
  }

  const id =
    stringValue(
      value.id ??
        value.audit_id ??
        value.auditId,
    )

  if (!id) {
    return null
  }

  return {
    id,

    action:
      stringValue(
        value.action ??
          value.event ??
          value.event_type,
      ) ||
      'Unknown action',

    actor:
      stringValue(
        value.actor ??
          value.actor_email ??
          value.actor_user_id ??
          value.user_id,
      ) ||
      'Unknown',

    entity:
      stringValue(
        value.entity ??
          value.entity_type ??
          value.resource,
      ) ||
      'Unknown',

    entity_id:
      stringValue(
        value.entity_id ??
          value.resource_id,
      ) ||
      '—',

    created_at:
      nullableString(
        value.created_at ??
          value.timestamp,
      ),

    ip_address:
      stringValue(
        value.ip_address ??
          value.ip,
      ) ||
      '—',
  }
}

function normalizeDataQuality(
  value: unknown,
): DataQuality | null {
  if (
    !isRecord(value)
  ) {
    return null
  }

  const table =
    stringValue(
      value.table ??
        value.table_name,
    )

  if (!table) {
    return null
  }

  const totalRows =
    numberValue(
      value.total_rows ??
        value.totalRows ??
        value.rows,
    )

  const nullRows =
    numberValue(
      value.null_rows ??
        value.nullRows,
    )

  const duplicateRows =
    numberValue(
      value.duplicate_rows ??
        value.duplicateRows,
    )

  const invalidRows =
    numberValue(
      value.invalid_rows ??
        value.invalidRows,
    )

  let score =
    numberValue(
      value.score ??
        value.quality_score ??
        value.qualityScore,
    )

  if (
    score <= 0 &&
    totalRows > 0 &&
    nullRows === 0 &&
    duplicateRows === 0 &&
    invalidRows === 0
  ) {
    score = 100
  }

  return {
    table,
    total_rows: totalRows,
    null_rows: nullRows,
    duplicate_rows: duplicateRows,
    invalid_rows: invalidRows,
    score,
  }
}

/* ============================================================================
 * API FETCH
 * ========================================================================== */

async function adminFetch<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const token =
    getAuthToken()

  const headers =
    new Headers(
      options.headers ?? {},
    )

  headers.set(
    'Accept',
    'application/json',
  )

  if (
    options.body &&
    !(options.body instanceof FormData) &&
    !headers.has(
      'Content-Type',
    )
  ) {
    headers.set(
      'Content-Type',
      'application/json',
    )
  }

  /**
   * If token is available in local/session storage,
   * attach it.
   *
   * If token is HttpOnly cookie based, token will be empty,
   * but credentials:'include' still sends the cookie.
   */
  if (token) {
    headers.set(
      'Authorization',
      `Bearer ${token}`,
    )
  }

  const url =
    `${API_BASE_URL}${endpoint}`

  let response: Response

  try {
    response =
      await fetch(
        url,
        {
          ...options,
          method:
            options.method ??
            'GET',
          headers,
          credentials:
            'include',
          cache:
            'no-store',
        },
      )
  } catch (
    caught
  ) {
    throw new AdminApiError(
      caught instanceof Error
        ? caught.message
        : `Unable to connect to CashGuard-AI backend at ${API_BASE_URL}.`,
      0,
      endpoint,
    )
  }

  let body: unknown = null

  const contentType =
    response.headers.get(
      'content-type',
    ) || ''

  try {
    if (
      contentType
        .toLowerCase()
        .includes(
          'application/json',
        )
    ) {
      body =
        await response.json()
    } else {
      body =
        await response.text()
    }
  } catch {
    body = null
  }

  if (
    !response.ok
  ) {
    let message =
      `Admin API request failed (${response.status}).`

    if (
      typeof body ===
        'string' &&
      body.trim()
    ) {
      message =
        body.trim()
    }

    if (
      isRecord(body)
    ) {
      if (
        typeof body.detail ===
        'string'
      ) {
        message =
          body.detail
      } else if (
        typeof body.message ===
        'string'
      ) {
        message =
          body.message
      } else if (
        Array.isArray(
          body.detail,
        )
      ) {
        const messages =
          body.detail
            .map(
              (
                item,
              ) => {
                if (
                  isRecord(item)
                ) {
                  return (
                    stringValue(
                      item.msg,
                    ) ||
                    stringValue(
                      item.message,
                    )
                  )
                }

                return stringValue(
                  item,
                )
              },
            )
            .filter(Boolean)

        if (
          messages.length >
          0
        ) {
          message =
            messages.join(
              ', ',
            )
        }
      }
    }

    if (
      response.status ===
      401
    ) {
      message =
        'Administrator authentication is missing or expired. Please sign in again.'
    }

    if (
      response.status ===
      403
    ) {
      message =
        'Administrator access is required for this section.'
    }

    throw new AdminApiError(
      message,
      response.status,
      endpoint,
      body,
    )
  }

  if (
    response.status ===
    204
  ) {
    return undefined as T
  }

  return body as T
}

/* ============================================================================
 * DISPLAY HELPERS
 * ========================================================================== */

function formatINR(
  value: number,
): string {
  return new Intl.NumberFormat(
    'en-IN',
    {
      style:
        'currency',
      currency:
        'INR',
      maximumFractionDigits:
        0,
    },
  ).format(value)
}

function formatDate(
  value: string | null,
): string {
  if (!value) {
    return '—'
  }

  const parsed =
    new Date(value)

  if (
    Number.isNaN(
      parsed.getTime(),
    )
  ) {
    return value
  }

  return new Intl.DateTimeFormat(
    'en-IN',
    {
      dateStyle:
        'medium',
      timeStyle:
        'short',
      timeZone:
        'Asia/Kolkata',
    },
  ).format(parsed)
}

function getStatusTone(
  value: unknown,
): StatusTone {
  const normalized =
    stringValue(
      value,
    ).toLowerCase()

  if (
    [
      'active',
      'healthy',
      'connected',
      'resolved',
      'available',
      'enabled',
      'success',
      'ready',
      'live',
    ].includes(
      normalized,
    )
  ) {
    return 'success'
  }

  if (
    [
      'pending',
      'degraded',
      'warning',
      'review',
      'reviewing',
      'maintenance',
      'needs review',
      'onboarding',
    ].includes(
      normalized,
    )
  ) {
    return 'warning'
  }

  if (
    [
      'critical',
      'high',
      'failed',
      'unavailable',
      'suspended',
      'inactive',
      'dismissed',
      'error',
      'disabled',
    ].includes(
      normalized,
    )
  ) {
    return 'danger'
  }

  return 'neutral'
}

/* ============================================================================
 * UI COMPONENTS
 * ========================================================================== */

function Status({
  children,
}: {
  children: ReactNode
}) {
  return (
    <span
      className={`admin-status ${getStatusTone(
        children,
      )}`}
    >
      {children}
    </span>
  )
}

function EmptyState({
  title,
  description,
  onRetry,
}: {
  title: string
  description: string
  onRetry?: () => void
}) {
  return (
    <div className="admin-empty">
      <Database
        size={22}
      />

      <strong>
        {title}
      </strong>

      <span>
        {description}
      </span>

      {onRetry && (
        <button
          type="button"
          className="admin-button"
          onClick={
            onRetry
          }
        >
          <RefreshCw
            size={13}
          />
          Retry
        </button>
      )}
    </div>
  )
}

function Panel({
  title,
  eyebrow,
  action,
  children,
}: {
  title: string
  eyebrow?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="admin-panel">
      <div className="admin-panel-head">
        <div>
          {eyebrow && (
            <p className="admin-eyebrow">
              {eyebrow}
            </p>
          )}

          <h2>
            {title}
          </h2>
        </div>

        {action}
      </div>

      {children}
    </section>
  )
}

/* ============================================================================
 * MAIN
 * ========================================================================== */

export function AdminControlCentre() {
  const [
    tab,
    setTab,
  ] = useState<AdminTab>(
    'Overview',
  )

  const [
    summary,
    setSummary,
  ] = useState<AdminSummary | null>(
    null,
  )

  const [
    businesses,
    setBusinesses,
  ] = useState<BusinessAdmin[]>(
    [],
  )

  const [
    users,
    setUsers,
  ] = useState<AdminUser[]>(
    [],
  )

  const [
    services,
    setServices,
  ] = useState<ServiceHealth[]>(
    [],
  )

  const [
    models,
    setModels,
  ] = useState<AIModel[]>(
    [],
  )

  const [
    insights,
    setInsights,
  ] = useState<AIInsight[]>(
    [],
  )

  const [
    anomalies,
    setAnomalies,
  ] = useState<TransactionAnomaly[]>(
    [],
  )

  const [
    alerts,
    setAlerts,
  ] = useState<AlertRecord[]>(
    [],
  )

  const [
    auditLogs,
    setAuditLogs,
  ] = useState<AuditRecord[]>(
    [],
  )

  const [
    dataQuality,
    setDataQuality,
  ] = useState<DataQuality[]>(
    [],
  )

  const [
    aiStatus,
    setAiStatus,
  ] = useState<AIStatus | null>(
    null,
  )

  const [
    mlStatus,
    setMlStatus,
  ] = useState<MLStatus | null>(
    null,
  )

  const [
    loading,
    setLoading,
  ] = useState(true)

  const [
    refreshing,
    setRefreshing,
  ] = useState(false)

  const [
    error,
    setError,
  ] = useState('')

  const [
    notice,
    setNotice,
  ] = useState('')

  const [
    query,
    setQuery,
  ] = useState('')

  const [
    businessStatus,
    setBusinessStatus,
  ] = useState('ALL')

  const [
    userStatus,
    setUserStatus,
  ] = useState('ALL')

  const [
    selectedBusiness,
    setSelectedBusiness,
  ] = useState<BusinessAdmin | null>(
    null,
  )

  const [
    selectedUser,
    setSelectedUser,
  ] = useState<AdminUser | null>(
    null,
  )

  const [
    mutatingId,
    setMutatingId,
  ] = useState<string | null>(
    null,
  )

  /* ==========================================================================
   * LOAD OVERVIEW
   * ======================================================================== */

  const loadOverview =
    useCallback(
      async (
        showRefresh = false,
      ) => {
        if (showRefresh) {
          setRefreshing(true)
        } else {
          setLoading(true)
        }

        try {
          const [
            summaryResponse,
            servicesResponse,
            aiResponse,
            mlResponse,
          ] =
            await Promise.all([
              adminFetch<unknown>(
                '/api/admin/summary',
              ),

              adminFetch<unknown>(
                '/api/admin/services',
              ),

              adminFetch<unknown>(
                '/api/admin/ai/status',
              ),

              adminFetch<unknown>(
                '/api/admin/ml/status',
              ),
            ])

          setSummary(
            normalizeSummary(
              summaryResponse,
            ),
          )

          setServices(
            extractArray<unknown>(
              servicesResponse,
            )
              .map(
                (
                  item,
                ) =>
                  normalizeService(
                    item,
                  ),
              )
              .filter(
                (
                  item,
                ): item is ServiceHealth =>
                  item !== null,
              ),
          )

          if (
            isRecord(
              aiResponse,
            )
          ) {
            const details =
              isRecord(
                aiResponse.details,
              )
                ? aiResponse.details
                : {}

            setAiStatus({
              available:
                booleanValue(
                  aiResponse.available ??
                    aiResponse.connected ??
                    (
                      stringValue(
                        aiResponse.status,
                      ).toLowerCase() ===
                      'healthy'
                    ),
                ),

              provider:
                stringValue(
                  aiResponse.provider,
                ) ||
                'Ollama',

              model:
                stringValue(
                  aiResponse.model ??
                    aiResponse.model_name ??
                    details.model,
                ) ||
                '—',

              configured:
                booleanValue(
                  aiResponse.configured ??
                    aiResponse.available ??
                    aiResponse.connected,
                ),

              message:
                stringValue(
                  aiResponse.message,
                ) ||
                'AI status received.',
            })
          } else {
            setAiStatus(null)
          }

          if (
            isRecord(
              mlResponse,
            )
          ) {
            setMlStatus({
              available:
                booleanValue(
                  mlResponse.available ??
                    (
                      stringValue(
                        mlResponse.status,
                      ).toLowerCase() ===
                      'healthy'
                    ),
                ),

              payment_delay_model:
                stringValue(
                  mlResponse.payment_delay_model ??
                    mlResponse.paymentDelayModel,
                ) ||
                '—',

              cash_flow_model:
                stringValue(
                  mlResponse.cash_flow_model ??
                    mlResponse.cashFlowModel,
                ) ||
                '—',

              models_endpoint:
                stringValue(
                  mlResponse.models_endpoint ??
                    mlResponse.modelsEndpoint,
                ) ||
                '—',
            })
          } else {
            setMlStatus(null)
          }

          setError('')
        } catch (
          caught
        ) {
          setError(
            caught instanceof
              AdminApiError
              ? caught.message
              : 'Unable to load admin overview.',
          )
        } finally {
          setLoading(false)
          setRefreshing(false)
        }
      },
      [],
    )

  /* ==========================================================================
   * LOAD BUSINESSES
   * ======================================================================== */

  const loadBusinesses =
    useCallback(
      async () => {
        try {
          const response =
            await adminFetch<unknown>(
              '/api/admin/businesses?limit=500&offset=0',
            )

          const rows =
            extractArray<unknown>(
              response,
            )
              .map(
                (
                  item,
                ) =>
                  normalizeBusiness(
                    item,
                  ),
              )
              .filter(
                (
                  item,
                ): item is BusinessAdmin =>
                  item !== null,
              )

          setBusinesses(
            rows,
          )
        } catch (
          caught
        ) {
          setError(
            caught instanceof
              AdminApiError
              ? caught.message
              : 'Unable to load businesses.',
          )
        }
      },
      [],
    )

  /* ==========================================================================
   * LOAD USERS
   * ======================================================================== */

  const loadUsers =
    useCallback(
      async () => {
        try {
          const response =
            await adminFetch<unknown>(
              '/api/admin/users?limit=500&offset=0',
            )

          const rows =
            extractArray<unknown>(
              response,
            )
              .map(
                (
                  item,
                ) =>
                  normalizeUser(
                    item,
                  ),
              )
              .filter(
                (
                  item,
                ): item is AdminUser =>
                  item !== null,
              )

          setUsers(
            rows,
          )
        } catch (
          caught
        ) {
          setError(
            caught instanceof
              AdminApiError
              ? caught.message
              : 'Unable to load users.',
          )
        }
      },
      [],
    )

  /* ==========================================================================
   * LOAD AI
   * ======================================================================== */

  const loadAI =
    useCallback(
      async () => {
        try {
          const [
            modelResponse,
            insightResponse,
          ] =
            await Promise.all([
              adminFetch<unknown>(
                '/api/admin/ai/models',
              ),

              adminFetch<unknown>(
                '/api/admin/ai/insights?limit=100',
              ),
            ])

          setModels(
            extractArray<unknown>(
              modelResponse,
            )
              .map(
                (
                  item,
                ) =>
                  normalizeModel(
                    item,
                  ),
              )
              .filter(
                (
                  item,
                ): item is AIModel =>
                  item !== null,
              ),
          )

          setInsights(
            extractArray<unknown>(
              insightResponse,
            )
              .map(
                (
                  item,
                  index,
                ) =>
                  normalizeInsight(
                    item,
                    index,
                  ),
              )
              .filter(
                (
                  item,
                ): item is AIInsight =>
                  item !== null,
              ),
          )
        } catch (
          caught
        ) {
          setError(
            caught instanceof
              AdminApiError
              ? caught.message
              : 'Unable to load AI data.',
          )
        }
      },
      [],
    )

  /* ==========================================================================
   * LOAD ANOMALIES
   * ======================================================================== */

  const loadAnomalies =
    useCallback(
      async () => {
        try {
          const response =
            await adminFetch<unknown>(
              '/api/admin/anomalies?limit=100',
            )

          setAnomalies(
            extractArray<unknown>(
              response,
            )
              .map(
                (
                  item,
                ) =>
                  normalizeAnomaly(
                    item,
                  ),
              )
              .filter(
                (
                  item,
                ): item is TransactionAnomaly =>
                  item !== null,
              ),
          )
        } catch (
          caught
        ) {
          setError(
            caught instanceof
              AdminApiError
              ? caught.message
              : 'Unable to load anomalies.',
          )
        }
      },
      [],
    )

  /* ==========================================================================
   * LOAD ALERTS + AUDIT
   * ======================================================================== */

  const loadAudit =
    useCallback(
      async () => {
        try {
          const [
            alertResponse,
            auditResponse,
          ] =
            await Promise.all([
              adminFetch<unknown>(
                '/api/admin/alerts?limit=100&offset=0',
              ),

              adminFetch<unknown>(
                '/api/admin/audit-logs?limit=100&offset=0',
              ),
            ])

          setAlerts(
            extractArray<unknown>(
              alertResponse,
            )
              .map(
                (
                  item,
                ) =>
                  normalizeAlert(
                    item,
                  ),
              )
              .filter(
                (
                  item,
                ): item is AlertRecord =>
                  item !== null,
              ),
          )

          setAuditLogs(
            extractArray<unknown>(
              auditResponse,
            )
              .map(
                (
                  item,
                ) =>
                  normalizeAudit(
                    item,
                  ),
              )
              .filter(
                (
                  item,
                ): item is AuditRecord =>
                  item !== null,
              ),
          )
        } catch (
          caught
        ) {
          setError(
            caught instanceof
              AdminApiError
              ? caught.message
              : 'Unable to load alerts and audit logs.',
          )
        }
      },
      [],
    )

  /* ==========================================================================
   * LOAD DATA QUALITY
   * ======================================================================== */

  const loadDataQuality =
    useCallback(
      async () => {
        try {
          const response =
            await adminFetch<unknown>(
              '/api/admin/data-quality',
            )

          setDataQuality(
            extractArray<unknown>(
              response,
            )
              .map(
                (
                  item,
                ) =>
                  normalizeDataQuality(
                    item,
                  ),
              )
              .filter(
                (
                  item,
                ): item is DataQuality =>
                  item !== null,
              ),
          )
        } catch (
          caught
        ) {
          setError(
            caught instanceof
              AdminApiError
              ? caught.message
              : 'Unable to load data quality.',
          )
        }
      },
      [],
    )

  /* ==========================================================================
   * INITIAL LOAD
   * ======================================================================== */

  useEffect(
    () => {
      void Promise.all([
        loadOverview(),
        loadBusinesses(),
        loadUsers(),
        loadAI(),
        loadAnomalies(),
        loadAudit(),
        loadDataQuality(),
      ])
    },
    [
      loadOverview,
      loadBusinesses,
      loadUsers,
      loadAI,
      loadAnomalies,
      loadAudit,
      loadDataQuality,
    ],
  )

  /* ==========================================================================
   * AUTH CHANGE
   * ======================================================================== */

  useEffect(
    () => {
      const handleAuthChanged =
        () => {
          void Promise.all([
            loadOverview(true),
            loadBusinesses(),
            loadUsers(),
            loadAI(),
            loadAnomalies(),
            loadAudit(),
            loadDataQuality(),
          ])
        }

      window.addEventListener(
        'auth-changed',
        handleAuthChanged,
      )

      return () => {
        window.removeEventListener(
          'auth-changed',
          handleAuthChanged,
        )
      }
    },
    [
      loadOverview,
      loadBusinesses,
      loadUsers,
      loadAI,
      loadAnomalies,
      loadAudit,
      loadDataQuality,
    ],
  )

  /* ==========================================================================
   * FILTERS
   * ======================================================================== */

  const visibleBusinesses =
    useMemo(
      () => {
        const search =
          query
            .trim()
            .toLowerCase()

        return businesses.filter(
          (
            business,
          ) => {
            const haystack =
              [
                business.id,
                business.name,
                business.owner,
                business.industry,
                business.location,
                business.gstin,
              ]
                .join(' ')
                .toLowerCase()

            const matchesSearch =
              !search ||
              haystack.includes(
                search,
              )

            const matchesStatus =
              businessStatus ===
                'ALL' ||
              business.status
                .trim()
                .toUpperCase() ===
                businessStatus

            return (
              matchesSearch &&
              matchesStatus
            )
          },
        )
      },
      [
        businesses,
        query,
        businessStatus,
      ],
    )

  const visibleUsers =
    useMemo(
      () => {
        const search =
          query
            .trim()
            .toLowerCase()

        return users.filter(
          (
            user,
          ) => {
            const haystack =
              [
                user.id,
                user.name,
                user.email,
                user.business,
                user.role,
              ]
                .join(' ')
                .toLowerCase()

            const matchesSearch =
              !search ||
              haystack.includes(
                search,
              )

            const normalizedStatus =
              user.status
                .trim()
                .toUpperCase()

            const matchesStatus =
              userStatus ===
                'ALL' ||
              normalizedStatus ===
                userStatus ||
              (
                userStatus ===
                  'ACTIVE' &&
                normalizedStatus ===
                  'ENABLED'
              )

            return (
              matchesSearch &&
              matchesStatus
            )
          },
        )
      },
      [
        users,
        query,
        userStatus,
      ],
    )

  /* ==========================================================================
   * KPI
   * ======================================================================== */

  const kpis = [
    {
      label:
        'Total Businesses',
      value:
        summary?.total_businesses ??
        0,
      icon:
        Building2,
    },
    {
      label:
        'Active Businesses',
      value:
        summary?.active_businesses ??
        0,
      icon:
        CheckCircle2,
    },
    {
      label:
        'Total Users',
      value:
        summary?.total_users ??
        0,
      icon:
        Users,
    },
    {
      label:
        'Transactions Today',
      value:
        summary?.transactions_today ??
        0,
      icon:
        Activity,
    },
    {
      label:
        'Payments Today',
      value:
        summary?.payments_today ??
        0,
      icon:
        Wallet,
    },
    {
      label:
        'High-Risk Transactions',
      value:
        summary?.high_risk_transactions ??
        0,
      icon:
        ShieldAlert,
    },
    {
      label:
        'AI Requests Today',
      value:
        summary?.ai_requests_today ??
        0,
      icon:
        BrainCircuit,
    },
    {
      label:
        'System Alerts',
      value:
        summary?.system_alerts ??
        0,
      icon:
        AlertTriangle,
    },
  ]

  /* ==========================================================================
   * REFRESH
   * ======================================================================== */

  const refreshAll =
    useCallback(
      async () => {
        setRefreshing(true)
        setError('')
        setNotice('')

        try {
          await Promise.all([
            loadOverview(true),
            loadBusinesses(),
            loadUsers(),
            loadAI(),
            loadAnomalies(),
            loadAudit(),
            loadDataQuality(),
          ])

          setNotice(
            'Admin control centre refreshed from the backend.',
          )
        } finally {
          setRefreshing(false)
        }
      },
      [
        loadOverview,
        loadBusinesses,
        loadUsers,
        loadAI,
        loadAnomalies,
        loadAudit,
        loadDataQuality,
      ],
    )

  /* ==========================================================================
   * BUSINESS ACTION
   * ======================================================================== */

  const updateBusiness =
    useCallback(
      async (
        business: BusinessAdmin,
        newStatus: string,
      ) => {
        setMutatingId(
          business.id,
        )

        setError('')
        setNotice('')

        try {
          /**
           * Current backend routes.py does not yet expose
           * PATCH /api/admin/businesses/{business_id}.
           *
           * Do not call a missing endpoint.
           */
          setNotice(
            `Business "${business.name}" action "${newStatus}" is pending the backend business-update endpoint.`,
          )
        } finally {
          setMutatingId(
            null,
          )
        }
      },
      [],
    )

  /* ==========================================================================
   * USER ACTION
   * ======================================================================== */

  const updateUser =
    useCallback(
      async (
        user: AdminUser,
        newStatus: string,
      ) => {
        setMutatingId(
          user.id,
        )

        setError('')
        setNotice('')

        try {
          const isActive =
            newStatus
              .trim()
              .toUpperCase() ===
            'ACTIVE'

          await adminFetch(
            `/api/admin/users/${encodeURIComponent(
              user.id,
            )}`,
            {
              method:
                'PATCH',

              body:
                JSON.stringify({
                  is_active:
                    isActive,
                }),
            },
          )

          setNotice(
            `${user.email} status updated successfully.`,
          )

          setSelectedUser(
            null,
          )

          await Promise.all([
            loadUsers(),
            loadOverview(true),
          ])
        } catch (
          caught
        ) {
          setError(
            caught instanceof
              AdminApiError
              ? caught.message
              : 'Unable to update user.',
          )
        } finally {
          setMutatingId(
            null,
          )
        }
      },
      [
        loadUsers,
        loadOverview,
      ],
    )

  /* ==========================================================================
   * EXPORT
   * ======================================================================== */

  const exportBusinesses =
    useCallback(
      () => {
        if (
          businesses.length ===
          0
        ) {
          setNotice(
            'No business data is available for export.',
          )

          return
        }

        const headers = [
          'ID',
          'Business',
          'Owner',
          'Industry',
          'Location',
          'Users',
          'Transactions',
          'Outstanding',
          'Risk',
          'Banking',
          'Status',
          'GSTIN',
          'AI',
        ]

        const rows =
          businesses.map(
            (
              business,
            ) => [
              business.id,
              business.name,
              business.owner,
              business.industry,
              business.location,
              business.users,
              business.transactions,
              business.outstanding,
              business.risk,
              business.banking,
              business.status,
              business.gstin,
              business.ai,
            ],
          )

        const csv =
          [
            headers,
            ...rows,
          ]
            .map(
              (
                row,
              ) =>
                row
                  .map(
                    (
                      value,
                    ) =>
                      `"${String(
                        value ??
                          '',
                      ).replace(
                        /"/g,
                        '""',
                      )}"`,
                  )
                  .join(','),
            )
            .join(
              '\n',
            )

        const blob =
          new Blob(
            [csv],
            {
              type:
                'text/csv;charset=utf-8',
            },
          )

        const url =
          URL.createObjectURL(
            blob,
          )

        const anchor =
          document.createElement(
            'a',
          )

        anchor.href =
          url

        anchor.download =
          'cashguard-admin-businesses.csv'

        document.body.appendChild(
          anchor,
        )

        anchor.click()

        document.body.removeChild(
          anchor,
        )

        URL.revokeObjectURL(
          url,
        )

        setNotice(
          'Business register exported successfully.',
        )
      },
      [
        businesses,
      ],
    )

  /* ==========================================================================
   * RENDER
   * ======================================================================== */

  return (
    <main className="admin-page">
      <style jsx>{`
        .admin-page {
          min-height: 100%;
          padding: 28px;
          background:
            radial-gradient(
              circle at top right,
              rgba(14, 165, 233, .07),
              transparent 30%
            ),
            linear-gradient(
              180deg,
              #f8fafc 0%,
              #f3f6f9 100%
            );
          color: #0f172a;
        }

        .admin-page * {
          box-sizing: border-box;
        }

        .admin-topline {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 22px;
          margin-bottom: 18px;
        }

        .admin-eyebrow {
          margin: 0 0 7px;
          color: #0284c7;
          font-size: 9px;
          font-weight: 850;
          letter-spacing: .14em;
          text-transform: uppercase;
        }

        .admin-topline h1 {
          margin: 0;
          font-size: clamp(28px, 4vw, 40px);
          line-height: 1;
          letter-spacing: -.05em;
        }

        .admin-description {
          max-width: 760px;
          margin: 10px 0 0;
          color: #64748b;
          font-size: 12px;
          line-height: 1.65;
        }

        .admin-actions {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          flex-wrap: wrap;
          gap: 8px;
        }

        .admin-secure {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          min-height: 36px;
          padding: 0 10px;
          border: 1px solid #dbeafe;
          border-radius: 10px;
          background: #eff6ff;
          color: #0369a1;
          font-size: 9px;
          font-weight: 800;
        }

        .admin-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          min-height: 37px;
          padding: 0 11px;
          border: 1px solid #dbe5ef;
          border-radius: 9px;
          background: #fff;
          color: #0f172a;
          font-size: 10px;
          font-weight: 750;
          cursor: pointer;
          transition: .15s ease;
        }

        .admin-button:hover {
          border-color: #b7c7d6;
          transform: translateY(-1px);
        }

        .admin-button:disabled {
          opacity: .5;
          cursor: not-allowed;
          transform: none;
        }

        .admin-button.primary {
          border-color: #0284c7;
          background: #0284c7;
          color: #fff;
        }

        .admin-button.danger {
          border-color: #fecaca;
          color: #b91c1c;
          background: #fff;
        }

        .admin-notice,
        .admin-error {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 13px;
          padding: 11px 13px;
          border-radius: 10px;
          font-size: 10px;
        }

        .admin-notice {
          border: 1px solid #bbf7d0;
          background: #f0fdf4;
          color: #166534;
        }

        .admin-error {
          border: 1px solid #fecaca;
          background: #fff1f2;
          color: #991b1b;
        }

        .admin-notice span,
        .admin-error span {
          flex: 1;
        }

        .admin-notice button,
        .admin-error button {
          margin-left: auto;
          border: 0;
          background: transparent;
          color: inherit;
          cursor: pointer;
        }

        .admin-tabs {
          display: flex;
          gap: 4px;
          overflow-x: auto;
          padding: 4px;
          margin-bottom: 14px;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          background: rgba(255,255,255,.85);
        }

        .admin-tabs button {
          flex: 0 0 auto;
          padding: 9px 12px;
          border: 0;
          border-radius: 8px;
          background: transparent;
          color: #64748b;
          font-size: 9px;
          font-weight: 800;
          cursor: pointer;
        }

        .admin-tabs button.active {
          background: #e0f2fe;
          color: #0369a1;
        }

        .admin-kpis {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
          margin-bottom: 13px;
        }

        .admin-kpi {
          position: relative;
          overflow: hidden;
          padding: 15px;
          border: 1px solid #e2e8f0;
          border-radius: 15px;
          background: rgba(255,255,255,.97);
          box-shadow: 0 7px 26px rgba(15,23,42,.04);
        }

        .admin-kpi-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }

        .admin-kpi-label {
          color: #64748b;
          font-size: 9px;
          font-weight: 800;
        }

        .admin-kpi-icon {
          display: grid;
          place-items: center;
          width: 29px;
          height: 29px;
          border-radius: 8px;
          background: #f0f9ff;
          color: #0284c7;
        }

        .admin-kpi strong {
          display: block;
          margin-top: 14px;
          font-size: 24px;
          line-height: 1;
          letter-spacing: -.045em;
        }

        .admin-kpi small {
          display: block;
          margin-top: 8px;
          color: #94a3b8;
          font-size: 8px;
        }

        .admin-grid {
          display: grid;
          gap: 12px;
          margin-bottom: 12px;
        }

        .admin-grid.two {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .admin-panel {
          min-width: 0;
          padding: 16px;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          background: #fff;
          box-shadow: 0 9px 30px rgba(15,23,42,.045);
        }

        .admin-panel + .admin-panel {
          margin-top: 12px;
        }

        .admin-grid .admin-panel + .admin-panel {
          margin-top: 0;
        }

        .admin-panel-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 13px;
        }

        .admin-panel-head h2 {
          margin: 0;
          font-size: 15px;
          letter-spacing: -.025em;
        }

        .admin-link {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          border: 0;
          background: transparent;
          color: #0284c7;
          font-size: 9px;
          font-weight: 800;
          cursor: pointer;
        }

        .admin-empty {
          display: grid;
          place-items: center;
          gap: 7px;
          min-height: 180px;
          padding: 22px;
          text-align: center;
          color: #94a3b8;
        }

        .admin-empty strong {
          color: #0f172a;
          font-size: 12px;
        }

        .admin-empty span {
          max-width: 470px;
          color: #64748b;
          font-size: 9px;
          line-height: 1.6;
        }

        .admin-ai-card {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 14px;
          border: 1px solid #dbeafe;
          border-radius: 12px;
          background:
            linear-gradient(
              135deg,
              #f8fdff,
              #eff6ff
            );
        }

        .admin-ai-card > svg {
          flex: 0 0 auto;
          color: #0284c7;
        }

        .admin-ai-card > div {
          flex: 1;
          min-width: 0;
        }

        .admin-ai-card strong {
          font-size: 11px;
        }

        .admin-ai-card p {
          margin: 5px 0 0;
          color: #64748b;
          font-size: 9px;
          line-height: 1.55;
        }

        .admin-service-grid,
        .admin-health-grid,
        .admin-model-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 9px;
        }

        .admin-service,
        .admin-model,
        .admin-health-card {
          padding: 12px;
          border: 1px solid #e2e8f0;
          border-radius: 11px;
          background: #fbfdff;
        }

        .admin-service-top,
        .admin-model-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }

        .admin-service strong,
        .admin-model strong,
        .admin-health-card strong {
          font-size: 10px;
        }

        .admin-service small,
        .admin-model small,
        .admin-health-card small {
          display: block;
          margin-top: 7px;
          color: #94a3b8;
          font-size: 8px;
          line-height: 1.5;
          word-break: break-word;
        }

        .admin-status {
          display: inline-flex;
          align-items: center;
          width: fit-content;
          min-height: 21px;
          padding: 0 7px;
          border-radius: 999px;
          font-size: 7px;
          font-weight: 850;
          letter-spacing: .05em;
          text-transform: uppercase;
          white-space: nowrap;
        }

        .admin-status.success {
          background: #f0fdf4;
          color: #15803d;
        }

        .admin-status.warning {
          background: #fffbeb;
          color: #b45309;
        }

        .admin-status.danger {
          background: #fef2f2;
          color: #b91c1c;
        }

        .admin-status.neutral {
          background: #f1f5f9;
          color: #475569;
        }

        .admin-toolbar {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          flex-wrap: wrap;
          gap: 7px;
        }

        .admin-search {
          position: relative;
          width: min(320px, 100%);
        }

        .admin-search svg {
          position: absolute;
          left: 10px;
          top: 50%;
          transform: translateY(-50%);
          color: #94a3b8;
          pointer-events: none;
        }

        .admin-search input,
        .admin-select {
          height: 35px;
          border: 1px solid #dbe5ef;
          border-radius: 8px;
          background: #fff;
          color: #0f172a;
          outline: none;
          font-size: 9px;
          font-weight: 650;
        }

        .admin-search input {
          width: 100%;
          padding: 0 10px 0 31px;
        }

        .admin-select {
          padding: 0 8px;
        }

        .admin-search input:focus,
        .admin-select:focus {
          border-color: #7dd3fc;
          box-shadow:
            0 0 0 3px
            rgba(14,165,233,.09);
        }

        .admin-table-wrap {
          overflow-x: auto;
          border: 1px solid #e2e8f0;
          border-radius: 11px;
        }

        .admin-table {
          width: 100%;
          min-width: 1100px;
          border-collapse: collapse;
        }

        .admin-table th {
          padding: 10px;
          border-bottom: 1px solid #e2e8f0;
          background: #f8fafc;
          color: #94a3b8;
          font-size: 7px;
          font-weight: 850;
          letter-spacing: .08em;
          text-align: left;
          text-transform: uppercase;
        }

        .admin-table td {
          padding: 11px 10px;
          border-bottom: 1px solid #eef2f7;
          color: #475569;
          font-size: 9px;
          vertical-align: middle;
        }

        .admin-table tr:last-child td {
          border-bottom: 0;
        }

        .admin-table tbody tr {
          transition: background .15s ease;
        }

        .admin-table tbody tr:hover {
          background: #fbfdff;
        }

        .admin-table td strong {
          display: block;
          color: #0f172a;
          font-size: 9px;
        }

        .admin-table td small {
          display: block;
          margin-top: 3px;
          color: #94a3b8;
          font-size: 7px;
        }

        .admin-icon-button {
          display: grid;
          place-items: center;
          width: 28px;
          height: 28px;
          border: 1px solid #dbe5ef;
          border-radius: 7px;
          background: #fff;
          color: #64748b;
          cursor: pointer;
        }

        .admin-icon-button:hover {
          border-color: #bae6fd;
          color: #0284c7;
        }

        .admin-insight-list {
          display: grid;
          gap: 8px;
        }

        .admin-insight {
          padding: 11px;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          background: #fbfdff;
        }

        .admin-insight-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }

        .admin-insight h4 {
          margin: 0;
          color: #0f172a;
          font-size: 10px;
        }

        .admin-insight p {
          margin: 6px 0;
          color: #64748b;
          font-size: 8px;
          line-height: 1.55;
        }

        .admin-insight small {
          color: #94a3b8;
          font-size: 7px;
          line-height: 1.5;
        }

        .admin-quality-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
        }

        .admin-quality {
          padding: 11px;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          background: #fbfdff;
        }

        .admin-quality strong {
          display: block;
          font-size: 10px;
        }

        .admin-quality-row {
          display: flex;
          justify-content: space-between;
          gap: 8px;
          margin-top: 7px;
          color: #64748b;
          font-size: 8px;
        }

        .admin-drawer-backdrop {
          position: fixed;
          z-index: 100;
          inset: 0;
          background: rgba(15,23,42,.32);
          backdrop-filter: blur(3px);
        }

        .admin-drawer {
          position: absolute;
          top: 0;
          right: 0;
          width: min(510px, 100%);
          height: 100%;
          overflow-y: auto;
          padding: 20px;
          background: #fff;
          box-shadow:
            -18px 0 45px
            rgba(15,23,42,.15);
        }

        .admin-drawer-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 18px;
        }

        .admin-drawer h2 {
          margin: 4px 0 0;
          font-size: 20px;
          letter-spacing: -.035em;
        }

        .admin-drawer-close {
          display: grid;
          place-items: center;
          width: 32px;
          height: 32px;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          background: #fff;
          color: #64748b;
          cursor: pointer;
        }

        .admin-drawer-section {
          margin-top: 14px;
          padding-top: 14px;
          border-top: 1px solid #eef2f7;
        }

        .admin-drawer-section h3 {
          margin: 0 0 9px;
          font-size: 10px;
        }

        .admin-detail-row {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          padding: 8px 0;
        }

        .admin-detail-row span {
          color: #94a3b8;
          font-size: 8px;
        }

        .admin-detail-row strong {
          color: #334155;
          font-size: 9px;
          text-align: right;
          word-break: break-word;
        }

        .admin-spin {
          animation:
            admin-spin 1s linear infinite;
        }

        @keyframes admin-spin {
          from {
            transform: rotate(0deg);
          }

          to {
            transform: rotate(360deg);
          }
        }

        @media (max-width: 1100px) {
          .admin-kpis {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .admin-grid.two {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 760px) {
          .admin-page {
            padding: 15px;
          }

          .admin-topline {
            flex-direction: column;
          }

          .admin-actions {
            justify-content: flex-start;
          }

          .admin-kpis,
          .admin-health-grid,
          .admin-model-grid,
          .admin-service-grid,
          .admin-quality-grid {
            grid-template-columns: 1fr;
          }

          .admin-panel-head {
            flex-direction: column;
          }

          .admin-toolbar {
            width: 100%;
            justify-content: flex-start;
          }

          .admin-search {
            width: 100%;
          }

          .admin-ai-card {
            flex-wrap: wrap;
          }
        }

        @media (max-width: 500px) {
          .admin-page {
            padding: 11px;
          }

          .admin-kpis {
            grid-template-columns: 1fr;
          }

          .admin-topline h1 {
            font-size: 29px;
          }
        }
      `}</style>

      {/* HEADER */}

      <div className="admin-topline">
        <div>
          <p className="admin-eyebrow">
            ADMIN CONTROL CENTRE
          </p>

          <h1>
            CashGuard-AI Administration
          </h1>

          <p className="admin-description">
            Central control for MSME
            businesses, financial
            operations, AI intelligence,
            risk monitoring and platform
            health.
          </p>
        </div>

        <div className="admin-actions">
          <span className="admin-secure">
            <ShieldAlert size={12} />
            Administrator access
          </span>

          <button
            type="button"
            className="admin-button"
            onClick={() =>
              void refreshAll()
            }
            disabled={refreshing}
          >
            <RefreshCw
              size={13}
              className={
                refreshing
                  ? 'admin-spin'
                  : undefined
              }
            />

            {refreshing
              ? 'Refreshing'
              : 'Refresh'}
          </button>

          <button
            type="button"
            className="admin-button"
            onClick={
              exportBusinesses
            }
          >
            <Download
              size={13}
            />
            Export
          </button>

          <button
            type="button"
            className="admin-button primary"
            onClick={() => {
              setTab(
                'Platform Health',
              )

              void loadOverview(
                true,
              )
            }}
          >
            <Activity
              size={13}
            />

            System status
          </button>
        </div>
      </div>

      {/* NOTICES */}

      {notice && (
        <div className="admin-notice">
          <CheckCircle2
            size={14}
          />

          <span>
            {notice}
          </span>

          <button
            type="button"
            onClick={() =>
              setNotice('')
            }
            aria-label="Dismiss notice"
          >
            <X size={13} />
          </button>
        </div>
      )}

      {error && (
        <div
          className="admin-error"
          role="alert"
        >
          <AlertCircle
            size={14}
          />

          <span>
            {error}
          </span>

          <button
            type="button"
            onClick={() =>
              setError('')
            }
            aria-label="Dismiss error"
          >
            <X size={13} />
          </button>
        </div>
      )}

      {/* TABS */}

      <div className="admin-tabs">
        {(
          [
            'Overview',
            'Businesses',
            'Users',
            'Platform Health',
            'AI Control Centre',
            'Anomalies',
            'Alerts & Audit',
            'Configuration',
          ] as AdminTab[]
        ).map(
          (
            item,
          ) => (
            <button
              key={item}
              type="button"
              className={
                tab === item
                  ? 'active'
                  : ''
              }
              onClick={() =>
                setTab(item)
              }
            >
              {item}
            </button>
          ),
        )}
      </div>

      {/* OVERVIEW */}

      {tab === 'Overview' && (
        <>
          <div className="admin-kpis">
            {kpis.map(
              ({
                label,
                value,
                icon:
                  Icon,
              }) => (
                <div
                  className="admin-kpi"
                  key={label}
                >
                  <div className="admin-kpi-top">
                    <span className="admin-kpi-label">
                      {label}
                    </span>

                    <span className="admin-kpi-icon">
                      <Icon
                        size={14}
                      />
                    </span>
                  </div>

                  <strong>
                    {loading
                      ? '—'
                      : value.toLocaleString(
                          'en-IN',
                        )}
                  </strong>

                  <small>
                    Live backend metric
                  </small>
                </div>
              ),
            )}
          </div>

          <div className="admin-grid two">
            <Panel
              eyebrow="BUSINESS CONTROL"
              title="Business operations"
              action={
                <button
                  type="button"
                  className="admin-link"
                  onClick={() =>
                    setTab(
                      'Businesses',
                    )
                  }
                >
                  View businesses
                  <ArrowUpRight
                    size={12}
                  />
                </button>
              }
            >
              {businesses.length >
              0 ? (
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>
                          Business
                        </th>
                        <th>
                          Users
                        </th>
                        <th>
                          Transactions
                        </th>
                        <th>
                          Risk
                        </th>
                        <th>
                          Status
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {businesses
                        .slice(
                          0,
                          6,
                        )
                        .map(
                          (
                            business,
                          ) => (
                            <tr
                              key={
                                business.id
                              }
                            >
                              <td>
                                <strong>
                                  {
                                    business.name
                                  }
                                </strong>

                                <small>
                                  {
                                    business.gstin
                                  }
                                </small>
                              </td>

                              <td>
                                {
                                  business.users
                                }
                              </td>

                              <td>
                                {
                                  business.transactions
                                }
                              </td>

                              <td>
                                <Status>
                                  {
                                    business.risk
                                  }
                                </Status>
                              </td>

                              <td>
                                <Status>
                                  {
                                    business.status
                                  }
                                </Status>
                              </td>
                            </tr>
                          ),
                        )}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState
                  title="No business data"
                  description="The backend has not returned business records."
                  onRetry={() =>
                    void loadBusinesses()
                  }
                />
              )}
            </Panel>

            <Panel
              eyebrow="PLATFORM HEALTH"
              title="Live infrastructure"
              action={
                <button
                  type="button"
                  className="admin-link"
                  onClick={() =>
                    setTab(
                      'Platform Health',
                    )
                  }
                >
                  Open health
                  <ArrowUpRight
                    size={12}
                  />
                </button>
              }
            >
              {services.length >
              0 ? (
                <div className="admin-service-grid">
                  {services
                    .slice(
                      0,
                      8,
                    )
                    .map(
                      (
                        service,
                      ) => (
                        <div
                          className="admin-service"
                          key={
                            service.name
                          }
                        >
                          <div className="admin-service-top">
                            <strong>
                              {
                                service.name
                              }
                            </strong>

                            <Status>
                              {
                                service.status
                              }
                            </Status>
                          </div>

                          <small>
                            Latency ·{' '}
                            {
                              service.latency
                            }
                            <br />
                            Error rate ·{' '}
                            {
                              service.error_rate
                            }
                          </small>
                        </div>
                      ),
                    )}
                </div>
              ) : (
                <EmptyState
                  title="Health data unavailable"
                  description="The admin service-health endpoint has not returned data."
                  onRetry={() =>
                    void loadOverview(
                      true,
                    )
                  }
                />
              )}
            </Panel>
          </div>

          <div className="admin-grid two">
            <Panel
              eyebrow="AI CONTROL CENTRE"
              title="AI / ML readiness"
              action={
                <button
                  type="button"
                  className="admin-link"
                  onClick={() =>
                    setTab(
                      'AI Control Centre',
                    )
                  }
                >
                  Open AI monitor
                  <ArrowUpRight
                    size={12}
                  />
                </button>
              }
            >
              <div className="admin-ai-card">
                <BrainCircuit
                  size={23}
                />

                <div>
                  <strong>
                    {aiStatus?.available
                      ? 'GenAI service available'
                      : 'GenAI service unavailable'}
                  </strong>

                  <p>
                    Provider:{' '}
                    {
                      aiStatus?.provider ||
                      '—'
                    }
                  </p>

                  <p>
                    Model:{' '}
                    {
                      aiStatus?.model ||
                      '—'
                    }
                  </p>

                  <p>
                    Payment Delay ·{' '}
                    {
                      mlStatus?.payment_delay_model ||
                      '—'
                    }
                  </p>

                  <p>
                    Cash Flow ·{' '}
                    {
                      mlStatus?.cash_flow_model ||
                      '—'
                    }
                  </p>
                </div>

                <Status>
                  {aiStatus?.available
                    ? 'Available'
                    : 'Unavailable'}
                </Status>
              </div>
            </Panel>

            <Panel
              eyebrow="RISK MANAGEMENT"
              title="High-risk exposure"
              action={
                <button
                  type="button"
                  className="admin-link"
                  onClick={() =>
                    setTab(
                      'Anomalies',
                    )
                  }
                >
                  Review anomalies
                  <ArrowUpRight
                    size={12}
                  />
                </button>
              }
            >
              <div className="admin-ai-card">
                <ShieldAlert
                  size={23}
                />

                <div>
                  <strong>
                    {
                      summary?.high_risk_transactions ??
                      0
                    }{' '}
                    high-risk transactions
                  </strong>

                  <p>
                    Risk metrics are
                    supplied by backend
                    risk records.
                  </p>

                  <p>
                    No synthetic financial
                    risk values are
                    generated here.
                  </p>
                </div>
              </div>
            </Panel>
          </div>
        </>
      )}

      {/* BUSINESSES */}

      {tab === 'Businesses' && (
        <Panel
          eyebrow="MSME MANAGEMENT"
          title="Registered businesses"
          action={
            <div className="admin-toolbar">
              <label className="admin-search">
                <Search
                  size={13}
                />

                <input
                  value={query}
                  onChange={(
                    event,
                  ) =>
                    setQuery(
                      event.target
                        .value,
                    )
                  }
                  placeholder="Search business, owner, GSTIN..."
                  aria-label="Search businesses"
                />
              </label>

              <select
                className="admin-select"
                value={
                  businessStatus
                }
                onChange={(
                  event,
                ) =>
                  setBusinessStatus(
                    event.target
                      .value,
                  )
                }
                aria-label="Business status"
              >
                <option value="ALL">
                  All
                </option>

                <option value="ACTIVE">
                  Active
                </option>

                <option value="PENDING">
                  Pending
                </option>

                <option value="SUSPENDED">
                  Suspended
                </option>

                <option value="INACTIVE">
                  Inactive
                </option>
              </select>

              <button
                type="button"
                className="admin-button"
                onClick={() =>
                  void loadBusinesses()
                }
              >
                <RefreshCw
                  size={12}
                />
              </button>
            </div>
          }
        >
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>
                    Business
                  </th>
                  <th>
                    Owner
                  </th>
                  <th>
                    Location
                  </th>
                  <th>
                    Users
                  </th>
                  <th>
                    Transactions
                  </th>
                  <th>
                    Outstanding
                  </th>
                  <th>
                    Risk
                  </th>
                  <th>
                    Banking
                  </th>
                  <th>
                    Status
                  </th>
                  <th />
                </tr>
              </thead>

              <tbody>
                {visibleBusinesses.map(
                  (
                    business,
                  ) => (
                    <tr
                      key={
                        business.id
                      }
                    >
                      <td>
                        <strong>
                          {
                            business.name
                          }
                        </strong>

                        <small>
                          {
                            business.gstin
                          }
                        </small>
                      </td>

                      <td>
                        <strong>
                          {
                            business.owner
                          }
                        </strong>

                        <small>
                          {
                            business.industry
                          }
                        </small>
                      </td>

                      <td>
                        {
                          business.location
                        }
                      </td>

                      <td>
                        {
                          business.users
                        }
                      </td>

                      <td>
                        {
                          business.transactions
                        }
                      </td>

                      <td>
                        {formatINR(
                          business.outstanding,
                        )}
                      </td>

                      <td>
                        <Status>
                          {
                            business.risk
                          }
                        </Status>
                      </td>

                      <td>
                        <Status>
                          {
                            business.banking
                          }
                        </Status>
                      </td>

                      <td>
                        <Status>
                          {
                            business.status
                          }
                        </Status>
                      </td>

                      <td>
                        <button
                          type="button"
                          className="admin-icon-button"
                          onClick={() =>
                            setSelectedBusiness(
                              business,
                            )
                          }
                          aria-label={`Open ${business.name}`}
                        >
                          <ChevronRight
                            size={14}
                          />
                        </button>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>

          {visibleBusinesses.length ===
            0 && (
            <EmptyState
              title="No businesses found"
              description="No backend business record matches the current filters."
              onRetry={() =>
                void loadBusinesses()
              }
            />
          )}
        </Panel>
      )}

      {/* USERS */}

      {tab === 'Users' && (
        <Panel
          eyebrow="ACCESS CONTROL"
          title="Platform users"
          action={
            <div className="admin-toolbar">
              <label className="admin-search">
                <Search
                  size={13}
                />

                <input
                  value={query}
                  onChange={(
                    event,
                  ) =>
                    setQuery(
                      event.target
                        .value,
                    )
                  }
                  placeholder="Search name, email, role..."
                  aria-label="Search users"
                />
              </label>

              <select
                className="admin-select"
                value={
                  userStatus
                }
                onChange={(
                  event,
                ) =>
                  setUserStatus(
                    event.target
                      .value,
                  )
                }
                aria-label="User status"
              >
                <option value="ALL">
                  All
                </option>

                <option value="ACTIVE">
                  Active
                </option>

                <option value="INACTIVE">
                  Inactive
                </option>

                <option value="SUSPENDED">
                  Suspended
                </option>
              </select>

              <button
                type="button"
                className="admin-button"
                onClick={() =>
                  void loadUsers()
                }
              >
                <RefreshCw
                  size={12}
                />
              </button>
            </div>
          }
        >
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>
                    User
                  </th>
                  <th>
                    Business
                  </th>
                  <th>
                    Role
                  </th>
                  <th>
                    Email
                  </th>
                  <th>
                    Last login
                  </th>
                  <th>
                    Status
                  </th>
                  <th />
                </tr>
              </thead>

              <tbody>
                {visibleUsers.map(
                  (
                    user,
                  ) => (
                    <tr
                      key={
                        user.id
                      }
                    >
                      <td>
                        <strong>
                          {
                            user.name
                          }
                        </strong>

                        <small>
                          ID ·{' '}
                          {
                            user.id
                          }
                        </small>
                      </td>

                      <td>
                        {
                          user.business
                        }
                      </td>

                      <td>
                        {
                          user.role
                        }
                      </td>

                      <td>
                        {
                          user.email
                        }
                      </td>

                      <td>
                        {formatDate(
                          user.last_login,
                        )}
                      </td>

                      <td>
                        <Status>
                          {
                            user.status
                          }
                        </Status>
                      </td>

                      <td>
                        <button
                          type="button"
                          className="admin-icon-button"
                          onClick={() =>
                            setSelectedUser(
                              user,
                            )
                          }
                          aria-label={`Open ${user.name}`}
                        >
                          <ChevronRight
                            size={14}
                          />
                        </button>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>

          {visibleUsers.length ===
            0 && (
            <EmptyState
              title="No users found"
              description="No backend user record matches the current filters."
              onRetry={() =>
                void loadUsers()
              }
            />
          )}
        </Panel>
      )}

      {/* PLATFORM HEALTH */}

      {tab === 'Platform Health' && (
        <>
          <Panel
            eyebrow="SYSTEM HEALTH"
            title="Core services"
            action={
              <button
                type="button"
                className="admin-button"
                onClick={() =>
                  void loadOverview(
                    true,
                  )
                }
                disabled={refreshing}
              >
                <RefreshCw
                  size={13}
                  className={
                    refreshing
                      ? 'admin-spin'
                      : undefined
                  }
                />
                Refresh
              </button>
            }
          >
            {services.length >
            0 ? (
              <div className="admin-service-grid">
                {services.map(
                  (
                    service,
                  ) => (
                    <div
                      className="admin-service"
                      key={
                        service.name
                      }
                    >
                      <div className="admin-service-top">
                        <strong>
                          {
                            service.name
                          }
                        </strong>

                        <Status>
                          {
                            service.status
                          }
                        </Status>
                      </div>

                      <small>
                        Latency ·{' '}
                        {
                          service.latency
                        }

                        <br />

                        Error rate ·{' '}
                        {
                          service.error_rate
                        }

                        <br />

                        Checked ·{' '}
                        {
                          service.checked
                        }
                      </small>
                    </div>
                  ),
                )}
              </div>
            ) : (
              <EmptyState
                title="No health records"
                description="The backend did not return service health data."
                onRetry={() =>
                  void loadOverview(
                    true,
                  )
                }
              />
            )}
          </Panel>

          <div
            className="admin-grid two"
            style={{
              marginTop: 12,
            }}
          >
            <Panel
              eyebrow="APPLICATION"
              title="Backend connection"
            >
              <div className="admin-health-grid">
                <div className="admin-health-card">
                  <div className="admin-service-top">
                    <strong>
                      FastAPI
                    </strong>

                    <Status>
                      Connected
                    </Status>
                  </div>

                  <small>
                    {
                      API_BASE_URL
                    }
                  </small>
                </div>

                <div className="admin-health-card">
                  <div className="admin-service-top">
                    <strong>
                      MySQL
                    </strong>

                    <Status>
                      Backend managed
                    </Status>
                  </div>

                  <small>
                    Database status is supplied
                    through backend admin APIs.
                  </small>
                </div>
              </div>
            </Panel>

            <Panel
              eyebrow="ML SERVICE"
              title="Model readiness"
            >
              <div className="admin-health-grid">
                <div className="admin-health-card">
                  <div className="admin-service-top">
                    <strong>
                      Payment Delay
                    </strong>

                    <Status>
                      {
                        mlStatus?.payment_delay_model ||
                        'Unknown'
                      }
                    </Status>
                  </div>

                  <small>
                    Existing payment-delay
                    prediction model.
                  </small>
                </div>

                <div className="admin-health-card">
                  <div className="admin-service-top">
                    <strong>
                      Cash Flow
                    </strong>

                    <Status>
                      {
                        mlStatus?.cash_flow_model ||
                        'Unknown'
                      }
                    </Status>
                  </div>

                  <small>
                    Existing cash-flow
                    forecasting model.
                  </small>
                </div>
              </div>
            </Panel>
          </div>
        </>
      )}

      {/* AI CONTROL CENTRE */}

      {tab ===
        'AI Control Centre' && (
        <>
          <div className="admin-grid two">
            <Panel
              eyebrow="GENAI"
              title="LLM status"
            >
              <div className="admin-ai-card">
                <Sparkles
                  size={22}
                />

                <div>
                  <strong>
                    {
                      aiStatus?.provider ||
                      'AI provider'
                    }
                  </strong>

                  <p>
                    Model:{' '}
                    {
                      aiStatus?.model ||
                      '—'
                    }
                  </p>

                  <p>
                    {
                      aiStatus?.message ||
                      'No AI status information returned.'
                    }
                  </p>
                </div>

                <Status>
                  {aiStatus?.available
                    ? 'Available'
                    : 'Unavailable'}
                </Status>
              </div>
            </Panel>

            <Panel
              eyebrow="ML"
              title="Prediction readiness"
            >
              <div className="admin-ai-card">
                <BrainCircuit
                  size={22}
                />

                <div>
                  <strong>
                    Trained ML models
                  </strong>

                  <p>
                    Payment Delay ·{' '}
                    {
                      mlStatus?.payment_delay_model ||
                      '—'
                    }
                  </p>

                  <p>
                    Cash Flow ·{' '}
                    {
                      mlStatus?.cash_flow_model ||
                      '—'
                    }
                  </p>
                </div>

                <Status>
                  {mlStatus?.available
                    ? 'Available'
                    : 'Unavailable'}
                </Status>
              </div>
            </Panel>
          </div>

          <Panel
            eyebrow="MODEL GOVERNANCE"
            title="AI / ML models"
          >
            {models.length >
            0 ? (
              <div className="admin-model-grid">
                {models.map(
                  (
                    model,
                  ) => (
                    <div
                      className="admin-model"
                      key={
                        model.name
                      }
                    >
                      <div className="admin-model-top">
                        <strong>
                          {
                            model.name
                          }
                        </strong>

                        <Status>
                          {
                            model.status
                          }
                        </Status>
                      </div>

                      <small>
                        Version ·{' '}
                        {
                          model.version
                        }

                        <br />

                        Predictions ·{' '}
                        {
                          model.predictions
                        }

                        <br />

                        Confidence ·{' '}
                        {model.confidence ===
                        null
                          ? '—'
                          : `${Math.round(
                              model.confidence *
                                100,
                            )}%`}

                        <br />

                        Source ·{' '}
                        {
                          model.source
                        }

                        <br />

                        Trained ·{' '}
                        {formatDate(
                          model.trained,
                        )}
                      </small>
                    </div>
                  ),
                )}
              </div>
            ) : (
              <EmptyState
                title="No model records"
                description="The backend did not return AI/ML model metadata."
                onRetry={() =>
                  void loadAI()
                }
              />
            )}
          </Panel>

          <Panel
            eyebrow="AI INSIGHTS"
            title="Recent intelligence"
          >
            {insights.length >
            0 ? (
              <div className="admin-insight-list">
                {insights.map(
                  (
                    insight,
                  ) => (
                    <div
                      className="admin-insight"
                      key={
                        insight.id
                      }
                    >
                      <div className="admin-insight-top">
                        <h4>
                          {
                            insight.title
                          }
                        </h4>

                        <Status>
                          {
                            insight.severity
                          }
                        </Status>
                      </div>

                      <p>
                        {
                          insight.recommendation
                        }
                      </p>

                      <small>
                        Business ·{' '}
                        {
                          insight.business
                        }

                        {' · '}

                        Model ·{' '}
                        {
                          insight.model
                        }

                        {' · '}

                        {
                          formatDate(
                            insight.created_at,
                          )
                        }
                      </small>
                    </div>
                  ),
                )}
              </div>
            ) : (
              <EmptyState
                title="No AI insights"
                description="No persisted AI insight records are available."
                onRetry={() =>
                  void loadAI()
                }
              />
            )}
          </Panel>
        </>
      )}

      {/* ANOMALIES */}

      {tab === 'Anomalies' && (
        <Panel
          eyebrow="TRANSACTION INTELLIGENCE"
          title="Detected anomalies"
          action={
            <button
              type="button"
              className="admin-button"
              onClick={() =>
                void loadAnomalies()
              }
            >
              <RefreshCw
                size={13}
              />
              Refresh
            </button>
          }
        >
          {anomalies.length >
          0 ? (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>
                      Business
                    </th>
                    <th>
                      Amount
                    </th>
                    <th>
                      Type
                    </th>
                    <th>
                      Risk
                    </th>
                    <th>
                      Score
                    </th>
                    <th>
                      Reason
                    </th>
                    <th>
                      Status
                    </th>
                    <th>
                      Created
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {anomalies.map(
                    (
                      anomaly,
                    ) => (
                      <tr
                        key={
                          anomaly.id
                        }
                      >
                        <td>
                          {
                            anomaly.business
                          }
                        </td>

                        <td>
                          {formatINR(
                            anomaly.amount,
                          )}
                        </td>

                        <td>
                          {
                            anomaly.type
                          }
                        </td>

                        <td>
                          <Status>
                            {
                              anomaly.risk
                            }
                          </Status>
                        </td>

                        <td>
                          {
                            anomaly.score
                          }
                        </td>

                        <td>
                          {
                            anomaly.reason
                          }
                        </td>

                        <td>
                          <Status>
                            {
                              anomaly.status
                            }
                          </Status>
                        </td>

                        <td>
                          {formatDate(
                            anomaly.created_at,
                          )}
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title="No anomalies"
              description="No stored transaction anomaly records are currently available."
              onRetry={() =>
                void loadAnomalies()
              }
            />
          )}
        </Panel>
      )}

      {/* ALERTS + AUDIT */}

      {tab ===
        'Alerts & Audit' && (
        <>
          <div className="admin-grid two">
            <Panel
              eyebrow="ALERT CENTRE"
              title="Backend alerts"
            >
              {alerts.length >
              0 ? (
                <div className="admin-insight-list">
                  {alerts.map(
                    (
                      alert,
                    ) => (
                      <div
                        className="admin-insight"
                        key={
                          alert.id
                        }
                      >
                        <div className="admin-insight-top">
                          <h4>
                            {
                              alert.title
                            }
                          </h4>

                          <Status>
                            {
                              alert.severity
                            }
                          </Status>
                        </div>

                        <p>
                          {
                            alert.message
                          }
                        </p>

                        <small>
                          {
                            alert.category
                          }

                          {' · '}

                          {
                            alert.status
                          }

                          {' · '}

                          {
                            formatDate(
                              alert.created_at,
                            )
                          }
                        </small>
                      </div>
                    ),
                  )}
                </div>
              ) : (
                <EmptyState
                  title="No alerts"
                  description="No backend alert records are currently available."
                  onRetry={() =>
                    void loadAudit()
                  }
                />
              )}
            </Panel>

            <Panel
              eyebrow="AUDIT"
              title="Recent audit activity"
            >
              {auditLogs.length >
              0 ? (
                <div className="admin-insight-list">
                  {auditLogs.map(
                    (
                      item,
                    ) => (
                      <div
                        className="admin-insight"
                        key={
                          item.id
                        }
                      >
                        <div className="admin-insight-top">
                          <h4>
                            {
                              item.action
                            }
                          </h4>

                          <Status>
                            Audit
                          </Status>
                        </div>

                        <p>
                          Actor ·{' '}
                          {
                            item.actor
                          }

                          {' · '}

                          Entity ·{' '}
                          {
                            item.entity
                          }

                          {' · '}

                          {
                            item.entity_id
                          }
                        </p>

                        <small>
                          {
                            formatDate(
                              item.created_at,
                            )
                          }

                          {' · '}

                          {
                            item.ip_address
                          }
                        </small>
                      </div>
                    ),
                  )}
                </div>
              ) : (
                <EmptyState
                  title="No audit events"
                  description="No backend audit records are currently available."
                  onRetry={() =>
                    void loadAudit()
                  }
                />
              )}
            </Panel>
          </div>
        </>
      )}

      {/* CONFIGURATION */}

      {tab ===
        'Configuration' && (
        <>
          <Panel
            eyebrow="DATA QUALITY"
            title="Platform data quality"
            action={
              <button
                type="button"
                className="admin-button"
                onClick={() =>
                  void loadDataQuality()
                }
              >
                <RefreshCw
                  size={13}
                />
                Refresh
              </button>
            }
          >
            {dataQuality.length >
            0 ? (
              <div className="admin-quality-grid">
                {dataQuality.map(
                  (
                    item,
                  ) => (
                    <div
                      className="admin-quality"
                      key={
                        item.table
                      }
                    >
                      <strong>
                        {
                          item.table
                        }
                      </strong>

                      <div className="admin-quality-row">
                        <span>
                          Total rows
                        </span>

                        <b>
                          {
                            item.total_rows
                          }
                        </b>
                      </div>

                      <div className="admin-quality-row">
                        <span>
                          Null rows
                        </span>

                        <b>
                          {
                            item.null_rows
                          }
                        </b>
                      </div>

                      <div className="admin-quality-row">
                        <span>
                          Duplicates
                        </span>

                        <b>
                          {
                            item.duplicate_rows
                          }
                        </b>
                      </div>

                      <div className="admin-quality-row">
                        <span>
                          Invalid
                        </span>

                        <b>
                          {
                            item.invalid_rows
                          }
                        </b>
                      </div>

                      <div className="admin-quality-row">
                        <span>
                          Quality
                        </span>

                        <b>
                          {
                            item.score
                          }%
                        </b>
                      </div>
                    </div>
                  ),
                )}
              </div>
            ) : (
              <EmptyState
                title="No data-quality records"
                description="The backend did not return data-quality monitoring results."
                onRetry={() =>
                  void loadDataQuality()
                }
              />
            )}
          </Panel>

          <div
            className="admin-grid two"
            style={{
              marginTop: 12,
            }}
          >
            <Panel
              eyebrow="AI CONFIGURATION"
              title="GenAI configuration"
            >
              <div className="admin-detail-row">
                <span>
                  Provider
                </span>

                <strong>
                  {
                    aiStatus?.provider ||
                    '—'
                  }
                </strong>
              </div>

              <div className="admin-detail-row">
                <span>
                  Model
                </span>

                <strong>
                  {
                    aiStatus?.model ||
                    '—'
                  }
                </strong>
              </div>

              <div className="admin-detail-row">
                <span>
                  Status
                </span>

                <Status>
                  {aiStatus?.available
                    ? 'Available'
                    : 'Unavailable'}
                </Status>
              </div>

              <div className="admin-detail-row">
                <span>
                  Requests today
                </span>

                <strong>
                  {
                    summary?.ai_requests_today ??
                    0
                  }
                </strong>
              </div>
            </Panel>

            <Panel
              eyebrow="ML CONFIGURATION"
              title="Model endpoints"
            >
              <div className="admin-detail-row">
                <span>
                  Payment delay
                </span>

                <strong>
                  {
                    mlStatus?.payment_delay_model ||
                    '—'
                  }
                </strong>
              </div>

              <div className="admin-detail-row">
                <span>
                  Cash flow
                </span>

                <strong>
                  {
                    mlStatus?.cash_flow_model ||
                    '—'
                  }
                </strong>
              </div>

              <div className="admin-detail-row">
                <span>
                  Models endpoint
                </span>

                <strong>
                  {
                    mlStatus?.models_endpoint ||
                    '—'
                  }
                </strong>
              </div>
            </Panel>
          </div>
        </>
      )}

      {/* BUSINESS DRAWER */}

      {selectedBusiness && (
        <div
          className="admin-drawer-backdrop"
          onClick={() =>
            setSelectedBusiness(
              null,
            )
          }
        >
          <aside
            className="admin-drawer"
            onClick={(
              event,
            ) =>
              event.stopPropagation()
            }
          >
            <div className="admin-drawer-head">
              <div>
                <p className="admin-eyebrow">
                  BUSINESS DETAIL
                </p>

                <h2>
                  {
                    selectedBusiness.name
                  }
                </h2>
              </div>

              <button
                type="button"
                className="admin-drawer-close"
                onClick={() =>
                  setSelectedBusiness(
                    null,
                  )
                }
                aria-label="Close business detail"
              >
                <X size={15} />
              </button>
            </div>

            <div className="admin-drawer-section">
              <h3>
                Business information
              </h3>

              <div className="admin-detail-row">
                <span>
                  Business ID
                </span>

                <strong>
                  {
                    selectedBusiness.id
                  }
                </strong>
              </div>

              <div className="admin-detail-row">
                <span>
                  Owner
                </span>

                <strong>
                  {
                    selectedBusiness.owner
                  }
                </strong>
              </div>

              <div className="admin-detail-row">
                <span>
                  GSTIN
                </span>

                <strong>
                  {
                    selectedBusiness.gstin
                  }
                </strong>
              </div>

              <div className="admin-detail-row">
                <span>
                  Industry
                </span>

                <strong>
                  {
                    selectedBusiness.industry
                  }
                </strong>
              </div>

              <div className="admin-detail-row">
                <span>
                  Location
                </span>

                <strong>
                  {
                    selectedBusiness.location
                  }
                </strong>
              </div>
            </div>

            <div className="admin-drawer-section">
              <h3>
                Financial control
              </h3>

              <div className="admin-detail-row">
                <span>
                  Users
                </span>

                <strong>
                  {
                    selectedBusiness.users
                  }
                </strong>
              </div>

              <div className="admin-detail-row">
                <span>
                  Transactions
                </span>

                <strong>
                  {
                    selectedBusiness.transactions
                  }
                </strong>
              </div>

              <div className="admin-detail-row">
                <span>
                  Outstanding
                </span>

                <strong>
                  {formatINR(
                    selectedBusiness.outstanding,
                  )}
                </strong>
              </div>

              <div className="admin-detail-row">
                <span>
                  Risk
                </span>

                <Status>
                  {
                    selectedBusiness.risk
                  }
                </Status>
              </div>

              <div className="admin-detail-row">
                <span>
                  Banking
                </span>

                <Status>
                  {
                    selectedBusiness.banking
                  }
                </Status>
              </div>

              <div className="admin-detail-row">
                <span>
                  AI
                </span>

                <Status>
                  {
                    selectedBusiness.ai
                  }
                </Status>
              </div>
            </div>

            <div className="admin-drawer-section">
              <h3>
                Administrative actions
              </h3>

              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  flexWrap: 'wrap',
                }}
              >
                {selectedBusiness.status
                  .trim()
                  .toUpperCase() !==
                  'ACTIVE' && (
                  <button
                    type="button"
                    className="admin-button"
                    disabled={
                      mutatingId ===
                      selectedBusiness.id
                    }
                    onClick={() =>
                      void updateBusiness(
                        selectedBusiness,
                        'ACTIVE',
                      )
                    }
                  >
                    {mutatingId ===
                    selectedBusiness.id ? (
                      <RefreshCw
                        size={12}
                        className="admin-spin"
                      />
                    ) : (
                      <Check
                        size={12}
                      />
                    )}

                    Activate
                  </button>
                )}

                {selectedBusiness.status
                  .trim()
                  .toUpperCase() !==
                  'SUSPENDED' && (
                  <button
                    type="button"
                    className="admin-button danger"
                    disabled={
                      mutatingId ===
                      selectedBusiness.id
                    }
                    onClick={() =>
                      void updateBusiness(
                        selectedBusiness,
                        'SUSPENDED',
                      )
                    }
                  >
                    <ShieldAlert
                      size={12}
                    />
                    Suspend
                  </button>
                )}
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* USER DRAWER */}

      {selectedUser && (
        <div
          className="admin-drawer-backdrop"
          onClick={() =>
            setSelectedUser(
              null,
            )
          }
        >
          <aside
            className="admin-drawer"
            onClick={(
              event,
            ) =>
              event.stopPropagation()
            }
          >
            <div className="admin-drawer-head">
              <div>
                <p className="admin-eyebrow">
                  USER DETAIL
                </p>

                <h2>
                  {
                    selectedUser.name
                  }
                </h2>
              </div>

              <button
                type="button"
                className="admin-drawer-close"
                onClick={() =>
                  setSelectedUser(
                    null,
                  )
                }
                aria-label="Close user detail"
              >
                <X size={15} />
              </button>
            </div>

            <div className="admin-drawer-section">
              <h3>
                User information
              </h3>

              <div className="admin-detail-row">
                <span>
                  User ID
                </span>

                <strong>
                  {
                    selectedUser.id
                  }
                </strong>
              </div>

              <div className="admin-detail-row">
                <span>
                  Email
                </span>

                <strong>
                  {
                    selectedUser.email
                  }
                </strong>
              </div>

              <div className="admin-detail-row">
                <span>
                  Business
                </span>

                <strong>
                  {
                    selectedUser.business
                  }
                </strong>
              </div>

              <div className="admin-detail-row">
                <span>
                  Role
                </span>

                <strong>
                  {
                    selectedUser.role
                  }
                </strong>
              </div>

              <div className="admin-detail-row">
                <span>
                  Security
                </span>

                <strong>
                  {
                    selectedUser.security
                  }
                </strong>
              </div>

              <div className="admin-detail-row">
                <span>
                  Last login
                </span>

                <strong>
                  {formatDate(
                    selectedUser.last_login,
                  )}
                </strong>
              </div>

              <div className="admin-detail-row">
                <span>
                  Status
                </span>

                <Status>
                  {
                    selectedUser.status
                  }
                </Status>
              </div>
            </div>

            <div className="admin-drawer-section">
              <h3>
                Account control
              </h3>

              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  flexWrap: 'wrap',
                }}
              >
                {selectedUser.status
                  .trim()
                  .toUpperCase() !==
                  'ACTIVE' && (
                  <button
                    type="button"
                    className="admin-button"
                    disabled={
                      mutatingId ===
                      selectedUser.id
                    }
                    onClick={() =>
                      void updateUser(
                        selectedUser,
                        'ACTIVE',
                      )
                    }
                  >
                    {mutatingId ===
                    selectedUser.id ? (
                      <RefreshCw
                        size={12}
                        className="admin-spin"
                      />
                    ) : (
                      <Check
                        size={12}
                      />
                    )}

                    Activate
                  </button>
                )}

                {selectedUser.status
                  .trim()
                  .toUpperCase() !==
                  'INACTIVE' && (
                  <button
                    type="button"
                    className="admin-button danger"
                    disabled={
                      mutatingId ===
                      selectedUser.id
                    }
                    onClick={() =>
                      void updateUser(
                        selectedUser,
                        'INACTIVE',
                      )
                    }
                  >
                    <ShieldAlert
                      size={12}
                    />
                    Deactivate
                  </button>
                )}
              </div>
            </div>
          </aside>
        </div>
      )}
    </main>
  )
}

export default AdminControlCentre