'use client'

import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'

import {
  AlertCircle,
  ArrowUpRight,
  Building2,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  Filter,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  X,
} from 'lucide-react'

// ============================================================
// TYPES
// ============================================================

type Tone =
  | 'green'
  | 'amber'
  | 'red'
  | 'blue'

type Account = {
  id: string
  bank: string
  nickname: string
  number: string
  type: string
  current: string
  available: string
  synced: string
  status:
    | 'Healthy'
    | 'Warning'
}

type Transaction = {
  id: string
  entity: string
  description: string
  type: string
  amount: string
  date: string
  risk: Tone
  account: string
  category: string
  status: string
  reference: string
}

type Payment = {
  id: string
  counterparty: string
  type: string
  amount: string
  date: string
  method: string
  status:
    | 'Completed'
    | 'Pending'
    | 'Scheduled'
    | 'Failed'
    | 'Cancelled'
    | 'Processing'
  reference: string
  notes: string
}

type PaymentMode =
  | 'Vendor payment'
  | 'Customer collection'

type PaymentMethod =
  | 'UPI'
  | 'QR'
  | 'NEFT'
  | 'RTGS'
  | 'Bank Transfer'

type ApiBankAccount = {
  id: string
  user_id: number
  provider: string
  external_account_id: string
  name: string
  currency: string
  balance:
    | number
    | string
    | null
  sync_status: string
  last_synced_at:
    | string
    | null
  created_at?:
    | string
    | null
  updated_at?:
    | string
    | null
}

type ApiBankTransaction = {
  id: string
  business_id: string
  transaction_date: string
  transaction_type: string
  category: string
  amount:
    | number
    | string
    | null
  running_balance:
    | number
    | string
    | null
  description: string
  reference_number:
    | string
    | null
  customer_id:
    | string
    | null
  supplier_id:
    | string
    | null
  invoice_payment_id:
    | string
    | null
  expense_id:
    | string
    | null
  created_at: string
}

type ApiBankingSummary = {
  total_transactions: number
  total_credit:
    | number
    | string
  total_debit:
    | number
    | string
  balance:
    | number
    | string
}

type ApiInvoice = {
  id: string
  invoice_number?:
    | string
    | null
  customer_id?:
    | string
    | null
  total_amount?:
    | number
    | string
    | null
  amount_paid?:
    | number
    | string
    | null
  due_date?:
    | string
    | null
  status?:
    | string
    | null
}

type NormalizedPayment = {
  id: string
  counterparty: string
  type: PaymentMode
  amount: number
  date: string
  method: string
  status: Payment['status']
  reference: string
  notes: string
  transaction?: ApiBankTransaction
}

// ============================================================
// API CONFIG
// ============================================================

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:8000'
).replace(
  /\/+$/,
  '',
)

// ============================================================
// AUTH STORAGE
// ============================================================

const AUTH_KEYS = [
  'access_token',
  'accessToken',
  'token',
  'auth_token',
  'jwt_token',
  'jwt',
  'cashguard_access_token',
  'cashguard_token',
]

const AUTH_OBJECT_KEYS = [
  'auth',
  'session',
  'authData',
  'auth_data',
  'currentUser',
  'current_user',
]

// ============================================================
// TOKEN HELPERS
// ============================================================

function cleanToken(
  value: unknown,
): string | null {
  if (
    typeof value !==
    'string'
  ) {
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

function extractToken(
  value: unknown,
): string | null {
  if (!value) {
    return null
  }

  if (
    typeof value ===
    'string'
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
      return null
    }
  }

  if (
    typeof value !==
      'object' ||
    value === null
  ) {
    return null
  }

  const obj =
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
  ]

  for (
    const key of directKeys
  ) {
    const token =
      cleanToken(
        obj[key],
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
  ]

  for (
    const key of nestedKeys
  ) {
    const token =
      extractToken(
        obj[key],
      )

    if (token) {
      return token
    }
  }

  return null
}

function getAuthToken(): string | null {
  if (
    typeof window ===
    'undefined'
  ) {
    return null
  }

  const storages = [
    window.localStorage,
    window.sessionStorage,
  ]

  for (
    const storage of storages
  ) {
    for (
      const key of AUTH_KEYS
    ) {
      try {
        const value =
          storage.getItem(key)

        const token =
          extractToken(value)

        if (token) {
          return token
        }
      } catch {
        // Ignore storage access errors.
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
        const value =
          storage.getItem(key)

        const token =
          extractToken(value)

        if (token) {
          return token
        }
      } catch {
        // Ignore storage access errors.
      }
    }
  }

  return null
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
      process.env
        .NEXT_PUBLIC_BUSINESS_ID
        ?.trim() ||
      null
    )
  }

  const keys = [
    'business_id',
    'businessId',
    'cashguard_business_id',
  ]

  const storages = [
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
    process.env
      .NEXT_PUBLIC_BUSINESS_ID
      ?.trim() ||
    null
  )
}

// ============================================================
// CLEAR CLIENT AUTH
// ============================================================

function clearClientTokens(): void {
  if (
    typeof window ===
    'undefined'
  ) {
    return
  }

  const keysToClear = [
    ...AUTH_KEYS,
    ...AUTH_OBJECT_KEYS,
    'auth_email',
    'auth_logged_in',
    'auth_expires_in',
  ]

  for (
    const key of keysToClear
  ) {
    try {
      window.localStorage.removeItem(
        key,
      )

      window.sessionStorage.removeItem(
        key,
      )
    } catch {
      // Ignore storage errors.
    }
  }
}

function dispatchAuthExpired(): void {
  if (
    typeof window ===
    'undefined'
  ) {
    return
  }

  window.dispatchEvent(
    new CustomEvent(
      'cashguard-auth-expired',
    ),
  )

  // Banking endpoints are protected. Once both the
  // bearer token and cookie session fail, stop the
  // request loop and send the user back to login.
  if (
    window.location.pathname !==
    '/login'
  ) {
    window.location.replace(
      '/login',
    )
  }
}

function buildApiUrl(
  endpoint: string,
): string {
  if (
    /^https?:\/\//i.test(
      endpoint,
    )
  ) {
    return endpoint
  }

  const normalized =
    endpoint.startsWith('/')
      ? endpoint
      : `/${endpoint}`

  return `${API_BASE_URL}${normalized}`
}

// ============================================================
// API ERROR
// ============================================================

class CashGuardApiError extends Error {
  status: number
  endpoint: string
  hasBearerToken: boolean

  constructor(
    message: string,
    status: number,
    endpoint: string,
    hasBearerToken: boolean,
  ) {
    super(message)

    this.name =
      'CashGuardApiError'

    this.status =
      status

    this.endpoint =
      endpoint

    this.hasBearerToken =
      hasBearerToken
  }
}

// ============================================================
// API FETCH
// ============================================================

async function cashGuardApiFetch<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const token =
    getAuthToken()

  const headers =
    new Headers(
      options.headers ||
        {},
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

  headers.set(
    'Accept',
    'application/json',
  )

  if (token) {
    headers.set(
      'Authorization',
      `Bearer ${token}`,
    )
  } else {
    headers.delete(
      'Authorization',
    )
  }

  const url =
    buildApiUrl(endpoint)

  if (
    process.env.NODE_ENV !==
    'production'
  ) {
    console.debug(
      '[CASHGUARD API]',
      {
        url,
        hasBearerToken:
          Boolean(token),
      },
    )
  }

  const method = String(
    options.method ||
      'GET',
  ).toUpperCase()

  const request = async (
    requestHeaders: Headers,
  ): Promise<Response> => {
    try {
      return await fetch(
        url,
        {
          ...options,
          method,
          headers:
            requestHeaders,
          credentials:
            'include',
          cache:
            'no-store',
        },
      )
    } catch (
      networkError
    ) {
      console.error(
        '[CASHGUARD API] Network error',
        networkError,
      )

      throw new Error(
        `Unable to connect to CashGuard-AI backend at ${API_BASE_URL}. Make sure FastAPI is running.`,
      )
    }
  }

  let response =
    await request(headers)

  // Important auth recovery:
  // FastAPI gives the Authorization header priority over
  // the HttpOnly cookie. If an old/stale localStorage JWT
  // exists while the cookie is still valid, retry safe
  // read requests once without the bearer header.
  const canRetryWithCookie =
    Boolean(token) &&
    (
      method === 'GET' ||
      method === 'HEAD' ||
      method === 'OPTIONS'
    ) &&
    response.status === 401

  if (
    canRetryWithCookie
  ) {
    const cookieHeaders =
      new Headers(
        headers,
      )

    cookieHeaders.delete(
      'Authorization',
    )

    try {
      const cookieResponse =
        await request(
          cookieHeaders,
        )

      if (
        cookieResponse.ok
      ) {
        response =
          cookieResponse
      }
    } catch {
      // Keep the original 401 response
      // and continue with normal auth-expiry handling.
    }
  }

  if (!response.ok) {
    let message =
      `API request failed (${response.status})`

    try {
      const body =
        await response.json()

      if (
        typeof body?.detail ===
        'string'
      ) {
        message =
          body.detail
      } else if (
        Array.isArray(
          body?.detail,
        )
      ) {
        message =
          body.detail
            .map(
              (
                item: {
                  msg?: string
                },
              ) =>
                item?.msg ||
                'Validation error',
            )
            .join(', ')
      } else if (
        typeof body?.message ===
        'string'
      ) {
        message =
          body.message
      }
    } catch {
      // Non-JSON response.
    }

    if (
      response.status ===
      401
    ) {
      clearClientTokens()
      dispatchAuthExpired()
    }

    throw new CashGuardApiError(
      message,
      response.status,
      endpoint,
      Boolean(token),
    )
  }

  if (
    response.status ===
    204
  ) {
    return undefined as T
  }

  const contentType =
    response.headers.get(
      'content-type',
    ) || ''

  if (
    !contentType
      .toLowerCase()
      .includes(
        'application/json',
      )
  ) {
    return (
      (await response.text()) as T
    )
  }

  return response.json() as Promise<T>
}



// ============================================================
// FETCH COMPLETE BANK TRANSACTION HISTORY
// ============================================================
//
// The banking API accepts a maximum page size of 100.
// This helper keeps requesting subsequent pages until:
//   1. the API returns an empty page,
//   2. the returned page is smaller than 100, or
//   3. the API exposes a total and we have reached it.
//
// The result is de-duplicated by transaction ID so the
// consuming pages always receive one complete transaction set.
// ============================================================

type BankTransactionPageResponse =
  | ApiBankTransaction[]
  | {
      items?: ApiBankTransaction[]
      data?: ApiBankTransaction[]
      transactions?: ApiBankTransaction[]
      records?: ApiBankTransaction[]
      results?: ApiBankTransaction[]
      total?: number
      limit?: number
      offset?: number
    }

async function fetchInitialBankTransactions(
  businessId: string,
): Promise<ApiBankTransaction[]> {
  const encodedBusinessId =
    encodeURIComponent(
      businessId,
    )

  const response =
    await cashGuardApiFetch<BankTransactionPageResponse>(
      `/api/banking/transactions?business_id=${encodedBusinessId}&limit=100&offset=0`,
    )

  if (Array.isArray(response)) {
    return response
  }

  if (
    response &&
    typeof response === 'object'
  ) {
    const payload =
      response as Exclude<
        BankTransactionPageResponse,
        ApiBankTransaction[]
      >

    const rows =
      payload.items ||
      payload.data ||
      payload.transactions ||
      payload.records ||
      payload.results ||
      []

    return Array.isArray(rows)
      ? rows
      : []
  }

  return []
}

