'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import Link from 'next/link'

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  RefreshCw,
  Sparkles,
  Wallet,
} from 'lucide-react'

// ============================================================
// TYPES
// ============================================================

type Tone =
  | 'green'
  | 'amber'
  | 'red'
  | 'blue'

type RangeLabel =
  | '7 Days'
  | '30 Days'
  | '90 Days'

type ChartMode =
  | 'position'
  | 'flow'

type LoadState =
  | 'loading'
  | 'ready'
  | 'empty'
  | 'error'

type RiskLevel =
  | 'LOW'
  | 'MEDIUM'
  | 'HIGH'
  | 'CRITICAL'

type ApiBankTransaction = {
  id: string
  business_id?: string | null
  transaction_date?: string | null
  transaction_type?: string | null
  category?: string | null
  amount?: number | string | null
  running_balance?: number | string | null
  description?: string | null
  reference_number?: string | null
  customer_id?: string | null
  supplier_id?: string | null
  invoice_payment_id?: string | null
  expense_id?: string | null
  created_at?: string | null
}

type ApiInvoice = {
  id: string
  business_id?: string | null
  customer_id?: string | null
  invoice_number?: string | null
  invoice_date?: string | null
  due_date?: string | null
  status?: string | null
  subtotal?: number | string | null
  tax_amount?: number | string | null
  total_amount?: number | string | null
  amount_paid?: number | string | null
  created_at?: string | null
  updated_at?: string | null
}

type ApiInvoiceEnvelope = {
  status?: string
  total?: number
  limit?: number
  offset?: number
  data?: ApiInvoice[]
}

type ApiBankingSummary = {
  total_transactions?: number | string | null
  total_credit?: number | string | null
  total_debit?: number | string | null
  balance?: number | string | null
}

type ApiMLCashFlowForecastRow = {
  forecast_date: string
  predicted_inflow?: number | null
  predicted_outflow?: number | null
  predicted_net_cash_flow?: number | null
}

type ApiMLCashFlowForecastResponse = {
  business_id?: string | null
  horizon_days?: number
  forecast_days?: number
  model?: string
  target?: string
  forecast?: ApiMLCashFlowForecastRow[]
}

type AIInsight = {
  type: string
  title: string
  explanation: string
  evidence: string
  recommendation: string
  timestamp: string
  action: string
  source: 'ai' | 'rule'
}

type PositionPoint = {
  date: string
  actual: number | null
  projected: number | null
}

type FlowPoint = {
  name: string
  inflow: number
  outflow: number
}

type ForecastSummary = {
  days: number
  totalNet: number
  averageDailyNet: number
  minimumDailyNet: number
  maximumDailyNet: number
  lowestBalance: number
}

type ForecastResult = {
  projectedInflow: number
  projectedOutflow: number
  projectedNet: number
  projectedLowestBalance: number
}

// ============================================================
// CONFIG
// ============================================================

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:8000'
).replace(
  /\/+$/,
  '',
)

const ML_API_BASE_URL = (
  process.env.NEXT_PUBLIC_ML_API_URL ||
  'http://127.0.0.1:8001'
).replace(
  /\/+$/,
  '',
)

const DEFAULT_BUSINESS_ID =
  process.env.NEXT_PUBLIC_BUSINESS_ID?.trim() ||
  ''

const AUTH_TOKEN_KEY =
  'cashguard_access_token'

const LEGACY_AUTH_KEYS = [
  'access_token',
  'accessToken',
  'token',
  'auth_token',
  'jwt_token',
  'jwt',
  'cashguard_token',
] as const

const AI_REQUEST_TIMEOUT_MS = 30000

// ============================================================
// AUTH TOKEN
// ============================================================

function cleanToken(
  value: unknown,
): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const token =
    value
      .trim()
      .replace(
        /^Bearer\s+/i,
        '',
      )
      .trim()

  return token || null
}