async function fetchAllBankTransactions(
  businessId: string,
): Promise<ApiBankTransaction[]> {
  const encodedBusinessId =
    encodeURIComponent(
      businessId,
    )

  const pageSize = 100
  const maxPages = 100

  const allTransactions: ApiBankTransaction[] = []

  for (
    let page = 0;
    page < maxPages;
    page += 1
  ) {
    const offset =
      page * pageSize

    const response =
      await cashGuardApiFetch<BankTransactionPageResponse>(
        `/api/banking/transactions?business_id=${encodedBusinessId}&limit=${pageSize}&offset=${offset}`,
      )

    let pageTransactions: ApiBankTransaction[] = []
    let total: number | null = null

    if (
      Array.isArray(response)
    ) {
      pageTransactions =
        response
    } else if (
      response &&
      typeof response === 'object'
    ) {
      const payload =
        response as Exclude<
          BankTransactionPageResponse,
          ApiBankTransaction[]
        >

      if (
        Array.isArray(
          payload.items,
        )
      ) {
        pageTransactions =
          payload.items
      } else if (
        Array.isArray(
          payload.data,
        )
      ) {
        pageTransactions =
          payload.data
      } else if (
        Array.isArray(
          payload.transactions,
        )
      ) {
        pageTransactions =
          payload.transactions
      } else if (
        Array.isArray(
          payload.records,
        )
      ) {
        pageTransactions =
          payload.records
      } else if (
        Array.isArray(
          payload.results,
        )
      ) {
        pageTransactions =
          payload.results
      }

      if (
        typeof payload.total ===
          'number' &&
        Number.isFinite(
          payload.total,
        )
      ) {
        total =
          payload.total
      }
    }

    if (
      !pageTransactions.length
    ) {
      break
    }

    allTransactions.push(
      ...pageTransactions,
    )

    if (
      total !== null &&
      allTransactions.length >=
        total
    ) {
      break
    }

    if (
      pageTransactions.length <
      pageSize
    ) {
      break
    }
  }

  const uniqueTransactions =
    new Map<
      string,
      ApiBankTransaction
    >()

  const transactionsWithoutId: ApiBankTransaction[] = []

  for (
    const transaction of allTransactions
  ) {
    if (
      transaction.id
    ) {
      uniqueTransactions.set(
        transaction.id,
        transaction,
      )
    } else {
      transactionsWithoutId.push(
        transaction,
      )
    }
  }

  return [
    ...Array.from(
      uniqueTransactions.values(),
    ),
    ...transactionsWithoutId,
  ].sort(
    (
      a,
      b,
    ) => {
      const dateDiff =
        new Date(
          b.transaction_date,
        ).getTime() -
        new Date(
          a.transaction_date,
        ).getTime()

      if (
        dateDiff !== 0
      ) {
        return dateDiff
      }

      return (
        new Date(
          b.created_at,
        ).getTime() -
        new Date(
          a.created_at,
        ).getTime()
      )
    },
  )
}

async function optionalCashGuardApiFetch<T>(
  endpoint: string,
): Promise<T | null> {
  try {
    return await cashGuardApiFetch<T>(
      endpoint,
    )
  } catch (
    error
  ) {
    if (
      process.env.NODE_ENV !==
      'production'
    ) {
      console.warn(
        '[CASHGUARD OPTIONAL API]',
        endpoint,
        error,
      )
    }

    return null
  }
}

// ============================================================
// FORMAT HELPERS
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

  const parsed =
    Number(value)

  return Number.isFinite(
    parsed,
  )
    ? parsed
    : 0
}

function formatINR(
  value:
    | number
    | string
    | null
    | undefined,
): string {
  return `₹${Math.abs(
    toNumber(value),
  ).toLocaleString(
    'en-IN',
    {
      maximumFractionDigits: 2,
    },
  )}`
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

  const date =
    new Date(value)

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return value
  }

  return date.toLocaleDateString(
    'en-IN',
    {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    },
  )
}

function formatRelativeSyncTime(
  value:
    | string
    | null,
): string {
  if (!value) {
    return 'Never'
  }

  const date =
    new Date(value)

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return 'Unknown'
  }

  const diff =
    Math.max(
      0,
      Date.now() -
        date.getTime(),
    )

  const minutes =
    Math.floor(
      diff / 60000,
    )

  if (
    minutes < 1
  ) {
    return 'Just now'
  }

  if (
    minutes < 60
  ) {
    return `${minutes} min ago`
  }

  const hours =
    Math.floor(
      minutes / 60,
    )

  if (
    hours < 24
  ) {
    return `${hours} hr ago`
  }

  const days =
    Math.floor(
      hours / 24,
    )

  return `${days} day${
    days === 1
      ? ''
      : 's'
  } ago`
}

function normalizeTransactionType(
  value: string,
):
  | 'Credit'
  | 'Debit' {
  const normalized =
    (
      value || ''
    )
      .trim()
      .toLowerCase()

  if (
    [
      'credit',
      'cr',
      'income',
      'deposit',
      'inflow',
      'received',
      'receive',
      'paid_in',
    ].includes(
      normalized,
    )
  ) {
    return 'Credit'
  }

  return 'Debit'
}

function calculateCreditTotal(
  transactions: ApiBankTransaction[],
): number {
  return transactions
    .filter(
      (row) =>
        normalizeTransactionType(
          row.transaction_type,
        ) ===
        'Credit',
    )
    .reduce(
      (
        total,
        row,
      ) =>
        total +
        Math.abs(
          toNumber(
            row.amount,
          ),
        ),
      0,
    )
}

function calculateDebitTotal(
  transactions: ApiBankTransaction[],
): number {
  return transactions
    .filter(
      (row) =>
        normalizeTransactionType(
          row.transaction_type,
        ) ===
        'Debit',
    )
    .reduce(
      (
        total,
        row,
      ) =>
        total +
        Math.abs(
          toNumber(
            row.amount,
          ),
        ),
      0,
    )
}

function getLatestRunningBalance(
  transactions: ApiBankTransaction[],
): number {
  if (
    !transactions.length
  ) {
    return 0
  }

  const sorted =
    [...transactions].sort(
      (
        a,
        b,
      ) => {
        const dateDiff =
          new Date(
            b.transaction_date,
          ).getTime() -
          new Date(
            a.transaction_date,
          ).getTime()

        if (
          dateDiff !== 0
        ) {
          return dateDiff
        }

        return (
          new Date(
            b.created_at,
          ).getTime() -
          new Date(
            a.created_at,
          ).getTime()
        )
      },
    )

  return toNumber(
    sorted[0]
      ?.running_balance,
  )
}

// ============================================================
// COMMON UI
// ============================================================

function Status({
  tone,
  children,
}: {
  tone: Tone
  children: ReactNode
}) {
  return (
    <span
      className={`badge ${tone}`}
    >
      {children}
    </span>
  )
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string
  children: ReactNode
  onClose: () => void
}) {
  return (
    <div
      className="finance-overlay"
      role="dialog"
      aria-modal="true"
    >
      <div className="finance-modal">
        <div className="finance-modal-head">
          <div>
            <p className="auth-eyebrow">
              CASHGUARD-AI
            </p>

            <h3>
              {title}
            </h3>
          </div>

          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {children}
      </div>
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <label className="finance-field">
      <span>{label}</span>
      {children}
    </label>
  )
}

function Toolbar({
  query,
  setQuery,
  filter,
  setFilter,
  placeholder,
}: {
  query: string
  setQuery: (
    value: string,
  ) => void
  filter: string
  setFilter: (
    value: string,
  ) => void
  placeholder: string
}) {
  return (
    <div className="finance-toolbar">
      <div className="search-control">
        <Search size={16} />

        <input
          type="search"
          aria-label={
            placeholder
          }
          placeholder={
            placeholder
          }
          value={query}
          onChange={(
            event,
          ) =>
            setQuery(
              event.target
                .value,
            )
          }
        />
      </div>

      <select
        aria-label="Filter records"
        value={filter}
        onChange={(
          event,
        ) =>
          setFilter(
            event.target
              .value,
          )
        }
      >
        <option value="All">
          All
        </option>

        <option value="Credit">
          Credit
        </option>

        <option value="Debit">
          Debit
        </option>

        <option value="Healthy">
          Healthy
        </option>

        <option value="Warning">
          Warning
        </option>

        <option value="Pending">
          Pending
        </option>

        <option value="Completed">
          Completed
        </option>

        <option value="Failed">
          Failed
        </option>
      </select>

      <button
        type="button"
        className="secondary-button"
      >
        <Filter size={14} />
        Filters
      </button>
    </div>
  )
}

function Kpis({
  items,
}: {
  items: Array<
    [
      string,
      string,
      string,
      Tone,
    ]
  >
}) {
  return (
    <div className="dashboard-kpis">
      {items.map(
        ([
          label,
          value,
          sub,
          tone,
        ]) => (
          <section
            className="foundation-card kpi-card"
            key={label}
          >
            <div>
              <span className="kpi-label">
                {label}
              </span>

              <span
                className={`kpi-status ${tone}`}
              />
            </div>

            <strong className="money">
              {value}
            </strong>

            <p>{sub}</p>

            <small
              className={
                tone ===
                'green'
                  ? 'positive-text'
                  : tone ===
                      'red'
                    ? 'danger-text'
                    : tone ===
                        'amber'
                      ? 'warning-text'
                      : ''
              }
            >
              {tone ===
              'green'
                ? 'Healthy'
                : tone ===
                    'red'
                  ? 'Action required'
                  : tone ===
                      'amber'
                    ? 'Monitor closely'
                    : 'Live'}
            </small>
          </section>
        ),
      )}
    </div>
  )
}

// ============================================================
// BANKING PAGE
// ============================================================

export function BankingPage() {
  const [
    accounts,
    setAccounts,
  ] = useState<
    ApiBankAccount[]
  >([])

  const [
    transactions,
    setTransactions,
  ] = useState<
    ApiBankTransaction[]
  >([])

  const [
    summary,
    setSummary,
  ] =
    useState<ApiBankingSummary | null>(
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
  ] = useState<string | null>(
    null,
  )

  const [
    query,
    setQuery,
  ] = useState('')

  const [
    filter,
    setFilter,
  ] = useState('All')

  const [
    modal,
    setModal,
  ] = useState<
    | 'connect'
    | 'account'
    | 'transaction'
    | null
  >(null)

  const [
    selectedAccount,
    setSelectedAccount,
  ] =
    useState<ApiBankAccount | null>(
      null,
    )

  const [
    selectedTransaction,
    setSelectedTransaction,
  ] =
    useState<ApiBankTransaction | null>(
      null,
    )

  const [
    message,
    setMessage,
  ] = useState('')

  const loadBankingData =
    async (
      showRefreshing = false,
    ) => {
      const businessId =
        getBusinessId()

      if (!businessId) {
        setError(
          'Business ID is missing. Configure NEXT_PUBLIC_BUSINESS_ID in frontend/.env.local.',
        )

        setLoading(false)
        return
      }

      try {
        setError(null)

        if (showRefreshing) {
          setRefreshing(true)
        } else {
          setLoading(true)
        }

        const [
          transactionResponse,
          accountResponse,
          summaryResponse,
        ] = await Promise.all([
          fetchInitialBankTransactions(
            businessId,
          ),

          optionalCashGuardApiFetch<
            ApiBankAccount[]
          >(
            '/api/banking/accounts',
          ),

          optionalCashGuardApiFetch<
            ApiBankingSummary
          >(
            `/api/banking/transactions/summary?business_id=${encodeURIComponent(businessId)}`,
          ),
        ])

        setTransactions(
          Array.isArray(
            transactionResponse,
          )
            ? transactionResponse
            : [],
        )

        setAccounts(
          Array.isArray(
            accountResponse,
          )
            ? accountResponse
            : [],
        )

        setSummary(
          summaryResponse,
        )

        // Load the remaining transaction history in the background so the
        // Banking page becomes interactive as soon as the first 100 rows
        // and the KPI data are available.
        void fetchAllBankTransactions(
          businessId,
        )
          .then((allTransactions) => {
            if (allTransactions.length > transactionResponse.length) {
              setTransactions(allTransactions)
            }
          })
          .catch((backgroundError) => {
            if (process.env.NODE_ENV !== 'production') {
              console.warn(
                '[BankingPage] Background transaction history unavailable.',
                backgroundError,
              )
            }
          })
      } catch (
        err
      ) {
        const apiError =
          err as {
            status?: number
            message?: string
          }

        if (
          apiError?.status ===
          401
        ) {
          setError(
            'Authentication failed. Please login again.',
          )
        } else if (
          apiError?.status ===
          403
        ) {
          setError(
            'You are not authorized to access this banking data.',
          )
        } else {
          setError(
            err instanceof Error
              ? err.message
              : 'Unable to load banking data.',
          )
        }
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    }

  useEffect(() => {
    void loadBankingData()

    const handleAuthChanged =
      () => {
        void loadBankingData(
          true,
        )
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
  }, [])

  const visibleTransactions =
    useMemo(
      () =>
        transactions.filter(
          (
            row,
          ) => {
            const searchable =
              [
                row.description,
                row.reference_number ||
                  '',
                row.category,
                row.business_id,
              ]
                .join(' ')
                .toLowerCase()

            const matchesQuery =
              searchable.includes(
                query
                  .trim()
                  .toLowerCase(),
              )

            const type =
              normalizeTransactionType(
                row.transaction_type,
              )

            const matchesFilter =
              filter ===
                'All' ||
              (filter ===
                'Credit' &&
                type ===
                  'Credit') ||
              (filter ===
                'Debit' &&
                type ===
                  'Debit') ||
              (filter ===
                'Healthy' &&
                type ===
                  'Credit') ||
              (filter ===
                'Warning' &&
                type ===
                  'Debit')

            return (
              matchesQuery &&
              matchesFilter
            )
          },
        ),
      [
        transactions,
        query,
        filter,
      ],
    )

  const calculatedCredit =
    calculateCreditTotal(
      transactions,
    )

  const calculatedDebit =
    calculateDebitTotal(
      transactions,
    )

  const latestBalance =
    getLatestRunningBalance(
      transactions,
    )

  const accountBalance =
    accounts.reduce(
      (
        total,
        account,
      ) =>
        total +
        toNumber(
          account.balance,
        ),
      0,
    )

  const cashInBank =
    summary !== null
      ? toNumber(
          summary.balance,
        )
      : latestBalance ||
        accountBalance

  const totalCredit =
    summary !== null
      ? toNumber(
          summary.total_credit,
        )
      : calculatedCredit

  const totalDebit =
    summary !== null
      ? toNumber(
          summary.total_debit,
        )
      : calculatedDebit

  const totalTransactions =
    summary !== null
      ? summary.total_transactions
      : transactions.length

  return (
    <main className="foundation-content operations-page">
      <div className="dashboard-heading">
        <div>
          <p className="auth-eyebrow">
            BANKING · LIVE
          </p>

          <h2>
            Banking
          </h2>

          <p>
            See every connected
            account and live
            transaction in one
            place.
          </p>
        </div>

        <button
          type="button"
          className="auth-button compact"
          onClick={() =>
            setModal(
              'connect',
            )
          }
        >
          <Plus size={15} />
          Connect bank
          account
        </button>
      </div>

      {error && (
        <div
          className="operations-success"
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
              void loadBankingData(
                true,
              )
            }
          >
            Retry
          </button>
        </div>
      )}

      {message && (
        <div
          className="operations-success"
          role="status"
        >
          <CheckCircle2
            size={16}
          />

          <span>
            {message}
          </span>

          <button
            type="button"
            onClick={() =>
              setMessage('')
            }
            aria-label="Dismiss"
          >
            <X size={15} />
          </button>
        </div>
      )}

      <Kpis
        items={[
          [
            'Cash in bank',
            loading
              ? 'Loading...'
              : formatINR(
                  cashInBank,
                ),
            `${accounts.length} connected account${
              accounts.length ===
              1
                ? ''
                : 's'
            }`,
            'green',
          ],
          [
            'Money in',
            loading
              ? 'Loading...'
              : formatINR(
                  totalCredit,
                ),
            'Live credit transactions',
            'green',
          ],
          [
            'Money out',
            loading
              ? 'Loading...'
              : formatINR(
                  totalDebit,
                ),
            'Live debit transactions',
            'blue',
          ],
          [
            'Transactions',
            loading
              ? 'Loading...'
              : String(
                  totalTransactions,
                ),
            'Live transaction count',
            'blue',
          ],
        ]}
      />

      <section className="foundation-card finance-panel">
        <div className="panel-heading">
          <div>
            <h3>
              Connected bank
              accounts
            </h3>

            <p>
              Securely monitored
              accounts from
              CashGuard-AI
              backend.
            </p>
          </div>

          <button
            type="button"
            className="secondary-button"
            disabled={
              refreshing
            }
            onClick={() =>
              void loadBankingData(
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

        <div className="account-grid">
          {loading ? (
            <div className="operations-state">
              Loading live bank
              accounts...
            </div>
          ) : accounts.length ===
            0 ? (
            <div className="operations-state">
              No connected bank
              accounts found.
            </div>
          ) : (
            accounts.map(
              (
                account,
              ) => {
                const healthy =
                  [
                    'synced',
                    'healthy',
                  ].includes(
                    account.sync_status
                      ?.toLowerCase(),
                  )

                return (
                  <article
                    key={
                      account.id
                    }
                    className="account-card"
                  >
                    <div className="account-card-head">
                      <span className="bank-logo">
                        <Building2
                          size={17}
                        />
                      </span>

                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`More actions for ${
                          account.name ||
                          'bank account'
                        }`}
                      >
                        <MoreHorizontal
                          size={17}
                        />
                      </button>
                    </div>

                    <h4>
                      {account.name ||
                        'Bank Account'}
                    </h4>

                    <p>
                      {account.provider ||
                        'Bank'}{' '}
                      ·{' '}
                      {account.external_account_id ||
                        'N/A'}
                    </p>

                    <strong className="money">
                      {formatINR(
                        account.balance,
                      )}
                    </strong>

                    <div className="account-meta">
                      <span>
                        Currency
                        <br />
                        <b>
                          {account.currency ||
                            'INR'}
                        </b>
                      </span>

                      <span>
                        Synced
                        <br />
                        <b>
                          {formatRelativeSyncTime(
                            account.last_synced_at,
                          )}
                        </b>
                      </span>
                    </div>

                    <div className="account-foot">
                      <Status
                        tone={
                          healthy
                            ? 'green'
                            : 'amber'
                        }
                      >
                        {healthy
                          ? 'Healthy'
                          : account.sync_status ||
                            'Unknown'}
                      </Status>

                      <button
                        type="button"
                        onClick={() => {
                          setSelectedAccount(
                            account,
                          )

                          setModal(
                            'account',
                          )
                        }}
                      >
                        View details
                        <ChevronRight
                          size={
                            13
                          }
                        />
                      </button>
                    </div>
                  </article>
                )
              },
            )
          )}
        </div>
      </section>

      <section className="foundation-card finance-panel">
        <div className="panel-heading">
          <div>
            <h3>
              Banking activity
            </h3>

            <p>
              Live transactions
              from the selected
              business.
            </p>
          </div>
        </div>

        <Toolbar
          query={query}
          setQuery={setQuery}
          filter={filter}
          setFilter={setFilter}
          placeholder="Search description, reference or category"
        />

        <div className="finance-table-wrap">
          <table className="finance-table">
            <thead>
              <tr>
                <th>
                  Description
                </th>
                <th>
                  Type
                </th>
                <th>
                  Amount
                </th>
                <th>
                  Date
                </th>
                <th>
                  Category
                </th>
                <th>
                  Reference
                </th>
                <th>
                  Action
                </th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={7}
                    style={{
                      textAlign:
                        'center',
                      padding:
                        '34px 20px',
                    }}
                  >
                    Loading live
                    transactions...
                  </td>
                </tr>
              ) : visibleTransactions.length >
                0 ? (
                visibleTransactions.map(
                  (
                    row,
                  ) => {
                    const type =
                      normalizeTransactionType(
                        row.transaction_type,
                      )

                    return (
                      <tr
                        key={
                          row.id
                        }
                      >
                        <td>
                          <strong>
                            {row.description ||
                              'Bank transaction'}
                          </strong>

                          <small>
                            Business:{' '}
                            {
                              row.business_id
                            }
                          </small>
                        </td>

                        <td>
                          <span
                            className={
                              type ===
                              'Credit'
                                ? 'positive-text'
                                : 'danger-text'
                            }
                          >
                            {
                              type
                            }
                          </span>
                        </td>

                        <td>
                          <strong
                            className={
                              type ===
                              'Credit'
                                ? 'positive-text'
                                : 'danger-text'
                            }
                          >
                            {type ===
                            'Credit'
                              ? '+'
                              : '-'}
                            {formatINR(
                              row.amount,
                            )}
                          </strong>
                        </td>

                        <td>
                          {formatDate(
                            row.transaction_date,
                          )}
                        </td>

                        <td>
                          <Status tone="blue">
                            {row.category ||
                              'Uncategorized'}
                          </Status>
                        </td>

                        <td>
                          <small>
                            {row.reference_number ||
                              '—'}
                          </small>
                        </td>

                        <td>
                          <button
                            type="button"
                            className="table-action"
                            onClick={() => {
                              setSelectedTransaction(
                                row,
                              )

                              setModal(
                                'transaction',
                              )
                            }}
                          >
                            View
                            <ArrowUpRight
                              size={
                                13
                              }
                            />
                          </button>
                        </td>
                      </tr>
                    )
                  },
                )
              ) : (
                <tr>
                  <td
                    colSpan={7}
                    style={{
                      textAlign:
                        'center',
                      padding:
                        '34px 20px',
                    }}
                  >
                    No banking
                    records found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="foundation-card finance-panel">
        <div className="panel-heading">
          <div>
            <h3>
              Recent
              transactions
            </h3>

            <p>
              Latest live
              inflows and
              outflows.
            </p>
          </div>
        </div>

        <div className="transaction-list">
          {transactions
            .slice(
              0,
              8,
            )
            .map(
              (
                row,
              ) => {
                const type =
                  normalizeTransactionType(
                    row.transaction_type,
                  )

                return (
                  <button
                    type="button"
                    className="transaction-row"
                    key={
                      row.id
                    }
                    onClick={() => {
                      setSelectedTransaction(
                        row,
                      )

                      setModal(
                        'transaction',
                      )
                    }}
                  >
                    <span
                      className={`transaction-icon ${
                        type ===
                        'Credit'
                          ? 'inflow'
                          : 'outflow'
                      }`}
                    >
                      {type ===
                      'Credit'
                        ? '↑'
                        : '↓'}
                    </span>

                    <span>
                      <strong>
                        {row.description ||
                          'Bank transaction'}
                      </strong>

                      <small>
                        {row.category ||
                          'Uncategorized'}{' '}
                        ·{' '}
                        {formatDate(
                          row.transaction_date,
                        )}
                      </small>
                    </span>

                    <b
                      className={
                        type ===
                        'Credit'
                          ? 'positive-text'
                          : 'danger-text'
                      }
                    >
                      {type ===
                      'Credit'
                        ? '+'
                        : '-'}
                      {formatINR(
                        row.amount,
                      )}
                    </b>

                    <Status tone="green">
                      Live
                    </Status>
                  </button>
                )
              },
            )}

          {!loading &&
            transactions.length ===
              0 && (
              <div className="operations-state">
                No live
                transactions
                available.
              </div>
            )}
        </div>
      </section>

      {modal ===
        'connect' && (
        <Modal
          title="Connect bank account"
          onClose={() =>
            setModal(
              null,
            )
          }
        >
          <div className="finance-form">
            <Field label="Provider">
              <input
                defaultValue="sandbox"
                placeholder="sandbox"
              />
            </Field>

            <Field label="External account ID">
              <input
                placeholder="e.g. HDFC-001"
              />
            </Field>

            <Field label="Account name">
              <input
                placeholder="e.g. HDFC Current Account"
              />
            </Field>

            <Field label="Currency">
              <input
                defaultValue="INR"
                maxLength={3}
              />
            </Field>

            <Field label="Opening balance">
              <input
                type="number"
                min="0"
                placeholder="0"
              />
            </Field>

            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() =>
                  setModal(
                    null,
                  )
                }
              >
                Cancel
              </button>

              <button
                type="button"
                className="auth-button compact"
                onClick={() => {
                  setModal(
                    null,
                  )

                  setMessage(
                    'Bank account connection form is ready for backend submission.',
                  )
                }}
              >
                <CreditCard
                  size={
                    14
                  }
                />
                Connect account
              </button>
            </div>
          </div>
        </Modal>
      )}

      {modal ===
        'account' &&
        selectedAccount && (
          <Modal
            title={`${selectedAccount.name || 'Bank Account'} details`}
            onClose={() =>
              setModal(
                null,
              )
            }
          >
            <div className="detail-list">
              <p>
                <span>
                  Provider
                </span>

                <b>
                  {
                    selectedAccount.provider
                  }
                </b>
              </p>

              <p>
                <span>
                  External Account
                  ID
                </span>

                <b>
                  {
                    selectedAccount.external_account_id
                  }
                </b>
              </p>

              <p>
                <span>
                  Currency
                </span>

                <b>
                  {
                    selectedAccount.currency
                  }
                </b>
              </p>

              <p>
                <span>
                  Current Balance
                </span>

                <b>
                  {formatINR(
                    selectedAccount.balance,
                  )}
                </b>
              </p>

              <p>
                <span>
                  Sync Status
                </span>

                <Status
                  tone={
                    selectedAccount.sync_status
                      ?.toLowerCase() ===
                    'synced'
                      ? 'green'
                      : 'amber'
                  }
                >
                  {
                    selectedAccount.sync_status
                  }
                </Status>
              </p>

              <p>
                <span>
                  Last Synced
                </span>

                <b>
                  {formatRelativeSyncTime(
                    selectedAccount.last_synced_at,
                  )}
                </b>
              </p>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() =>
                  void loadBankingData(
                    true,
                  )
                }
              >
                <RefreshCw
                  size={
                    14
                  }
                />
                Refresh data
              </button>

              <button
                type="button"
                className="auth-button compact"
                onClick={() =>
                  setModal(
                    null,
                  )
                }
              >
                Close
              </button>
            </div>
          </Modal>
        )}

      {modal ===
        'transaction' &&
        selectedTransaction && (
          <Modal
            title={`Transaction · ${
              selectedTransaction.reference_number ||
              selectedTransaction.id
            }`}
            onClose={() =>
              setModal(
                null,
              )
            }
          >
            <div className="detail-list">
              <p>
                <span>
                  Transaction ID
                </span>

                <b>
                  {
                    selectedTransaction.id
                  }
                </b>
              </p>

              <p>
                <span>
                  Description
                </span>

                <b>
                  {
                    selectedTransaction.description
                  }
                </b>
              </p>

              <p>
                <span>
                  Type
                </span>

                <b>
                  {normalizeTransactionType(
                    selectedTransaction.transaction_type,
                  )}
                </b>
              </p>

              <p>
                <span>
                  Amount
                </span>

                <b>
                  {formatINR(
                    selectedTransaction.amount,
                  )}
                </b>
              </p>

              <p>
                <span>
                  Running Balance
                </span>

                <b>
                  {formatINR(
                    selectedTransaction.running_balance,
                  )}
                </b>
              </p>

              <p>
                <span>
                  Transaction
                  Date
                </span>

                <b>
                  {formatDate(
                    selectedTransaction.transaction_date,
                  )}
                </b>
              </p>

              <p>
                <span>
                  Category
                </span>

                <b>
                  {
                    selectedTransaction.category
                  }
                </b>
              </p>

              <p>
                <span>
                  Reference
                </span>

                <b>
                  {selectedTransaction.reference_number ||
                    'N/A'}
                </b>
              </p>

              <p>
                <span>
                  Customer ID
                </span>

                <b>
                  {selectedTransaction.customer_id ||
                    'N/A'}
                </b>
              </p>

              <p>
                <span>
                  Supplier ID
                </span>

                <b>
                  {selectedTransaction.supplier_id ||
                    'N/A'}
                </b>
              </p>

              <p>
                <span>
                  Invoice Payment
                  ID
                </span>

                <b>
                  {
                    selectedTransaction.invoice_payment_id ||
                      'N/A'
                  }
                </b>
              </p>

              <p>
                <span>
                  Expense ID
                </span>

                <b>
                  {selectedTransaction.expense_id ||
                    'N/A'}
                </b>
              </p>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setModal(
                    null,
                  )

                  setMessage(
                    `${
                      selectedTransaction.reference_number ||
                      selectedTransaction.id
                    } is ready for reconciliation.`,
                  )
                }}
              >
                <CheckCircle2
                  size={
                    14
                  }
                />
                Mark for
                Reconciliation
              </button>

              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setModal(
                    null,
                  )

                  setMessage(
                    `${
                      selectedTransaction.reference_number ||
                      selectedTransaction.id
                    } flagged for review.`,
                  )
                }}
              >
                <AlertCircle
                  size={
                    14
                  }
                />
                Flag for
                Review
              </button>
            </div>
          </Modal>
        )}
    </main>
  )
}