function getAuthToken(): string | null {
  if (
    typeof window ===
    'undefined'
  ) {
    return null
  }

  const storages: Storage[] = [
    window.localStorage,
    window.sessionStorage,
  ]

  // Canonical token first.
  for (
    const storage of storages
  ) {
    try {
      const token =
        cleanToken(
          storage.getItem(
            AUTH_TOKEN_KEY,
          ),
        )

      if (token) {
        return token
      }
    } catch {
      // Ignore storage errors.
    }
  }

  // Backward-compatible legacy keys.
  for (
    const storage of storages
  ) {
    for (
      const key of LEGACY_AUTH_KEYS
    ) {
      try {
        const token =
          cleanToken(
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

  return null
}

function hasAuthMarker(): boolean {
  if (
    typeof window ===
    'undefined'
  ) {
    return false
  }

  const storages: Storage[] = [
    window.localStorage,
    window.sessionStorage,
  ]

  for (
    const storage of storages
  ) {
    try {
      if (
        storage.getItem(
          'cashguard-auth',
        ) ===
        'authenticated'
      ) {
        return true
      }
    } catch {
      // Ignore storage errors.
    }
  }

  return false
}

// ============================================================
// BUSINESS ID
// ============================================================

function getBusinessId(): string | null {
  if (
    typeof window ===
    'undefined'
  ) {
    return (
      DEFAULT_BUSINESS_ID ||
      null
    )
  }

  const keys = [
    'business_id',
    'businessId',
    'cashguard_business_id',
  ]

  const storages: Storage[] = [
    window.localStorage,
    window.sessionStorage,
  ]

  for (
    const storage of storages
  ) {
    for (
      const key of keys
    ) {
      try {
        const value =
          storage
            .getItem(key)
            ?.trim()

        if (value) {
          return value
        }
      } catch {
        // Ignore storage errors.
      }
    }
  }

  return (
    DEFAULT_BUSINESS_ID ||
    null
  )
}

// ============================================================
// API ERROR
// ============================================================

class ApiError extends Error {
  status: number
  endpoint: string

  constructor(
    message: string,
    status: number,
    endpoint: string,
  ) {
    super(message)

    this.name =
      'ApiError'

    this.status =
      status

    this.endpoint =
      endpoint
  }
}

// ============================================================
// JSON HELPERS
// ============================================================

function isRecord(
  value: unknown,
): value is Record<
  string,
  unknown
> {
  return (
    typeof value ===
      'object' &&
    value !== null &&
    !Array.isArray(value)
  )
}

function parseJsonSafely(
  raw: string,
): unknown | null {
  const text =
    raw.trim()

  if (!text) {
    return null
  }

  try {
    return JSON.parse(
      text,
    )
  } catch {
    return null
  }
}

function cleanTextResponse(
  raw: string,
): string {
  return raw
    .replace(
      /<[^>]*>/g,
      ' ',
    )
    .replace(
      /\s+/g,
      ' ',
    )
    .trim()
}

function extractApiMessage(
  body: unknown,
  fallback: string,
): string {
  if (
    isRecord(body)
  ) {
    const detail =
      body.detail

    if (
      typeof detail ===
      'string'
    ) {
      return detail
    }

    if (
      Array.isArray(detail)
    ) {
      const messages =
        detail
          .map(
            (
              item,
            ) => {
              if (
                isRecord(
                  item,
                ) &&
                typeof item.msg ===
                  'string'
              ) {
                return item.msg
              }

              return null
            },
          )
          .filter(
            (
              value,
            ): value is string =>
              Boolean(value),
          )

      if (
        messages.length >
        0
      ) {
        return messages.join(
          ', ',
        )
      }
    }

    if (
      typeof body.message ===
      'string'
    ) {
      return body.message
    }

    if (
      typeof body.error ===
      'string'
    ) {
      return body.error
    }
  }

  const text =
    typeof body ===
      'string'
      ? cleanTextResponse(
          body,
        )
      : ''

  return (
    text || fallback
  )
}

// ============================================================
// MAIN API FETCH
// ============================================================

async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const headers =
    new Headers(
      options.headers ||
        {},
    )

  headers.set(
    'Accept',
    'application/json, text/plain, */*',
  )

  if (
    options.body &&
    !(
      options.body instanceof
      FormData
    ) &&
    !headers.has(
      'Content-Type',
    )
  ) {
    headers.set(
      'Content-Type',
      'application/json',
    )
  }

  const token =
    getAuthToken()

  if (token) {
    headers.set(
      'Authorization',
      `Bearer ${token}`,
    )
  }

  let response: Response

  try {
    response =
      await fetch(
        `${API_BASE_URL}${endpoint}`,
        {
          ...options,
          method:
            options.method ||
            'GET',
          headers,
          credentials:
            'include',
          cache:
            'no-store',
        },
      )
  } catch (error) {
    throw new ApiError(
      error instanceof Error
        ? error.message
        : 'Unable to connect to backend API.',
      0,
      endpoint,
    )
  }

  let rawBody = ''

  try {
    rawBody =
      await response.text()
  } catch {
    rawBody = ''
  }

  const parsedBody =
    parseJsonSafely(
      rawBody,
    )

  if (
    response.ok
  ) {
    if (
      response.status ===
      204
    ) {
      return undefined as T
    }

    if (
      parsedBody !==
      null
    ) {
      return parsedBody as T
    }

    /*
     * Some lightweight AI/model endpoints
     * can return plain text. Do not break the
     * entire page for a valid text response.
     */
    if (
      rawBody.trim()
    ) {
      return rawBody as T
    }

    throw new ApiError(
      'Backend returned an empty response.',
      response.status,
      endpoint,
    )
  }

  const message =
    extractApiMessage(
      parsedBody ??
        rawBody,
      `API request failed (${response.status})`,
    )

  if (
    response.status ===
    401
  ) {
    console.warn(
      '[CashGuard Auth] 401 Unauthorized',
      {
        endpoint,
        hasToken:
          Boolean(
            getAuthToken(),
          ),
        hasAuthMarker:
          hasAuthMarker(),
        message,
      },
    )

    if (
      typeof window !==
      'undefined'
    ) {
      window.dispatchEvent(
        new Event(
          'cashguard-auth-expired',
        ),
      )
    }
  }

  throw new ApiError(
    message,
    response.status,
    endpoint,
  )
}

// ============================================================
// ML FETCH
// ============================================================

async function mlFetch<T>(
  endpoint: string,
): Promise<T> {
  let response: Response

  try {
    response =
      await fetch(
        `${ML_API_BASE_URL}${endpoint}`,
        {
          method:
            'GET',
          headers: {
            Accept:
              'application/json',
          },
          cache:
            'no-store',
        },
      )
  } catch (error) {
    throw new ApiError(
      error instanceof Error
        ? error.message
        : 'Unable to connect to ML service.',
      0,
      endpoint,
    )
  }

  let rawBody = ''

  try {
    rawBody =
      await response.text()
  } catch {
    rawBody = ''
  }

  const parsedBody =
    parseJsonSafely(
      rawBody,
    )

  if (
    !response.ok
  ) {
    throw new ApiError(
      extractApiMessage(
        parsedBody ??
          rawBody,
        `ML API request failed (${response.status})`,
      ),
      response.status,
      endpoint,
    )
  }

  if (
    parsedBody !== null
  ) {
    return parsedBody as T
  }

  throw new ApiError(
    'ML API returned an invalid response.',
    response.status,
    endpoint,
  )
}

// ============================================================
// NUMBER HELPERS
// ============================================================

function toNumber(
  value:
    | number
    | string
    | null
    | undefined,
): number {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return 0
  }

  const numeric =
    Number(value)

  return Number.isFinite(
    numeric,
  )
    ? numeric
    : 0
}

// ============================================================
// FORMATTERS
// ============================================================

function formatINR(
  value: number,
): string {
  const safeValue =
    Number.isFinite(
      value,
    )
      ? value
      : 0

  return `₹${Math.abs(
    safeValue,
  ).toLocaleString(
    'en-IN',
    {
      maximumFractionDigits:
        2,
    },
  )}`
}

function formatSignedINR(
  value: number,
): string {
  const safeValue =
    Number.isFinite(
      value,
    )
      ? value
      : 0

  const formatted =
    Math.abs(
      safeValue,
    ).toLocaleString(
      'en-IN',
      {
        maximumFractionDigits:
          2,
      },
    )

  return safeValue < 0
    ? `-₹${formatted}`
    : `₹${formatted}`
}

function formatDate(
  value:
    | string
    | null
    | undefined,
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

  return parsed.toLocaleDateString(
    'en-IN',
    {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    },
  )
}

// ============================================================
// TRANSACTION TYPE
// ============================================================

function normalizeType(
  value:
    | string
    | null
    | undefined,
): 'Credit' | 'Debit' {
  const type =
    (
      value || ''
    )
      .trim()
      .toLowerCase()

  const creditTypes = [
    'credit',
    'cr',
    'income',
    'deposit',
    'inflow',
    'received',
    'receive',
    'paid_in',
  ]

  return creditTypes.includes(
    type,
  )
    ? 'Credit'
    : 'Debit'
}

// ============================================================
// RANGE HELPERS
// ============================================================

function getRangeDays(
  range: RangeLabel,
): number {
  switch (range) {
    case '7 Days':
      return 7

    case '90 Days':
      return 90

    default:
      return 30
  }
}

function getRangeStartDate(
  range: RangeLabel,
): Date {
  const start =
    new Date()

  start.setHours(
    0,
    0,
    0,
    0,
  )

  start.setDate(
    start.getDate() -
      getRangeDays(range) +
      1,
  )

  return start
}

function isInRange(
  value:
    | string
    | null
    | undefined,
  range: RangeLabel,
): boolean {
  if (!value) {
    return false
  }

  const parsed =
    new Date(value)

  if (
    Number.isNaN(
      parsed.getTime(),
    )
  ) {
    return false
  }

  const start =
    new Date()

  start.setHours(
    0,
    0,
    0,
    0,
  )

  start.setDate(
    start.getDate() -
      getRangeDays(
        range,
      ) +
      1,
  )

  return (
    parsed >= start
  )
}

// ============================================================
// DAYS UNTIL
// ============================================================

function daysUntil(
  value:
    | string
    | null
    | undefined,
): number | null {
  if (!value) {
    return null
  }

  const due =
    new Date(value)

  if (
    Number.isNaN(
      due.getTime(),
    )
  ) {
    return null
  }

  const today =
    new Date()

  today.setHours(
    0,
    0,
    0,
    0,
  )

  due.setHours(
    0,
    0,
    0,
    0,
  )

  return Math.ceil(
    (due.getTime() -
      today.getTime()) /
      86400000,
  )
}

// ============================================================
// FAST INITIAL DATA
// ============================================================

async function fetchInitialTransactions(
  businessId: string,
): Promise<ApiBankTransaction[]> {
  const endpoint =
    `/api/banking/transactions?business_id=${encodeURIComponent(
      businessId,
    )}&limit=100&offset=0`

  const response =
    await apiFetch<unknown>(
      endpoint,
    )

  const rows =
    Array.isArray(response)
      ? response
      : isRecord(response) &&
          Array.isArray(response.data)
        ? response.data
        : []

  return rows.filter(
    (
      row,
    ): row is ApiBankTransaction =>
      isRecord(row) &&
      typeof row.id === 'string',
  )
}

type InvoicePageResult = {
  batch: ApiInvoice[]
  total: number | null
}

async function fetchInvoicePage(
  offset: number,
  limit: number,
): Promise<InvoicePageResult> {
  const response =
    await apiFetch<unknown>(
      `/api/invoices?limit=${limit}&offset=${offset}`,
    )

  let batch: ApiInvoice[] = []
  let total: number | null = null

  if (
    Array.isArray(response)
  ) {
    batch = response.filter(
      (
        row,
      ): row is ApiInvoice =>
        isRecord(row) &&
        typeof row.id === 'string',
    )
  } else if (
    isRecord(response)
  ) {
    if (
      Array.isArray(response.data)
    ) {
      batch = (
        response.data as unknown[]
      ).filter(
        (
          row,
        ): row is ApiInvoice =>
          isRecord(row) &&
          typeof row.id === 'string',
      )
    }

    if (
      typeof response.total === 'number'
    ) {
      total = response.total
    }
  }

  return {
    batch,
    total,
  }
}

async function fetchInitialInvoices(
  businessId: string,
): Promise<InvoicePageResult> {
  void businessId

  // Keep the first request intentionally small so the main page can
  // render immediately. The remaining invoice history loads later.
  return fetchInvoicePage(0, 500)
}

// ============================================================
// RANGE-LIMITED TRANSACTIONS
// ============================================================

async function fetchTransactionsForRange(
  businessId: string,
  range: RangeLabel,
): Promise<ApiBankTransaction[]> {
  const limit = 100
  const maxPages = 100
  const rangeStart =
    getRangeStartDate(range)
  const result: ApiBankTransaction[] = []

  for (
    let page = 0;
    page < maxPages;
    page += 1
  ) {
    const offset =
      page * limit

    const endpoint =
      `/api/banking/transactions?business_id=${encodeURIComponent(
        businessId,
      )}&limit=${limit}&offset=${offset}`

    const response =
      await apiFetch<unknown>(
        endpoint,
      )

    const batch =
      Array.isArray(response)
        ? response.filter(
            (
              row,
            ): row is ApiBankTransaction =>
              isRecord(row) &&
              typeof row.id === 'string',
          )
        : isRecord(response) &&
            Array.isArray(response.data)
          ? (
              response.data as unknown[]
            ).filter(
              (
                row,
              ): row is ApiBankTransaction =>
                isRecord(row) &&
                typeof row.id === 'string',
            )
          : []

    if (
      batch.length === 0
    ) {
      break
    }

    for (
      const row of batch
    ) {
      if (
        (!row.business_id ||
          row.business_id === businessId) &&
        isInRange(
          row.transaction_date,
          range,
        )
      ) {
        result.push(row)
      }
    }

    // The banking endpoint is consumed in newest-first pagination.
    // Once an entire page is older than the selected range, there is
    // no need to continue scanning historical pages.
    const pageIsEntirelyBeforeRange =
      batch.every(
        (
          row,
        ) => {
          if (!row.transaction_date) {
            return false
          }

          const date =
            new Date(
              row.transaction_date,
            )

          return (
            !Number.isNaN(
              date.getTime(),
            ) &&
            date < rangeStart
          )
        },
      )

    if (
      pageIsEntirelyBeforeRange ||
      batch.length < limit
    ) {
      break
    }
  }

  return result
}

// ============================================================
// BACKGROUND INVOICES
// ============================================================

async function fetchAllInvoices(
  businessId: string,
  firstPage: InvoicePageResult,
): Promise<ApiInvoice[]> {
  void businessId

  const limit = 500
  const concurrency = 4

  const firstBatch =
    firstPage.batch

  const total =
    firstPage.total

  if (
    total !== null &&
    total <= firstBatch.length
  ) {
    return firstBatch.filter(
      (
        row,
      ) =>
        !row.business_id ||
        row.business_id === businessId,
    )
  }

  const remainingPages =
    total !== null
      ? Math.max(
          0,
          Math.ceil(
            total / limit,
          ) - 1,
        )
      : 100

  const result: ApiInvoice[] = [
    ...firstBatch,
  ]

  for (
    let startPage = 1;
    startPage <= remainingPages;
    startPage += concurrency
  ) {
    const pages =
      Array.from(
        {
          length: Math.min(
            concurrency,
            remainingPages -
              startPage +
              1,
          ),
        },
        (
          _,
          index,
        ) =>
          startPage + index,
      )

    const responses =
      await Promise.all(
        pages.map(
          async (page) =>
            fetchInvoicePage(
              page * limit,
              limit,
            ),
        ),
      )

    let reachedEnd = false

    for (
      const response of responses
    ) {
      if (
        response.batch.length === 0
      ) {
        reachedEnd = true
        break
      }

      result.push(
        ...response.batch,
      )

      if (
        response.batch.length <
        limit
      ) {
        reachedEnd = true
        break
      }
    }

    if (
      reachedEnd
    ) {
      break
    }
  }

  const maxItems =
    total !== null
      ? total
      : result.length

  return result
    .slice(
      0,
      maxItems,
    )
    .filter(
      (
        row,
      ) =>
        !row.business_id ||
        row.business_id === businessId,
    )
}

// ============================================================
// BANKING SUMMARY
// ============================================================

async function fetchBankingSummary(
  businessId: string,
): Promise<ApiBankingSummary> {
  const response =
    await apiFetch<unknown>(
      `/api/banking/transactions/summary?business_id=${encodeURIComponent(
        businessId,
      )}`,
    )

  if (
    isRecord(
      response,
    )
  ) {
    return response as ApiBankingSummary
  }

  return {
    total_transactions:
      0,
    total_credit:
      0,
    total_debit:
      0,
    balance:
      0,
  }
}

// ============================================================
// ML FORECAST
// ============================================================

async function fetchMLCashFlowForecast(
  businessId: string,
  horizonDays = 30,
): Promise<
  ApiMLCashFlowForecastResponse | null
> {
  try {
    const response =
      await mlFetch<ApiMLCashFlowForecastResponse>(
        `/predict/cash-flow?business_id=${encodeURIComponent(
          businessId,
        )}&horizon_days=${horizonDays}`,
      )

    if (
      !Array.isArray(
        response?.forecast,
      )
    ) {
      return null
    }

    return {
      ...response,
      forecast:
        response.forecast.filter(
          (
            row,
          ) =>
            Boolean(
              row?.forecast_date,
            ),
        ),
    }
  } catch (error) {
    console.warn(
      '[CashFlowPage] ML forecast unavailable.',
      error,
    )

    return null
  }
}

// ============================================================
// LATEST BALANCE
// ============================================================

function latestBalance(
  transactions:
    ApiBankTransaction[],
): number {
  if (
    transactions.length ===
    0
  ) {
    return 0
  }

  const sorted =
    [
      ...transactions,
    ].sort(
      (
        a,
        b,
      ) => {
        const dateA =
          a.transaction_date
            ? new Date(
                a.transaction_date,
              ).getTime()
            : 0

        const dateB =
          b.transaction_date
            ? new Date(
                b.transaction_date,
              ).getTime()
            : 0

        if (
          dateA !==
          dateB
        ) {
          return (
            dateB -
            dateA
          )
        }

        const createdA =
          a.created_at
            ? new Date(
                a.created_at,
              ).getTime()
            : 0

        const createdB =
          b.created_at
            ? new Date(
                b.created_at,
              ).getTime()
            : 0

        return (
          createdB -
          createdA
        )
      },
    )

  return toNumber(
    sorted[0]
      ?.running_balance,
  )
}

// ============================================================
// TOTALS
// ============================================================

function calculateTotals(
  transactions:
    ApiBankTransaction[],
  range:
    RangeLabel,
) {
  const rows =
    transactions.filter(
      (
        row,
      ) =>
        isInRange(
          row.transaction_date,
          range,
        ),
    )

  const moneyIn =
    rows
      .filter(
        (
          row,
        ) =>
          normalizeType(
            row.transaction_type,
          ) ===
          'Credit',
      )
      .reduce(
        (
          sum,
          row,
        ) =>
          sum +
          Math.abs(
            toNumber(
              row.amount,
            ),
          ),
        0,
      )

  const moneyOut =
    rows
      .filter(
        (
          row,
        ) =>
          normalizeType(
            row.transaction_type,
          ) ===
          'Debit',
      )
      .reduce(
        (
          sum,
          row,
        ) =>
          sum +
          Math.abs(
            toNumber(
              row.amount,
            ),
          ),
        0,
      )

  return {
    rows,
    moneyIn,
    moneyOut,
    net:
      moneyIn -
      moneyOut,
  }
}

// ============================================================
// RECEIVABLES
// ============================================================

function calculateReceivables(
  invoices:
    ApiInvoice[],
) {
  let total = 0
  let overdue = 0
  let dueSoon = 0

  for (
    const invoice of invoices
  ) {
    const outstanding =
      Math.max(
        0,
        toNumber(
          invoice.total_amount,
        ) -
          toNumber(
            invoice.amount_paid,
          ),
      )

    if (
      outstanding <=
      0
    ) {
      continue
    }

    total +=
      outstanding

    const due =
      daysUntil(
        invoice.due_date,
      )

    if (
      due !== null &&
      due < 0
    ) {
      overdue +=
        outstanding
    }

    if (
      due !== null &&
      due >= 0 &&
      due <= 14
    ) {
      dueSoon +=
        outstanding
    }
  }

  return {
    total,
    overdue,
    dueSoon,
  }
}

// ============================================================
// LEGACY FORECAST
// ============================================================

function calculateForecast(
  currentBalance: number,
  transactions:
    ApiBankTransaction[],
  invoices:
    ApiInvoice[],
): ForecastResult {
  const cutoff =
    new Date()

  cutoff.setDate(
    cutoff.getDate() -
      30,
  )

  const recent =
    transactions.filter(
      (
        row,
      ) => {
        if (
          !row.transaction_date
        ) {
          return false
        }

        const date =
          new Date(
            row.transaction_date,
          )

        return (
          !Number.isNaN(
            date.getTime(),
          ) &&
          date >= cutoff
        )
      },
    )

  const recentIn =
    recent
      .filter(
        (
          row,
        ) =>
          normalizeType(
            row.transaction_type,
          ) ===
          'Credit',
      )
      .reduce(
        (
          sum,
          row,
        ) =>
          sum +
          Math.abs(
            toNumber(
              row.amount,
            ),
          ),
        0,
      )

  const recentOut =
    recent
      .filter(
        (
          row,
        ) =>
          normalizeType(
            row.transaction_type,
          ) ===
          'Debit',
      )
      .reduce(
        (
          sum,
          row,
        ) =>
          sum +
          Math.abs(
            toNumber(
              row.amount,
            ),
          ),
        0,
      )

  const dailyIn =
    recentIn / 30

  const dailyOut =
    recentOut / 30

  const nearTermReceivables =
    invoices.reduce(
      (
        sum,
        invoice,
      ) => {
        const outstanding =
          Math.max(
            0,
            toNumber(
              invoice.total_amount,
            ) -
              toNumber(
                invoice.amount_paid,
              ),
          )

        const due =
          daysUntil(
            invoice.due_date,
          )

        if (
          outstanding >
            0 &&
          due !== null &&
          due >= 0 &&
          due <= 14
        ) {
          return (
            sum +
            outstanding
          )
        }

        return sum
      },
      0,
    )

  const projectedInflow =
    Math.max(
      dailyIn * 14,
      nearTermReceivables,
    )

  const projectedOutflow =
    dailyOut * 14

  const projectedNet =
    projectedInflow -
    projectedOutflow

  const projectedLowestBalance =
    currentBalance +
    projectedNet

  return {
    projectedInflow,
    projectedOutflow,
    projectedNet,
    projectedLowestBalance,
  }
}

// ============================================================
// ML SUMMARY
// ============================================================

function calculateMLForecastSummary(
  rows:
    ApiMLCashFlowForecastRow[],
  currentBalance: number,
): ForecastSummary | null {
  const next14 =
    rows
      .slice(
        0,
        14,
      )
      .filter(
        (
          row,
        ) =>
          Boolean(
            row?.forecast_date,
          ),
      )

  if (
    next14.length ===
    0
  ) {
    return null
  }

  let cumulative = 0

  let lowestBalance =
    currentBalance

  for (
    const row of next14
  ) {
    cumulative +=
      toNumber(
        row.predicted_net_cash_flow,
      )

    const projectedBalance =
      currentBalance +
      cumulative

    lowestBalance =
      Math.min(
        lowestBalance,
        projectedBalance,
      )
  }

  const netValues =
    next14.map(
      (
        row,
      ) =>
        toNumber(
          row.predicted_net_cash_flow,
        ),
    )

  const totalNet =
    netValues.reduce(
      (
        sum,
        value,
      ) =>
        sum + value,
      0,
    )

  return {
    days:
      next14.length,
    totalNet,
    averageDailyNet:
      totalNet /
      next14.length,
    minimumDailyNet:
      Math.min(
        ...netValues,
      ),
    maximumDailyNet:
      Math.max(
        ...netValues,
      ),
    lowestBalance,
  }
}

// ============================================================
// HEALTH
// ============================================================

function healthScore(
  currentBalance: number,
  projectedOutflow: number,
  projectedLowestBalance: number,
  receivables: number,
): number {
  const coverage =
    projectedOutflow >
    0
      ? Math.min(
          100,
          (Math.max(
            currentBalance,
            0,
          ) /
            projectedOutflow) *
            100,
        )
      : 100

  const liquidity =
    projectedLowestBalance >=
    0
      ? 100
      : 20

  const receivableSupport =
    receivables >=
    projectedOutflow
      ? 100
      : receivables > 0
        ? 65
        : 40

  return Math.max(
    0,
    Math.min(
      100,
      Math.round(
        coverage * 0.45 +
          liquidity * 0.35 +
          receivableSupport *
            0.2,
      ),
    ),
  )
}

// ============================================================
// RISK
// ============================================================

function riskLevel(
  currentBalance: number,
  lowestBalance: number,
): RiskLevel {
  if (
    lowestBalance < 0
  ) {
    return 'CRITICAL'
  }

  if (
    currentBalance <=
    0
  ) {
    return 'HIGH'
  }

  const ratio =
    lowestBalance /
    currentBalance

  if (
    ratio < 0.25
  ) {
    return 'HIGH'
  }

  if (
    ratio < 0.5
  ) {
    return 'MEDIUM'
  }

  return 'LOW'
}

// ============================================================
// POSITION CHART
// ============================================================

function buildPositionData(
  transactions:
    ApiBankTransaction[],
  range:
    RangeLabel,
): PositionPoint[] {
  const rows =
    transactions
      .filter(
        (
          row,
        ) =>
          isInRange(
            row.transaction_date,
            range,
          ),
      )
      .sort(
        (
          a,
          b,
        ) => {
          const aTime =
            a.transaction_date
              ? new Date(
                  a.transaction_date,
                ).getTime()
              : 0

          const bTime =
            b.transaction_date
              ? new Date(
                  b.transaction_date,
                ).getTime()
              : 0

          return (
            aTime -
            bTime
          )
        },
      )

  const map =
    new Map<
      string,
      number
    >()

  for (
    const row of rows
  ) {
    if (
      !row.transaction_date
    ) {
      continue
    }

    const date =
      new Date(
        row.transaction_date,
      )

    if (
      Number.isNaN(
        date.getTime(),
      )
    ) {
      continue
    }

    const key =
      date
        .toISOString()
        .slice(
          0,
          10,
        )

    map.set(
      key,
      toNumber(
        row.running_balance,
      ),
    )
  }

  return Array.from(
    map.entries(),
  )
    .sort(
      (
        a,
        b,
      ) =>
        a[0].localeCompare(
          b[0],
        ),
    )
    .map(
      ([
        date,
        balance,
      ]) => ({
        date:
          formatDate(
            date,
          ),
        actual:
          balance,
        projected:
          null,
      }),
    )
}

// ============================================================
// FLOW CHART
// ============================================================

function buildFlowData(
  transactions:
    ApiBankTransaction[],
  range:
    RangeLabel,
): FlowPoint[] {
  const rows =
    transactions.filter(
      (
        row,
      ) =>
        isInRange(
          row.transaction_date,
          range,
        ),
    )

  const map =
    new Map<
      string,
      FlowPoint
    >()

  for (
    const row of rows
  ) {
    const category =
      row.category?.trim() ||
      'Other'

    const current =
      map.get(
        category,
      ) || {
        name:
          category,
        inflow: 0,
        outflow: 0,
      }

    const amount =
      Math.abs(
        toNumber(
          row.amount,
        ),
      )

    if (
      normalizeType(
        row.transaction_type,
      ) ===
      'Credit'
    ) {
      current.inflow +=
        amount
    } else {
      current.outflow +=
        amount
    }

    map.set(
      category,
      current,
    )
  }

  return Array.from(
    map.values(),
  )
    .sort(
      (
        a,
        b,
      ) =>
        b.inflow +
        b.outflow -
        (a.inflow +
          a.outflow),
    )
    .slice(
      0,
      8,
    )
}

// ============================================================
// FALLBACK AI
// ============================================================

function buildFallbackInsights(
  data: {
    overdue: number
    dueSoon: number
    projectedNet: number
    projectedLowestBalance: number
    risk: RiskLevel
  },
): AIInsight[] {
  const insights:
    AIInsight[] =
    []

  if (
    data.overdue >
    0
  ) {
    insights.push({
      type:
        'Collection priority',
      title:
        'Overdue receivables need attention',
      explanation:
        'Outstanding overdue invoices are reducing near-term liquidity available to the business.',
      evidence:
        `${formatINR(
          data.overdue,
        )} overdue`,
      recommendation:
        'Prioritise overdue customer follow-ups and collection commitments.',
      timestamp:
        'Generated from live invoice data',
      action:
        'Review Invoices',
      source:
        'rule',
    })
  }

  if (
    data.projectedNet <
    0
  ) {
    insights.push({
      type:
        'Liquidity warning',
      title:
        'Projected cash pressure detected',
      explanation:
        'Recent cash-outflow activity is currently stronger than projected inflows.',
      evidence:
        `Projected 14-day net ${formatSignedINR(
          data.projectedNet,
        )}`,
      recommendation:
        data.dueSoon >
        0
          ? `Accelerate collection of ${formatINR(
              data.dueSoon,
            )} due soon.`
          : 'Review discretionary outflows and payment timing.',
      timestamp:
        'Generated from live cash-flow data',
      action:
        'Review Collections',
      source:
        'rule',
    })
  }

  if (
    data.risk ===
      'HIGH' ||
    data.risk ===
      'CRITICAL'
  ) {
    insights.push({
      type:
        'Shortfall risk',
      title:
        'Cash buffer is becoming tight',
      explanation:
        'The short-term projection indicates limited liquidity headroom.',
      evidence:
        `Lowest projected balance ${formatSignedINR(
          data.projectedLowestBalance,
        )}`,
      recommendation:
        'Accelerate inflows and review upcoming payments before adding new spending.',
      timestamp:
        'Generated from live cash-flow data',
      action:
        'View Banking',
      source:
        'rule',
    })
  }

  if (
    insights.length ===
    0
  ) {
    insights.push({
      type:
        'Liquidity health',
      title:
        'Cash position is currently stable',
      explanation:
        'The current balance and short-term projection remain positive under the observed cash-flow trend.',
      evidence:
        `Projected lowest balance ${formatINR(
          data.projectedLowestBalance,
        )}`,
      recommendation:
        'Maintain a healthy operating buffer and continue monitoring collections.',
      timestamp:
        'Generated from live cash-flow data',
      action:
        'Monitor Cash Flow',
      source:
        'rule',
    })
  }

  return insights.slice(
    0,
    3,
  )
}

// ============================================================
// AI RESPONSE NORMALIZATION
// ============================================================

function findAIObject(
  response: unknown,
): Record<
  string,
  unknown
> | null {
  if (
    isRecord(
      response,
    )
  ) {
    const possibleKeys = [
      'insight',
      'data',
      'result',
      'analysis',
      'response',
    ]

    for (
      const key of possibleKeys
    ) {
      const value =
        response[key]

      if (
        isRecord(
          value,
        )
      ) {
        return value
      }
    }

    return response
  }

  if (
    typeof response ===
    'string'
  ) {
    const parsed =
      parseJsonSafely(
        response,
      )

    if (
      isRecord(
        parsed,
      )
    ) {
      return findAIObject(
        parsed,
      )
    }
  }

  return null
}

// ============================================================
// AI API
// ============================================================

async function requestAIInsight(
  payload: Record<
    string,
    unknown
  >,
): Promise<AIInsight | null> {
  const controller =
    new AbortController()

  const timeout =
    window.setTimeout(
      () =>
        controller.abort(),
      AI_REQUEST_TIMEOUT_MS,
    )

  try {
    /*
     * We deliberately use apiFetch here so:
     * - JWT is attached automatically
     * - HttpOnly cookie is included
     * - JSON and plain-text responses are supported
     * - backend 502/503/504 can fall back safely
     */
    const response =
      await apiFetch<unknown>(
        '/api/ai/insight/cash-flow',
        {
          method:
            'POST',
          body: JSON.stringify(
            payload,
          ),
          signal:
            controller.signal,
        },
      )

    const data =
      findAIObject(
        response,
      )

    if (!data) {
      return null
    }

    const explanation =
      String(
        data.explanation ??
          data.body ??
          data.summary ??
          data.description ??
          data.insight_text ??
          '',
      ).trim()

    const recommendation =
      String(
        data.recommendation ??
          data.recommendations ??
          data.action_text ??
          data.next_action ??
          data.action ??
          '',
      ).trim()

    const title =
      String(
        data.title ??
          data.headline ??
          'Cash Flow Intelligence',
      ).trim()

    const evidence =
      String(
        data.evidence ??
          data.reason ??
          data.context ??
          'Generated from live business cash-flow data.',
      ).trim()

    if (
      !explanation &&
      !recommendation
    ) {
      return null
    }

    const source =
      String(
        data.source ??
          'ai',
      ).toLowerCase()

    return {
      type:
        String(
          data.type ??
            'AI Cash Flow Insight',
        ),

      title:
        title ||
        'Cash Flow Intelligence',

      explanation:
        explanation ||
        'CashGuard AI analysed the available live cash-flow information.',

      evidence:
        evidence ||
        'Generated from live business cash-flow data.',

      recommendation:
        recommendation ||
        'Continue monitoring collections, liquidity and upcoming cash obligations.',

      timestamp:
        new Date().toLocaleString(
          'en-IN',
          {
            dateStyle:
              'medium',
            timeStyle:
              'short',
            timeZone:
              'Asia/Kolkata',
          },
        ),

      action:
        String(
          data.action ??
            'Review Cash Flow',
        ),

      source:
        source ===
        'rule'
          ? 'rule'
          : 'ai',
    }
  } catch (
    error
  ) {
    /*
     * AI is an enhancement layer.
     * Cash Flow must stay usable if Ollama,
     * AI service, gateway, or network fails.
     */
    if (
      error instanceof
      DOMException &&
      error.name ===
        'AbortError'
    ) {
      return null
    }

    if (
      error instanceof
      ApiError
    ) {
      if (
        error.status ===
          502 ||
        error.status ===
          503 ||
        error.status ===
          504 ||
        error.status ===
          0
      ) {
        return null
      }
    }

    return null
  } finally {
    window.clearTimeout(
      timeout,
    )
  }
}

// ============================================================
// UI COMPONENTS
// ============================================================

function KpiCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string
  value: string
  sub: string
  tone: Tone
}) {
  return (
    <section className="cf-kpi">
      <div className="cf-kpi-top">
        <span>
          {label}
        </span>

        <i
          className={`cf-dot ${tone}`}
        />
      </div>

      <strong className="cf-money">
        {value}
      </strong>

      <small>
        {sub}
      </small>
    </section>
  )
}