// ============================================================
// PAYMENTS PAGE — LIVE + AI
// ============================================================

export function PaymentsPage() {
  const [
    transactions,
    setTransactions,
  ] = useState<
    ApiBankTransaction[]
  >([])

  const [
    accounts,
    setAccounts,
  ] = useState<
    ApiBankAccount[]
  >([])

  const [
    bankingSummary,
    setBankingSummary,
  ] =
    useState<ApiBankingSummary | null>(
      null,
    )

  const [
    invoices,
    setInvoices,
  ] = useState<
    ApiInvoice[]
  >([])

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
  ] = useState<string | null>(
    null,
  )

  const [
    query,
    setQuery,
  ] = useState('')

  const [
    tab,
    setTab,
  ] = useState('All')

  const [
    methodFilter,
    setMethodFilter,
  ] = useState('All')

  const [
    modal,
    setModal,
  ] = useState<
    | 'payment'
    | 'detail'
    | 'ai'
    | 'qr'
    | null
  >(null)

  const [
    selectedPayment,
    setSelectedPayment,
  ] =
    useState<NormalizedPayment | null>(
      null,
    )

  const [
    message,
    setMessage,
  ] = useState('')

  const [
    paymentMode,
    setPaymentMode,
  ] =
    useState<PaymentMode>(
      'Vendor payment',
    )

  const [
    paymentMethod,
    setPaymentMethod,
  ] =
    useState<PaymentMethod>(
      'Bank Transfer',
    )

  const [
    counterparty,
    setCounterparty,
  ] = useState('')

  const [
    amount,
    setAmount,
  ] = useState('')

  const [
    accountNumber,
    setAccountNumber,
  ] = useState('')

  const [
    ifsc,
    setIfsc,
  ] = useState('')

  const [
    upiId,
    setUpiId,
  ] = useState('')

  const [
    reference,
    setReference,
  ] = useState('')

  const [
    notes,
    setNotes,
  ] = useState('')

  const [
    invoiceId,
    setInvoiceId,
  ] = useState('')

  const [
    qrText,
    setQrText,
  ] = useState('')

  const [
    aiQuestion,
    setAiQuestion,
  ] = useState('')

  const [
    aiAnswer,
    setAiAnswer,
  ] = useState('')

  const [
    aiLoading,
    setAiLoading,
  ] = useState(false)

  const businessId =
    getBusinessId()

  // ==========================================================
  // LOAD LIVE PAYMENT DATA
  // ==========================================================

  const loadPaymentsData =
    async (
      showRefreshing = false,
    ) => {
      const id =
        getBusinessId()

      if (!id) {
        setError(
          'Business ID is missing. Configure NEXT_PUBLIC_BUSINESS_ID in frontend/.env.local.',
        )

        setLoading(false)
        return
      }

      try {
        setError(null)

        if (showRefreshing) {
          setRefreshing(true)
        } else {
          setLoading(true)
        }

        const [
          transactionResponse,
          accountResponse,
          summaryResponse,
          invoiceResponse,
        ] =
          await Promise.all([
            fetchAllBankTransactions(
              id,
            ),

            optionalCashGuardApiFetch<
              ApiBankAccount[]
            >(
              '/api/banking/accounts',
            ),

            optionalCashGuardApiFetch<
              ApiBankingSummary
            >(
              `/api/banking/transactions/summary?business_id=${encodeURIComponent(businessId)}`,
            ),

            optionalCashGuardApiFetch<
              | ApiInvoice[]
              | {
                  data?: ApiInvoice[]
                }
            >(
              '/api/invoices?limit=500&offset=0',
            ),
          ])

        setTransactions(
          Array.isArray(
            transactionResponse,
          )
            ? transactionResponse
            : [],
        )

        setAccounts(
          Array.isArray(
            accountResponse,
          )
            ? accountResponse
            : [],
        )

        setBankingSummary(
          summaryResponse,
        )

        if (
          Array.isArray(
            invoiceResponse,
          )
        ) {
          setInvoices(
            invoiceResponse,
          )
        } else if (
          Array.isArray(
            invoiceResponse?.data,
          )
        ) {
          setInvoices(
            invoiceResponse.data,
          )
        } else {
          setInvoices([])
        }
      } catch (
        err
      ) {
        const apiError =
          err as {
            status?: number
          }

        if (
          apiError?.status ===
          401
        ) {
          setError(
            'Authentication failed. Please login again.',
          )
        } else if (
          apiError?.status ===
          403
        ) {
          setError(
            'You are not authorized to access payment and banking data.',
          )
        } else {
          setError(
            err instanceof Error
              ? err.message
              : 'Unable to load payment data.',
          )
        }
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    }

  useEffect(() => {
    void loadPaymentsData()

    const handleAuthChanged =
      () => {
        void loadPaymentsData(
          true,
        )
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
  }, [])

  // ==========================================================
  // LIVE PAYMENT NORMALIZATION
  // ==========================================================

  const paymentRows =
    useMemo<
      NormalizedPayment[]
    >(
      () =>
        transactions.map(
          (
            transaction,
          ) => {
            const type =
              normalizeTransactionType(
                transaction.transaction_type,
              )

            const category =
              (
                transaction.category ||
                ''
              ).toLowerCase()

            const description =
              (
                transaction.description ||
                ''
              ).toLowerCase()

            let paymentType:
              PaymentMode =
              'Vendor payment'

            if (
              type ===
                'Credit' ||
              category.includes(
                'customer',
              ) ||
              category.includes(
                'receipt',
              ) ||
              description.includes(
                'invoice receipt',
              )
            ) {
              paymentType =
                'Customer collection'
            }

            let method =
              'Bank Transfer'

            if (
              category.includes(
                'upi',
              ) ||
              description.includes(
                'upi',
              )
            ) {
              method = 'UPI'
            } else if (
              category.includes(
                'rtgs',
              ) ||
              description.includes(
                'rtgs',
              )
            ) {
              method = 'RTGS'
            } else if (
              category.includes(
                'neft',
              ) ||
              description.includes(
                'neft',
              )
            ) {
              method = 'NEFT'
            } else if (
              category.includes(
                'transfer',
              ) ||
              description.includes(
                'transfer',
              )
            ) {
              method =
                'Bank Transfer'
            }

            return {
              id:
                transaction.reference_number ||
                transaction.id,

              counterparty:
                transaction.customer_id ||
                transaction.supplier_id ||
                (
                  paymentType ===
                  'Customer collection'
                    ? 'Customer'
                    : 'Supplier'
                ),

              type:
                paymentType,

              amount:
                Math.abs(
                  toNumber(
                    transaction.amount,
                  ),
                ),

              date:
                transaction.transaction_date,

              method,

              status:
                'Completed',

              reference:
                transaction.reference_number ||
                transaction.id,

              notes:
                transaction.description ||
                '',

              transaction,
            }
          },
        ),
      [
        transactions,
      ],
    )

  // ==========================================================
  // FILTERED PAYMENTS
  // ==========================================================

  const visiblePayments =
    useMemo(
      () =>
        paymentRows.filter(
          (
            row,
          ) => {
            const searchable =
              [
                row.id,
                row.counterparty,
                row.type,
                row.method,
                row.reference,
                row.notes,
              ]
                .join(' ')
                .toLowerCase()

            const matchesQuery =
              searchable.includes(
                query
                  .trim()
                  .toLowerCase(),
              )

            const matchesTab =
              tab ===
                'All' ||
              row.status ===
                tab ||
              (tab ===
                'Upcoming' &&
                row.status ===
                  'Scheduled')

            const matchesMethod =
              methodFilter ===
                'All' ||
              row.method ===
                methodFilter

            return (
              matchesQuery &&
              matchesTab &&
              matchesMethod
            )
          },
        ),
      [
        paymentRows,
        query,
        tab,
        methodFilter,
      ],
    )

  // ==========================================================
  // KPI DATA
  // ==========================================================

  const totalReceived =
    bankingSummary !==
    null
      ? toNumber(
          bankingSummary.total_credit,
        )
      : calculateCreditTotal(
          transactions,
        )

  const totalSent =
    bankingSummary !==
    null
      ? toNumber(
          bankingSummary.total_debit,
        )
      : calculateDebitTotal(
          transactions,
        )

  const currentBalance =
    bankingSummary !==
    null
      ? toNumber(
          bankingSummary.balance,
        )
      : getLatestRunningBalance(
          transactions,
        )

  const pendingCollections =
    invoices.reduce(
      (
        total,
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

        return (
          total +
          outstanding
        )
      },
      0,
    )

  const completedPayments =
    paymentRows.filter(
      (row) =>
        row.status ===
        'Completed',
    )

  const completedAmount =
    completedPayments.reduce(
      (
        total,
        row,
      ) =>
        total +
        row.amount,
      0,
    )

  // ==========================================================
  // PAYMENT FORM RESET
  // ==========================================================

  function resetPaymentForm() {
    setPaymentMode(
      'Vendor payment',
    )

    setPaymentMethod(
      'Bank Transfer',
    )

    setCounterparty('')
    setAmount('')
    setAccountNumber('')
    setIfsc('')
    setUpiId('')
    setReference('')
    setNotes('')
    setInvoiceId('')
  }

  // ==========================================================
  // PAYMENT REQUEST VALIDATION
  // ==========================================================

  function validatePaymentForm(): string | null {
    const numericAmount =
      Number(amount)

    if (
      !counterparty.trim()
    ) {
      return 'Counterparty is required.'
    }

    if (
      !Number.isFinite(
        numericAmount,
      ) ||
      numericAmount <= 0
    ) {
      return 'Enter a valid payment amount.'
    }

    if (
      paymentMethod ===
      'UPI'
    ) {
      if (
        !upiId.trim()
      ) {
        return 'UPI ID is required.'
      }
    }

    if (
      paymentMethod ===
        'NEFT' ||
      paymentMethod ===
        'RTGS' ||
      paymentMethod ===
        'Bank Transfer'
    ) {
      if (
        !accountNumber.trim()
      ) {
        return 'Beneficiary account number is required.'
      }

      if (!ifsc.trim()) {
        return 'IFSC is required.'
      }
    }

    if (
      paymentMode ===
        'Customer collection' &&
      !invoiceId.trim()
    ) {
      return 'Select an invoice for customer collection.'
    }

    return null
  }

  // ==========================================================
  // PAYMENT REQUEST
  // ==========================================================

  function submitPayment(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault()

    const validation =
      validatePaymentForm()

    if (validation) {
      setMessage(
        validation,
      )
      return
    }

    /*
     * IMPORTANT:
     * We do not fabricate bank transfer success.
     * The current verified backend contract available in this
     * project exposes banking data and payment router registration,
     * but the exact transfer-creation request schema has not been
     * established from the current route contract.
     *
     * Therefore this step prepares and validates the request
     * without claiming that money was transferred.
     */

    const numericAmount =
      Number(amount)

    setMessage(
      `${paymentMethod} payment request prepared for ${formatINR(
        numericAmount,
      )}. No transfer was marked successful without backend confirmation.`,
    )

    setModal(null)
  }

  // ==========================================================
  // GENERATE QR
  // ==========================================================

  function generatePaymentQR() {
    const numericAmount =
      Number(amount)

    if (
      !counterparty.trim()
    ) {
      setMessage(
        'Enter the payee/customer before generating QR.',
      )
      return
    }

    if (
      !Number.isFinite(
        numericAmount,
      ) ||
      numericAmount <= 0
    ) {
      setMessage(
        'Enter a valid amount before generating QR.',
      )
      return
    }

    let payload = ''

    if (
      upiId.trim()
    ) {
      payload =
        `upi://pay?pa=${encodeURIComponent(
          upiId.trim(),
        )}` +
        `&pn=${encodeURIComponent(
          counterparty.trim(),
        )}` +
        `&am=${numericAmount.toFixed(
          2,
        )}` +
        `&cu=INR` +
        `${
          reference.trim()
            ? `&tn=${encodeURIComponent(
                reference.trim(),
              )}`
            : ''
        }`
    } else {
      payload = [
        'CashGuard-AI',
        `Business=${
          businessId || ''
        }`,
        `Payee=${counterparty.trim()}`,
        `Amount=${numericAmount.toFixed(
          2,
        )}`,
        `Reference=${
          reference.trim() ||
          'N/A'
        }`,
      ].join('|')
    }

    setQrText(
      payload,
    )

    setModal(
      'qr',
    )
  }

  // ==========================================================
  // REAL AI CALL
  // ==========================================================

  async function askCashGuardAI() {
    const question =
      aiQuestion.trim()

    if (!question) {
      setAiAnswer(
        'Please enter a question for CashGuard AI.',
      )
      return
    }

    setAiLoading(true)
    setAiAnswer('')

    try {
      const prompt = [
        'You are CashGuard-AI payment assistant.',
        'Use ONLY the supplied live business data.',
        'Do not invent transactions, payments, balances, customers, suppliers, or future events.',
        'Do not claim money has been transferred unless the backend explicitly confirms it.',
        '',
        `Business ID: ${
          businessId || 'unknown'
        }`,
        `Current observed bank balance: ${formatINR(
          currentBalance,
        )}`,
        `Total credit activity: ${formatINR(
          totalReceived,
        )}`,
        `Total debit activity: ${formatINR(
          totalSent,
        )}`,
        `Outstanding invoice value: ${formatINR(
          pendingCollections,
        )}`,
        `Live transactions loaded: ${
          transactions.length
        }`,
        `Connected accounts: ${
          accounts.length
        }`,
        '',
        'Question:',
        question,
        '',
        'Answer in a practical MSME finance-assistant style.',
        'Clearly separate observed facts from recommendations.',
      ].join('\n')

      const result =
        await cashGuardApiFetch<{
          success?: boolean
          model?: string
          response?: string
          done?: boolean
        }>(
          '/ai/chat',
          {
            method:
              'POST',

            body:
              JSON.stringify({
                prompt,
                system_prompt:
                  'CashGuard-AI must use real supplied data only and must never fabricate financial events.',
              }),
          },
        )

      if (
        result?.response
      ) {
        setAiAnswer(
          result.response,
        )
      } else {
        setAiAnswer(
          'CashGuard AI returned no response.',
        )
      }
    } catch (
      err
    ) {
      setAiAnswer(
        err instanceof Error
          ? err.message
          : 'Unable to reach CashGuard AI.',
      )
    } finally {
      setAiLoading(false)
    }
  }

  // ==========================================================
  // AI PAYMENT RISK CHECK
  // ==========================================================

  async function runPaymentRiskCheck() {
    const numericAmount =
      Number(amount)

    if (
      !Number.isFinite(
        numericAmount,
      ) ||
      numericAmount <= 0
    ) {
      setAiAnswer(
        'Enter a valid payment amount first.',
      )

      return
    }

    const remaining =
      currentBalance -
      numericAmount

    const prompt = [
      'Assess this proposed business payment using only the supplied facts.',
      'Do not say the transfer succeeded.',
      'Do not invent future obligations.',
      '',
      `Current observed balance: ${formatINR(
        currentBalance,
      )}`,
      `Proposed payment: ${formatINR(
        numericAmount,
      )}`,
      `Remaining balance if executed: ${formatINR(
        remaining,
      )}`,
      `Payment mode: ${paymentMode}`,
      `Payment method: ${paymentMethod}`,
      `Counterparty: ${
        counterparty || 'Not provided'
      }`,
      `Outstanding invoice value: ${formatINR(
        pendingCollections,
      )}`,
      `Live transaction count: ${
        transactions.length
      }`,
      '',
      'Give:',
      '1. liquidity assessment',
      '2. main risk',
      '3. recommendation',
      '4. confidence note',
    ].join('\n')

    setAiLoading(true)
    setAiAnswer('')

    try {
      const result =
        await cashGuardApiFetch<{
          response?: string
        }>(
          '/ai/chat',
          {
            method:
              'POST',

            body:
              JSON.stringify({
                prompt,
                system_prompt:
                  'You are a cautious MSME payment-risk assistant. Never fabricate financial facts.',
              }),
          },
        )

      setAiAnswer(
        result?.response ||
          `After a proposed payment of ${formatINR(
            numericAmount,
          )}, the observed balance would be approximately ${formatINR(
            remaining,
          )}.`,
      )
    } catch (
      err
    ) {
      setAiAnswer(
        err instanceof Error
          ? err.message
          : 'Unable to calculate AI payment assessment.',
      )
    } finally {
      setAiLoading(false)
    }
  }

  // ==========================================================
  // HELPER STATUS TONE
  // ==========================================================

  function statusTone(
    status: Payment['status'],
  ): Tone {
    if (
      status ===
      'Completed'
    ) {
      return 'green'
    }

    if (
      status ===
        'Failed' ||
      status ===
        'Cancelled'
    ) {
      return 'red'
    }

    if (
      status ===
        'Pending' ||
      status ===
        'Processing'
    ) {
      return 'amber'
    }

    return 'blue'
  }

  // ==========================================================
  // ACCOUNT TOTAL
  // ==========================================================

  const accountTotal =
    accounts.reduce(
      (
        total,
        account,
      ) =>
        total +
        toNumber(
          account.balance,
        ),
      0,
    )

  return (
    <main className="foundation-content operations-page">

      {/* ====================================================== */}
      {/* HEADER */}
      {/* ====================================================== */}

      <div className="dashboard-heading">
        <div>
          <p className="auth-eyebrow">
            PAYMENTS · LIVE
          </p>

          <h2>
            Payments
          </h2>

          <p>
            Manage business
            payments with live
            banking data and
            CashGuard AI
            assistance.
          </p>
        </div>

        <div
          style={{
            display:
              'flex',
            gap: '8px',
            flexWrap:
              'wrap',
          }}
        >
          <button
            type="button"
            className="secondary-button"
            disabled={
              refreshing
            }
            onClick={() =>
              void loadPaymentsData(
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

          <button
            type="button"
            className="auth-button compact"
            onClick={() => {
              resetPaymentForm()

              setModal(
                'payment',
              )
            }}
          >
            <Plus size={15} />
            Make Payment
          </button>
        </div>
      </div>

      {/* ====================================================== */}
      {/* ERROR */}
      {/* ====================================================== */}

      {error && (
        <div
          className="operations-success"
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
              void loadPaymentsData(
                true,
              )
            }
          >
            Retry
          </button>
        </div>
      )}

      {/* ====================================================== */}
      {/* MESSAGE */}
      {/* ====================================================== */}

      {message && (
        <div
          className="operations-success"
          role="status"
        >
          <CheckCircle2
            size={16}
          />

          <span>
            {message}
          </span>

          <button
            type="button"
            onClick={() =>
              setMessage('')
            }
            aria-label="Dismiss"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* ====================================================== */}
      {/* KPIs */}
      {/* ====================================================== */}

      <Kpis
        items={[
          [
            'Available cash',
            loading
              ? 'Loading...'
              : formatINR(
                  currentBalance,
                ),
            `${accounts.length} connected account${
              accounts.length ===
              1
                ? ''
                : 's'
            }`,
            'green',
          ],
          [
            'Money received',
            loading
              ? 'Loading...'
              : formatINR(
                  totalReceived,
                ),
            'Live credit activity',
            'green',
          ],
          [
            'Money sent',
            loading
              ? 'Loading...'
              : formatINR(
                  totalSent,
                ),
            'Live debit activity',
            'blue',
          ],
          [
            'Completed payments',
            loading
              ? 'Loading...'
              : formatINR(
                  completedAmount,
                ),
            `${completedPayments.length} completed records`,
            'green',
          ],
        ]}
      />

      {/* ====================================================== */}
      {/* QUICK PAYMENT CENTER */}
      {/* ====================================================== */}

      <section
        className="foundation-card finance-panel"
        style={{
          marginTop:
            '14px',
        }}
      >
        <div className="panel-heading">
          <div>
            <p className="auth-eyebrow">
              PAYMENT CENTER
            </p>

            <h3>
              Quick Payment
            </h3>

            <p>
              Start a bank payment,
              UPI payment or QR
              collection flow.
            </p>
          </div>

          <Status tone="green">
            Banking Live
          </Status>
        </div>

        <div
          style={{
            display:
              'grid',
            gridTemplateColumns:
              'repeat(auto-fit, minmax(150px, 1fr))',
            gap:
              '10px',
            marginTop:
              '16px',
          }}
        >
          {[
            [
              'UPI',
              'Fast UPI payment',
            ],
            [
              'QR',
              'Generate payment QR',
            ],
            [
              'NEFT',
              'Bank transfer',
            ],
            [
              'RTGS',
              'High-value transfer',
            ],
            [
              'Bank Transfer',
              'Direct transfer',
            ],
          ].map(
            ([
              label,
              description,
            ]) => (
              <button
                type="button"
                key={
                  label
                }
                onClick={() => {
                  resetPaymentForm()

                  setPaymentMethod(
                    label as PaymentMethod,
                  )

                  setModal(
                    'payment',
                  )
                }}
                style={{
                  display:
                    'flex',
                  flexDirection:
                    'column',
                  alignItems:
                    'flex-start',
                  gap:
                    '6px',
                  padding:
                    '14px',
                  border:
                    '1px solid #dbe4ee',
                  borderRadius:
                    '10px',
                  background:
                    '#fff',
                  textAlign:
                    'left',
                  cursor:
                    'pointer',
                }}
              >
                <strong
                  style={{
                    color:
                      '#0f172a',
                    fontSize:
                      '13px',
                  }}
                >
                  {label}
                </strong>

                <small
                  style={{
                    color:
                      '#64748b',
                    fontSize:
                      '9px',
                  }}
                >
                  {
                    description
                  }
                </small>
              </button>
            ),
          )}
        </div>
      </section>

      {/* ====================================================== */}
      {/* LIVE BANK + AI */}
      {/* ====================================================== */}

      <div
        style={{
          display:
            'grid',
          gridTemplateColumns:
            'minmax(0, 1.2fr) minmax(300px, .8fr)',
          gap:
            '14px',
          marginTop:
            '14px',
        }}
      >
        <section className="foundation-card finance-panel">
          <div className="panel-heading">
            <div>
              <p className="auth-eyebrow">
                LIVE BANKING
              </p>

              <h3>
                Bank Accounts
              </h3>

              <p>
                Current account
                balances available
                for payment
                decisions.
              </p>
            </div>
          </div>

          <div
            style={{
              display:
                'grid',
              gridTemplateColumns:
                'repeat(auto-fit, minmax(210px, 1fr))',
              gap:
                '10px',
              marginTop:
                '16px',
            }}
          >
            {accounts.length >
            0 ? (
              accounts.map(
                (
                  account,
                ) => (
                  <div
                    key={
                      account.id
                    }
                    style={{
                      padding:
                        '13px',
                      border:
                        '1px solid #e2e8f0',
                      borderRadius:
                        '9px',
                      background:
                        '#f8fafc',
                    }}
                  >
                    <strong>
                      {account.name ||
                        'Bank Account'}
                    </strong>

                    <small
                      style={{
                        display:
                          'block',
                        marginTop:
                          '4px',
                        color:
                          '#64748b',
                        fontSize:
                          '9px',
                      }}
                    >
                      {
                        account.provider
                      }{' '}
                      ·{' '}
                      {
                        account.external_account_id ||
                        'N/A'
                      }
                    </small>

                    <strong
                      style={{
                        display:
                          'block',
                        marginTop:
                          '12px',
                        fontSize:
                          '18px',
                      }}
                    >
                      {formatINR(
                        account.balance,
                      )}
                    </strong>

                    <small
                      style={{
                        display:
                          'block',
                        marginTop:
                          '5px',
                        color:
                          '#64748b',
                        fontSize:
                          '9px',
                      }}
                    >
                      Synced{' '}
                      {formatRelativeSyncTime(
                        account.last_synced_at,
                      )}
                    </small>
                  </div>
                ),
              )
            ) : (
              <div className="operations-state">
                No live bank
                accounts found.
              </div>
            )}
          </div>

          <div
            style={{
              marginTop:
                '12px',
              padding:
                '12px',
              border:
                '1px solid #dbeafe',
              borderRadius:
                '8px',
              background:
                '#f8fbff',
              display:
                'flex',
              justifyContent:
                'space-between',
              gap:
                '10px',
            }}
          >
            <span
              style={{
                color:
                  '#64748b',
                fontSize:
                  '10px',
              }}
            >
              Account total
            </span>

            <strong>
              {formatINR(
                accountTotal,
              )}
            </strong>
          </div>
        </section>

        <section
          className="foundation-card finance-panel"
          style={{
            background:
              '#f0f9ff',
            border:
              '1px solid #bae6fd',
          }}
        >
          <div className="panel-heading">
            <div>
              <p className="auth-eyebrow">
                CASHGUARD AI
              </p>

              <h3>
                Payment Assistant
              </h3>

              <p>
                Ask AI using the
                actual loaded banking
                data.
              </p>
            </div>

            <Sparkles
              size={18}
            />
          </div>

          <div
            style={{
              marginTop:
                '15px',
              padding:
                '13px',
              background:
                '#fff',
              border:
                '1px solid #dbeafe',
              borderRadius:
                '9px',
            }}
          >
            <small>
              OBSERVED BALANCE
            </small>

            <strong
              style={{
                display:
                  'block',
                marginTop:
                  '5px',
                fontSize:
                  '21px',
              }}
            >
              {formatINR(
                currentBalance,
              )}
            </strong>

            <small
              style={{
                display:
                  'block',
                marginTop:
                  '9px',
              }}
            >
              Outstanding
              invoices
            </small>

            <strong
              style={{
                display:
                  'block',
                marginTop:
                  '4px',
                fontSize:
                  '15px',
              }}
            >
              {formatINR(
                pendingCollections,
              )}
            </strong>
          </div>

          <button
            type="button"
            className="auth-button compact"
            style={{
              width:
                '100%',
              marginTop:
                '10px',
            }}
            onClick={() => {
              setAiAnswer('')
              setAiQuestion('')

              setModal(
                'ai',
              )
            }}
          >
            <Sparkles
              size={14}
            />
            Ask CashGuard AI
          </button>

          <button
            type="button"
            className="secondary-button"
            style={{
              width:
                '100%',
              marginTop:
                '8px',
            }}
            onClick={() => {
              setAiAnswer('')
              setModal(
                'ai',
              )
            }}
          >
            Check payment risk
          </button>
        </section>
      </div>

      {/* ====================================================== */}
      {/* PAYMENT REGISTER */}
      {/* ====================================================== */}

      <section
        className="foundation-card finance-panel"
        style={{
          marginTop:
            '14px',
        }}
      >
        <div className="panel-heading">
          <div>
            <p className="auth-eyebrow">
              LIVE PAYMENT ACTIVITY
            </p>

            <h3>
              Payment Register
            </h3>

            <p>
              Derived from live
              banking transaction
              data.
            </p>
          </div>
        </div>

        <div className="finance-toolbar">
          <div className="search-control">
            <Search size={16} />

            <input
              type="search"
              placeholder="Search payment, reference or counterparty"
              value={query}
              onChange={(
                event,
              ) =>
                setQuery(
                  event.target.value,
                )
              }
            />
          </div>

          <select
            value={tab}
            onChange={(
              event,
            ) =>
              setTab(
                event.target.value,
              )
            }
          >
            <option value="All">
              All
            </option>

            <option value="Completed">
              Completed
            </option>

            <option value="Pending">
              Pending
            </option>

            <option value="Processing">
              Processing
            </option>

            <option value="Failed">
              Failed
            </option>
          </select>

          <select
            value={
              methodFilter
            }
            onChange={(
              event,
            ) =>
              setMethodFilter(
                event.target.value,
              )
            }
          >
            <option value="All">
              All methods
            </option>

            <option value="UPI">
              UPI
            </option>

            <option value="NEFT">
              NEFT
            </option>

            <option value="RTGS">
              RTGS
            </option>

            <option value="Bank Transfer">
              Bank Transfer
            </option>
          </select>

          {(query ||
            tab !== 'All' ||
            methodFilter !==
              'All') && (
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                setQuery('')
                setTab(
                  'All',
                )
                setMethodFilter(
                  'All',
                )
              }}
            >
              <X size={14} />
              Clear
            </button>
          )}
        </div>

        <div className="finance-table-wrap">
          <table className="finance-table payment-table">
            <thead>
              <tr>
                <th>
                  Payment
                </th>

                <th>
                  Type
                </th>

                <th>
                  Counterparty
                </th>

                <th>
                  Method
                </th>

                <th>
                  Amount
                </th>

                <th>
                  Date
                </th>

                <th>
                  Status
                </th>

                <th>
                  Action
                </th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={
                      8
                    }
                    style={{
                      textAlign:
                        'center',
                      padding:
                        '34px 20px',
                    }}
                  >
                    Loading live
                    payments...
                  </td>
                </tr>
              ) : visiblePayments.length >
                0 ? (
                visiblePayments
                  .slice(
                    0,
                    100,
                  )
                  .map(
                    (
                      row,
                    ) => (
                      <tr
                        key={
                          row.id
                        }
                      >
                        <td>
                          <strong>
                            {
                              row.id
                            }
                          </strong>

                          <small>
                            {
                              row.reference
                            }
                          </small>
                        </td>

                        <td>
                          {
                            row.type
                          }
                        </td>

                        <td>
                          {
                            row.counterparty
                          }
                        </td>

                        <td>
                          <Status tone="blue">
                            {
                              row.method
                            }
                          </Status>
                        </td>

                        <td>
                          <strong
                            className={
                              row.type ===
                              'Customer collection'
                                ? 'positive-text'
                                : 'danger-text'
                            }
                          >
                            {row.type ===
                            'Customer collection'
                              ? '+'
                              : '-'}
                            {formatINR(
                              row.amount,
                            )}
                          </strong>
                        </td>

                        <td>
                          {formatDate(
                            row.date,
                          )}
                        </td>

                        <td>
                          <Status
                            tone={statusTone(
                              row.status,
                            )}
                          >
                            {
                              row.status
                            }
                          </Status>
                        </td>

                        <td>
                          <button
                            type="button"
                            className="table-action"
                            onClick={() => {
                              setSelectedPayment(
                                row,
                              )

                              setModal(
                                'detail',
                              )
                            }}
                          >
                            View
                            <ArrowUpRight
                              size={
                                13
                              }
                            />
                          </button>
                        </td>
                      </tr>
                    ),
                  )
              ) : (
                <tr>
                  <td
                    colSpan={
                      8
                    }
                    style={{
                      textAlign:
                        'center',
                      padding:
                        '34px 20px',
                    }}
                  >
                    No live payment
                    activity found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ====================================================== */}
      {/* COLLECTION MONITOR */}
      {/* ====================================================== */}

      <section
        className="foundation-card finance-panel"
        style={{
          marginTop:
            '14px',
        }}
      >
        <div className="panel-heading">
          <div>
            <p className="auth-eyebrow">
              COLLECTION MONITOR
            </p>

            <h3>
              Customer Collections
            </h3>

            <p>
              Invoice-backed customer
              collection workflow.
            </p>
          </div>

          <Status tone="blue">
            {
              invoices.length
            }{' '}
            invoices
          </Status>
        </div>

        <div
          style={{
            display:
              'grid',
            gridTemplateColumns:
              'repeat(auto-fit, minmax(170px, 1fr))',
            gap:
              '10px',
            marginTop:
              '16px',
          }}
        >
          <div
            style={{
              padding:
                '13px',
              border:
                '1px solid #e2e8f0',
              borderRadius:
                '9px',
            }}
          >
            <small>
              Outstanding
            </small>

            <strong
              style={{
                display:
                  'block',
                marginTop:
                  '6px',
                fontSize:
                  '17px',
              }}
            >
              {formatINR(
                pendingCollections,
              )}
            </strong>
          </div>

          <div
            style={{
              padding:
                '13px',
              border:
                '1px solid #e2e8f0',
              borderRadius:
                '9px',
            }}
          >
            <small>
              Received
            </small>

            <strong
              style={{
                display:
                  'block',
                marginTop:
                  '6px',
                fontSize:
                  '17px',
              }}
            >
              {formatINR(
                totalReceived,
              )}
            </strong>
          </div>

          <div
            style={{
              padding:
                '13px',
              border:
                '1px solid #e2e8f0',
              borderRadius:
                '9px',
            }}
          >
            <small>
              Live transactions
            </small>

            <strong
              style={{
                display:
                  'block',
                marginTop:
                  '6px',
                fontSize:
                  '17px',
              }}
            >
              {
                transactions.length
              }
            </strong>
          </div>
        </div>

        <div
          style={{
            display:
              'flex',
            gap:
              '8px',
            flexWrap:
              'wrap',
            marginTop:
              '13px',
          }}
        >
          <button
            type="button"
            className="auth-button compact"
            onClick={() => {
              resetPaymentForm()

              setPaymentMode(
                'Customer collection',
              )

              setModal(
                'payment',
              )
            }}
          >
            <Plus size={14} />
            Create Collection
          </button>

          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              resetPaymentForm()

              setPaymentMode(
                'Customer collection',
              )

              setPaymentMethod(
                'QR',
              )

              setModal(
                'payment',
              )
            }}
          >
            Generate Collection
            QR
          </button>
        </div>
      </section>

      {/* ====================================================== */}
      {/* PAYMENT MODAL */}
      {/* ====================================================== */}

      {modal ===
        'payment' && (
        <Modal
          title={
            paymentMode ===
            'Vendor payment'
              ? 'Make Payment'
              : 'Collect Customer Payment'
          }
          onClose={() =>
            setModal(
              null,
            )
          }
        >
          <form
            className="finance-form"
            onSubmit={
              submitPayment
            }
          >
            <Field label="Payment mode">
              <select
                value={
                  paymentMode
                }
                onChange={(
                  event,
                ) =>
                  setPaymentMode(
                    event.target
                      .value as PaymentMode,
                  )
                }
              >
                <option value="Vendor payment">
                  Vendor payment
                </option>

                <option value="Customer collection">
                  Customer
                  collection
                </option>
              </select>
            </Field>

            <Field label="Payment method">
              <select
                value={
                  paymentMethod
                }
                onChange={(
                  event,
                ) =>
                  setPaymentMethod(
                    event.target
                      .value as PaymentMethod,
                  )
                }
              >
                <option value="Bank Transfer">
                  Bank Transfer
                </option>

                <option value="NEFT">
                  NEFT
                </option>

                <option value="RTGS">
                  RTGS
                </option>

                <option value="UPI">
                  UPI
                </option>

                <option value="QR">
                  QR
                </option>
              </select>
            </Field>

            <Field
              label={
                paymentMode ===
                'Customer collection'
                  ? 'Customer'
                  : 'Vendor / Beneficiary'
              }
            >
              <input
                value={
                  counterparty
                }
                onChange={(
                  event,
                ) =>
                  setCounterparty(
                    event.target
                      .value,
                  )
                }
                placeholder={
                  paymentMode ===
                  'Customer collection'
                    ? 'Customer name'
                    : 'Vendor / beneficiary name'
                }
                required
              />
            </Field>

            <Field label="Amount (INR)">
              <input
                value={
                  amount
                }
                onChange={(
                  event,
                ) =>
                  setAmount(
                    event.target
                      .value,
                  )
                }
                type="number"
                min="0.01"
                step="0.01"
                placeholder="0.00"
                required
              />
            </Field>

            {(
              paymentMethod ===
              'UPI' ||
              paymentMethod ===
              'QR'
            ) && (
              <Field label="UPI ID">
                <input
                  value={
                    upiId
                  }
                  onChange={(
                    event,
                  ) =>
                    setUpiId(
                      event.target
                        .value,
                    )
                  }
                  placeholder="example@upi"
                />
              </Field>
            )}

            {(paymentMethod ===
              'NEFT' ||
              paymentMethod ===
                'RTGS' ||
              paymentMethod ===
                'Bank Transfer') && (
              <>
                <Field label="Beneficiary Account Number">
                  <input
                    value={
                      accountNumber
                    }
                    onChange={(
                      event,
                    ) =>
                      setAccountNumber(
                        event.target
                          .value,
                      )
                    }
                    placeholder="Account number"
                    required
                  />
                </Field>

                <Field label="IFSC">
                  <input
                    value={
                      ifsc
                    }
                    onChange={(
                      event,
                    ) =>
                      setIfsc(
                        event.target
                          .value
                          .toUpperCase(),
                      )
                    }
                    placeholder="HDFC0001234"
                    required
                  />
                </Field>
              </>
            )}

            {paymentMode ===
              'Customer collection' && (
              <Field label="Invoice">
                <select
                  value={
                    invoiceId
                  }
                  onChange={(
                    event,
                  ) =>
                    setInvoiceId(
                      event.target
                        .value,
                    )
                  }
                  required
                >
                  <option value="">
                    Select invoice
                  </option>

                  {invoices
                    .filter(
                      (
                        invoice,
                      ) =>
                        Math.max(
                          0,
                          toNumber(
                            invoice.total_amount,
                          ) -
                            toNumber(
                              invoice.amount_paid,
                            ),
                        ) >
                        0,
                    )
                    .slice(
                      0,
                      100,
                    )
                    .map(
                      (
                        invoice,
                      ) => (
                        <option
                          key={
                            invoice.id
                          }
                          value={
                            invoice.id
                          }
                        >
                          {invoice.invoice_number ||
                            invoice.id}{' '}
                          ·{' '}
                          {formatINR(
                            Math.max(
                              0,
                              toNumber(
                                invoice.total_amount,
                              ) -
                                toNumber(
                                  invoice.amount_paid,
                                ),
                            ),
                          )}
                        </option>
                      ),
                    )}
                </select>
              </Field>
            )}

            <Field label="Reference">
              <input
                value={
                  reference
                }
                onChange={(
                  event,
                ) =>
                  setReference(
                    event.target
                      .value,
                  )
                }
                placeholder="Optional reference"
              />
            </Field>

            <Field label="Notes">
              <textarea
                value={
                  notes
                }
                onChange={(
                  event,
                ) =>
                  setNotes(
                    event.target
                      .value,
                  )
                }
                rows={
                  3
                }
                placeholder="Payment notes"
              />
            </Field>

            <div
              style={{
                padding:
                  '12px',
                border:
                  '1px solid #bae6fd',
                borderRadius:
                  '8px',
                background:
                  '#f0f9ff',
              }}
            >
              <div
                style={{
                  display:
                    'flex',
                  alignItems:
                    'center',
                  justifyContent:
                    'space-between',
                }}
              >
                <strong
                  style={{
                    fontSize:
                      '11px',
                  }}
                >
                  CashGuard AI
                  payment check
                </strong>

                <Sparkles
                  size={
                    14
                  }
                />
              </div>

              <p
                style={{
                  margin:
                    '7px 0 0',
                  color:
                    '#64748b',
                  fontSize:
                    '10px',
                }}
              >
                Current
                observed
                balance:{' '}
                <strong>
                  {formatINR(
                    currentBalance,
                  )}
                </strong>
              </p>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() =>
                  setModal(
                    null,
                  )
                }
              >
                Cancel
              </button>

              {(
                paymentMethod ===
                  'QR' ||
                paymentMethod ===
                  'UPI'
              ) && (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={
                    generatePaymentQR
                  }
                >
                  Generate QR
                </button>
              )}

              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setAiAnswer('')
                  setModal(
                    'ai',
                  )
                }}
              >
                <Sparkles
                  size={
                    14
                  }
                />
                AI Check
              </button>

              <button
                type="submit"
                className="auth-button compact"
              >
                <CreditCard
                  size={
                    14
                  }
                />
                Continue
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ====================================================== */}
      {/* QR MODAL */}
      {/* ====================================================== */}

      {modal ===
        'qr' &&
        qrText && (
          <Modal
            title="Payment QR"
            onClose={() =>
              setModal(
                null,
              )
            }
          >
            <div
              style={{
                display:
                  'grid',
                gap:
                  '14px',
              }}
            >
              <div
                style={{
                  display:
                    'grid',
                  placeItems:
                    'center',
                  padding:
                    '18px',
                  border:
                    '1px solid #e2e8f0',
                  borderRadius:
                    '10px',
                  background:
                    '#fff',
                }}
              >
                <img
                  src={`https://quickchart.io/qr?text=${encodeURIComponent(
                    qrText,
                  )}&size=260`}
                  alt="CashGuard-AI payment QR"
                  width={260}
                  height={260}
                  style={{
                    maxWidth:
                      '100%',
                    height:
                      'auto',
                  }}
                />
              </div>

              <div
                style={{
                  padding:
                    '11px',
                  border:
                    '1px solid #e2e8f0',
                  borderRadius:
                    '8px',
                  background:
                    '#f8fafc',
                }}
              >
                <small
                  style={{
                    display:
                      'block',
                    color:
                      '#94a3b8',
                    fontSize:
                      '9px',
                  }}
                >
                  PAYMENT PAYLOAD
                </small>

                <code
                  style={{
                    display:
                      'block',
                    marginTop:
                      '6px',
                    fontSize:
                      '9px',
                    wordBreak:
                      'break-all',
                    color:
                      '#334155',
                  }}
                >
                  {
                    qrText
                  }
                </code>
              </div>

              <p
                style={{
                  margin:
                    0,
                  color:
                    '#64748b',
                  fontSize:
                    '9px',
                  lineHeight:
                    1.5,
                }}
              >
                QR generation is
                available now.
                Actual payment
                completion must be
                confirmed by the
                payment/banking
                backend.
              </p>

              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard?.writeText(
                        qrText,
                      )

                      setMessage(
                        'Payment QR payload copied.',
                      )
                    } catch {
                      setMessage(
                        'Unable to copy payload automatically.',
                      )
                    }
                  }}
                >
                  Copy Payload
                </button>

                <button
                  type="button"
                  className="auth-button compact"
                  onClick={() =>
                    setModal(
                      null,
                    )
                  }
                >
                  Done
                </button>
              </div>
            </div>
          </Modal>
        )}

      {/* ====================================================== */}
      {/* AI MODAL */}
      {/* ====================================================== */}

      {modal ===
        'ai' && (
        <Modal
          title="CashGuard AI · Payment Assistant"
          onClose={() =>
            setModal(
              null,
            )
          }
        >
          <div
            style={{
              display:
                'grid',
              gap:
                '12px',
            }}
          >
            <div
              style={{
                display:
                  'grid',
                gridTemplateColumns:
                  'repeat(3, minmax(0, 1fr))',
                gap:
                  '8px',
              }}
            >
              <div
                style={{
                  padding:
                    '10px',
                  border:
                    '1px solid #e2e8f0',
                  borderRadius:
                    '8px',
                }}
              >
                <small>
                  Cash
                </small>

                <strong
                  style={{
                    display:
                      'block',
                    marginTop:
                      '4px',
                    fontSize:
                      '13px',
                  }}
                >
                  {formatINR(
                    currentBalance,
                  )}
                </strong>
              </div>

              <div
                style={{
                  padding:
                    '10px',
                  border:
                    '1px solid #e2e8f0',
                  borderRadius:
                    '8px',
                }}
              >
                <small>
                  Received
                </small>

                <strong
                  style={{
                    display:
                      'block',
                    marginTop:
                      '4px',
                    fontSize:
                      '13px',
                  }}
                >
                  {formatINR(
                    totalReceived,
                  )}
                </strong>
              </div>

              <div
                style={{
                  padding:
                    '10px',
                  border:
                    '1px solid #e2e8f0',
                  borderRadius:
                    '8px',
                }}
              >
                <small>
                  Outstanding
                </small>

                <strong
                  style={{
                    display:
                      'block',
                    marginTop:
                      '4px',
                    fontSize:
                      '13px',
                  }}
                >
                  {formatINR(
                    pendingCollections,
                  )}
                </strong>
              </div>
            </div>

            <Field label="Ask CashGuard AI">
              <textarea
                rows={
                  4
                }
                value={
                  aiQuestion
                }
                onChange={(
                  event,
                ) =>
                  setAiQuestion(
                    event.target
                      .value,
                  )
                }
                placeholder="Example: Can I safely make this payment?"
              />
            </Field>

            <div
              style={{
                display:
                  'flex',
                gap:
                  '8px',
                flexWrap:
                  'wrap',
              }}
            >
              <button
                type="button"
                className="secondary-button"
                disabled={
                  aiLoading
                }
                onClick={() =>
                  void askCashGuardAI()
                }
              >
                <Sparkles
                  size={
                    14
                  }
                />

                {aiLoading
                  ? 'Thinking...'
                  : 'Ask AI'}
              </button>

              <button
                type="button"
                className="secondary-button"
                disabled={
                  aiLoading
                }
                onClick={() =>
                  void runPaymentRiskCheck()
                }
              >
                Check Payment
                Risk
              </button>
            </div>

            {aiAnswer && (
              <div
                style={{
                  padding:
                    '13px',
                  border:
                    '1px solid #bae6fd',
                  borderRadius:
                    '9px',
                  background:
                    '#f0f9ff',
                }}
              >
                <strong
                  style={{
                    display:
                      'block',
                    color:
                      '#0369a1',
                    fontSize:
                      '10px',
                  }}
                >
                  CASHGUARD AI
                </strong>

                <p
                  style={{
                    margin:
                      '8px 0 0',
                    color:
                      '#334155',
                    fontSize:
                      '11px',
                    lineHeight:
                      1.6,
                    whiteSpace:
                      'pre-wrap',
                  }}
                >
                  {
                    aiAnswer
                  }
                </p>
              </div>
            )}

            <div className="modal-actions">
              <button
                type="button"
                className="auth-button compact"
                onClick={() =>
                  setModal(
                    null,
                  )
                }
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ====================================================== */}
      {/* PAYMENT DETAIL MODAL */}
      {/* ====================================================== */}

      {modal ===
        'detail' &&
        selectedPayment && (
          <Modal
            title={`Payment Detail · ${
              selectedPayment.id
            }`}
            onClose={() =>
              setModal(
                null,
              )
            }
          >
            <div className="detail-list">
              <p>
                <span>
                  Payment ID
                </span>

                <b>
                  {
                    selectedPayment.id
                  }
                </b>
              </p>

              <p>
                <span>
                  Counterparty
                </span>

                <b>
                  {
                    selectedPayment.counterparty
                  }
                </b>
              </p>

              <p>
                <span>
                  Type
                </span>

                <b>
                  {
                    selectedPayment.type
                  }
                </b>
              </p>

              <p>
                <span>
                  Method
                </span>

                <b>
                  {
                    selectedPayment.method
                  }
                </b>
              </p>

              <p>
                <span>
                  Amount
                </span>

                <b>
                  {formatINR(
                    selectedPayment.amount,
                  )}
                </b>
              </p>

              <p>
                <span>
                  Date
                </span>

                <b>
                  {formatDate(
                    selectedPayment.date,
                  )}
                </b>
              </p>

              <p>
                <span>
                  Status
                </span>

                <b>
                  {
                    selectedPayment.status
                  }
                </b>
              </p>

              <p>
                <span>
                  Reference
                </span>

                <b>
                  {
                    selectedPayment.reference
                  }
                </b>
              </p>

              <p>
                <span>
                  Notes
                </span>

                <b>
                  {
                    selectedPayment.notes ||
                    '—'
                  }
                </b>
              </p>

              {selectedPayment.transaction && (
                <>
                  <p>
                    <span>
                      Banking
                      Transaction
                      ID
                    </span>

                    <b>
                      {
                        selectedPayment
                          .transaction
                          .id
                      }
                    </b>
                  </p>

                  <p>
                    <span>
                      Running
                      Balance
                    </span>

                    <b>
                      {formatINR(
                        selectedPayment
                          .transaction
                          .running_balance,
                      )}
                    </b>
                  </p>

                  <p>
                    <span>
                      Category
                    </span>

                    <b>
                      {
                        selectedPayment
                          .transaction
                          .category
                      }
                    </b>
                  </p>
                </>
              )}
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setAiQuestion(
                    `Explain this payment ${
                      selectedPayment.id
                    } using the available CashGuard-AI banking data.`,
                  )

                  setAiAnswer('')

                  setModal(
                    'ai',
                  )
                }}
              >
                <Sparkles
                  size={
                    14
                  }
                />
                Ask AI
              </button>

              <button
                type="button"
                className="auth-button compact"
                onClick={() =>
                  setModal(
                    null,
                  )
                }
              >
                Close
              </button>
            </div>
          </Modal>
        )}
    </main>
  )
}

// ============================================================
// DEDICATED BANK TRANSACTION PAGE
// ============================================================

export function BankingTransactionPage() {
  const [
    query,
    setQuery,
  ] = useState('')

  const [
    filter,
    setFilter,
  ] = useState('All')

  const [
    dateRange,
    setDateRange,
  ] = useState('all')

  const [
    transactions,
    setTransactions,
  ] =
    useState<ApiBankTransaction[]>(
      [],
    )

  const [
    summary,
    setSummary,
  ] =
    useState<ApiBankingSummary | null>(
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
  ] = useState<string | null>(
    null,
  )

  const [
    selectedTxn,
    setSelectedTxn,
  ] =
    useState<ApiBankTransaction | null>(
      null,
    )

  const [
    message,
    setMessage,
  ] = useState('')

  const loadData =
    async (
      showRefreshing = false,
    ) => {
      const businessId =
        getBusinessId()

      if (!businessId) {
        setError(
          'Business ID is missing. Configure NEXT_PUBLIC_BUSINESS_ID in frontend/.env.local.',
        )

        setLoading(false)
        return
      }

      try {
        setError(null)

        if (showRefreshing) {
          setRefreshing(true)
        } else {
          setLoading(true)
        }

        const transactionResponse =
          await fetchAllBankTransactions(
            businessId,
          )

        const summaryResponse =
          await optionalCashGuardApiFetch<
            ApiBankingSummary
          >(
            `/api/banking/transactions/summary?business_id=${encodeURIComponent(businessId)}`,
          )

        setTransactions(
          Array.isArray(
            transactionResponse,
          )
            ? transactionResponse
            : [],
        )

        setSummary(
          summaryResponse,
        )
      } catch (
        err
      ) {
        const apiError =
          err as {
            status?: number
          }

        if (
          apiError?.status ===
          401
        ) {
          setError(
            'Authentication failed. Please login again.',
          )
        } else if (
          apiError?.status ===
          403
        ) {
          setError(
            'You are not authorized to access this business banking data.',
          )
        } else {
          setError(
            err instanceof Error
              ? err.message
              : 'Unable to load banking data.',
          )
        }
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    }

  useEffect(() => {
    void loadData()

    const handleAuthChanged =
      () => {
        void loadData(
          true,
        )
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
  }, [])

  const visible =
    useMemo(
      () => {
        const today =
          new Date()

        return transactions.filter(
          (
            row,
          ) => {
            const searchable =
              [
                row.description,
                row.reference_number ||
                  '',
                row.category,
                row.business_id,
              ]
                .join(' ')
                .toLowerCase()

            const matchesSearch =
              searchable.includes(
                query
                  .trim()
                  .toLowerCase(),
              )

            const type =
              normalizeTransactionType(
                row.transaction_type,
              )

            const matchesFilter =
              filter ===
                'All' ||
              (filter ===
                'Credit' &&
                type ===
                  'Credit') ||
              (filter ===
                'Debit' &&
                type ===
                  'Debit')

            let matchesDate =
              true

            if (
              dateRange !==
              'all'
            ) {
              const transactionDate =
                new Date(
                  row.transaction_date,
                )

              const days =
                dateRange ===
                '7d'
                  ? 7
                  : dateRange ===
                      '30d'
                    ? 30
                    : 90

              const cutoff =
                new Date(
                  today,
                )

              cutoff.setDate(
                cutoff.getDate() -
                  days,
              )

              matchesDate =
                transactionDate >=
                cutoff
            }

            return (
              matchesSearch &&
              matchesFilter &&
              matchesDate
            )
          },
        )
      },
      [
        transactions,
        query,
        filter,
        dateRange,
      ],
    )

  const moneyIn =
    summary !== null
      ? toNumber(
          summary.total_credit,
        )
      : calculateCreditTotal(
          visible,
        )

  const moneyOut =
    summary !== null
      ? toNumber(
          summary.total_debit,
        )
      : calculateDebitTotal(
          visible,
        )

  const availableBalance =
    summary !== null
      ? toNumber(
          summary.balance,
        )
      : getLatestRunningBalance(
          transactions,
        )

  return (
    <main className="foundation-content operations-page">
      <div className="dashboard-heading">
        <div>
          <p className="auth-eyebrow">
            BANKING · LIVE
          </p>

          <h2>
            Banking
          </h2>

          <p>
            Monitor and manage
            live business bank
            transactions.
          </p>
        </div>

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
            size={15}
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

      {error && (
        <div
          className="operations-success"
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

      {message && (
        <div
          className="operations-success"
          role="status"
        >
          <CheckCircle2
            size={16}
          />

          <span>
            {message}
          </span>

          <button
            type="button"
            onClick={() =>
              setMessage('')
            }
          >
            <X size={15} />
          </button>
        </div>
      )}

      <Kpis
        items={[
          [
            'Available Balance',
            loading
              ? 'Loading...'
              : formatINR(
                  availableBalance,
                ),
            'Latest running balance',
            'green',
          ],
          [
            'Money In',
            loading
              ? 'Loading...'
              : formatINR(
                  moneyIn,
                ),
            'Live credits',
            'green',
          ],
          [
            'Money Out',
            loading
              ? 'Loading...'
              : formatINR(
                  moneyOut,
                ),
            'Live debits',
            'blue',
          ],
          [
            'Transactions',
            loading
              ? 'Loading...'
              : String(
                  summary?.total_transactions ??
                    transactions.length,
                ),
            'Live transaction count',
            'blue',
          ],
        ]}
      />

      <section className="foundation-card finance-panel">
        <div className="panel-heading">
          <div>
            <h3>
              Bank
              Transactions
            </h3>

            <p>
              Search, filter and
              inspect live bank
              transactions.
            </p>
          </div>
        </div>

        <div className="finance-toolbar">
          <div className="search-control">
            <Search size={16} />

            <input
              type="search"
              placeholder="Search by description, reference or category"
              value={query}
              onChange={(
                event,
              ) =>
                setQuery(
                  event.target
                    .value,
                )
              }
            />
          </div>

          <select
            value={
              filter
            }
            onChange={(
              event,
            ) =>
              setFilter(
                event.target
                  .value,
              )
            }
          >
            <option value="All">
              All
            </option>

            <option value="Credit">
              Credit
            </option>

            <option value="Debit">
              Debit
            </option>
          </select>

          <select
            value={
              dateRange
            }
            onChange={(
              event,
            ) =>
              setDateRange(
                event.target
                  .value,
              )
            }
          >
            <option value="all">
              All dates
            </option>

            <option value="7d">
              Last 7 days
            </option>

            <option value="30d">
              Last 30 days
            </option>

            <option value="90d">
              Last 90 days
            </option>
          </select>

          {(query ||
            filter !==
              'All' ||
            dateRange !==
              'all') && (
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                setQuery('')
                setFilter(
                  'All',
                )
                setDateRange(
                  'all',
                )
              }}
            >
              <X size={14} />
              Clear filters
            </button>
          )}
        </div>

        <div className="finance-table-wrap">
          <table className="finance-table">
            <thead>
              <tr>
                <th>
                  Date
                </th>

                <th>
                  Description
                </th>

                <th>
                  Reference
                </th>

                <th>
                  Type
                </th>

                <th>
                  Amount
                </th>

                <th>
                  Category
                </th>

                <th>
                  Balance
                </th>

                <th>
                  Actions
                </th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={
                      8
                    }
                    style={{
                      textAlign:
                        'center',
                      padding:
                        '34px 20px',
                    }}
                  >
                    Loading live
                    transactions...
                  </td>
                </tr>
              ) : visible.length >
                0 ? (
                visible.map(
                  (
                    row,
                  ) => {
                    const type =
                      normalizeTransactionType(
                        row.transaction_type,
                      )

                    return (
                      <tr
                        key={
                          row.id
                        }
                      >
                        <td>
                          <strong>
                            {formatDate(
                              row.transaction_date,
                            )}
                          </strong>
                        </td>

                        <td>
                          <strong>
                            {
                              row.description
                            }
                          </strong>

                          <small>
                            {
                              row.category
                            }
                          </small>
                        </td>

                        <td>
                          <small>
                            {row.reference_number ||
                              '—'}
                          </small>
                        </td>

                        <td>
                          <span
                            className={
                              type ===
                              'Credit'
                                ? 'positive-text'
                                : 'danger-text'
                            }
                          >
                            {
                              type
                            }
                          </span>
                        </td>

                        <td>
                          <strong
                            className={
                              type ===
                              'Credit'
                                ? 'positive-text'
                                : 'danger-text'
                            }
                          >
                            {type ===
                            'Credit'
                              ? '+'
                              : '-'}
                            {formatINR(
                              row.amount,
                            )}
                          </strong>
                        </td>

                        <td>
                          <Status tone="blue">
                            {row.category ||
                              'Uncategorized'}
                          </Status>
                        </td>

                        <td>
                          <strong>
                            {formatINR(
                              row.running_balance,
                            )}
                          </strong>
                        </td>

                        <td>
                          <button
                            type="button"
                            className="table-action"
                            onClick={() =>
                              setSelectedTxn(
                                row,
                              )
                            }
                          >
                            View
                            <ChevronRight
                              size={
                                13
                              }
                            />
                          </button>
                        </td>
                      </tr>
                    )
                  },
                )
              ) : (
                <tr>
                  <td
                    colSpan={
                      8
                    }
                    style={{
                      textAlign:
                        'center',
                      padding:
                        '34px 20px',
                    }}
                  >
                    No transactions
                    found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section
        className="foundation-card finance-panel"
        style={{
          marginTop:
            '14px',
        }}
      >
        <div className="panel-heading">
          <div>
            <h3>
              Banking
              Insights
            </h3>

            <p>
              Basic live
              observations from
              backend data.
            </p>
          </div>
        </div>

        <div
          style={{
            display:
              'grid',
            gridTemplateColumns:
              'repeat(auto-fit, minmax(250px, 1fr))',
            gap:
              '12px',
          }}
        >
          <div className="insight-card">
            <span>
              <Sparkles
                size={14}
              />
              Live data
            </span>

            <h4>
              Money in vs
              money out
            </h4>

            <p>
              {formatINR(
                moneyIn,
              )}{' '}
              received versus{' '}
              {formatINR(
                moneyOut,
              )}{' '}
              paid across the
              loaded
              transactions.
            </p>
          </div>

          <div className="insight-card">
            <span>
              <AlertCircle
                size={14}
              />
              Monitoring
            </span>

            <h4>
              {
                transactions.length
              }{' '}
              live
              transactions
            </h4>

            <p>
              Data is loaded
              directly from
              the backend.
            </p>
          </div>

          <div className="insight-card">
            <span>
              <Sparkles
                size={14}
              />
              Balance
            </span>

            <h4>
              Current:{' '}
              {formatINR(
                availableBalance,
              )}
            </h4>

            <p>
              Backend summary is
              used when available.
            </p>
          </div>
        </div>
      </section>

      {selectedTxn && (
        <Modal
          title={`Transaction Detail · ${
            selectedTxn.reference_number ||
            selectedTxn.id
          }`}
          onClose={() =>
            setSelectedTxn(
              null,
            )
          }
        >
          <div className="detail-list">
            <p>
              <span>
                Transaction ID
              </span>

              <b>
                {
                  selectedTxn.id
                }
              </b>
            </p>

            <p>
              <span>
                Business ID
              </span>

              <b>
                {
                  selectedTxn.business_id
                }
              </b>
            </p>

            <p>
              <span>
                Date
              </span>

              <b>
                {formatDate(
                  selectedTxn.transaction_date,
                )}
              </b>
            </p>

            <p>
              <span>
                Type
              </span>

              <b>
                {
                  normalizeTransactionType(
                    selectedTxn.transaction_type,
                  )
                }
              </b>
            </p>

            <p>
              <span>
                Amount
              </span>

              <b>
                {formatINR(
                  selectedTxn.amount,
                )}
              </b>
            </p>

            <p>
              <span>
                Running Balance
              </span>

              <b>
                {formatINR(
                  selectedTxn.running_balance,
                )}
              </b>
            </p>

            <p>
              <span>
                Description
              </span>

              <b>
                {
                  selectedTxn.description
                }
              </b>
            </p>

            <p>
              <span>
                Category
              </span>

              <b>
                {
                  selectedTxn.category
                }
              </b>
            </p>

            <p>
              <span>
                Reference
              </span>

              <b>
                {selectedTxn.reference_number ||
                  'N/A'}
              </b>
            </p>

            <p>
              <span>
                Customer ID
              </span>

              <b>
                {selectedTxn.customer_id ||
                  'N/A'}
              </b>
            </p>

            <p>
              <span>
                Supplier ID
              </span>

              <b>
                {selectedTxn.supplier_id ||
                  'N/A'}
              </b>
            </p>

            <p>
              <span>
                Invoice Payment
                ID
              </span>

              <b>
                {
                  selectedTxn.invoice_payment_id ||
                    'N/A'
                }
              </b>
            </p>

            <p>
              <span>
                Expense ID
              </span>

              <b>
                {selectedTxn.expense_id ||
                  'N/A'}
              </b>
            </p>
          </div>

          <div className="modal-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                setSelectedTxn(
                  null,
                )

                setMessage(
                  'Transaction marked for reconciliation.',
                )
              }}
            >
              <CheckCircle2
                size={14}
              />
              Mark for
              Reconciliation
            </button>

            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                setSelectedTxn(
                  null,
                )

                setMessage(
                  'Transaction flagged for review.',
                )
              }}
            >
              <AlertCircle
                size={14}
              />
              Flag for Review
            </button>
          </div>
        </Modal>
      )}
    </main>
  )
}

// ============================================================
// EXPORT TYPES
// ============================================================

export type {
  Account,
  Transaction,
  Payment,
}

// ============================================================
// DEFAULT EXPORT
// ============================================================

export default BankingPage