function Badge({
  tone,
  children,
}: {
  tone: Tone
  children: ReactNode
}) {
  return (
    <span
      className={`cf-badge ${tone}`}
    >
      {children}
    </span>
  )
}

function Loading({
  text,
}: {
  text: string
}) {
  return (
    <div className="cf-state">
      <RefreshCw
        size={16}
        className="animate-spin"
      />

      <span>
        {text}
      </span>
    </div>
  )
}

// ============================================================
// PAGE
// ============================================================

export default function CashFlowPage() {
  const [
    range,
    setRange,
  ] =
    useState<RangeLabel>(
      '30 Days',
    )

  const [
    chartMode,
    setChartMode,
  ] =
    useState<ChartMode>(
      'position',
    )

  const [
    businessId,
    setBusinessId,
  ] =
    useState('')

  const [
    transactions,
    setTransactions,
  ] =
    useState<
      ApiBankTransaction[]
    >([])

  const [
    invoices,
    setInvoices,
  ] =
    useState<
      ApiInvoice[]
    >([])

  const [
    summary,
    setSummary,
  ] =
    useState<
      ApiBankingSummary | null
    >(null)

  const [
    mlForecast,
    setMLForecast,
  ] =
    useState<
      ApiMLCashFlowForecastResponse | null
    >(null)

  const [
    loadState,
    setLoadState,
  ] =
    useState<LoadState>(
      'loading',
    )

  const [
    error,
    setError,
  ] =
    useState<
      string | null
    >(null)

  const [
    refreshing,
    setRefreshing,
  ] =
    useState(false)

  const [
    aiLoading,
    setAiLoading,
  ] =
    useState(false)

  const [
    aiInsights,
    setAiInsights,
  ] =
    useState<
      AIInsight[]
    >([])

  const aiBusyRef =
    useRef(false)

  const aiAutoKeyRef =
    useRef<string | null>(null)

  const loadBusyRef =
    useRef(false)

  const initialLoadStartedRef =
    useRef(false)

  const rangeRequestRef =
    useRef(0)

  const loadRequestRef =
    useRef(0)

  const activeRangeRef =
    useRef<RangeLabel | null>(null)

  const transactionsHydratedRef =
    useRef(false)

  const invoicesHydratedRef =
    useRef(false)

  const invoiceLoadRequestRef =
    useRef(0)

  const [
    dataHydrated,
    setDataHydrated,
  ] =
    useState(false)

  // ==========================================================
  // LOAD DATA
  // ==========================================================

  const loadData =
    useCallback(
      async (
        refresh = false,
      ) => {
        if (
          loadBusyRef.current
        ) {
          return
        }

        const id =
          getBusinessId()

        if (!id) {
          setBusinessId('')
          setLoadState('error')
          setError(
            'Business ID is missing. Configure NEXT_PUBLIC_BUSINESS_ID in frontend/.env.local.',
          )
          return
        }

        loadBusyRef.current = true
        setBusinessId(id)
        setError(null)
        setDataHydrated(false)
        transactionsHydratedRef.current = false
        invoicesHydratedRef.current = false
        const invoiceRequestId =
          ++invoiceLoadRequestRef.current

        if (refresh) {
          setRefreshing(true)
        } else {
          setLoadState('loading')
        }

        const requestRange = range
        const requestId =
          ++loadRequestRef.current

        activeRangeRef.current =
          requestRange

        try {
          const [
            initialTransactions,
            initialInvoicePage,
            bankingSummary,
          ] =
            await Promise.all([
              fetchInitialTransactions(
                id,
              ),
              fetchInitialInvoices(
                id,
              ),
              fetchBankingSummary(
                id,
              ),
            ])

          if (
            requestId !==
            loadRequestRef.current
          ) {
            return
          }

          setTransactions(
            initialTransactions.filter(
              (
                row,
              ) =>
                isInRange(
                  row.transaction_date,
                  requestRange,
                ),
            ),
          )

          setInvoices(
            initialInvoicePage.batch,
          )

          setSummary(
            bankingSummary,
          )

          setLoadState(
            initialTransactions.some(
              (
                row,
              ) =>
                isInRange(
                  row.transaction_date,
                  requestRange,
                ),
            ) ||
              initialInvoicePage.batch.length >
                0
              ? 'ready'
              : 'empty',
          )

          // Render is now unblocked. Complete only the data needed
          // for the selected transaction range and receivable KPIs.
          void fetchTransactionsForRange(
            id,
            requestRange,
          ).then(
            (completeTransactions) => {
              if (
                requestId !==
                  loadRequestRef.current ||
                activeRangeRef.current !==
                  requestRange
              ) {
                return
              }

              setTransactions(
                completeTransactions,
              )
              transactionsHydratedRef.current =
                true
              setDataHydrated(
                invoicesHydratedRef.current,
              )
            },
          ).catch(
            (backgroundError) => {
              if (
                requestId ===
                  loadRequestRef.current &&
                activeRangeRef.current ===
                  requestRange
              ) {
                console.warn(
                  '[CashFlowPage] Background transaction range load failed.',
                  backgroundError,
                )
              }
              transactionsHydratedRef.current =
                false
            },
          )

          void fetchAllInvoices(
            id,
            initialInvoicePage,
          ).then(
            (completeInvoices) => {
              if (
                invoiceRequestId !==
                  invoiceLoadRequestRef.current
              ) {
                return
              }

              setInvoices(
                completeInvoices,
              )
              invoicesHydratedRef.current =
                true
              setDataHydrated(
                transactionsHydratedRef.current,
              )
            },
          ).catch(
            (backgroundError) => {
              console.warn(
                '[CashFlowPage] Background invoice load failed.',
                backgroundError,
              )
            },
          )

          // ML forecast stays fully non-blocking.
          void fetchMLCashFlowForecast(
            id,
            30,
          ).then(
            (
              machineLearningForecast,
            ) => {
              if (
                requestId ===
                loadRequestRef.current
              ) {
                setMLForecast(
                  machineLearningForecast,
                )
              }
            },
          )
        } catch (
          requestError
        ) {
          console.error(
            '[CashFlowPage]',
            requestError,
          )

          const status =
            requestError instanceof
            ApiError
              ? requestError.status
              : 0

          if (
            status === 401
          ) {
            setError(
              'Authentication required. Please login again so CashGuard can send your JWT token to the backend.',
            )
          } else if (
            status === 403
          ) {
            setError(
              'You are not authorized to access this business cash-flow data.',
            )
          } else if (
            status === 0
          ) {
            setError(
              'Unable to connect to the backend. Make sure the FastAPI server is running.',
            )
          } else {
            setError(
              requestError instanceof
                Error
                ? requestError.message
                : 'Unable to load live cash-flow data.',
            )
          }

          setLoadState(
            'error',
          )
        } finally {
          loadBusyRef.current =
            false
          setRefreshing(false)
        }
      },
      [
        range,
      ],
    )

  // ==========================================================
  // INITIAL LOAD
  // ==========================================================

  useEffect(() => {
    if (
      initialLoadStartedRef.current
    ) {
      return
    }

    initialLoadStartedRef.current = true
    void loadData()
  }, [
    loadData,
  ])

  // ==========================================================
  // AUTH EVENTS
  // ==========================================================

  useEffect(() => {
    const onAuthChanged =
      () => {
        void loadData(
          true,
        )
      }

    const onAuthExpired =
      () => {
        setError(
          'Your authentication session is missing or expired. Please login again.',
        )
      }

    window.addEventListener(
      'auth-changed',
      onAuthChanged,
    )

    window.addEventListener(
      'cashguard-auth-expired',
      onAuthExpired,
    )

    return () => {
      window.removeEventListener(
        'auth-changed',
        onAuthChanged,
      )

      window.removeEventListener(
        'cashguard-auth-expired',
        onAuthExpired,
      )
    }
  }, [
    loadData,
  ])

  useEffect(() => {
    if (
      !businessId ||
      loadState !== 'ready' ||
      activeRangeRef.current === range
    ) {
      return
    }

    let cancelled = false

    ++loadRequestRef.current

    const requestId =
      ++rangeRequestRef.current

    activeRangeRef.current = range
    transactionsHydratedRef.current = false
    setDataHydrated(false)

    void fetchTransactionsForRange(
      businessId,
      range,
    ).then(
      (rangeTransactions) => {
        if (
          cancelled ||
          requestId !==
            rangeRequestRef.current
        ) {
          return
        }

        setTransactions(
          rangeTransactions,
        )
        transactionsHydratedRef.current =
          true
        setDataHydrated(
          invoicesHydratedRef.current,
        )
      },
    ).catch(
      (rangeError) => {
        if (
          !cancelled &&
          requestId ===
            rangeRequestRef.current
        ) {
          console.warn(
            '[CashFlowPage] Range transaction refresh failed.',
            rangeError,
          )
          transactionsHydratedRef.current = false
          setDataHydrated(false)
        }
      },
    )

    return () => {
      cancelled = true
    }
  }, [
    businessId,
    loadState,
    range,
  ])

  // ==========================================================
  // METRICS
  // ==========================================================

  const totals =
    useMemo(
      () =>
        calculateTotals(
          transactions,
          range,
        ),
      [
        transactions,
        range,
      ],
    )

  const currentBalance =
    summary !== null &&
    summary.balance !==
      undefined &&
    summary.balance !==
      null
      ? toNumber(
          summary.balance,
        )
      : latestBalance(
          transactions,
        )

  const receivableData =
    useMemo(
      () =>
        calculateReceivables(
          invoices,
        ),
      [
        invoices,
      ],
    )

  const legacyForecast =
    useMemo(
      () =>
        calculateForecast(
          currentBalance,
          transactions,
          invoices,
        ),
      [
        currentBalance,
        transactions,
        invoices,
      ],
    )

  const mlForecastSummary =
    useMemo(
      () =>
        mlForecast?.forecast
          ?.length
          ? calculateMLForecastSummary(
              mlForecast.forecast,
              currentBalance,
            )
          : null,
      [
        mlForecast,
        currentBalance,
      ],
    )

  const forecast =
    useMemo<ForecastResult>(
      () =>
        mlForecastSummary
          ? {
              /*
               * The existing ML model predicts
               * net cash flow only.
               * We intentionally do not fabricate
               * separate inflow/outflow values.
               */
              projectedInflow: 0,

              projectedOutflow: 0,

              projectedNet:
                mlForecastSummary.totalNet,

              projectedLowestBalance:
                mlForecastSummary.lowestBalance,
            }
          : legacyForecast,
      [
        legacyForecast,
        mlForecastSummary,
      ],
    )

  const risk =
    riskLevel(
      currentBalance,
      forecast.projectedLowestBalance,
    )

  const score =
    healthScore(
      currentBalance,
      forecast.projectedOutflow,
      forecast.projectedLowestBalance,
      receivableData.total,
    )

  const workingCapital =
    currentBalance +
    receivableData.total

  const riskTone:
    Tone =
    risk ===
    'LOW'
      ? 'green'
      : risk ===
          'MEDIUM'
        ? 'amber'
        : 'red'

  // ==========================================================
  // CHART DATA
  // ==========================================================

  const positionData =
    useMemo(
      () =>
        buildPositionData(
          transactions,
          range,
        ),
      [
        transactions,
        range,
      ],
    )

  const flowData =
    useMemo(
      () =>
        buildFlowData(
          transactions,
          range,
        ),
      [
        transactions,
        range,
      ],
    )

  // ==========================================================
  // UPCOMING COLLECTIONS
  // ==========================================================

  const upcomingCollections =
    useMemo(
      () =>
        invoices
          .filter(
            (
              invoice,
            ) => {
              const outstanding =
                Math.max(
                  0,
                  toNumber(
                    invoice.total_amount,
                  ) -
                    toNumber(
                      invoice.amount_paid,
                    ),
                )

              const due =
                daysUntil(
                  invoice.due_date,
                )

              return (
                outstanding >
                  0 &&
                due !== null &&
                due >= 0 &&
                due <= 14
              )
            },
          )
          .sort(
            (
              a,
              b,
            ) =>
              (
                daysUntil(
                  a.due_date,
                ) ??
                999
              ) -
              (
                daysUntil(
                  b.due_date,
                ) ??
                999
              ),
          )
          .slice(
            0,
            8,
          ),
      [
        invoices,
      ],
    )

  // ==========================================================
  // AI
  // ==========================================================

  const refreshAI =
    useCallback(
      async () => {
        if (
          !businessId ||
          aiBusyRef.current
        ) {
          return
        }

        aiBusyRef.current =
          true

        setAiLoading(true)

        const fallback =
          buildFallbackInsights(
            {
              overdue:
                receivableData.overdue,

              dueSoon:
                receivableData.dueSoon,

              projectedNet:
                forecast.projectedNet,

              projectedLowestBalance:
                forecast.projectedLowestBalance,

              risk,
            },
          )

        setAiInsights(
          fallback,
        )

        try {
          const ai =
            await requestAIInsight(
              {
                business_id:
                  businessId,

                planning_horizon_days:
                  14,

                current_cash:
                  currentBalance,

                money_in:
                  totals.moneyIn,

                money_out:
                  totals.moneyOut,

                net_cash_flow:
                  totals.net,

                receivables:
                  receivableData.total,

                overdue_receivables:
                  receivableData.overdue,

                due_soon_collections:
                  receivableData.dueSoon,

                projected_inflow:
                  toNumber(
                    forecast.projectedInflow,
                  ),

                projected_outflow:
                  toNumber(
                    forecast.projectedOutflow,
                  ),

                projected_net:
                  toNumber(
                    forecast.projectedNet,
                  ),

                projected_lowest_balance:
                  toNumber(
                    forecast.projectedLowestBalance,
                  ),

                shortfall_risk:
                  risk,

                health_score:
                  score,
              },
            )

          if (ai) {
            setAiInsights([
              ai,
              ...fallback.slice(
                0,
                2,
              ),
            ])
          } else {
            setAiInsights(
              fallback,
            )
          }
        } finally {
          aiBusyRef.current =
            false

          setAiLoading(false)
        }
      },
      [
        businessId,
        currentBalance,
        forecast.projectedInflow,
        forecast.projectedLowestBalance,
        forecast.projectedNet,
        forecast.projectedOutflow,
        receivableData.dueSoon,
        receivableData.overdue,
        receivableData.total,
        risk,
        score,
        totals.moneyIn,
        totals.moneyOut,
        totals.net,
      ],
    )

  const aiAutoKey =
    useMemo(
      () =>
        JSON.stringify([
          businessId,
          range,
          currentBalance,
          totals.moneyIn,
          totals.moneyOut,
          totals.net,
          receivableData.total,
          receivableData.overdue,
          receivableData.dueSoon,
          risk,
          score,
        ]),
      [
        businessId,
        range,
        currentBalance,
        totals.moneyIn,
        totals.moneyOut,
        totals.net,
        receivableData.total,
        receivableData.overdue,
        receivableData.dueSoon,
        risk,
        score,
      ],
    )

  useEffect(() => {
    if (
      loadState !== 'ready' ||
      !businessId ||
      !dataHydrated
    ) {
      return
    }

    if (
      aiAutoKeyRef.current ===
      aiAutoKey
    ) {
      return
    }

    aiAutoKeyRef.current =
      aiAutoKey

    void refreshAI()
  }, [
    loadState,
    businessId,
    dataHydrated,
    aiAutoKey,
    refreshAI,
  ])

  // ==========================================================
  // RENDER
  // ==========================================================

  return (
    <>
      <main className="foundation-content cf-page">

        {/* HEADER */}

        <header className="cf-header">
          <div>
            <p className="auth-eyebrow">
              CASH FLOW · LIVE MSME MONITORING
            </p>

            <h2>
              Cash Flow
            </h2>

            <p>
              Monitor live cash movement,
              receivables, liquidity risk
              and short-term projections.
            </p>
          </div>

          <div className="cf-header-actions">
            <button
              type="button"
              className="cf-business"
              title={
                businessId ||
                'Business ID'
              }
            >
              <Building2
                size={15}
              />

              <span>
                <b>
                  Selected Business
                </b>

                <small>
                  {businessId ||
                    'Not configured'}
                </small>
              </span>

              <ChevronDown
                size={15}
              />
            </button>

            <button
              type="button"
              className="secondary-button"
              disabled={
                refreshing
              }
              onClick={() =>
                void loadData(
                  true,
                )
              }
            >
              <RefreshCw
                size={14}
                className={
                  refreshing
                    ? 'animate-spin'
                    : ''
                }
              />

              {refreshing
                ? 'Refreshing...'
                : 'Refresh'}
            </button>
          </div>
        </header>

        {/* ERROR */}

        {error && (
          <div
            className="operations-success cf-error"
            role="alert"
          >
            <AlertCircle
              size={16}
            />

            <span>
              {error}
            </span>

            <button
              type="button"
              onClick={() =>
                void loadData(
                  true,
                )
              }
            >
              Retry
            </button>
          </div>
        )}

        {/* RANGE */}

        <div
          className="cf-range"
          role="tablist"
        >
          {(
            [
              '7 Days',
              '30 Days',
              '90 Days',
            ] as RangeLabel[]
          ).map(
            (
              item,
            ) => (
              <button
                type="button"
                key={item}
                role="tab"
                aria-selected={
                  range ===
                  item
                }
                className={
                  range ===
                  item
                    ? 'active'
                    : ''
                }
                onClick={() =>
                  setRange(
                    item,
                  )
                }
              >
                {item}
              </button>
            ),
          )}
        </div>

        {/* KPI */}

        <div className="cf-kpi-grid">
          <KpiCard
            label="Cash in Bank"
            value={
              loadState ===
              'loading'
                ? 'Loading...'
                : formatINR(
                    currentBalance,
                  )
            }
            sub="Latest live running balance"
            tone="green"
          />

          <KpiCard
            label="Money In"
            value={
              loadState ===
              'loading'
                ? 'Loading...'
                : formatINR(
                    totals.moneyIn,
                  )
            }
            sub={`Actual credits · ${range}`}
            tone="green"
          />

          <KpiCard
            label="Money Out"
            value={
              loadState ===
              'loading'
                ? 'Loading...'
                : formatINR(
                    totals.moneyOut,
                  )
            }
            sub={`Actual debits · ${range}`}
            tone="blue"
          />

          <KpiCard
            label="Net Cash Flow"
            value={
              loadState ===
              'loading'
                ? 'Loading...'
                : formatSignedINR(
                    totals.net,
                  )
            }
            sub={`Money in − money out · ${range}`}
            tone={
              totals.net <
              0
                ? 'red'
                : 'green'
            }
          />

          <KpiCard
            label="Receivables"
            value={
              loadState ===
              'loading'
                ? 'Loading...'
                : formatINR(
                    receivableData.total,
                  )
            }
            sub="Outstanding customer invoices"
            tone="blue"
          />

          <KpiCard
            label="Shortfall Risk"
            value={
              loadState ===
              'loading'
                ? 'Loading...'
                : risk
            }
            sub="14-day projected liquidity"
            tone={
              riskTone
            }
          />
        </div>

        {/* MAIN GRID */}

        <div className="cf-main-grid">

          <section className="foundation-card cf-card">
            <div className="cf-section-head">
              <div>
                <p className="auth-eyebrow">
                  CASH POSITION
                </p>

                <h3>
                  Live Cash Position
                </h3>

                <p>
                  Historical balance and
                  cash-movement analysis from
                  live transactions.
                </p>
              </div>

              <div className="cf-chart-tabs">
                <button
                  type="button"
                  className={
                    chartMode ===
                    'position'
                      ? 'active'
                      : ''
                  }
                  onClick={() =>
                    setChartMode(
                      'position',
                    )
                  }
                >
                  Position
                </button>

                <button
                  type="button"
                  className={
                    chartMode ===
                    'flow'
                      ? 'active'
                      : ''
                  }
                  onClick={() =>
                    setChartMode(
                      'flow',
                    )
                  }
                >
                  Inflow / Outflow
                </button>
              </div>
            </div>

            {loadState ===
            'loading' ? (
              <Loading
                text="Loading live cash-flow data..."
              />
            ) : chartMode ===
              'position' ? (
              positionData.length >
              0 ? (
                <div className="cf-chart">
                  <ResponsiveContainer
                    width="100%"
                    height={310}
                  >
                    <AreaChart
                      data={
                        positionData
                      }
                    >
                      <defs>
                        <linearGradient
                          id="cfGradient"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="0%"
                            stopColor="#0ea5e9"
                            stopOpacity={
                              0.2
                            }
                          />

                          <stop
                            offset="100%"
                            stopColor="#0ea5e9"
                            stopOpacity={
                              0
                            }
                          />
                        </linearGradient>
                      </defs>

                      <CartesianGrid
                        stroke="#e2e8f0"
                        strokeDasharray="4 4"
                        vertical={
                          false
                        }
                      />

                      <XAxis
                        dataKey="date"
                        tick={{
                          fontSize: 10,
                          fill: '#94a3b8',
                        }}
                        axisLine={
                          false
                        }
                        tickLine={
                          false
                        }
                      />

                      <YAxis
                        width={58}
                        tick={{
                          fontSize: 10,
                          fill: '#94a3b8',
                        }}
                        tickFormatter={(
                          value: number,
                        ) =>
                          `₹${Math.round(
                            Number(
                              value,
                            ) /
                              1000,
                          )}k`
                        }
                        axisLine={
                          false
                        }
                        tickLine={
                          false
                        }
                      />

                      <Tooltip
                        formatter={(
                          value:
                            number |
                            string |
                            undefined,
                        ) => [
                          formatINR(
                            Number(
                              value ??
                                0,
                            ),
                          ),
                          'Cash Balance',
                        ]}
                        contentStyle={{
                          border:
                            '1px solid #e2e8f0',
                          borderRadius:
                            8,
                          fontSize: 11,
                        }}
                      />

                      <Area
                        type="monotone"
                        dataKey="actual"
                        stroke="#0ea5e9"
                        strokeWidth={3}
                        fill="url(#cfGradient)"
                        fillOpacity={1}
                        connectNulls
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="cf-state">
                  <Wallet
                    size={16}
                  />

                  <span>
                    No transaction history
                    available for this period.
                  </span>
                </div>
              )
            ) : flowData.length >
              0 ? (
              <div className="cf-chart">
                <ResponsiveContainer
                  width="100%"
                  height={310}
                >
                  <BarChart
                    data={
                      flowData
                    }
                    margin={{
                      top: 10,
                      right: 10,
                      left: 0,
                      bottom: 25,
                    }}
                  >
                    <CartesianGrid
                      stroke="#e2e8f0"
                      strokeDasharray="4 4"
                      vertical={
                        false
                      }
                    />

                    <XAxis
                      dataKey="name"
                      tick={{
                        fontSize: 9,
                        fill: '#64748b',
                      }}
                      angle={-22}
                      textAnchor="end"
                      height={55}
                      axisLine={
                        false
                      }
                      tickLine={
                        false
                      }
                    />

                    <YAxis
                      width={58}
                      tick={{
                        fontSize: 10,
                        fill: '#94a3b8',
                      }}
                      tickFormatter={(
                        value: number,
                      ) =>
                        `₹${Math.round(
                          Number(
                            value,
                          ) /
                            1000,
                        )}k`
                      }
                      axisLine={
                        false
                      }
                      tickLine={
                        false
                      }
                    />

                    <Tooltip
                      formatter={(
                        value:
                          number |
                          string |
                          undefined,
                        name:
                          string |
                          undefined,
                      ) => [
                        formatINR(
                          Number(
                            value ??
                              0,
                          ),
                        ),
                        name ===
                        'inflow'
                          ? 'Inflow'
                          : 'Outflow',
                      ]}
                      contentStyle={{
                        border:
                          '1px solid #e2e8f0',
                        borderRadius:
                          8,
                        fontSize: 11,
                      }}
                    />

                    <Bar
                      dataKey="inflow"
                      fill="#22c55e"
                      radius={[
                        4,
                        4,
                        0,
                        0,
                      ]}
                    />

                    <Bar
                      dataKey="outflow"
                      fill="#f59e0b"
                      radius={[
                        4,
                        4,
                        0,
                        0,
                      ]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="cf-state">
                No inflow/outflow data available.
              </div>
            )}

            <div className="cf-legend">
              <span>
                <i className="cf-key sky" />
                Cash position
              </span>

              <span>
                <i className="cf-key green" />
                Inflow
              </span>

              <span>
                <i className="cf-key amber" />
                Outflow
              </span>
            </div>
          </section>

          {/* WATCH */}

          <aside className="foundation-card cf-watch">
            <div className="cf-watch-icon">
              <CircleAlert
                size={18}
              />
            </div>

            <p className="auth-eyebrow">
              CASHGUARD WATCH
            </p>

            <h3>
              {risk ===
              'LOW'
                ? 'Liquidity is currently stable'
                : 'Cash pressure requires monitoring'}
            </h3>

            <p>
              The 14-day projection gives
              a lowest expected balance of{' '}
              <strong>
                {formatSignedINR(
                  forecast.projectedLowestBalance,
                )}
              </strong>
              .
            </p>

            <div className="cf-watch-stats">
              <div>
                <span>
                  Current Cash
                </span>

                <strong>
                  {formatINR(
                    currentBalance,
                  )}
                </strong>
              </div>

              <div>
                <span>
                  Due Soon
                </span>

                <strong>
                  {formatINR(
                    receivableData.dueSoon,
                  )}
                </strong>
              </div>

              <div>
                <span>
                  Overdue
                </span>

                <strong>
                  {formatINR(
                    receivableData.overdue,
                  )}
                </strong>
              </div>
            </div>

            <b className="cf-recommended">
              Recommended Action
            </b>

            <p>
              {receivableData.overdue >
              0
                ? `Prioritise ${formatINR(
                    receivableData.overdue,
                  )} of overdue receivables.`
                : forecast.projectedNet <
                    0
                  ? 'Review upcoming outflows and accelerate expected collections.'
                  : 'Maintain the existing operating cash buffer.'}
            </p>

            <div className="cf-actions">
              <Link href="/invoices">
                Review Collections
                <ArrowUpRight
                  size={13}
                />
              </Link>

              <Link href="/dashboard/banking">
                Review Banking
                <ArrowUpRight
                  size={13}
                />
              </Link>
            </div>
          </aside>
        </div>

        {/* MOVEMENT + FORECAST */}

        <div className="cf-main-grid cf-lower-grid">

          <section className="foundation-card cf-card">
            <div className="cf-section-head">
              <div>
                <h3>
                  Cash Flow Movement
                </h3>

                <p>
                  Actual money movement for{' '}
                  {range}.
                </p>
              </div>
            </div>

            <div className="cf-total-row">
              <div>
                <span>
                  Money In
                </span>

                <strong className="cf-positive">
                  {formatINR(
                    totals.moneyIn,
                  )}
                </strong>
              </div>

              <div>
                <span>
                  Money Out
                </span>

                <strong>
                  {formatINR(
                    totals.moneyOut,
                  )}
                </strong>
              </div>

              <div>
                <span>
                  Net
                </span>

                <strong
                  className={
                    totals.net <
                    0
                      ? 'cf-negative'
                      : 'cf-positive'
                  }
                >
                  {formatSignedINR(
                    totals.net,
                  )}
                </strong>
              </div>
            </div>

            <div className="cf-breakdown">
              {flowData.length >
              0 ? (
                flowData.map(
                  (
                    item,
                  ) => {
                    const net =
                      item.inflow -
                      item.outflow

                    return (
                      <div
                        key={
                          item.name
                        }
                      >
                        <div className="cf-breakdown-name">
                          <strong>
                            {
                              item.name
                            }
                          </strong>

                          <small>
                            Category movement
                          </small>
                        </div>

                        <div>
                          <span>
                            Inflow
                          </span>

                          <strong className="cf-positive">
                            {formatINR(
                              item.inflow,
                            )}
                          </strong>
                        </div>

                        <div>
                          <span>
                            Outflow
                          </span>

                          <strong className="cf-negative">
                            {formatINR(
                              item.outflow,
                            )}
                          </strong>
                        </div>

                        <div>
                          <span>
                            Net
                          </span>

                          <strong
                            className={
                              net <
                              0
                                ? 'cf-negative'
                                : 'cf-positive'
                            }
                          >
                            {formatSignedINR(
                              net,
                            )}
                          </strong>
                        </div>
                      </div>
                    )
                  },
                )
              ) : (
                <div className="cf-state">
                  No category movement available.
                </div>
              )}
            </div>
          </section>

          <section className="foundation-card cf-card cf-forecast">
            <div className="cf-section-head">
              <div>
                <p className="auth-eyebrow">
                  PLANNING VIEW
                </p>

                <h3>
                  14-Day Cash Flow Forecast
                </h3>

                <p>
                  Based on recent transaction
                  behaviour and near-term
                  invoice collections.
                </p>
              </div>
            </div>

            <div className="cf-forecast-points">
              <div>
                <span>
                  Today
                </span>

                <strong>
                  {formatINR(
                    currentBalance,
                  )}
                </strong>

                <Badge tone="green">
                  Current
                </Badge>
              </div>

              <div>
                <span>
                  +7 Days
                </span>

                <strong>
                  {formatSignedINR(
                    currentBalance +
                      forecast.projectedNet /
                        2,
                  )}
                </strong>

                <Badge
                  tone={
                    forecast.projectedNet <
                    0
                      ? 'amber'
                      : 'green'
                  }
                >
                  Projected
                </Badge>
              </div>

              <div>
                <span>
                  +14 Days
                </span>

                <strong>
                  {formatSignedINR(
                    forecast.projectedLowestBalance,
                  )}
                </strong>

                <Badge
                  tone={
                    riskTone
                  }
                >
                  {risk}
                </Badge>
              </div>
            </div>

            {mlForecast?.forecast
              ?.length ? (
              <div
                className="cf-ml-forecast"
                aria-label="Machine learning cash flow forecast"
              >
                <div className="cf-ml-head">
                  <div>
                    <span>
                      ML FORECAST
                    </span>

                    <strong>
                      {mlForecast.model ||
                        'Existing Cash Flow ML Model'}
                    </strong>
                  </div>

                  <Badge tone="blue">
                    {mlForecast.model ||
                      'ML'}
                  </Badge>
                </div>

                <div className="cf-ml-scroll">
                  {mlForecast.forecast
                    .slice(
                      0,
                      14,
                    )
                    .map(
                      (
                        row,
                      ) => (
                        <div
                          key={`${row.forecast_date}-${row.predicted_net_cash_flow ?? 0}`}
                          className="cf-ml-row"
                        >
                          <span>
                            {formatDate(
                              row.forecast_date,
                            )}
                          </span>

                          <strong
                            className={
                              toNumber(
                                row.predicted_net_cash_flow,
                              ) <
                              0
                                ? 'cf-negative'
                                : 'cf-positive'
                            }
                          >
                            {formatSignedINR(
                              toNumber(
                                row.predicted_net_cash_flow,
                              ),
                            )}
                          </strong>

                          <small>
                            Predicted net cash flow
                          </small>
                        </div>
                      ),
                    )}
                </div>

                <p className="cf-ml-note">
                  The existing trained model predicts
                  <strong>
                    {' '}
                    net cash flow{' '}
                  </strong>
                  only. Inflow and outflow are not fabricated.
                </p>
              </div>
            ) : null}

            <div className="cf-forecast-summary">
              <div>
                <small>
                  {mlForecastSummary
                    ? 'ML Inflow'
                    : 'Projected Inflow'}
                </small>

                <strong>
                  {mlForecastSummary
                    ? 'Model predicts net only'
                    : formatINR(
                        forecast.projectedInflow,
                      )}
                </strong>
              </div>

              <div>
                <small>
                  {mlForecastSummary
                    ? 'ML Outflow'
                    : 'Projected Outflow'}
                </small>

                <strong>
                  {mlForecastSummary
                    ? 'Model predicts net only'
                    : formatINR(
                        forecast.projectedOutflow,
                      )}
                </strong>
              </div>

              <div>
                <small>
                  Projected Net
                </small>

                <strong
                  className={
                    forecast.projectedNet <
                    0
                      ? 'cf-negative'
                      : 'cf-positive'
                  }
                >
                  {formatSignedINR(
                    forecast.projectedNet,
                  )}
                </strong>
              </div>
            </div>
          </section>
        </div>

        {/* COLLECTIONS */}

        <section className="foundation-card cf-table-panel">
          <div className="cf-section-head">
            <div>
              <p className="auth-eyebrow">
                EXPECTED INFLOWS
              </p>

              <h3>
                Customer Collections Due Soon
              </h3>

              <p>
                Live outstanding invoices
                due within the next 14 days.
              </p>
            </div>

            <Link
              href="/invoices"
              className="secondary-button"
            >
              View Receivables
              <ArrowUpRight
                size={13}
              />
            </Link>
          </div>

          {upcomingCollections.length >
          0 ? (
            <div className="cf-table-wrap">
              <table className="cf-table">
                <thead>
                  <tr>
                    <th>
                      Invoice
                    </th>

                    <th>
                      Due Date
                    </th>

                    <th>
                      Outstanding
                    </th>

                    <th>
                      Customer
                    </th>

                    <th>
                      Status
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {upcomingCollections.map(
                    (
                      invoice,
                    ) => {
                      const outstanding =
                        Math.max(
                          0,
                          toNumber(
                            invoice.total_amount,
                          ) -
                            toNumber(
                              invoice.amount_paid,
                            ),
                        )

                      const due =
                        daysUntil(
                          invoice.due_date,
                        ) ??
                        0

                      return (
                        <tr
                          key={
                            invoice.id
                          }
                        >
                          <td>
                            <strong>
                              {invoice.invoice_number ||
                                invoice.id}
                            </strong>

                            <small>
                              {
                                invoice.id
                              }
                            </small>
                          </td>

                          <td>
                            {formatDate(
                              invoice.due_date,
                            )}
                          </td>

                          <td className="cf-table-money">
                            {formatINR(
                              outstanding,
                            )}
                          </td>

                          <td>
                            <span className="cf-customer">
                              {invoice.customer_id ||
                                'Customer'}
                            </span>
                          </td>

                          <td>
                            <Badge
                              tone={
                                due <=
                                3
                                  ? 'red'
                                  : due <=
                                      7
                                    ? 'amber'
                                    : 'green'
                              }
                            >
                              {due ===
                              0
                                ? 'Due today'
                                : `Due in ${due}d`}
                            </Badge>
                          </td>
                        </tr>
                      )
                    },
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="cf-state">
              <CalendarDays
                size={16}
              />

              <span>
                No outstanding invoices are
                due within the next 14 days.
              </span>
            </div>
          )}
        </section>

        {/* WORKING CAPITAL + HEALTH */}

        <div className="cf-bottom-grid">
          <section className="foundation-card cf-card">
            <div className="cf-section-head">
              <div>
                <h3>
                  Working Capital Snapshot
                </h3>

                <p>
                  Cash plus outstanding
                  receivables monitoring view.
                </p>
              </div>
            </div>

            <div className="cf-working-grid">
              <KpiCard
                label="Cash"
                value={formatINR(
                  currentBalance,
                )}
                sub="Available bank cash"
                tone="green"
              />

              <KpiCard
                label="Receivables"
                value={formatINR(
                  receivableData.total,
                )}
                sub="Outstanding invoices"
                tone="blue"
              />

              <KpiCard
                label="Overdue"
                value={formatINR(
                  receivableData.overdue,
                )}
                sub="Past-due receivables"
                tone={
                  receivableData.overdue >
                  0
                    ? 'amber'
                    : 'green'
                }
              />

              <KpiCard
                label="Working Capital"
                value={formatINR(
                  workingCapital,
                )}
                sub="Cash + receivables"
                tone="green"
              />
            </div>

            <p className="cf-note">
              Monitoring indicator only;
              this is not a complete
              accounting working-capital
              calculation.
            </p>
          </section>

          <section className="foundation-card cf-card">
            <div className="cf-section-head">
              <div>
                <p className="auth-eyebrow">
                  HEALTH MONITOR
                </p>

                <h3>
                  Cash Flow Health
                </h3>
              </div>

              <div className="cf-health-score">
                <strong>
                  {score}
                </strong>

                <span>
                  /100
                </span>
              </div>
            </div>

            <div className="cf-health-row">
              <div>
                <span>
                  Cash availability
                </span>

                <b>
                  {score}
                </b>
              </div>

              <div>
                <i
                  style={{
                    width: `${score}%`,
                  }}
                />
              </div>
            </div>

            <div className="cf-health-row">
              <div>
                <span>
                  Collection support
                </span>

                <b>
                  {receivableData.total >
                  0
                    ? 70
                    : 40}
                </b>
              </div>

              <div>
                <i
                  style={{
                    width: `${
                      receivableData.total >
                      0
                        ? 70
                        : 40
                    }%`,
                  }}
                />
              </div>
            </div>

            <div className="cf-health-row">
              <div>
                <span>
                  Liquidity buffer
                </span>

                <b>
                  {risk ===
                  'LOW'
                    ? 90
                    : risk ===
                        'MEDIUM'
                      ? 60
                      : risk ===
                          'HIGH'
                        ? 35
                        : 15}
                </b>
              </div>

              <div>
                <i
                  style={{
                    width: `${
                      risk ===
                      'LOW'
                        ? 90
                        : risk ===
                            'MEDIUM'
                          ? 60
                          : risk ===
                              'HIGH'
                            ? 35
                            : 15
                    }%`,
                  }}
                />
              </div>
            </div>
          </section>
        </div>

        {/* RECENT ACTIVITY */}

        <section className="foundation-card cf-table-panel">
          <div className="cf-section-head">
            <div>
              <p className="auth-eyebrow">
                LIVE ACTIVITY
              </p>

              <h3>
                Recent Cash Flow Impact
              </h3>

              <p>
                Latest transactions in the
                selected period.
              </p>
            </div>

            <Link
              href="/dashboard/banking"
              className="secondary-button"
            >
              View Banking
              <ArrowUpRight
                size={13}
              />
            </Link>
          </div>

          {totals.rows.length >
          0 ? (
            <div className="cf-impact-list">
              {totals.rows
                .slice()
                .sort(
                  (
                    a,
                    b,
                  ) => {
                    const aTime =
                      a.transaction_date
                        ? new Date(
                            a.transaction_date,
                          ).getTime()
                        : 0

                    const bTime =
                      b.transaction_date
                        ? new Date(
                            b.transaction_date,
                          ).getTime()
                        : 0

                    return (
                      bTime -
                      aTime
                    )
                  },
                )
                .slice(
                  0,
                  8,
                )
                .map(
                  (
                    transaction,
                  ) => {
                    const type =
                      normalizeType(
                        transaction.transaction_type,
                      )

                    const amount =
                      Math.abs(
                        toNumber(
                          transaction.amount,
                        ),
                      )

                    return (
                      <div
                        key={
                          transaction.id
                        }
                      >
                        <div className="cf-impact-title">
                          <span
                            className={`cf-impact-icon ${
                              type ===
                              'Credit'
                                ? 'credit'
                                : 'debit'
                            }`}
                          >
                            {type ===
                            'Credit' ? (
                              <ArrowDownRight
                                size={
                                  13
                                }
                              />
                            ) : (
                              <ArrowUpRight
                                size={
                                  13
                                }
                              />
                            )}
                          </span>

                          <span>
                            <strong>
                              {transaction.description ||
                                'Bank transaction'}
                            </strong>

                            <small>
                              {transaction.category ||
                                'Uncategorized'}
                            </small>
                          </span>
                        </div>

                        <strong
                          className={
                            type ===
                            'Credit'
                              ? 'cf-positive'
                              : 'cf-negative'
                          }
                        >
                          {type ===
                          'Credit'
                            ? '+'
                            : '-'}
                          {formatINR(
                            amount,
                          )}
                        </strong>

                        <small className="cf-impact-date">
                          {formatDate(
                            transaction.transaction_date,
                          )}
                        </small>
                      </div>
                    )
                  },
                )}
            </div>
          ) : (
            <div className="cf-state">
              No recent transactions.
            </div>
          )}
        </section>

        {/* AI */}

        <section className="cf-ai">
          <div className="cf-section-head">
            <div>
              <p className="auth-eyebrow">
                CASHGUARD AI
              </p>

              <h3>
                Cash Flow Intelligence
              </h3>

              <p>
                AI-backed insights and actionable
                cash-flow recommendations.
              </p>
            </div>

            <button
              type="button"
              className="secondary-button"
              disabled={
                aiLoading ||
                loadState !==
                  'ready'
              }
              onClick={() =>
                void refreshAI()
              }
            >
              <Sparkles
                size={14}
                className={
                  aiLoading
                    ? 'animate-spin'
                    : ''
                }
              />

              {aiLoading
                ? 'Analysing...'
                : 'Refresh AI'}
            </button>
          </div>

          {aiLoading ? (
            <Loading
              text="CashGuard AI is analysing live cash-flow data..."
            />
          ) : aiInsights.length >
            0 ? (
            <div className="cf-ai-grid">
              {aiInsights.map(
                (
                  insight,
                  index,
                ) => (
                  <article
                    className="cf-insight"
                    key={`${insight.title}-${index}`}
                  >
                    <span className="cf-insight-label">
                      <Sparkles
                        size={
                          13
                        }
                      />

                      {insight.source ===
                      'ai'
                        ? 'AI Insight'
                        : 'CashGuard Monitor'}
                    </span>

                    <h4>
                      {
                        insight.title
                      }
                    </h4>

                    <p>
                      {
                        insight.explanation
                      }
                    </p>

                    <div className="cf-insight-block">
                      <small>
                        Evidence
                      </small>

                      <strong>
                        {
                          insight.evidence
                        }
                      </strong>
                    </div>

                    <div className="cf-insight-block">
                      <small>
                        Recommendation
                      </small>

                      <span>
                        {
                          insight.recommendation
                        }
                      </span>
                    </div>

                    <footer>
                      <small>
                        {
                          insight.timestamp
                        }
                      </small>

                      <Link
                        href={
                          insight.action
                            .toLowerCase()
                            .includes(
                              'invoice',
                            ) ||
                          insight.action
                            .toLowerCase()
                            .includes(
                              'collection',
                            )
                            ? '/invoices'
                            : '/dashboard/banking'
                        }
                      >
                        {
                          insight.action
                        }

                        <ArrowUpRight
                          size={
                            13
                          }
                        />
                      </Link>
                    </footer>
                  </article>
                ),
              )}
            </div>
          ) : (
            <div className="cf-state">
              No AI insight is available yet.
            </div>
          )}
        </section>

        {/* STATUS */}

        <section className="foundation-card cf-card">
          <div className="cf-section-head">
            <div>
              <h3>
                Live Data Status
              </h3>

              <p>
                Current backend data used by
                Cash Flow.
              </p>
            </div>
          </div>

          <div className="cf-status-list">
            <div>
              <span className="cf-status-icon">
                <Wallet
                  size={15}
                />
              </span>

              <span>
                <strong>
                  Banking
                </strong>

                <small>
                  {
                    transactions.length
                  } transactions loaded
                </small>
              </span>

              <Badge tone="green">
                <CheckCircle2
                  size={11}
                />
                Live
              </Badge>
            </div>

            <div>
              <span className="cf-status-icon">
                <CalendarDays
                  size={15}
                />
              </span>

              <span>
                <strong>
                  Receivables
                </strong>

                <small>
                  {invoices.length}{' '}
                  invoices loaded
                </small>
              </span>

              <Badge tone="green">
                <CheckCircle2
                  size={11}
                />
                Live
              </Badge>
            </div>

            <div>
              <span className="cf-status-icon">
                <Sparkles
                  size={15}
                />
              </span>

              <span>
                <strong>
                  ML Forecast
                </strong>

                <small>
                  {mlForecast?.forecast
                    ?.length
                    ? `${mlForecast.forecast.length} forecast rows loaded`
                    : 'ML forecast unavailable'}
                </small>
              </span>

              <Badge
                tone={
                  mlForecast?.forecast
                    ?.length
                    ? 'green'
                    : 'amber'
                }
              >
                {mlForecast?.forecast
                  ?.length
                  ? 'Live'
                  : 'Unavailable'}
              </Badge>
            </div>
          </div>
        </section>
      </main>

      <style jsx global>{`
        .cf-page {
          width: 100%;
          max-width: 1440px;
          margin: 0 auto;
          padding: 38px 34px 60px;
        }

        .cf-page,
        .cf-page * {
          box-sizing: border-box;
        }

        .cf-page button,
        .cf-page input,
        .cf-page select,
        .cf-page a {
          font: inherit;
        }

        .cf-page a {
          text-decoration: none;
        }

        .cf-header {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 24px;
          margin-bottom: 18px;
        }

        .cf-header h2 {
          margin: 0 0 8px;
          color: #0f172a;
          font-size: 34px;
          line-height: 1.05;
          letter-spacing: -0.055em;
        }

        .cf-header > div:first-child > p:last-child {
          max-width: 760px;
          margin: 0;
          color: #64748b;
          font-size: 13px;
          line-height: 1.6;
        }

        .cf-header-actions {
          display: flex;
          align-items: stretch;
          justify-content: flex-end;
          gap: 9px;
          flex-wrap: wrap;
        }

        .cf-business {
          display: inline-flex;
          align-items: center;
          gap: 9px;
          min-width: 285px;
          max-width: 390px;
          padding: 9px 11px;
          border: 1px solid #dbe4ee;
          border-radius: 8px;
          background: #fff;
          color: #334155;
          text-align: left;
          cursor: pointer;
        }

        .cf-business > span {
          display: flex;
          flex: 1;
          min-width: 0;
          flex-direction: column;
          gap: 2px;
        }

        .cf-business b {
          font-size: 11px;
          line-height: 1.2;
        }

        .cf-business small {
          display: block;
          max-width: 290px;
          overflow: hidden;
          color: #94a3b8;
          font-size: 9px;
          font-weight: 600;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .cf-business:hover {
          border-color: #bae6fd;
          background: #f8fdff;
        }

        .cf-error {
          display: flex;
          align-items: center;
          gap: 9px;
          margin-bottom: 14px;
          border-color: #fecaca;
          background: #fff7f7;
        }

        .cf-error span {
          flex: 1;
        }

        .cf-error button {
          border: 0;
          background: transparent;
          color: #b91c1c;
          font-size: 11px;
          font-weight: 750;
          cursor: pointer;
        }

        .cf-range {
          display: inline-flex;
          align-items: center;
          gap: 3px;
          max-width: 100%;
          margin-bottom: 15px;
          padding: 4px;
          overflow-x: auto;
          border: 1px solid #dbe4ee;
          border-radius: 8px;
          background: #fff;
        }

        .cf-range button {
          flex: 0 0 auto;
          border: 0;
          border-radius: 6px;
          padding: 8px 12px;
          background: transparent;
          color: #64748b;
          font-size: 11px;
          font-weight: 750;
          line-height: 1;
          cursor: pointer;
        }

        .cf-range button:hover {
          background: #f8fafc;
        }

        .cf-range button.active {
          background: #e0f2fe;
          color: #0284c7;
        }

        .cf-kpi-grid {
          display: grid;
          grid-template-columns: repeat(
            6,
            minmax(0, 1fr)
          );
          gap: 11px;
        }

        .cf-kpi {
          min-width: 0;
          min-height: 118px;
          padding: 16px;
          border: 1px solid #e2e8f0;
          border-radius: 11px;
          background: #fff;
        }

        .cf-kpi-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          color: #64748b;
          font-size: 10px;
          font-weight: 750;
        }

        .cf-money {
          display: block;
          max-width: 100%;
          margin: 13px 0 7px;
          overflow-wrap: anywhere;
          color: #0f172a;
          font-size: clamp(
            17px,
            1.7vw,
            21px
          );
          line-height: 1.05;
          letter-spacing: -0.045em;
        }

        .cf-kpi small {
          display: block;
          min-height: 28px;
          color: #94a3b8;
          font-size: 10px;
          line-height: 1.4;
        }

        .cf-dot {
          width: 7px;
          height: 7px;
          flex: 0 0 auto;
          border-radius: 50%;
          background: #38bdf8;
        }

        .cf-dot.green {
          background: #22c55e;
        }

        .cf-dot.amber {
          background: #f59e0b;
        }

        .cf-dot.red {
          background: #ef4444;
        }

        .cf-dot.blue {
          background: #38bdf8;
        }

        .cf-main-grid {
          display: grid;
          grid-template-columns:
            minmax(0, 1.65fr)
            minmax(310px, 0.85fr);
          gap: 14px;
          margin-top: 14px;
          align-items: stretch;
        }

        .cf-card,
        .cf-table-panel,
        .cf-ai {
          min-width: 0;
          padding: 20px;
        }

        .cf-section-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
        }

        .cf-section-head > div:first-child {
          min-width: 0;
        }

        .cf-section-head h3 {
          margin: 0;
          color: #0f172a;
          font-size: 15px;
          line-height: 1.25;
          letter-spacing: -0.025em;
        }

        .cf-section-head p:not(.auth-eyebrow) {
          margin: 5px 0 0;
          color: #94a3b8;
          font-size: 11px;
          line-height: 1.55;
        }

        .cf-chart-tabs {
          display: inline-flex;
          flex: 0 0 auto;
          gap: 3px;
          padding: 3px;
          border: 1px solid #dbe4ee;
          border-radius: 7px;
          background: #fff;
        }

        .cf-chart-tabs button {
          border: 0;
          border-radius: 5px;
          padding: 7px 10px;
          background: transparent;
          color: #64748b;
          font-size: 10px;
          font-weight: 700;
          cursor: pointer;
        }

        .cf-chart-tabs button.active {
          background: #e0f2fe;
          color: #0284c7;
        }

        .cf-chart {
          width: 100%;
          min-height: 310px;
          margin-top: 16px;
          overflow: hidden;
        }

        .cf-legend {
          display: flex;
          flex-wrap: wrap;
          gap: 18px;
          margin-top: 2px;
          color: #64748b;
          font-size: 10px;
        }

        .cf-key {
          display: inline-block;
          width: 17px;
          margin-right: 5px;
          vertical-align: middle;
          border-top: 2px solid #0ea5e9;
        }

        .cf-key.sky {
          border-color: #0ea5e9;
        }

        .cf-key.green {
          border-color: #22c55e;
        }

        .cf-key.amber {
          border-color: #f59e0b;
        }

        .cf-watch {
          min-width: 0;
          padding: 20px;
          border: 1px solid #fde68a;
          background: #fffbeb;
        }

        .cf-watch-icon {
          width: 36px;
          height: 36px;
          display: grid;
          place-items: center;
          margin-bottom: 14px;
          border-radius: 9px;
          background: #fef3c7;
          color: #b45309;
        }

        .cf-watch h3 {
          margin: 0 0 9px;
          color: #78350f;
          font-size: 18px;
          line-height: 1.25;
        }

        .cf-watch > p {
          color: #92400e;
          font-size: 12px;
          line-height: 1.55;
        }

        .cf-watch-stats {
          display: grid;
          gap: 9px;
          margin: 15px 0;
          padding: 13px 0;
          border-block: 1px solid #fde68a;
        }

        .cf-watch-stats div {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }

        .cf-watch-stats span {
          color: #92400e;
          font-size: 10px;
        }

        .cf-watch-stats strong {
          color: #b45309;
          font-size: 12px;
          white-space: nowrap;
        }

        .cf-recommended {
          display: block;
          color: #92400e;
          font-size: 10px;
        }

        .cf-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 15px;
        }

        .cf-actions a {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 8px 10px;
          border: 1px solid #fcd34d;
          border-radius: 7px;
          background: #fff;
          color: #92400e;
          font-size: 10px;
          font-weight: 700;
        }

        .cf-total-row {
          display: grid;
          grid-template-columns:
            repeat(
              3,
              minmax(0, 1fr)
            );
          gap: 12px;
          margin-top: 16px;
          padding-top: 15px;
          border-top: 1px solid #e2e8f0;
        }

        .cf-total-row > div {
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 5px;
        }

        .cf-total-row span {
          color: #64748b;
          font-size: 10px;
        }

        .cf-total-row strong {
          font-size: 16px;
          line-height: 1.2;
          overflow-wrap: anywhere;
        }

        .cf-positive {
          color: #16a34a !important;
        }

        .cf-negative {
          color: #dc2626 !important;
        }

        .cf-breakdown {
          width: 100%;
          margin-top: 17px;
          border-top: 1px solid #e2e8f0;
        }

        .cf-breakdown > div {
          display: grid;
          grid-template-columns:
            minmax(190px, 1.5fr)
            minmax(120px, 0.8fr)
            minmax(120px, 0.8fr)
            minmax(120px, 0.8fr);
          align-items: center;
          gap: 18px;
          padding: 14px 0;
          border-bottom: 1px solid #f1f5f9;
        }

        .cf-breakdown > div > div {
          min-width: 0;
        }

        .cf-breakdown span {
          display: block;
          color: #64748b;
          font-size: 9px;
          line-height: 1.3;
        }

        .cf-breakdown strong {
          display: block;
          margin-top: 3px;
          font-size: 12px;
          line-height: 1.3;
          overflow-wrap: anywhere;
        }

        .cf-breakdown-name strong {
          color: #0f172a;
          font-size: 13px;
        }

        .cf-breakdown-name small {
          display: block;
          margin-top: 3px;
          color: #94a3b8;
          font-size: 9px;
        }

        .cf-forecast-points {
          display: grid;
          margin-top: 21px;
        }

        .cf-forecast-points > div {
          display: grid;
          grid-template-columns:
            75px
            minmax(0, 1fr)
            auto;
          align-items: center;
          gap: 10px;
          padding: 13px 0;
          border-bottom: 1px solid #f1f5f9;
        }

        .cf-forecast-points > div:last-child {
          border-bottom: 0;
        }

        .cf-forecast-points span:first-child {
          color: #64748b;
          font-size: 10px;
        }

        .cf-forecast-points > div > strong {
          min-width: 0;
          font-size: 14px;
          overflow-wrap: anywhere;
        }

        .cf-forecast-summary {
          display: grid;
          grid-template-columns:
            repeat(
              3,
              minmax(0, 1fr)
            );
          gap: 9px;
          margin-top: 16px;
        }

        .cf-forecast-summary > div {
          min-width: 0;
          padding: 12px;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          background: #f8fafc;
        }

        .cf-forecast-summary small {
          display: block;
          margin-bottom: 5px;
          color: #94a3b8;
          font-size: 9px;
        }

        .cf-forecast-summary strong {
          display: block;
          font-size: 13px;
          line-height: 1.25;
          overflow-wrap: anywhere;
        }

        .cf-badge {
          width: max-content;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          border-radius: 20px;
          padding: 4px 7px;
          font-size: 9px;
          font-weight: 750;
          white-space: nowrap;
        }

        .cf-badge.green {
          background: #dcfce7;
          color: #15803d;
        }

        .cf-badge.amber {
          background: #fef3c7;
          color: #b45309;
        }

        .cf-badge.red {
          background: #fee2e2;
          color: #dc2626;
        }

        .cf-badge.blue {
          background: #e0f2fe;
          color: #0369a1;
        }

        .cf-table-panel {
          margin-top: 14px;
          overflow: hidden;
        }

        .cf-table-wrap {
          width: 100%;
          margin-top: 17px;
          overflow-x: auto;
        }

        .cf-table {
          width: 100%;
          min-width: 820px;
          border-collapse: collapse;
          table-layout: fixed;
        }

        .cf-table th {
          padding: 0 10px 10px;
          border-bottom: 1px solid #e2e8f0;
          color: #94a3b8;
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-align: left;
          text-transform: uppercase;
        }

        .cf-table td {
          padding: 13px 10px;
          border-bottom: 1px solid #f1f5f9;
          color: #64748b;
          font-size: 11px;
          vertical-align: middle;
        }

        .cf-table th:first-child,
        .cf-table td:first-child {
          width: 28%;
          padding-left: 0;
        }

        .cf-table th:nth-child(2),
        .cf-table td:nth-child(2) {
          width: 15%;
        }

        .cf-table th:nth-child(3),
        .cf-table td:nth-child(3) {
          width: 17%;
        }

        .cf-table th:nth-child(4),
        .cf-table td:nth-child(4) {
          width: 27%;
        }

        .cf-table th:last-child,
        .cf-table td:last-child {
          width: 13%;
        }

        .cf-table td strong {
          display: block;
          color: #0f172a;
          font-size: 11px;
          line-height: 1.35;
        }

        .cf-table td small {
          display: block;
          max-width: 280px;
          margin-top: 4px;
          color: #94a3b8;
          font-size: 9px;
          line-height: 1.35;
          overflow-wrap: anywhere;
        }

        .cf-table-money {
          color: #334155 !important;
          font-weight: 750;
          white-space: nowrap;
        }

        .cf-customer {
          display: block;
          max-width: 260px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .cf-bottom-grid {
          display: grid;
          grid-template-columns:
            minmax(0, 1.3fr)
            minmax(310px, 0.7fr);
          gap: 14px;
          margin-top: 14px;
        }

        .cf-working-grid {
          display: grid;
          grid-template-columns:
            repeat(
              4,
              minmax(0, 1fr)
            );
          gap: 9px;
          margin-top: 18px;
        }

        .cf-working-grid .cf-kpi {
          min-height: 102px;
          padding: 12px;
        }

        .cf-working-grid .cf-money {
          margin-top: 10px;
          font-size: 15px;
        }

        .cf-working-grid .cf-kpi small {
          font-size: 9px;
        }

        .cf-note {
          margin: 17px 0 0 !important;
          color: #64748b !important;
          font-size: 10px !important;
          line-height: 1.55 !important;
        }

        .cf-health-score {
          display: flex;
          align-items: baseline;
          color: #0ea5e9;
        }

        .cf-health-score strong {
          font-size: 28px;
          line-height: 1;
          letter-spacing: -0.05em;
        }

        .cf-health-score span {
          margin-left: 2px;
          color: #94a3b8;
          font-size: 10px;
        }

        .cf-health-row {
          margin-top: 16px;
        }

        .cf-health-row > div:first-child {
          display: flex;
          align-items: center;
          justify-content: space-between;
          color: #64748b;
          font-size: 10px;
        }

        .cf-health-row > div:last-child {
          height: 6px;
          margin-top: 7px;
          overflow: hidden;
          border-radius: 20px;
          background: #f1f5f9;
        }

        .cf-health-row i {
          display: block;
          height: 100%;
          border-radius: 20px;
          background: #0ea5e9;
        }

        .cf-impact-list {
          display: grid;
          margin-top: 10px;
        }

        .cf-impact-list > div {
          display: grid;
          grid-template-columns:
            minmax(0, 1fr)
            auto
            100px;
          align-items: center;
          gap: 15px;
          padding: 12px 0;
          border-bottom: 1px solid #f1f5f9;
        }

        .cf-impact-list > div:last-child {
          border-bottom: 0;
        }

        .cf-impact-title {
          min-width: 0;
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .cf-impact-title > span:last-child {
          min-width: 0;
        }

        .cf-impact-title strong {
          display: block;
          overflow: hidden;
          color: #334155;
          font-size: 11px;
          line-height: 1.3;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .cf-impact-title small {
          display: block;
          margin-top: 3px;
          color: #94a3b8;
          font-size: 9px;
        }

        .cf-impact-icon {
          width: 28px;
          height: 28px;
          flex: 0 0 auto;
          display: grid;
          place-items: center;
          border-radius: 7px;
        }

        .cf-impact-icon.credit {
          color: #15803d;
          background: #dcfce7;
        }

        .cf-impact-icon.debit {
          color: #dc2626;
          background: #fee2e2;
        }

        .cf-impact-list > div > strong {
          font-size: 12px;
          white-space: nowrap;
        }

        .cf-impact-date {
          color: #94a3b8;
          font-size: 9px;
          text-align: right;
          white-space: nowrap;
        }

        .cf-ai {
          margin-top: 14px;
          border: 1px solid #bae6fd;
          border-radius: 11px;
          background: #f0f9ff;
        }

        .cf-ai-grid {
          display: grid;
          grid-template-columns:
            repeat(
              3,
              minmax(0, 1fr)
            );
          gap: 11px;
          margin-top: 17px;
        }

        .cf-insight {
          min-width: 0;
          padding: 15px;
          border: 1px solid #e0f2fe;
          border-radius: 8px;
          background: #fff;
        }

        .cf-insight-label {
          display: flex;
          align-items: center;
          gap: 5px;
          color: #0284c7;
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .cf-insight h4 {
          margin: 11px 0 7px;
          color: #0f172a;
          font-size: 13px;
          line-height: 1.3;
        }

        .cf-insight > p {
          min-height: 56px;
          margin: 0 0 12px;
          color: #64748b;
          font-size: 11px;
          line-height: 1.55;
        }

        .cf-insight-block {
          display: grid;
          gap: 4px;
          padding: 9px 0;
          border-top: 1px solid #f1f5f9;
        }

        .cf-insight-block small {
          color: #94a3b8;
          font-size: 9px;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }

        .cf-insight-block strong {
          color: #334155;
          font-size: 10px;
          line-height: 1.4;
          overflow-wrap: anywhere;
        }

        .cf-insight-block span {
          color: #64748b;
          font-size: 10px;
          line-height: 1.45;
        }

        .cf-insight footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-top: 10px;
        }

        .cf-insight footer small {
          color: #94a3b8;
          font-size: 8px;
        }

        .cf-insight footer a {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          color: #0284c7;
          font-size: 10px;
          font-weight: 750;
          white-space: nowrap;
        }

        .cf-status-list {
          margin-top: 8px;
        }

        .cf-status-list > div {
          display: grid;
          grid-template-columns:
            32px
            minmax(0, 1fr)
            auto;
          align-items: center;
          gap: 11px;
          padding: 14px 0;
          border-bottom: 1px solid #f1f5f9;
        }

        .cf-status-list > div:last-child {
          border-bottom: 0;
        }

        .cf-status-icon {
          width: 32px;
          height: 32px;
          display: grid;
          place-items: center;
          border-radius: 8px;
          background: #e0f2fe;
          color: #0284c7;
        }

        .cf-status-list > div > span:nth-child(2) {
          min-width: 0;
        }

        .cf-status-list strong,
        .cf-status-list small {
          display: block;
        }

        .cf-status-list strong {
          color: #0f172a;
          font-size: 11px;
        }

        .cf-status-list small {
          margin-top: 3px;
          color: #94a3b8;
          font-size: 9px;
          overflow-wrap: anywhere;
        }

        .cf-state {
          min-height: 110px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 25px 10px;
          color: #94a3b8;
          font-size: 11px;
          text-align: center;
        }

        .cf-ml-forecast {
          margin-top: 16px;
          padding: 12px;
          border: 1px solid #dbeafe;
          border-radius: 8px;
          background: #f8fbff;
        }

        .cf-ml-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }

        .cf-ml-head > div {
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .cf-ml-head span {
          color: #0284c7;
          font-size: 8px;
          font-weight: 800;
          letter-spacing: 0.08em;
        }

        .cf-ml-head strong {
          color: #0f172a;
          font-size: 11px;
        }

        .cf-ml-scroll {
          display: grid;
          grid-template-columns:
            repeat(
              7,
              minmax(125px, 1fr)
            );
          gap: 8px;
          margin-top: 10px;
          overflow-x: auto;
          padding-bottom: 3px;
        }

        .cf-ml-row {
          min-width: 125px;
          padding: 10px;
          border: 1px solid #e2e8f0;
          border-radius: 7px;
          background: #fff;
        }

        .cf-ml-row > span {
          display: block;
          color: #64748b;
          font-size: 9px;
        }

        .cf-ml-row > strong {
          display: block;
          margin-top: 7px;
          font-size: 13px;
          line-height: 1.2;
        }

        .cf-ml-row > small {
          display: block;
          margin-top: 5px;
          color: #94a3b8;
          font-size: 8px;
          line-height: 1.3;
        }

        .cf-ml-note {
          margin: 9px 0 0 !important;
          color: #64748b !important;
          font-size: 9px !important;
          line-height: 1.5 !important;
        }

        @media (max-width: 1200px) {
          .cf-kpi-grid {
            grid-template-columns:
              repeat(
                3,
                minmax(0, 1fr)
              );
          }

          .cf-main-grid,
          .cf-bottom-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 850px) {
          .cf-page {
            padding: 30px 20px 50px;
          }

          .cf-header {
            align-items: flex-start;
            flex-direction: column;
          }

          .cf-header-actions {
            width: 100%;
            justify-content: flex-start;
          }

          .cf-business {
            flex: 1;
            min-width: 220px;
          }

          .cf-section-head {
            flex-direction: column;
          }

          .cf-breakdown > div {
            grid-template-columns:
              minmax(160px, 1.4fr)
              1fr
              1fr;
          }

          .cf-breakdown > div > div:last-child {
            grid-column: 2 / -1;
          }

          .cf-working-grid {
            grid-template-columns:
              repeat(
                2,
                minmax(0, 1fr)
              );
          }

          .cf-ai-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 650px) {
          .cf-page {
            padding: 24px 16px 40px;
          }

          .cf-kpi-grid {
            grid-template-columns:
              repeat(
                2,
                minmax(0, 1fr)
              );
          }

          .cf-card,
          .cf-table-panel,
          .cf-ai,
          .cf-watch {
            padding: 16px;
          }

          .cf-header-actions {
            flex-direction: column;
          }

          .cf-business,
          .cf-header-actions .secondary-button {
            width: 100%;
            max-width: none;
          }

          .cf-chart-tabs {
            width: 100%;
          }

          .cf-chart-tabs button {
            flex: 1;
          }

          .cf-chart {
            min-width: 520px;
          }

          .cf-ml-scroll {
            grid-template-columns:
              repeat(
                7,
                125px
              );
          }

          .cf-total-row {
            grid-template-columns: 1fr;
          }

          .cf-breakdown > div {
            grid-template-columns:
              1fr
              1fr;
            gap: 10px;
          }

          .cf-breakdown > div > .cf-breakdown-name {
            grid-column: 1 / -1;
          }

          .cf-breakdown > div > div:last-child {
            grid-column: 2;
          }

          .cf-forecast-summary {
            grid-template-columns: 1fr;
          }

          .cf-working-grid {
            grid-template-columns:
              1fr
              1fr;
          }

          .cf-impact-list > div {
            grid-template-columns:
              minmax(0, 1fr)
              auto;
          }

          .cf-impact-date {
            display: none;
          }
        }

        @media (max-width: 480px) {
          .cf-kpi-grid,
          .cf-working-grid {
            grid-template-columns: 1fr;
          }

          .cf-range {
            display: flex;
            width: 100%;
          }

          .cf-range button {
            flex: 1;
          }

          .cf-forecast-points > div {
            grid-template-columns:
              65px
              minmax(0, 1fr);
          }

          .cf-forecast-points > div > .cf-badge {
            grid-column: 2;
            justify-self: start;
          }

          .cf-table {
            min-width: 730px;
          }
        }
      `}</style>
    </>
  )
}