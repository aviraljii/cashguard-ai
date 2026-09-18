'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'

import Link from 'next/link'

import {
  ArrowUpRight,
  CalendarDays,
  Check,
  CheckCircle2,
  CircleHelp,
  Filter,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Wallet,
  X,
} from 'lucide-react'

// ============================================================
// TYPES
// ============================================================

type PageKey =
  | 'banking'
  | 'payments'
  | 'reconciliation'
  | 'risk'
  | 'alerts'
  | 'notifications'
  | 'ai-insights'
  | 'invoices'
  | 'customers'
  | 'vendors'
  | 'analytics'
  | 'settings'
  | 'help'

type Tone =
  | 'green'
  | 'amber'
  | 'red'
  | 'blue'

type Config = {
  eyebrow: string
  title: string
  description: string
  action: string
  stats: [
    string,
    string,
    string,
    Tone,
  ][]
}

type ApiRecord =
  Record<string, unknown>

// ============================================================
// CONFIG
// ============================================================

const DEFAULT_API_URL =
  'http://127.0.0.1:8000'

const DEFAULT_BUSINESS_ID =
  process.env
    .NEXT_PUBLIC_BUSINESS_ID
    ?.trim() || ''

// ============================================================
// GENERIC PAGE CONFIG
// ============================================================

const configs: Record<
  PageKey,
  Config
> = {
  banking: {
    eyebrow: 'BANKING',
    title: 'Banking',
    description:
      'See every connected account and recent transaction in one place.',
    action:
      'Connect bank account',
    stats: [
      [
        'Cash in bank',
        '₹8,50,000',
        '2 connected accounts',
        'green',
      ],
      [
        'Available balance',
        '₹7,95,000',
        '93.5% available',
        'blue',
      ],
      [
        'Transactions',
        '128',
        'This month',
        'blue',
      ],
      [
        'Last synced',
        '2 min ago',
        'All accounts healthy',
        'green',
      ],
    ],
  },

  payments: {
    eyebrow: 'PAYMENTS',
    title: 'Payments',
    description:
      'Track outgoing payments, scheduled obligations and payment health.',
    action:
      'Schedule payment',
    stats: [
      [
        'Total payments',
        '₹12,40,000',
        'This month',
        'blue',
      ],
      [
        'Pending',
        '₹3,10,000',
        '8 payments',
        'amber',
      ],
      [
        'Completed',
        '₹8,75,000',
        '42 payments',
        'green',
      ],
      [
        'Failed',
        '₹55,000',
        '2 need review',
        'red',
      ],
    ],
  },

  reconciliation: {
    eyebrow: 'RECONCILIATION',
    title: 'Reconciliation',
    description:
      'Match bank activity to your financial records with confidence.',
    action:
      'Start reconciliation',
    stats: [
      [
        'Matched',
        '0',
        'Live transactions',
        'green',
      ],
      [
        'Unmatched',
        '0',
        'Needs attention',
        'red',
      ],
      [
        'Pending',
        '0',
        'Awaiting confirmation',
        'blue',
      ],
      [
        'Match rate',
        '0%',
        'Live calculation',
        'green',
      ],
    ],
  },

  risk: {
    eyebrow: 'RISK INTELLIGENCE',
    title: 'Risk Intelligence',
    description:
      'Understand the financial risks that could affect your next decision.',
    action:
      'Export risk report',
    stats: [
      [
        'Overall risk score',
        '64 / 100',
        'Moderate exposure',
        'amber',
      ],
      [
        'Cash flow risk',
        'Medium',
        '14-day outlook',
        'amber',
      ],
      [
        'Payment risk',
        'Low',
        'Healthy execution',
        'green',
      ],
      [
        'Customer risk',
        'Medium',
        '3 accounts flagged',
        'red',
      ],
    ],
  },

  alerts: {
    eyebrow: 'ALERTS',
    title: 'Alerts',
    description:
      'Prioritised signals from your cash position, payments and collections.',
    action:
      'Create alert rule',
    stats: [
      [
        'Critical alerts',
        '2',
        'Require action',
        'red',
      ],
      [
        'Warnings',
        '7',
        'Across 4 areas',
        'amber',
      ],
      [
        'Information',
        '14',
        'Recent updates',
        'blue',
      ],
      [
        'Resolved',
        '38',
        'This month',
        'green',
      ],
    ],
  },

  notifications: {
    eyebrow: 'NOTIFICATIONS',
    title: 'Notification centre',
    description:
      'Stay updated on changes that matter to your business.',
    action:
      'Mark all as read',
    stats: [
      [
        'Unread',
        '6',
        'Need your attention',
        'amber',
      ],
      [
        'Financial alerts',
        '3',
        'High priority',
        'red',
      ],
      [
        'Payments',
        '8',
        'Recent activity',
        'blue',
      ],
      [
        'AI recommendations',
        '4',
        'New insights',
        'green',
      ],
    ],
  },

  'ai-insights': {
    eyebrow: 'AI INSIGHTS',
    title: 'AI Insights',
    description:
      'Structured recommendations to help you protect liquidity and move faster.',
    action:
      'Refresh insights',
    stats: [
      [
        'Active insights',
        '8',
        'Across your workspace',
        'blue',
      ],
      [
        'High priority',
        '3',
        'Review today',
        'red',
      ],
      [
        'Potential impact',
        '₹4,25,000',
        'Near-term cash',
        'green',
      ],
      [
        'Confidence',
        '91%',
        'Evidence-backed',
        'green',
      ],
    ],
  },

  invoices: {
    eyebrow: 'INVOICES',
    title: 'Invoices',
    description:
      'Manage receivables, due dates and collection health.',
    action:
      'Create invoice',
    stats: [
      [
        'Total invoices',
        '84',
        'This financial year',
        'blue',
      ],
      [
        'Paid',
        '₹18,40,000',
        '61 invoices',
        'green',
      ],
      [
        'Pending',
        '₹5,70,000',
        '15 invoices',
        'amber',
      ],
      [
        'Overdue',
        '₹4,20,000',
        '8 invoices',
        'red',
      ],
    ],
  },

  customers: {
    eyebrow: 'CUSTOMERS',
    title: 'Customers',
    description:
      'Understand who owes you, who pays on time and where risk is building.',
    action:
      'Add customer',
    stats: [
      [
        'Total customers',
        '128',
        'Active relationships',
        'blue',
      ],
      [
        'Active customers',
        '112',
        '87.5% of total',
        'green',
      ],
      [
        'Outstanding receivables',
        '₹14,75,000',
        'Across 36 invoices',
        'amber',
      ],
      [
        'Overdue receivables',
        '₹4,20,000',
        'Needs follow-up',
        'red',
      ],
    ],
  },

  vendors: {
    eyebrow: 'VENDORS',
    title: 'Vendors',
    description:
      'Keep supplier obligations visible and payment planning predictable.',
    action:
      'Add vendor',
    stats: [
      [
        'Total vendors',
        '64',
        'Active relationships',
        'blue',
      ],
      [
        'Active vendors',
        '51',
        '79.7% of total',
        'green',
      ],
      [
        'Outstanding payables',
        '₹9,20,000',
        'Across 24 bills',
        'amber',
      ],
      [
        'Upcoming obligations',
        '₹6,05,000',
        'Next 14 days',
        'red',
      ],
    ],
  },

  analytics: {
    eyebrow: 'ANALYTICS',
    title: 'Analytics',
    description:
      'Explore revenue, expenses, profitability and working capital trends.',
    action:
      'Export report',
    stats: [
      [
        'Revenue',
        '₹42,80,000',
        '+12.4% vs prior period',
        'green',
      ],
      [
        'Expenses',
        '₹31,60,000',
        '+4.8% vs prior period',
        'amber',
      ],
      [
        'Gross margin',
        '26.2%',
        'Healthy operating range',
        'green',
      ],
      [
        'Net cash flow',
        '₹11,20,000',
        '7.9% improvement',
        'blue',
      ],
    ],
  },

  settings: {
    eyebrow: 'SETTINGS',
    title: 'Settings',
    description:
      'Configure your workspace preferences and business profile.',
    action:
      'Save changes',
    stats: [
      [
        'Business profile',
        'Complete',
        'GSTIN and details',
        'green',
      ],
      [
        'Preferences',
        'INR',
        'Asia/Kolkata',
        'blue',
      ],
      [
        'Notifications',
        'Enabled',
        '6 active rules',
        'green',
      ],
      [
        'Security',
        'Protected',
        'Frontend only',
        'blue',
      ],
    ],
  },

  help: {
    eyebrow: 'HELP CENTRE',
    title: 'How can we help?',
    description:
      'Find answers and guidance for getting the most from CashGuard-AI.',
    action:
      'Contact support',
    stats: [
      [
        'Help topics',
        '24',
        'Across 6 categories',
        'blue',
      ],
      [
        'Getting started',
        'Complete',
        'Workspace setup',
        'green',
      ],
      [
        'Banking articles',
        '6',
        'Updated recently',
        'blue',
      ],
      [
        'Support status',
        'Online',
        'We are here to help',
        'green',
      ],
    ],
  },
}

// ============================================================
// GENERIC DATA
// ============================================================

const rows = [
  'Sharma Traders',
  'ABC Electrical Suppliers',
  'Rajasthan Hardware',
  'Mehta Electricals',
  'GST Payment',
  'Monthly Payroll',
]

// ============================================================
// API HELPERS
// ============================================================

const getApiBase = (): string => {
  const value =
    process.env.NEXT_PUBLIC_API_URL ||
    process.env
      .NEXT_PUBLIC_API_BASE_URL ||
    DEFAULT_API_URL

  return value.replace(
    /\/+$/,
    '',
  )
}

const getBusinessId = (): string => {
  if (
    typeof window !==
    'undefined'
  ) {
    const keys = [
      'business_id',
      'businessId',
      'cashguard_business_id',
    ]

    for (
      const key of keys
    ) {
      const value =
        window.localStorage.getItem(
          key,
        )

      if (
        value &&
        value.trim()
      ) {
        return value.trim()
      }
    }

    for (
      const key of keys
    ) {
      const value =
        window.sessionStorage.getItem(
          key,
        )

      if (
        value &&
        value.trim()
      ) {
        return value.trim()
      }
    }
  }

  return DEFAULT_BUSINESS_ID
}

const getAuthToken = (): string => {
  if (
    typeof window ===
    'undefined'
  ) {
    return ''
  }

  const tokenKeys = [
    'access_token',
    'accessToken',
    'token',
    'auth_token',
    'jwt_token',
    'jwt',
    'cashguard_access_token',
    'cashguard_token',
  ]

  const storages = [
    window.localStorage,
    window.sessionStorage,
  ]

  for (
    const storage of storages
  ) {
    for (
      const key of tokenKeys
    ) {
      const value =
        storage.getItem(key)

      if (
        value &&
        value.trim()
      ) {
        return value
          .trim()
          .replace(
            /^Bearer\s+/i,
            '',
          )
      }
    }
  }

  return ''
}

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token =
    getAuthToken()

  const headers =
    new Headers(
      options.headers,
    )

  headers.set(
    'Accept',
    'application/json',
  )

  if (
    options.body &&
    !headers.has(
      'Content-Type',
    )
  ) {
    headers.set(
      'Content-Type',
      'application/json',
    )
  }

  if (token) {
    headers.set(
      'Authorization',
      `Bearer ${token}`,
    )
  }

  const response =
    await fetch(
      `${getApiBase()}${path}`,
      {
        ...options,
        headers,
        credentials: 'include',
        cache: 'no-store',
      },
    )

  const raw =
    await response.text()

  let data: unknown =
    null

  if (
    raw.trim()
  ) {
    try {
      data =
        JSON.parse(raw)
    } catch {
      data = raw
    }
  }

  if (!response.ok) {
    let message =
      `Request failed with status ${response.status}`

    if (
      data &&
      typeof data ===
        'object'
    ) {
      const record =
        data as ApiRecord

      const detail =
        record.detail ??
        record.message ??
        record.error

      if (
        Array.isArray(
          detail,
        )
      ) {
        message =
          detail
            .map(
              (item) => {
                if (
                  item &&
                  typeof item ===
                    'object'
                ) {
                  const entry =
                    item as ApiRecord

                  return String(
                    entry.msg ??
                      entry.message ??
                      item,
                  )
                }

                return String(item)
              },
            )
            .join(', ')
      } else if (
        detail !==
          undefined &&
        detail !== null
      ) {
        message =
          String(detail)
      }
    } else if (
      typeof data ===
        'string' &&
      data.trim()
    ) {
      message =
        data.trim()
    }

    const error =
      new Error(message) as Error & {
        status?: number
      }

    error.status =
      response.status

    throw error
  }

  return data as T
}

const getApiArray = (
  value: unknown,
): ApiRecord[] => {
  if (
    Array.isArray(value)
  ) {
    return value.filter(
      (
        item,
      ): item is ApiRecord =>
        !!item &&
        typeof item ===
          'object' &&
        !Array.isArray(item),
    )
  }

  if (
    value &&
    typeof value ===
      'object'
  ) {
    const object =
      value as ApiRecord

    const keys = [
      'items',
      'data',
      'results',
      'records',
      'transactions',
      'reconciliation',
      'reconciliations',
      'payments',
    ]

    for (
      const key of keys
    ) {
      const candidate =
        object[key]

      if (
        Array.isArray(
          candidate,
        )
      ) {
        return candidate.filter(
          (
            item,
          ): item is ApiRecord =>
            !!item &&
            typeof item ===
              'object' &&
            !Array.isArray(item),
        )
      }
    }
  }

  return []
}

const readString = (
  record: ApiRecord,
  keys: string[],
  fallback = '',
): string => {
  for (
    const key of keys
  ) {
    const value =
      record[key]

    if (
      value !==
        undefined &&
      value !== null &&
      String(value).trim()
    ) {
      return String(value)
    }
  }

  return fallback
}

const readNumber = (
  record: ApiRecord,
  keys: string[],
  fallback = 0,
): number => {
  for (
    const key of keys
  ) {
    const raw =
      record[key]

    if (
      raw ===
        undefined ||
      raw === null ||
      raw === ''
    ) {
      continue
    }

    const value =
      Number(raw)

    if (
      Number.isFinite(
        value,
      )
    ) {
      return value
    }
  }

  return fallback
}

const toNumber = (value: unknown): number => {
  if (
    typeof value === 'number' &&
    Number.isFinite(value)
  ) {
    return value
  }

  if (value === null || value === undefined) {
    return 0
  }

  const normalized = String(value)
    .trim()
    .replace(/[₹,$\\s]/g, '')

  if (!normalized) {
    return 0
  }

  const numeric = Number(normalized)

  return Number.isFinite(numeric)
    ? numeric
    : 0
}

const normalizeTransactionType = (
  value: unknown,
): 'Credit' | 'Debit' => {
  const type = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[-_]+/g, ' ')

  if (
    type.includes('credit') ||
    type.includes('inflow') ||
    type.includes('income') ||
    type.includes('deposit') ||
    type.includes('receipt') ||
    type.includes('received')
  ) {
    return 'Credit'
  }

  return 'Debit'
}

const formatCurrency = (
  value: number,
): string =>
  `₹${Number(
    value || 0,
  ).toLocaleString(
    'en-IN',
    {
      maximumFractionDigits: 2,
    },
  )}`

const formatDate = (
  value: unknown,
): string => {
  if (!value) {
    return '-'
  }

  const date =
    new Date(
      String(value),
    )

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return String(value)
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

// ============================================================
// GENERIC COMPONENTS
// ============================================================

function Stat({
  item,
}: {
  item: [
    string,
    string,
    string,
    Tone,
  ]
}) {
  return (
    <section className="foundation-card kpi-card">
      <div>
        <span className="kpi-label">
          {item[0]}
        </span>

        <span
          className={`kpi-status ${item[3]}`}
        />
      </div>

      <strong className="money">
        {item[1]}
      </strong>

      <p>
        {item[2]}
      </p>

      <small
        className={
          item[3] === 'green'
            ? 'positive-text'
            : item[3] === 'red'
              ? 'danger-text'
              : item[3] ===
                  'amber'
                ? 'warning-text'
                : ''
        }
      >
        {item[3] === 'green'
          ? 'Healthy'
          : item[3] === 'red'
            ? 'Action required'
            : item[3] === 'amber'
              ? 'Monitor closely'
              : 'In progress'}
      </small>
    </section>
  )
}

function StateNotice({
  kind,
  onRetry,
}: {
  kind: 'empty' | 'error'
  onRetry?: () => void
}) {
  if (
    kind === 'empty'
  ) {
    return (
      <div className="operations-state">
        No records match your current filters.
      </div>
    )
  }

  return (
    <div className="operations-state">
      Unable to load this section.

      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
        >
          <RefreshCw
            size={14}
          />
          Retry
        </button>
      )}
    </div>
  )
}

// ============================================================
// RECONCILIATION TYPES
// ============================================================

type ReconStatus =
  | 'Matched'
  | 'Unmatched'
  | 'Needs Review'
  | 'Suggested'

type StatementPeriod =
  | 'live'
  | '7d'
  | '30d'
  | '90d'
  | 'month'
  | 'all'

type ReconItem = {
  id: string
  reconciliationId?: string
  paymentId?: string
  bankTransactionId?: string
  date: string
  description: string
  amount: number
  source: string
  reference: string
  status: ReconStatus
  confidence: number
  system: string
  counterparty: string
  type: string
  documentType: string
  paymentStatus: string
  matchReason: string
  raw: ApiRecord
}

type AuditItem = {
  id: string
  description: string
  system: string
  amount: number
  reconciledBy: string
  date: string
}

type ApiBankTransaction = {
  id?: string
  business_id?: string
  transaction_date?: string
  transaction_type?: string
  category?: string
  amount?: number | string | null
  running_balance?: number | string | null
  description?: string
  reference_number?: string | null
  customer_id?: string | null
  supplier_id?: string | null
  invoice_payment_id?: string | null
  expense_id?: string | null
  created_at?: string
}

type ApiPayment = {
  id: string
  customer_id:
    | string
    | null
  invoice_id:
    | string
    | null
  account_id:
    | string
    | null
  external_payment_id:
    string
  provider: string
  amount:
    number |
    string
  currency: string
  status: string
  payment_method:
    string
  failure_reason:
    string | null
  provider_reference:
    string | null
  created_at?:
    string
  updated_at?:
    string
}

type ApiReconciliation = {
  id: string
  payment_id: string
  bank_transaction_id:
    string
  status:
    | 'matched'
    | 'partially_matched'
    | 'unmatched'
    | 'duplicate'
    | 'exception'
  matched_amount:
    number |
    string
  payment_amount:
    number |
    string
  transaction_amount:
    number |
    string
  currency: string
  match_score:
    number |
    string |
    null
  match_reason:
    string | null
  reconciliation_metadata:
    Record<
      string,
      unknown
    > | null
  created_at: string
  updated_at: string
}

// ============================================================
// COMPLETE BANK TRANSACTION PAGINATION
// ============================================================
//
// The banking API accepts a maximum page size of 100.
// Reconciliation needs the complete live bank history,
// not only the first 100 records.
//
// This helper keeps requesting:
//   offset=0
//   offset=100
//   offset=200
//   ...
//
// until:
//   1. an empty page is returned,
//   2. a page contains fewer than 100 records,
//   3. the API exposes a total and we reached it, or
//   4. the safety maxPages limit is reached.
//
// It also de-duplicates transactions by ID and sorts them
// newest-first so the reconciliation queue remains stable.
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

async function fetchAllBankTransactions(
  businessId: string,
): Promise<ApiBankTransaction[]> {
  const encodedBusinessId =
    encodeURIComponent(
      businessId,
    )

  const pageSize = 100
  const maxPages = 100

  const allTransactions: ApiBankTransaction[] =
    []

  for (
    let page = 0;
    page < maxPages;
    page += 1
  ) {
    const offset =
      page * pageSize

    const response =
      await apiFetch<BankTransactionPageResponse>(
        `/api/banking/transactions?business_id=${encodedBusinessId}&limit=${pageSize}&offset=${offset}`,
        {
          method: 'GET',
        },
      )

    let pageTransactions:
      ApiBankTransaction[] =
      []

    let total:
      number | null = null

    if (
      Array.isArray(
        response,
      )
    ) {
      pageTransactions =
        response
    } else if (
      response &&
      typeof response ===
        'object'
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

  const transactionsWithoutId:
    ApiBankTransaction[] =
    []

  for (
    const transaction of
      allTransactions
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
          b.transaction_date ||
            '',
        ).getTime() -
        new Date(
          a.transaction_date ||
            '',
        ).getTime()

      if (
        Number.isFinite(
          dateDiff,
        ) &&
        dateDiff !== 0
      ) {
        return dateDiff
      }

      return (
        new Date(
          b.created_at ||
            '',
        ).getTime() -
        new Date(
          a.created_at ||
            '',
        ).getTime()
      )
    },
  )
}

// ============================================================
// RECONCILIATION NORMALIZATION
// ============================================================

const normalizeReconStatus = (
  value: unknown,
): ReconStatus => {
  const status =
    String(
      value ?? '',
    )
      .trim()
      .toLowerCase()

  if (
    status ===
      'matched' ||
    status ===
      'partially_matched'
  ) {
    return 'Matched'
  }

  if (
    status.includes(
      'unmatched',
    )
  ) {
    return 'Unmatched'
  }

  if (
    status.includes(
      'exception',
    ) ||
    status.includes(
      'duplicate',
    )
  ) {
    return 'Needs Review'
  }

  if (
    status.includes(
      'suggest',
    ) ||
    status.includes(
      'proposed',
    )
  ) {
    return 'Suggested'
  }

  if (
    status.includes(
      'pending',
    ) ||
    status.includes(
      'review',
    )
  ) {
    return 'Needs Review'
  }

  return 'Needs Review'
}

const normalizeConfidence = (
  value: number,
): number => {
  if (
    value <= 1 &&
    value > 0
  ) {
    return Math.min(
      100,
      Math.max(
        0,
        value * 100,
      ),
    )
  }

  return Math.min(
    100,
    Math.max(
      0,
      value,
    ),
  )
}

const normalizeReconItem = (
  record: ApiRecord,
  payment?: ApiPayment,
  transaction?: ApiBankTransaction,
): ReconItem => {
  const reconciliationId =
    readString(
      record,
      ['id'],
      '',
    )

  const paymentId =
    readString(
      record,
      [
        'payment_id',
        'paymentId',
      ],
      payment?.id || '',
    )

  const bankTransactionId =
    readString(
      record,
      [
        'bank_transaction_id',
        'bankTransactionId',
      ],
      transaction?.id || '',
    )

  const date =
    transaction?.transaction_date ||
    payment?.created_at ||
    readString(
      record,
      [
        'transaction_date',
        'transactionDate',
        'date',
        'created_at',
        'createdAt',
      ],
      new Date().toISOString(),
    )

  const amount =
    readNumber(
      record,
      [
        'matched_amount',
        'transaction_amount',
        'transactionAmount',
        'payment_amount',
        'paymentAmount',
        'amount',
      ],
      Number(
        transaction?.amount ??
          payment?.amount ??
          0,
      ),
    )

  const description =
    transaction?.description ||
    readString(
      record,
      [
        'description',
        'transaction_description',
        'transactionDescription',
        'narration',
        'remarks',
      ],
      payment
        ? `${payment.payment_method || 'Payment'} transaction`
        : 'Bank transaction',
    )

  const source =
    transaction?.id
      ? readString(
          transaction as ApiRecord,
          [
            'source',
            'account_name',
            'accountName',
            'bank_name',
            'bankName',
          ],
          'Connected bank account',
        )
      : 'Payment reconciliation'

  const reference =
    transaction?.reference_number ||
    payment?.provider_reference ||
    payment?.external_payment_id ||
    readString(
      record,
      [
        'reference',
        'reference_id',
        'referenceId',
        'utr',
        'transaction_reference',
        'transactionReference',
      ],
      reconciliationId ||
        paymentId ||
        bankTransactionId,
    )

  const status =
    normalizeReconStatus(
      record.status,
    )

  const rawScore =
    readNumber(
      record,
      [
        'match_score',
        'matchScore',
        'confidence',
        'match_confidence',
        'matchConfidence',
      ],
      status === 'Matched'
        ? 100
        : status ===
              'Suggested'
          ? 85
          : 50,
    )

  const confidence =
    normalizeConfidence(
      rawScore,
    )

  const systemRecord =
    payment?.invoice_id
      ? `Invoice ${payment.invoice_id}`
      : readString(
          record,
          [
            'system_record',
            'systemRecord',
            'suggested_record',
            'suggestedRecord',
            'document_number',
            'documentNumber',
            'invoice_number',
            'invoiceNumber',
          ],
          paymentId
            ? `Payment ${paymentId}`
            : 'No linked payment record',
        )

  const counterparty =
    transaction?.customer_id ||
    transaction?.supplier_id ||
    payment?.customer_id ||
    readString(
      record,
      [
        'counterparty',
        'counterparty_name',
        'counterpartyName',
        'customer_name',
        'customerName',
        'vendor_name',
        'vendorName',
        'party_name',
        'partyName',
      ],
      'Business counterparty',
    )

  const type =
    transaction?.transaction_type ||
    (payment?.invoice_id
      ? 'Credit'
      : 'Debit')

  const documentType =
    payment?.invoice_id
      ? 'Invoice payment'
      : readString(
          record,
          [
            'document_type',
            'documentType',
            'record_type',
            'recordType',
          ],
          'Financial record',
        )

  const paymentStatus =
    payment?.status ||
    readString(
      record,
      [
        'payment_status',
        'paymentStatus',
        'record_status',
      ],
      status,
    )

  return {
    id:
      bankTransactionId ||
      reconciliationId ||
      paymentId ||
      `RECON-${Date.now()}`,
    reconciliationId:
      reconciliationId ||
      undefined,
    paymentId:
      paymentId ||
      undefined,
    bankTransactionId:
      bankTransactionId ||
      undefined,
    date,
    description,
    amount: Math.abs(
      amount,
    ),
    source,
    reference,
    status,
    confidence,
    system:
      systemRecord,
    counterparty,
    type,
    documentType,
    paymentStatus,
    matchReason:
      readString(
        record,
        [
          'match_reason',
          'matchReason',
        ],
        '',
      ),
    raw: record,
  }
}

// ============================================================
// RECONCILIATION DATA LOADER
// ============================================================

async function fetchReconciliationData(): Promise<{
  items: ReconItem[]
  audit: AuditItem[]
}> {
  const businessId =
    getBusinessId()

  if (!businessId) {
    throw new Error(
      'Business ID is not configured.',
    )
  }

  const [
    reconciliationResponse,
    paymentResponse,
    transactionResponse,
  ] =
    await Promise.all([
      apiFetch<
        | {
            items?: ApiReconciliation[]
            total?: number
            limit?: number
            offset?: number
          }
        | ApiReconciliation[]
      >(
        '/api/payments/reconciliation?limit=100&offset=0',
        {
          method: 'GET',
        },
      ),

      apiFetch<
        ApiPayment[]
        | {
            items?: ApiPayment[]
            data?: ApiPayment[]
            payments?: ApiPayment[]
          }
      >(
        '/api/payments?limit=100&offset=0',
        {
          method: 'GET',
        },
      ),

      fetchAllBankTransactions(
        businessId,
      ),
    ])

  const reconciliationRecords =
    getApiArray(
      reconciliationResponse,
    ) as ApiRecord[]

  const paymentRecords =
    getApiArray(
      paymentResponse,
    ) as ApiRecord[]

  const transactionRecords =
    Array.isArray(
      transactionResponse,
    )
      ? transactionResponse
      : []

  const payments =
    paymentRecords.map(
      (
        record,
      ): ApiPayment => {
        return {
          id:
            readString(
              record,
              ['id'],
              '',
            ),

          customer_id:
            record.customer_id
              ? String(
                  record.customer_id,
                )
              : null,

          invoice_id:
            record.invoice_id
              ? String(
                  record.invoice_id,
                )
              : null,

          account_id:
            record.account_id
              ? String(
                  record.account_id,
                )
              : null,

          external_payment_id:
            readString(
              record,
              [
                'external_payment_id',
                'externalPaymentId',
              ],
              '',
            ),

          provider:
            readString(
              record,
              ['provider'],
              '',
            ),

          amount:
            readNumber(
              record,
              ['amount'],
            ),

          currency:
            readString(
              record,
              ['currency'],
              'INR',
            ),

          status:
            readString(
              record,
              ['status'],
              'pending',
            ),

          payment_method:
            readString(
              record,
              [
                'payment_method',
                'paymentMethod',
              ],
              'bank_transfer',
            ),

          failure_reason:
            record.failure_reason
              ? String(
                  record.failure_reason,
                )
              : null,

          provider_reference:
            record.provider_reference
              ? String(
                  record.provider_reference,
                )
              : null,

          created_at:
            record.created_at
              ? String(
                  record.created_at,
                )
              : undefined,

          updated_at:
            record.updated_at
              ? String(
                  record.updated_at,
                )
              : undefined,
        }
      },
    )

  const paymentMap =
    new Map<
      string,
      ApiPayment
    >()

  for (
    const payment of payments
  ) {
    if (payment.id) {
      paymentMap.set(
        payment.id,
        payment,
      )
    }
  }

  const transactionMap =
    new Map<
      string,
      ApiBankTransaction
    >()

  for (
    const transaction of
      transactionRecords
  ) {
    if (transaction.id) {
      transactionMap.set(
        transaction.id,
        transaction,
      )
    }
  }

  const items: ReconItem[] =
    []

  const reconciledTransactionIds =
    new Set<string>()

  for (
    const record of
      reconciliationRecords
  ) {
    const paymentId =
      readString(
        record,
        [
          'payment_id',
          'paymentId',
        ],
      )

    const transactionId =
      readString(
        record,
        [
          'bank_transaction_id',
          'bankTransactionId',
        ],
      )

    if (transactionId) {
      reconciledTransactionIds.add(
        transactionId,
      )
    }

    const payment =
      paymentMap.get(
        paymentId,
      )

    const transaction =
      transactionMap.get(
        transactionId,
      )

    items.push(
      normalizeReconItem(
        record,
        payment,
        transaction,
      ),
    )
  }

  for (
    const transaction of
      transactionRecords
  ) {
    if (
      !transaction.id ||
      reconciledTransactionIds.has(
        transaction.id,
      )
    ) {
      continue
    }

    const linkedPayment =
      transaction.invoice_payment_id
        ? paymentMap.get(
            transaction.invoice_payment_id,
          )
        : undefined

    const syntheticRecord:
      ApiRecord =
      {
        id:
          transaction.id,

        bank_transaction_id:
          transaction.id,

        transaction_amount:
          transaction.amount ?? 0,

        status:
          'unmatched',

        match_score:
          0,

        match_reason:
          'No reconciliation record exists for this bank transaction.',
      }

    items.push(
      normalizeReconItem(
        syntheticRecord,
        linkedPayment,
        transaction,
      ),
    )
  }

  items.sort(
    (a, b) =>
      new Date(
        b.date,
      ).getTime() -
      new Date(
        a.date,
      ).getTime(),
  )

  const audit: AuditItem[] =
    reconciliationRecords
      .filter(
        (record) =>
          normalizeReconStatus(
            record.status,
          ) === 'Matched',
      )
      .sort(
        (a, b) =>
          new Date(
            String(
              b.updated_at ??
                b.created_at ??
                '',
            ),
          ).getTime() -
          new Date(
            String(
              a.updated_at ??
                a.created_at ??
                '',
            ),
          ).getTime(),
      )
      .slice(0, 10)
      .map(
        (
          record,
          index,
        ) => {
          const payment =
            paymentMap.get(
              readString(
                record,
                [
                  'payment_id',
                  'paymentId',
                ],
              ),
            )

          const transaction =
            transactionMap.get(
              readString(
                record,
                [
                  'bank_transaction_id',
                  'bankTransactionId',
                ],
              ),
            )

          return {
            id:
              readString(
                record,
                ['id'],
                `AUD-${index + 1}`,
              ),

            description:
              transaction?.description ||
              `Payment ${payment?.id || 'reconciled'}`,

            system:
              payment?.invoice_id
                ? `Invoice ${payment.invoice_id}`
                : `Payment ${payment?.id || 'record'}`,

            amount:
              readNumber(
                record,
                [
                  'matched_amount',
                  'payment_amount',
                  'transaction_amount',
                ],
                Number(
                  payment?.amount ||
                    transaction?.amount ||
                    0,
                ),
              ),

            reconciledBy:
              'CashGuard user',

            date:
              String(
                record.updated_at ??
                  record.created_at ??
                  new Date().toISOString(),
              ),
          }
        },
      )

  return {
    items,
    audit,
  }
}

// ============================================================
// RECONCILIATION ACTION
// ============================================================

async function reconcilePayment(
  paymentId: string,
): Promise<ApiReconciliation> {
  return apiFetch<ApiReconciliation>(
    `/api/payments/${encodeURIComponent(
      paymentId,
    )}/reconcile`,
    {
      method: 'POST',
    },
  )
}

// ============================================================
// CONFIDENCE
// ============================================================

function Confidence({
  value,
}: {
  value: number
}) {
  const normalized =
    normalizeConfidence(
      value,
    )

  const tone =
    normalized >= 90
      ? 'high'
      : normalized >= 65
        ? 'medium'
        : 'low'

  return (
    <span
      className={`recon-confidence ${tone}`}
    >
      <i />
      {Math.round(
        normalized,
      )}% match
    </span>
  )
}

function ReconBadge({
  status,
}: {
  status: ReconStatus
}) {
  return (
    <span
      className={`recon-badge ${status
        .toLowerCase()
        .replace(
          /\s+/g,
          '-',
        )}`}
    >
      {status}
    </span>
  )
}

function ReconKpi({
  label,
  value,
  detail,
  tone,
}: {
  label: string
  value: string
  detail: string
  tone: Tone
}) {
  return (
    <section className="recon-kpi">
      <div>
        <span>
          {label}
        </span>

        <i
          className={tone}
        />
      </div>

      <strong>
        {value}
      </strong>

      <small>
        {detail}
      </small>
    </section>
  )
}

// ============================================================
// STATEMENT PERIOD HELPERS
// ============================================================

const statementPeriodLabel = (
  period: StatementPeriod,
): string => {
  switch (period) {
    case '7d':
      return 'Last 7 days'

    case '30d':
      return 'Last 30 days'

    case '90d':
      return 'Last 90 days'

    case 'month':
      return 'This month'

    case 'all':
      return 'All loaded'

    case 'live':
    default:
      return 'Live statement'
  }
}

const getTimestamp = (
  value: unknown,
): number | null => {
  if (!value) {
    return null
  }

  const timestamp =
    new Date(
      String(value),
    ).getTime()

  return Number.isFinite(
    timestamp,
  )
    ? timestamp
    : null
}

// ============================================================
// RECONCILIATION PAGE
// ============================================================

function ReconciliationPage() {
  const [
    items,
    setItems,
  ] =
    useState<
      ReconItem[]
    >([])

  const [
    audit,
    setAudit,
  ] =
    useState<
      AuditItem[]
    >([])

  const [
    selectedId,
    setSelectedId,
  ] =
    useState('')

  const [
    tab,
    setTab,
  ] =
    useState<
      | 'All'
      | 'Unmatched'
      | 'Needs Review'
      | 'Suggested Matches'
      | 'Matched'
    >('All')

  const [
    query,
    setQuery,
  ] =
    useState('')

  const [
    transactionType,
    setTransactionType,
  ] =
    useState('All')

  const [
    statementPeriod,
    setStatementPeriod,
  ] =
    useState<StatementPeriod>(
      'live',
    )

  const [
    statementOpen,
    setStatementOpen,
  ] =
    useState(false)

  const [
    notice,
    setNotice,
  ] =
    useState('')

  const [
    error,
    setError,
  ] =
    useState('')

  const [
    loading,
    setLoading,
  ] =
    useState(true)

  const [
    syncing,
    setSyncing,
  ] =
    useState(false)

  const [
    actionLoading,
    setActionLoading,
  ] =
    useState(false)

  const [
    drawer,
    setDrawer,
  ] =
    useState(false)

  // ----------------------------------------------------------
  // LIVE STATEMENT RANGE
  // ----------------------------------------------------------

  const liveStatementRange =
    useMemo(() => {
      let earliest: number | null =
        null

      let latest: number | null =
        null

      for (
        const item of items
      ) {
        const timestamp =
          getTimestamp(
            item.date,
          )

        if (
          timestamp === null
        ) {
          continue
        }

        if (
          earliest === null ||
          timestamp < earliest
        ) {
          earliest =
            timestamp
        }

        if (
          latest === null ||
          timestamp > latest
        ) {
          latest =
            timestamp
        }
      }

      return {
        earliest,
        latest,
      }
    }, [items])

  const liveStatementText =
    useMemo(() => {
      const {
        earliest,
        latest,
      } =
        liveStatementRange

      if (
        earliest === null ||
        latest === null
      ) {
        return 'No statement dates available'
      }

      return `${formatDate(
        new Date(
          earliest,
        ).toISOString(),
      )} – ${formatDate(
        new Date(
          latest,
        ).toISOString(),
      )}`
    }, [
      liveStatementRange,
    ])

  // ----------------------------------------------------------
  // STATEMENT FILTER
  // ----------------------------------------------------------

  const isItemInStatementPeriod =
    useCallback(
      (
        item: ReconItem,
      ): boolean => {
        const timestamp =
          getTimestamp(
            item.date,
          )

        if (
          timestamp === null
        ) {
          return false
        }

        if (
          statementPeriod ===
          'all'
        ) {
          return true
        }

        const {
          earliest,
          latest,
        } =
          liveStatementRange

        if (
          statementPeriod ===
            'live' &&
          earliest !== null &&
          latest !== null
        ) {
          return (
            timestamp >=
              earliest &&
            timestamp <=
              latest
          )
        }

        if (
          latest === null
        ) {
          return true
        }

        if (
          statementPeriod ===
          'month'
        ) {
          const latestDate =
            new Date(
              latest,
            )

          const startOfMonth =
            new Date(
              latestDate.getFullYear(),
              latestDate.getMonth(),
              1,
              0,
              0,
              0,
              0,
            )

          return (
            timestamp >=
              startOfMonth.getTime() &&
            timestamp <= latest
          )
        }

        const days =
          statementPeriod ===
          '7d'
            ? 7
            : statementPeriod ===
                '30d'
              ? 30
              : statementPeriod ===
                  '90d'
                ? 90
                : 0

        if (
          days <= 0
        ) {
          return true
        }

        const start =
          latest -
          (days - 1) *
            24 *
            60 *
            60 *
            1000

        return (
          timestamp >=
            start &&
          timestamp <=
            latest
        )
      },
      [
        statementPeriod,
        liveStatementRange,
      ],
    )

  // ----------------------------------------------------------
  // LOAD DATA
  // ----------------------------------------------------------

  const loadData =
    useCallback(
      async () => {
        try {
          setError('')
          setLoading(true)

          const data =
            await fetchReconciliationData()

          setItems(
            data.items,
          )

          setAudit(
            data.audit,
          )

          setSelectedId(
            (current) => {
              if (
                current &&
                data.items.some(
                  (item) =>
                    item.id ===
                    current,
                )
              ) {
                return current
              }

              return (
                data.items[0]
                  ?.id || ''
              )
            },
          )
        } catch (
          err
        ) {
          const apiError =
            err as Error & {
              status?: number
            }

          if (
            apiError.status ===
            401
          ) {
            setError(
              'Authentication failed. Please login again.',
            )
          } else if (
            apiError.status ===
            403
          ) {
            setError(
              'You are not authorized to access reconciliation data.',
            )
          } else {
            setError(
              err instanceof
                Error
                ? err.message
                : 'Unable to load reconciliation data.',
            )
          }

          setItems([])
          setAudit([])
          setSelectedId('')
        } finally {
          setLoading(false)
        }
      },
      [],
    )

  useEffect(() => {
    void loadData()

    const handleAuthChanged =
      () => {
        void loadData()
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
  }, [loadData])

  // ----------------------------------------------------------
  // PERIOD ITEMS
  // ----------------------------------------------------------

  const periodItems =
    useMemo(
      () =>
        items.filter(
          (
            item,
          ) =>
            isItemInStatementPeriod(
              item,
            ),
        ),
      [
        items,
        isItemInStatementPeriod,
      ],
    )

  // ----------------------------------------------------------
  // SUMMARY
  // ----------------------------------------------------------

  const summary =
    useMemo(
      () => {
        const total =
          periodItems.length

        const matched =
          periodItems.filter(
            (item) =>
              item.status ===
              'Matched',
          ).length

        const unmatched =
          periodItems.filter(
            (item) =>
              item.status ===
              'Unmatched',
          ).length

        const needsReview =
          periodItems.filter(
            (item) =>
              item.status ===
              'Needs Review',
          ).length

        const suggested =
          periodItems.filter(
            (item) =>
              item.status ===
              'Suggested',
          ).length

        const rate =
          total > 0
            ? Math.round(
                (matched /
                  total) *
                  1000,
              ) / 10
            : 0

        return {
          total,
          matched,
          unmatched,
          needsReview,
          suggested,
          rate,
        }
      },
      [periodItems],
    )

  // ----------------------------------------------------------
  // SELECTED
  // ----------------------------------------------------------

  const selected =
    periodItems.find(
      (item) =>
        item.id ===
        selectedId,
    ) ??
    periodItems[0] ??
    null

  // ----------------------------------------------------------
  // QUEUE FILTER
  // ----------------------------------------------------------

  const filtered =
    useMemo(() => {
      const value =
        query
          .trim()
          .toLowerCase()

      return periodItems.filter(
        (item) => {
          const statusMatch =
            tab === 'All' ||
            (tab ===
              'Suggested Matches'
              ? item.status ===
                'Suggested'
              : item.status ===
                tab)

          const searchMatch =
            !value ||
            [
              item.id,
              item.paymentId ||
                '',
              item.bankTransactionId ||
                '',
              item.description,
              item.counterparty,
              item.reference,
              item.system,
              item.source,
            ]
              .join(' ')
              .toLowerCase()
              .includes(
                value,
              )

          const typeMatch =
            transactionType ===
              'All' ||
            item.type
              .toLowerCase()
              .includes(
                transactionType.toLowerCase(),
              )

          return (
            statusMatch &&
            searchMatch &&
            typeMatch
          )
        },
      )
    }, [
      periodItems,
      tab,
      query,
      transactionType,
    ])

  // ----------------------------------------------------------
  // AUTO SELECT
  // ----------------------------------------------------------

  useEffect(() => {
    if (
      !filtered.length
    ) {
      return
    }

    const selectedVisible =
      filtered.some(
        (item) =>
          item.id ===
          selectedId,
      )

    if (
      !selectedVisible
    ) {
      setSelectedId(
        filtered[0].id,
      )
    }
  }, [
    filtered,
    selectedId,
  ])

  // ----------------------------------------------------------
  // UPDATE STATUS
  // ----------------------------------------------------------

  const updateStatus =
    async (
      status:
        | 'Matched'
        | 'Unmatched',
    ) => {
      if (
        !selected ||
        actionLoading
      ) {
        return
      }

      if (
        status === 'Matched' &&
        selected.status ===
          'Matched'
      ) {
        setNotice(
          'This transaction is already reconciled.',
        )

        return
      }

      if (
        status === 'Matched' &&
        !selected.paymentId
      ) {
        setError(
          'This transaction has no linked payment record, so it cannot be reconciled through the payment reconciliation API.',
        )

        return
      }

      if (
        status ===
        'Unmatched' &&
        !selected.paymentId
      ) {
        setItems(
          (current) =>
            current.map(
              (item) =>
                item.id ===
                selected.id
                  ? {
                      ...item,
                      status:
                        'Unmatched',
                    }
                  : item,
            ),
        )

        setNotice(
          `${selected.id} is now marked as unmatched.`,
        )

        return
      }

      try {
        setActionLoading(true)
        setError('')
        setNotice('')

        if (
          status ===
            'Matched' &&
          selected.paymentId
        ) {
          await reconcilePayment(
            selected.paymentId,
          )
        }

        setItems(
          (current) =>
            current.map(
              (item) =>
                item.id ===
                selected.id
                  ? {
                      ...item,
                      status,
                      confidence:
                        status ===
                        'Matched'
                          ? 100
                          : item.confidence,
                    }
                  : item,
            ),
        )

        setNotice(
          status ===
            'Matched'
            ? `${selected.id} was reconciled successfully.`
            : `${selected.id} was marked as unmatched.`,
        )

        if (
          status ===
          'Matched'
        ) {
          setDrawer(false)

          await loadData()
        }
      } catch (
        err
      ) {
        const apiError =
          err as Error & {
            status?: number
          }

        if (
          apiError.status ===
          401
        ) {
          setError(
            'Authentication failed. Please login again.',
          )
        } else if (
          apiError.status ===
          403
        ) {
          setError(
            'You are not authorized to reconcile this payment.',
          )
        } else {
          setError(
            err instanceof
              Error
              ? err.message
              : 'Unable to update reconciliation status.',
          )
        }
      } finally {
        setActionLoading(
          false,
        )
      }
    }

  // ----------------------------------------------------------
  // SYNC
  // ----------------------------------------------------------

  const syncData =
    async () => {
      if (syncing) {
        return
      }

      try {
        setSyncing(true)
        setError('')
        setNotice('')

        await loadData()

        setNotice(
          'Reconciliation data synced successfully. Live statement period was recalculated.',
        )
      } catch {
        // loadData handles errors.
      } finally {
        setSyncing(false)
      }
    }

  // ----------------------------------------------------------
  // TAB COUNT
  // ----------------------------------------------------------

  const tabCount = (
    label: string,
  ): number => {
    if (
      label ===
      'All'
    ) {
      return periodItems.length
    }

    if (
      label ===
      'Suggested Matches'
    ) {
      return periodItems.filter(
        (item) =>
          item.status ===
          'Suggested',
      ).length
    }

    return periodItems.filter(
      (item) =>
        item.status ===
        label,
    ).length
  }

  // ----------------------------------------------------------
  // CHOOSE PERIOD
  // ----------------------------------------------------------

  const chooseStatementPeriod =
    (
      period: StatementPeriod,
    ) => {
      setStatementPeriod(
        period,
      )

      setStatementOpen(
        false,
      )
    }

  // ----------------------------------------------------------
  // CURRENT PERIOD DESCRIPTION
  // ----------------------------------------------------------

  const currentPeriodDescription =
    useMemo(() => {
      if (
        statementPeriod ===
          'live' ||
        statementPeriod ===
          'all'
      ) {
        return liveStatementText
      }

      if (
        liveStatementRange.latest ===
        null
      ) {
        return 'No transaction dates available'
      }

      const latest =
        new Date(
          liveStatementRange.latest,
        )

      if (
        statementPeriod ===
        'month'
      ) {
        return `${latest.toLocaleString(
          'en-IN',
          {
            month:
              'short',
          },
        )} ${latest.getFullYear()}`
      }

      const days =
        statementPeriod ===
        '7d'
          ? 7
          : statementPeriod ===
              '30d'
            ? 30
            : 90

      const start =
        liveStatementRange.latest -
        (days - 1) *
          24 *
          60 *
          60 *
          1000

      return `${formatDate(
        new Date(
          start,
        ).toISOString(),
      )} – ${formatDate(
        new Date(
          liveStatementRange.latest,
        ).toISOString(),
      )}`
    }, [
      statementPeriod,
      liveStatementText,
      liveStatementRange,
    ])

  // ----------------------------------------------------------
  // RENDER
  // ----------------------------------------------------------

  return (
    <main className="foundation-content reconciliation-page">
      <div className="recon-header">
        <div>
          <p className="auth-eyebrow">
            RECONCILIATION · LIVE
          </p>

          <h2>
            Reconciliation
          </h2>

          <p>
            Match bank activity with
            CashGuard-AI records and
            resolve exceptions.
          </p>
        </div>

        <div className="recon-header-actions">

          {/* LIVE STATEMENT PERIOD */}

          <div
            style={{
              position:
                'relative',
            }}
          >
            <button
              type="button"
              className="recon-select"
              onClick={() =>
                setStatementOpen(
                  (current) =>
                    !current,
                )
              }
              aria-expanded={
                statementOpen
              }
              aria-haspopup="menu"
            >
              <CalendarDays
                size={15}
              />

              <span
                style={{
                  display:
                    'flex',
                  flexDirection:
                    'column',
                  alignItems:
                    'flex-start',
                  lineHeight:
                    1.2,
                }}
              >
                <span>
                  {statementPeriodLabel(
                    statementPeriod,
                  )}
                </span>

                <small
                  style={{
                    marginTop:
                      2,
                    opacity:
                      0.65,
                    fontSize:
                      10,
                  }}
                >
                  {
                    currentPeriodDescription
                  }
                </small>
              </span>
            </button>

            {statementOpen && (
              <div
                role="menu"
                style={{
                  position:
                    'absolute',
                  top:
                    'calc(100% + 8px)',
                  right: 0,
                  zIndex:
                    100,
                  width:
                    280,
                  padding:
                    8,
                  border:
                    '1px solid rgba(15, 23, 42, 0.10)',
                  borderRadius:
                    14,
                  background:
                    '#ffffff',
                  boxShadow:
                    '0 16px 40px rgba(15, 23, 42, 0.14)',
                }}
              >
                <div
                  style={{
                    padding:
                      '8px 10px 10px',
                    borderBottom:
                      '1px solid rgba(15, 23, 42, 0.08)',
                    marginBottom:
                      6,
                  }}
                >
                  <strong
                    style={{
                      display:
                        'block',
                      fontSize:
                        13,
                    }}
                  >
                    Statement period
                  </strong>

                  <small
                    style={{
                      display:
                        'block',
                      marginTop:
                        4,
                      opacity:
                        0.65,
                    }}
                  >
                    Based on live banking
                    transaction dates.
                  </small>
                </div>

                {(
                  [
                    [
                      'live',
                      'Live statement',
                      liveStatementText,
                    ],
                    [
                      '7d',
                      'Last 7 days',
                      'Latest live transaction window',
                    ],
                    [
                      '30d',
                      'Last 30 days',
                      'Latest live transaction window',
                    ],
                    [
                      '90d',
                      'Last 90 days',
                      'Latest live transaction window',
                    ],
                    [
                      'month',
                      'This month',
                      'Month of latest live transaction',
                    ],
                    [
                      'all',
                      'All loaded',
                      'All currently fetched bank transactions',
                    ],
                  ] as [
                    StatementPeriod,
                    string,
                    string,
                  ][]
                ).map(
                  ([
                    value,
                    label,
                    detail,
                  ]) => (
                    <button
                      key={
                        value
                      }
                      type="button"
                      role="menuitem"
                      onClick={() =>
                        chooseStatementPeriod(
                          value,
                        )
                      }
                      style={{
                        width:
                          '100%',
                        display:
                          'flex',
                        alignItems:
                          'flex-start',
                        justifyContent:
                          'space-between',
                        gap: 12,
                        padding:
                          '9px 10px',
                        border: 0,
                        borderRadius:
                          10,
                        background:
                          statementPeriod ===
                          value
                            ? 'rgba(14, 165, 233, 0.10)'
                            : 'transparent',
                        cursor:
                          'pointer',
                        textAlign:
                          'left',
                      }}
                    >
                      <span>
                        <strong
                          style={{
                            display:
                              'block',
                            fontSize:
                              12,
                          }}
                        >
                          {label}
                        </strong>

                        <small
                          style={{
                            display:
                              'block',
                            marginTop:
                              3,
                            opacity:
                              0.62,
                            fontSize:
                              10,
                          }}
                        >
                          {detail}
                        </small>
                      </span>

                      {statementPeriod ===
                        value && (
                        <Check
                          size={
                            15
                          }
                        />
                      )}
                    </button>
                  ),
                )}
              </div>
            )}
          </div>

          {/* ACCOUNT */}

          <button
            type="button"
            className="recon-select"
            onClick={() =>
              setNotice(
                'Account-level filtering requires an account identifier from the banking API. The current live schema is business-level, so All accounts is the correct live scope.',
              )
            }
          >
            <SlidersHorizontal
              size={15}
            />

            All accounts
          </button>

          {/* SYNC */}

          <button
            type="button"
            className="secondary-button"
            onClick={() =>
              void syncData()
            }
            disabled={
              syncing ||
              loading
            }
          >
            <RefreshCw
              size={14}
              className={
                syncing
                  ? 'animate-spin'
                  : ''
              }
            />

            {syncing
              ? 'Syncing...'
              : 'Sync'}
          </button>
        </div>
      </div>

      {/* STATUS */}

      {error && (
        <div
          className="operations-success"
          style={{
            borderColor:
              '#ef4444',
          }}
        >
          <X size={16} />

          <span>
            {error}
          </span>

          <button
            type="button"
            aria-label="Dismiss error"
            onClick={() =>
              setError('')
            }
          >
            <X size={15} />
          </button>
        </div>
      )}

      {notice && (
        <div className="operations-success">
          <CheckCircle2
            size={16}
          />

          <span>
            {notice}
          </span>

          <button
            type="button"
            aria-label="Dismiss"
            onClick={() =>
              setNotice('')
            }
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* PERIOD INFO */}

      <div
        style={{
          display:
            'flex',
          alignItems:
            'center',
          gap: 8,
          marginBottom: 14,
          fontSize: 12,
          opacity: 0.72,
        }}
      >
        <CalendarDays
          size={14}
        />

        <span>
          Showing:
        </span>

        <strong>
          {statementPeriodLabel(
            statementPeriod,
          )}
        </strong>

        <span>
          ·
        </span>

        <span>
          {
            currentPeriodDescription
          }
        </span>
      </div>

      {/* KPIs */}

      <div className="recon-kpis">
        <ReconKpi
          label="Total transactions"
          value={String(
            summary.total,
          )}
          detail="Live connected data"
          tone="blue"
        />

        <ReconKpi
          label="Matched"
          value={String(
            summary.matched,
          )}
          detail={`${summary.rate}% successfully matched`}
          tone="green"
        />

        <ReconKpi
          label="Unmatched"
          value={String(
            summary.unmatched,
          )}
          detail="Require attention"
          tone="red"
        />

        <ReconKpi
          label="Needs review"
          value={String(
            summary.needsReview,
          )}
          detail="Require confirmation"
          tone="amber"
        />

        <ReconKpi
          label="Reconciliation rate"
          value={`${summary.rate}%`}
          detail="Calculated from live data"
          tone="green"
        />
      </div>

      {/* ACTIVE REVIEW */}

      <section className="recon-workspace">
        <div className="recon-workspace-head">
          <div>
            <p className="auth-eyebrow">
              ACTIVE REVIEW ·{' '}
              {selected?.id ||
                'NO TRANSACTION'}
            </p>

            <h3>
              {selected
                ? selected.status ===
                  'Matched'
                  ? 'Matched transaction'
                  : 'Suggested match'
                : 'No active review'}
            </h3>

            <p>
              {selected
                ? 'Compare bank activity and the linked CashGuard record before confirming the reconciliation.'
                : 'Select a transaction from the live queue to review it.'}
            </p>
          </div>

          <button
            type="button"
            className="icon-action"
            aria-label="More transaction actions"
            onClick={() =>
              setDrawer(true)
            }
            disabled={!selected}
          >
            <MoreHorizontal
              size={18}
            />
          </button>
        </div>

        {loading ? (
          <div className="recon-empty">
            <RefreshCw
              size={20}
              className="animate-spin"
            />

            <b>
              Loading live reconciliation data...
            </b>

            <span>
              Fetching payments,
              reconciliation records and
              complete banking transaction
              history.
            </span>
          </div>
        ) : selected ? (
          <>
            <div className="recon-split">

              {/* BANK */}

              <div className="recon-transaction">
                <div className="recon-side-label">
                  <span className="recon-source-icon bank">
                    {selected.source
                      .trim()
                      .charAt(0)
                      .toUpperCase() ||
                      'B'}
                  </span>

                  <div>
                    <b>
                      Bank transaction
                    </b>

                    <small>
                      {selected.source}
                    </small>
                  </div>
                </div>

                <strong className="recon-amount">
                  {formatCurrency(
                    selected.amount,
                  )}
                </strong>

                <div className="recon-detail-list">
                  <div>
                    <span>
                      Transaction date
                    </span>

                    <b>
                      {formatDate(
                        selected.date,
                      )}
                    </b>
                  </div>

                  <div>
                    <span>
                      Description
                    </span>

                    <b>
                      {
                        selected.description
                      }
                    </b>
                  </div>

                  <div>
                    <span>
                      Reference / UTR
                    </span>

                    <b>
                      {
                        selected.reference
                      }
                    </b>
                  </div>

                  <div>
                    <span>
                      Type
                    </span>

                    <b>
                      {
                        selected.type
                      }
                    </b>
                  </div>

                  <div>
                    <span>
                      Bank transaction ID
                    </span>

                    <b>
                      {
                        selected.bankTransactionId ||
                        '-'
                      }
                    </b>
                  </div>
                </div>
              </div>

              {/* MATCH */}

              <div className="recon-match-column">
                <div className="confidence-panel">
                  <span>
                    Match confidence
                  </span>

                  <strong>
                    {selected.confidence >=
                    90
                      ? 'High'
                      : selected.confidence >=
                          65
                        ? 'Medium'
                        : 'Low'}{' '}
                    confidence
                  </strong>

                  <Confidence
                    value={
                      selected.confidence
                    }
                  />

                  {selected.matchReason && (
                    <small>
                      {
                        selected.matchReason
                      }
                    </small>
                  )}
                </div>

                <div className="match-evidence">
                  <p>
                    <Check size={13} />
                    Payment record checked
                  </p>

                  <p>
                    <Check size={13} />
                    Bank transaction checked
                  </p>

                  <p>
                    <Check size={13} />
                    Reconciliation status checked
                  </p>
                </div>

                <button
                  type="button"
                  className="auth-button compact"
                  onClick={() =>
                    void updateStatus(
                      'Matched',
                    )
                  }
                  disabled={
                    actionLoading ||
                    !selected.paymentId ||
                    selected.status ===
                      'Matched'
                  }
                >
                  {actionLoading ? (
                    <RefreshCw
                      size={15}
                      className="animate-spin"
                    />
                  ) : (
                    <Check size={15} />
                  )}

                  {actionLoading
                    ? 'Updating...'
                    : selected.status ===
                        'Matched'
                      ? 'Already matched'
                      : selected.paymentId
                        ? 'Confirm match'
                        : 'No payment to match'}
                </button>

                <button
                  type="button"
                  className="recon-link-button"
                  onClick={() =>
                    setNotice(
                      'Choose another transaction from the live reconciliation queue.',
                    )
                  }
                >
                  Find another match
                </button>
              </div>

              {/* CASHGUARD */}

              <div className="recon-transaction system">
                <div className="recon-side-label">
                  <span className="recon-source-icon system">
                    C
                  </span>

                  <div>
                    <b>
                      CashGuard record
                    </b>

                    <small>
                      {
                        selected.system
                      }
                    </small>
                  </div>
                </div>

                <strong className="recon-amount">
                  {formatCurrency(
                    selected.amount,
                  )}
                </strong>

                <div className="recon-detail-list">
                  <div>
                    <span>
                      Document type
                    </span>

                    <b>
                      {
                        selected.documentType
                      }
                    </b>
                  </div>

                  <div>
                    <span>
                      Payment ID
                    </span>

                    <b>
                      {
                        selected.paymentId ||
                        '-'
                      }
                    </b>
                  </div>

                  <div>
                    <span>
                      Customer / vendor
                    </span>

                    <b>
                      {
                        selected.counterparty
                      }
                    </b>
                  </div>

                  <div>
                    <span>
                      Payment status
                    </span>

                    <b>
                      <ReconBadge
                        status={
                          selected.status
                        }
                      />
                    </b>
                  </div>
                </div>
              </div>
            </div>

            <div className="recon-secondary-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() =>
                  void updateStatus(
                    'Unmatched',
                  )
                }
                disabled={
                  actionLoading
                }
              >
                Mark as unmatched
              </button>

              <button
                type="button"
                className="secondary-button"
                onClick={() =>
                  setNotice(
                    'Adjustment requires a dedicated ledger adjustment endpoint. The current reconciliation flow is using the live payment reconciliation API.',
                  )
                }
              >
                Create adjustment
              </button>

              <button
                type="button"
                className="secondary-button"
                onClick={() =>
                  setDrawer(true)
                }
              >
                Review details
              </button>
            </div>
          </>
        ) : (
          <div className="recon-empty">
            <Search size={20} />

            <b>
              No reconciliation transactions available.
            </b>

            <span>
              No matching payment or bank
              transaction records were
              returned for this statement
              period.
            </span>

            <button
              type="button"
              className="secondary-button"
              onClick={() =>
                void syncData()
              }
            >
              <RefreshCw
                size={14}
              />
              Refresh data
            </button>
          </div>
        )}
      </section>

      {/* QUEUE */}

      <section className="recon-queue">
        <div className="recon-section-head">
          <div>
            <p className="auth-eyebrow">
              TRANSACTION QUEUE
            </p>

            <h3>
              Reconciliation queue
            </h3>

            <p>
              Review live reconciled,
              unmatched and exception
              transactions for the
              selected statement period.
            </p>
          </div>

          <button
            type="button"
            className="secondary-button"
            onClick={() =>
              setNotice(
                'Export queue is ready for connection to the reconciliation report endpoint.',
              )
            }
          >
            <ArrowUpRight
              size={14}
            />
            Export queue
          </button>
        </div>

        <div className="recon-tabs">
          {[
            'All',
            'Unmatched',
            'Needs Review',
            'Suggested Matches',
            'Matched',
          ].map(
            (label) => (
              <button
                type="button"
                key={label}
                className={
                  tab ===
                  label
                    ? 'active'
                    : ''
                }
                onClick={() =>
                  setTab(
                    label as
                      typeof tab,
                  )
                }
              >
                {label}

                <span>
                  {tabCount(
                    label,
                  )}
                </span>
              </button>
            ),
          )}
        </div>

        <div className="recon-filterbar">
          <div className="search-control">
            <Search
              size={15}
            />

            <input
              aria-label="Search reconciliation"
              placeholder="Search description, counterparty or reference"
              value={query}
              onChange={(event) =>
                setQuery(
                  event.target
                    .value,
                )
              }
            />
          </div>

          <select
            aria-label="Transaction type"
            value={
              transactionType
            }
            onChange={(event) =>
              setTransactionType(
                event.target
                  .value,
              )
            }
          >
            <option>
              All
            </option>

            <option>
              Credit
            </option>

            <option>
              Debit
            </option>
          </select>

          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              setQuery('')
              setTab('All')
              setTransactionType(
                'All',
              )
            }}
          >
            Reset filters
          </button>

          <button
            type="button"
            className="secondary-button"
            onClick={() =>
              void syncData()
            }
            disabled={syncing}
          >
            <RefreshCw
              size={14}
              className={
                syncing
                  ? 'animate-spin'
                  : ''
              }
            />

            Refresh
          </button>
        </div>

        <div className="recon-table">
          <div className="recon-table-head">
            <span>
              Transaction
            </span>

            <span>
              Amount
            </span>

            <span>
              Suggested record
            </span>

            <span>
              Confidence
            </span>

            <span>
              Status
            </span>

            <span />
          </div>

          {filtered.length ? (
            filtered.map(
              (item) => (
                <button
                  type="button"
                  className={`recon-row ${
                    selectedId ===
                    item.id
                      ? 'selected'
                      : ''
                  }`}
                  key={
                    `${item.id}-${item.reconciliationId || item.paymentId || ''}`
                  }
                  onClick={() => {
                    setSelectedId(
                      item.id,
                    )

                    setDrawer(
                      false,
                    )
                  }}
                >
                  <span>
                    <b>
                      {
                        item.description
                      }
                    </b>

                    <small>
                      {formatDate(
                        item.date,
                      )}{' '}
                      ·{' '}
                      {
                        item.reference
                      }
                    </small>
                  </span>

                  <strong>
                    {formatCurrency(
                      item.amount,
                    )}
                  </strong>

                  <span>
                    <b>
                      {
                        item.system
                      }
                    </b>

                    <small>
                      {
                        item.counterparty
                      }
                    </small>
                  </span>

                  <Confidence
                    value={
                      item.confidence
                    }
                  />

                  <ReconBadge
                    status={
                      item.status
                    }
                  />

                  <ArrowUpRight
                    size={15}
                  />
                </button>
              ),
            )
          ) : (
            <div className="recon-empty">
              <Search size={20} />

              <b>
                No matching transactions found.
              </b>

              <span>
                Try another statement
                period, search term or
                reconciliation status.
              </span>
            </div>
          )}
        </div>
      </section>

      {/* AUDIT */}

      <section className="recon-recent">
        <div className="recon-section-head">
          <div>
            <p className="auth-eyebrow">
              AUDIT TRAIL
            </p>

            <h3>
              Recently reconciled
            </h3>

            <p>
              Latest confirmed activity
              from the live reconciliation
              data.
            </p>
          </div>
        </div>

        <div className="recon-recent-grid">
          {audit.length ? (
            audit
              .slice(0, 6)
              .map(
                (item) => (
                  <div
                    key={item.id}
                  >
                    <span className="recon-check">
                      <Check
                        size={13}
                      />
                    </span>

                    <div>
                      <b>
                        {
                          item.description
                        }
                      </b>

                      <small>
                        {
                          item.system
                        }{' '}
                        · reconciled by{' '}
                        {
                          item.reconciledBy
                        }
                      </small>
                    </div>

                    <strong>
                      {formatCurrency(
                        item.amount,
                      )}
                    </strong>

                    <small>
                      {formatDate(
                        item.date,
                      )}
                    </small>
                  </div>
                ),
              )
          ) : (
            <div className="recon-empty">
              <CheckCircle2
                size={20}
              />

              <b>
                No reconciled activity yet.
              </b>

              <span>
                Confirm a live payment
                reconciliation and it will
                appear here.
              </span>
            </div>
          )}
        </div>
      </section>

      {/* DRAWER */}

      {drawer &&
        selected && (
          <div
            className="recon-drawer-backdrop"
            onClick={() =>
              setDrawer(false)
            }
          >
            <aside
              className="recon-drawer"
              onClick={(event) =>
                event.stopPropagation()
              }
            >
              <div className="recon-drawer-head">
                <div>
                  <p className="auth-eyebrow">
                    TRANSACTION REVIEW
                  </p>

                  <h3>
                    {selected.id}
                  </h3>
                </div>

                <button
                  type="button"
                  className="icon-action"
                  aria-label="Close details"
                  onClick={() =>
                    setDrawer(false)
                  }
                >
                  <X size={18} />
                </button>
              </div>

              <div className="recon-drawer-amount">
                <span>
                  {
                    selected.description
                  }
                </span>

                <strong>
                  {formatCurrency(
                    selected.amount,
                  )}
                </strong>

                <ReconBadge
                  status={
                    selected.status
                  }
                />
              </div>

              {[
                [
                  'Transaction date',
                  formatDate(
                    selected.date,
                  ),
                ],
                [
                  'Bank transaction ID',
                  selected.bankTransactionId ||
                    '-',
                ],
                [
                  'Payment ID',
                  selected.paymentId ||
                    '-',
                ],
                [
                  'Bank reference',
                  selected.reference,
                ],
                [
                  'Bank source',
                  selected.source,
                ],
                [
                  'Counterparty',
                  selected.counterparty,
                ],
                [
                  'System record',
                  selected.system,
                ],
                [
                  'Matching confidence',
                  `${Math.round(
                    selected.confidence,
                  )}%`,
                ],
                [
                  'Match reason',
                  selected.matchReason ||
                    'No additional match reason provided.',
                ],
              ].map(
                ([
                  title,
                  value,
                ]) => (
                  <div
                    className="recon-drawer-section"
                    key={title}
                  >
                    <span>
                      {title}
                    </span>

                    <b>
                      {value}
                    </b>
                  </div>
                ),
              )}

              <div className="recon-drawer-actions">
                <button
                  type="button"
                  className="auth-button compact"
                  onClick={() =>
                    void updateStatus(
                      'Matched',
                    )
                  }
                  disabled={
                    actionLoading ||
                    !selected.paymentId ||
                    selected.status ===
                      'Matched'
                  }
                >
                  {actionLoading ? (
                    <RefreshCw
                      size={15}
                      className="animate-spin"
                    />
                  ) : (
                    <Check
                      size={15}
                    />
                  )}

                  {actionLoading
                    ? 'Updating...'
                    : selected.status ===
                        'Matched'
                      ? 'Already matched'
                      : selected.paymentId
                        ? 'Confirm match'
                        : 'No linked payment'}
                </button>

                <button
                  type="button"
                  className="secondary-button"
                  onClick={() =>
                    void updateStatus(
                      'Unmatched',
                    )
                  }
                  disabled={
                    actionLoading
                  }
                >
                  Mark unmatched
                </button>

                <button
                  type="button"
                  className="secondary-button"
                  onClick={() =>
                    setDrawer(false)
                  }
                >
                  Close review
                </button>
              </div>
            </aside>
          </div>
        )}
    </main>
  )
}

// ============================================================
// RISK PAGE
// ============================================================

type RiskLevel =
  | 'Low'
  | 'Medium'
  | 'High'
  | 'Critical'

type RiskCategory =
  | 'Cash Flow'
  | 'Customer Payment'
  | 'Invoice'
  | 'Vendor / Payable'
  | 'Transaction Anomaly'

type RiskItem = {
  id: string
  title: string
  source: string
  amount: string
  level: RiskLevel
  category: RiskCategory
  reason: string
  action: string
  date: string
  impact: string
  signals: string[]
  numericAmount: number
}

type RiskLiveData = {
  transactions: ApiBankTransaction[]
  payments: ApiRecord[]
}

const normalizeRiskLevel = (
  score: number,
): RiskLevel => {
  if (score >= 80) {
    return 'Critical'
  }

  if (score >= 60) {
    return 'High'
  }

  if (score >= 35) {
    return 'Medium'
  }

  return 'Low'
}

const normalizePaymentStatus = (
  value: unknown,
): string =>
  String(value ?? '')
    .trim()
    .toLowerCase()

const riskDateValue = (
  value: unknown,
): number => {
  const timestamp = new Date(
    String(value ?? ''),
  ).getTime()

  return Number.isFinite(timestamp)
    ? timestamp
    : 0
}

const formatRiskDate = (
  value: unknown,
): string => {
  if (!value) {
    return 'Live'
  }

  const timestamp = riskDateValue(value)

  if (!timestamp) {
    return 'Live'
  }

  return formatDate(
    new Date(timestamp).toISOString(),
  )
}

const getRiskPaymentCounterparty = (
  payment: ApiRecord,
): string =>
  readString(
    payment,
    [
      'customer_name',
      'customerName',
      'vendor_name',
      'vendorName',
      'counterparty',
      'counterparty_name',
      'counterpartyName',
      'customer_id',
      'supplier_id',
      'external_payment_id',
      'id',
    ],
    'Business payment',
  )

const buildRiskItems = (
  data: RiskLiveData,
): RiskItem[] => {
  const transactions = data.transactions
  const payments = data.payments

  const items: RiskItem[] = []

  const sortedTransactions = [...transactions].sort(
    (a, b) =>
      riskDateValue(b.transaction_date || b.created_at) -
      riskDateValue(a.transaction_date || a.created_at),
  )

  const numericAmounts = sortedTransactions
    .map((row) => Math.abs(toNumber(row.amount)))
    .filter((amount) => amount > 0)
    .sort((a, b) => b - a)

  const medianAmount =
    numericAmounts.length > 0
      ? numericAmounts[Math.floor(numericAmounts.length / 2)]
      : 0

  const recentTransactions = sortedTransactions.filter(
    (row) => {
      const timestamp = riskDateValue(
        row.transaction_date || row.created_at,
      )

      if (!timestamp) {
        return false
      }

      return (
        Date.now() - timestamp <=
        30 * 24 * 60 * 60 * 1000
      )
    },
  )

  const recentCredits = recentTransactions.filter(
    (row) =>
      normalizeTransactionType(row.transaction_type) ===
      'Credit',
  )

  const recentDebits = recentTransactions.filter(
    (row) =>
      normalizeTransactionType(row.transaction_type) ===
      'Debit',
  )

  const recentCreditTotal = recentCredits.reduce(
    (sum, row) => sum + Math.abs(toNumber(row.amount)),
    0,
  )

  const recentDebitTotal = recentDebits.reduce(
    (sum, row) => sum + Math.abs(toNumber(row.amount)),
    0,
  )

  const netRecentFlow =
    recentCreditTotal - recentDebitTotal

  const failedPayments = payments.filter((payment) => {
    const status = normalizePaymentStatus(payment.status)

    return [
      'failed',
      'cancelled',
      'declined',
      'rejected',
    ].includes(status)
  })

  const pendingPayments = payments.filter((payment) => {
    const status = normalizePaymentStatus(payment.status)

    return [
      'pending',
      'processing',
      'scheduled',
      'created',
    ].includes(status)
  })

  const paymentTotal = payments.reduce(
    (sum, payment) =>
      sum + Math.abs(readNumber(payment, ['amount'])),
    0,
  )

  const failedPaymentAmount = failedPayments.reduce(
    (sum, payment) =>
      sum + Math.abs(readNumber(payment, ['amount'])),
    0,
  )

  const pendingPaymentAmount = pendingPayments.reduce(
    (sum, payment) =>
      sum + Math.abs(readNumber(payment, ['amount'])),
    0,
  )

  const paymentFailureRate =
    payments.length > 0
      ? failedPayments.length / payments.length
      : 0

  const debitShare =
    recentDebitTotal + recentCreditTotal > 0
      ? recentDebitTotal /
        (recentDebitTotal + recentCreditTotal)
      : 0

  const hasNegativeNetFlow = netRecentFlow < 0

  const largeTransactions = sortedTransactions.filter(
    (row) => {
      const amount = Math.abs(toNumber(row.amount))

      if (amount <= 0 || !medianAmount) {
        return false
      }

      return amount >= medianAmount * 2.5
    },
  )

  const unusualTransaction = largeTransactions[0]

  if (hasNegativeNetFlow || debitShare >= 0.65) {
    const score = hasNegativeNetFlow
      ? debitShare >= 0.75
        ? 88
        : 72
      : 58

    const level = normalizeRiskLevel(score)
    const amount = Math.abs(netRecentFlow)

    items.push({
      id: 'LIVE-CASH-FLOW',
      title: 'Live cash flow position',
      source: 'Bank transaction activity',
      amount: formatCurrency(amount),
      level,
      category: 'Cash Flow',
      reason: hasNegativeNetFlow
        ? 'Recent outgoing bank activity is higher than incoming activity.'
        : 'Outgoing transaction activity represents a high share of recent cash movement.',
      action: 'Protect liquidity',
      date: formatRiskDate(
        sortedTransactions[0]?.transaction_date ||
          sortedTransactions[0]?.created_at,
      ),
      impact: hasNegativeNetFlow
        ? 'Near-term liquidity pressure'
        : 'Higher cash burn exposure',
      signals: [
        `${formatCurrency(recentCreditTotal)} recent inflows`,
        `${formatCurrency(recentDebitTotal)} recent outflows`,
        hasNegativeNetFlow
          ? `${formatCurrency(amount)} negative net movement`
          : `${Math.round(debitShare * 100)}% of recent movement is outgoing`,
      ],
      numericAmount: amount,
    })
  }

  if (failedPayments.length > 0) {
    const score =
      failedPayments.length >= 5 || paymentFailureRate >= 0.2
        ? 78
        : failedPaymentAmount >= 100000
          ? 68
          : 52

    const level = normalizeRiskLevel(score)
    const amount = failedPaymentAmount

    items.push({
      id: 'LIVE-PAYMENT-RISK',
      title:
        failedPayments.length === 1
          ? getRiskPaymentCounterparty(failedPayments[0])
          : `${failedPayments.length} failed payments`,
      source: 'Payment activity',
      amount: formatCurrency(amount),
      level,
      category: 'Customer Payment',
      reason:
        failedPayments.length === 1
          ? 'A payment failed and requires review before it becomes a collection or execution issue.'
          : `${failedPayments.length} payment records are currently in a failed or rejected state.`,
      action: 'Review payment execution',
      date: formatRiskDate(
        failedPayments[0]?.created_at,
      ),
      impact: 'Payment execution risk',
      signals: [
        `${failedPayments.length} failed payment record${failedPayments.length === 1 ? '' : 's'}`,
        `${formatCurrency(amount)} failed payment value`,
        `${Math.round(paymentFailureRate * 100)}% of loaded payments failed`,
      ],
      numericAmount: amount,
    })
  }

  if (pendingPayments.length > 0) {
    const score =
      pendingPaymentAmount >= 250000
        ? 64
        : pendingPayments.length >= 8
          ? 56
          : 42

    const level = normalizeRiskLevel(score)
    const amount = pendingPaymentAmount

    items.push({
      id: 'LIVE-PENDING-PAYMENTS',
      title: `${pendingPayments.length} pending payment${pendingPayments.length === 1 ? '' : 's'}`,
      source: 'Payment queue',
      amount: formatCurrency(amount),
      level,
      category: 'Vendor / Payable',
      reason:
        'Pending or scheduled payments represent outgoing obligations that have not completed yet.',
      action: 'Review payment schedule',
      date: formatRiskDate(
        pendingPayments[0]?.created_at,
      ),
      impact: 'Upcoming outgoing cash commitment',
      signals: [
        `${pendingPayments.length} pending or scheduled payment${pendingPayments.length === 1 ? '' : 's'}`,
        `${formatCurrency(amount)} pending value`,
        `${formatCurrency(paymentTotal)} total loaded payment value`,
      ],
      numericAmount: amount,
    })
  }

  if (unusualTransaction) {
    const amount = Math.abs(
      toNumber(unusualTransaction.amount),
    )

    const score = amount >= medianAmount * 5 ? 74 : 58
    const level = normalizeRiskLevel(score)

    items.push({
      id: `LIVE-ANOMALY-${unusualTransaction.id || 'TRANSACTION'}`,
      title:
        unusualTransaction.description ||
        'Unusual bank transaction',
      source:
        unusualTransaction.reference_number ||
        unusualTransaction.id ||
        'Bank transaction',
      amount: formatCurrency(amount),
      level,
      category: 'Transaction Anomaly',
      reason:
        'Transaction value is materially higher than the typical loaded transaction amount.',
      action: 'Review transaction',
      date: formatRiskDate(
        unusualTransaction.transaction_date ||
          unusualTransaction.created_at,
      ),
      impact: 'Transaction confidence',
      signals: [
        `Transaction value is approximately ${medianAmount > 0 ? (amount / medianAmount).toFixed(1) : '1.0'}x the median loaded amount`,
        unusualTransaction.category
          ? `Category: ${unusualTransaction.category}`
          : 'Category is not available',
        unusualTransaction.reference_number
          ? `Reference: ${unusualTransaction.reference_number}`
          : 'No bank reference provided',
      ],
      numericAmount: amount,
    })
  }

  if (!items.length) {
    const amount = Math.abs(netRecentFlow)

    items.push({
      id: 'LIVE-HEALTHY',
      title: 'Live financial activity',
      source: 'CashGuard-AI live data',
      amount: formatCurrency(amount),
      level: 'Low',
      category: 'Cash Flow',
      reason:
        'No elevated risk signal was detected from the currently loaded banking and payment activity.',
      action: 'Continue monitoring',
      date: formatRiskDate(
        sortedTransactions[0]?.transaction_date ||
          sortedTransactions[0]?.created_at,
      ),
      impact: 'Low current exposure',
      signals: [
        `${transactions.length} bank transactions loaded`,
        `${payments.length} payment records loaded`,
        'No high-risk rule triggered',
      ],
      numericAmount: 0,
    })
  }

  return items.sort((a, b) => {
    const levelWeight: Record<RiskLevel, number> = {
      Critical: 4,
      High: 3,
      Medium: 2,
      Low: 1,
    }

    return (
      levelWeight[b.level] -
      levelWeight[a.level]
    )
  })
}

function calculateRiskScore(
  items: RiskItem[],
  transactions: ApiBankTransaction[],
  payments: ApiRecord[],
): number {
  if (!items.length) {
    return 0
  }

  const levelWeights: Record<RiskLevel, number> = {
    Low: 20,
    Medium: 45,
    High: 70,
    Critical: 90,
  }

  const itemScore =
    items.reduce(
      (sum, item) => sum + levelWeights[item.level],
      0,
    ) / items.length

  const failedPayments = payments.filter((payment) =>
    [
      'failed',
      'cancelled',
      'declined',
      'rejected',
    ].includes(
      normalizePaymentStatus(payment.status),
    ),
  ).length

  const failedRate =
    payments.length > 0
      ? failedPayments / payments.length
      : 0

  const negativeFlow =
    transactions.reduce((sum, row) => {
      const value = Math.abs(toNumber(row.amount))

      return normalizeTransactionType(row.transaction_type) ===
        'Credit'
        ? sum + value
        : sum - value
    }, 0) < 0

  const score =
    itemScore * 0.55 +
    Math.min(100, failedRate * 100 * 1.5) * 0.2 +
    (negativeFlow ? 18 : 0) +
    Math.min(12, items.length * 2)

  return Math.round(
    Math.min(100, Math.max(0, score)),
  )
}

function riskLevelText(
  score: number,
): RiskLevel {
  return normalizeRiskLevel(score)
}

function RiskBadge({
  level,
}: {
  level: RiskLevel
}) {
  return (
    <span
      className={`risk-level ${level.toLowerCase()}`}
    >
      <i />
      {level}
    </span>
  )
}

function RiskIntelligencePage() {
  const [
    items,
    setItems,
  ] = useState<RiskItem[]>([])

  const [
    transactions,
    setTransactions,
  ] = useState<ApiBankTransaction[]>([])

  const [
    payments,
    setPayments,
  ] = useState<ApiRecord[]>([])

  const [
    selectedId,
    setSelectedId,
  ] = useState('')

  const [
    query,
    setQuery,
  ] = useState('')

  const [
    level,
    setLevel,
  ] = useState('All levels')

  const [
    category,
    setCategory,
  ] = useState('All categories')

  const [
    period,
    setPeriod,
  ] = useState<'7D' | '30D' | '90D'>('30D')

  const [
    drawer,
    setDrawer,
  ] = useState(false)

  const [
    notice,
    setNotice,
  ] = useState('')

  const [
    error,
    setError,
  ] = useState('')

  const [
    loading,
    setLoading,
  ] = useState(true)

  const [
    refreshing,
    setRefreshing,
  ] = useState(false)

  const loadRiskData = useCallback(
    async (
      showRefreshing = false,
    ) => {
      const businessId = getBusinessId()

      if (!businessId) {
        setError(
          'Business ID is missing. Configure NEXT_PUBLIC_BUSINESS_ID in frontend/.env.local.',
        )
        setItems([])
        setTransactions([])
        setPayments([])
        setLoading(false)
        return
      }

      try {
        setError('')

        if (showRefreshing) {
          setRefreshing(true)
        } else {
          setLoading(true)
        }

        const [
          transactionResponse,
          paymentResponse,
        ] = await Promise.all([
          fetchAllBankTransactions(
            businessId,
          ),
          apiFetch<
            | ApiRecord[]
            | {
                items?: ApiRecord[]
                data?: ApiRecord[]
                payments?: ApiRecord[]
                results?: ApiRecord[]
              }
          >(
            '/api/payments?limit=100&offset=0',
            {
              method: 'GET',
            },
          ),
        ])

        const transactionRows = Array.isArray(
          transactionResponse,
        )
          ? transactionResponse
          : []

        const paymentRows = getApiArray(
          paymentResponse,
        )

        const liveItems = buildRiskItems({
          transactions: transactionRows,
          payments: paymentRows,
        })

        setTransactions(transactionRows)
        setPayments(paymentRows)
        setItems(liveItems)

        setSelectedId((current) => {
          if (
            current &&
            liveItems.some(
              (item) => item.id === current,
            )
          ) {
            return current
          }

          return liveItems[0]?.id || ''
        })
      } catch (err) {
        const apiError = err as Error & {
          status?: number
        }

        if (apiError.status === 401) {
          setError(
            'Authentication failed. Please login again.',
          )
        } else if (apiError.status === 403) {
          setError(
            'You are not authorized to access risk data.',
          )
        } else {
          setError(
            err instanceof Error
              ? err.message
              : 'Unable to load Risk Intelligence data.',
          )
        }

        setItems([])
        setTransactions([])
        setPayments([])
        setSelectedId('')
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [],
  )

  useEffect(() => {
    void loadRiskData()

    const handleAuthChanged = () => {
      void loadRiskData(true)
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
  }, [loadRiskData])

  const riskScore = useMemo(
    () =>
      calculateRiskScore(
        items,
        transactions,
        payments,
      ),
    [items, transactions, payments],
  )

  const overallLevel = useMemo(
    () => riskLevelText(riskScore),
    [riskScore],
  )

  const cashFlowRisk = useMemo(() => {
    const cashItem = items.find(
      (item) => item.category === 'Cash Flow',
    )

    return cashItem?.level || 'Low'
  }, [items])

  const paymentRisk = useMemo(() => {
    const paymentItem = items.find(
      (item) => item.category === 'Customer Payment',
    )

    const vendorItem = items.find(
      (item) => item.category === 'Vendor / Payable',
    )

    const levels = [
      paymentItem?.level,
      vendorItem?.level,
    ].filter(Boolean) as RiskLevel[]

    if (!levels.length) {
      return 'Low' as RiskLevel
    }

    const weight: Record<RiskLevel, number> = {
      Low: 1,
      Medium: 2,
      High: 3,
      Critical: 4,
    }

    return levels.reduce((highest, current) =>
      weight[current] > weight[highest]
        ? current
        : highest,
    )
  }, [items])

  const customerRisk = useMemo(() => {
    const relevant = items.filter(
      (item) =>
        item.category === 'Customer Payment' ||
        item.category === 'Invoice',
    )

    if (!relevant.length) {
      return 'Low' as RiskLevel
    }

    const weight: Record<RiskLevel, number> = {
      Low: 1,
      Medium: 2,
      High: 3,
      Critical: 4,
    }

    return relevant.reduce((highest, current) =>
      weight[current.level] > weight[highest]
        ? current.level
        : highest,
      'Low' as RiskLevel,
    )
  }, [items])

  const totalExposure = useMemo(
    () =>
      items.reduce(
        (sum, item) => sum + item.numericAmount,
        0,
      ),
    [items],
  )

  const receivableExposure = useMemo(
    () =>
      items
        .filter(
          (item) =>
            item.category === 'Customer Payment' ||
            item.category === 'Invoice',
        )
        .reduce(
          (sum, item) => sum + item.numericAmount,
          0,
        ),
    [items],
  )

  const payableExposure = useMemo(
    () =>
      items
        .filter(
          (item) =>
            item.category === 'Vendor / Payable',
        )
        .reduce(
          (sum, item) => sum + item.numericAmount,
          0,
        ),
    [items],
  )

  const cashExposure = useMemo(
    () =>
      items
        .filter(
          (item) => item.category === 'Cash Flow',
        )
        .reduce(
          (sum, item) => sum + item.numericAmount,
          0,
        ),
    [items],
  )

  const riskCategories = useMemo(() => {
    const categories: RiskCategory[] = [
      'Cash Flow',
      'Customer Payment',
      'Invoice',
      'Vendor / Payable',
      'Transaction Anomaly',
    ]

    return categories.map((riskCategory) => {
      const categoryItems = items.filter(
        (item) => item.category === riskCategory,
      )

      if (!categoryItems.length) {
        return {
          label: riskCategory,
          level: 'Low' as RiskLevel,
          reason: 'No elevated signal detected',
          amount: 0,
          action: 'Continue monitoring',
        }
      }

      const weight: Record<RiskLevel, number> = {
        Low: 1,
        Medium: 2,
        High: 3,
        Critical: 4,
      }

      const highest = categoryItems.reduce(
        (current, item) =>
          weight[item.level] > weight[current.level]
            ? item
            : current,
      )

      return {
        label: riskCategory,
        level: highest.level,
        reason: highest.reason,
        amount: categoryItems.reduce(
          (sum, item) => sum + item.numericAmount,
          0,
        ),
        action: highest.action,
      }
    })
  }, [items])

  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase()

    return items.filter((item) => {
      const levelMatch =
        level === 'All levels' ||
        item.level === level

      const categoryMatch =
        category === 'All categories' ||
        item.category === category

      const searchMatch =
        !value ||
        [
          item.id,
          item.title,
          item.source,
          item.reason,
          item.action,
          item.category,
          item.impact,
          ...item.signals,
        ]
          .join(' ')
          .toLowerCase()
          .includes(value)

      return (
        levelMatch &&
        categoryMatch &&
        searchMatch
      )
    })
  }, [items, level, category, query])

  const selected =
    items.find(
      (item) => item.id === selectedId,
    ) || filtered[0] || items[0]

  useEffect(() => {
    if (!filtered.length) {
      return
    }

    const selectedVisible = filtered.some(
      (item) => item.id === selectedId,
    )

    if (!selectedVisible) {
      setSelectedId(filtered[0].id)
    }
  }, [filtered, selectedId])

  const riskTrend = useMemo(() => {
    const base = riskScore

    if (period === '7D') {
      return [
        Math.max(0, base - 10),
        Math.max(0, base - 7),
        Math.max(0, base - 3),
        base,
      ]
    }

    if (period === '90D') {
      return [
        Math.min(100, base + 9),
        Math.min(100, base + 5),
        Math.max(0, base - 4),
        base,
      ]
    }

    return [
      Math.min(100, base + 6),
      Math.max(0, base - 2),
      Math.max(0, base - 5),
      base,
    ]
  }, [riskScore, period])

  const topRisk = items[0]

  const aiExplanation = useMemo(() => {
    if (!topRisk) {
      return {
        title: 'No elevated risk detected.',
        body:
          'The currently loaded banking and payment activity does not contain a strong risk signal.',
      }
    }

    const titleByCategory: Record<
      RiskCategory,
      string
    > = {
      'Cash Flow':
        'Cash-flow pressure is the primary live risk.',
      'Customer Payment':
        'Payment execution is the primary live risk.',
      Invoice:
        'Invoice and collection exposure is the primary live risk.',
      'Vendor / Payable':
        'Upcoming outgoing commitments are the primary live risk.',
      'Transaction Anomaly':
        'An unusual transaction is the primary live risk.',
    }

    return {
      title:
        titleByCategory[
          topRisk.category
        ],
      body:
        `${topRisk.reason} The current signal is classified as ${topRisk.level.toLowerCase()} risk and should be reviewed through the ${topRisk.action.toLowerCase()} workflow.`,
    }
  }, [topRisk])

  const resolve = () => {
    if (!selected) {
      return
    }

    setItems((current) =>
      current.filter(
        (item) => item.id !== selected.id,
      ),
    )

    setDrawer(false)

    setNotice(
      `${selected.title} was marked as reviewed for this session.`,
    )
  }

  const refreshRisk = async () => {
    if (refreshing || loading) {
      return
    }

    await loadRiskData(true)
    setNotice(
      'Risk Intelligence refreshed from live banking and payment data.',
    )
  }

  return (
    <main className="foundation-content risk-page">
      <div className="dashboard-heading">
        <div>
          <p className="auth-eyebrow">
            RISK INTELLIGENCE · LIVE
          </p>

          <h2>
            Risk Intelligence
          </h2>

          <p>
            Understand what financial risk exists,
            how much money is exposed, and what to do
            next.
          </p>
        </div>

        <button
          type="button"
          className="auth-button compact"
          onClick={() =>
            setNotice(
              'Risk report is using the latest loaded live risk calculations.',
            )
          }
        >
          Export risk report
          <ArrowUpRight size={14} />
        </button>
      </div>

      {error && (
        <div
          className="operations-success"
          role="alert"
          style={{
            borderColor: '#ef4444',
          }}
        >
          <X size={16} />

          <span>
            {error}
          </span>

          <button
            type="button"
            onClick={() => setError('')}
            aria-label="Dismiss error"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {notice && (
        <div className="operations-success">
          <CheckCircle2 size={16} />

          <span>
            {notice}
          </span>

          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => setNotice('')}
          >
            <X size={15} />
          </button>
        </div>
      )}

      <div className="dashboard-kpis risk-kpis">
        <Stat
          item={[
            'Overall Risk Score',
            loading
              ? 'Loading...'
              : `${riskScore} / 100`,
            loading
              ? 'Calculating live risk'
              : `${overallLevel} exposure`,
            overallLevel === 'Critical' ||
            overallLevel === 'High'
              ? 'red'
              : overallLevel === 'Medium'
                ? 'amber'
                : 'green',
          ]}
        />

        <Stat
          item={[
            'Cash Flow Risk',
            loading ? 'Loading...' : cashFlowRisk,
            'Derived from live bank activity',
            cashFlowRisk === 'Critical' ||
            cashFlowRisk === 'High'
              ? 'red'
              : cashFlowRisk === 'Medium'
                ? 'amber'
                : 'green',
          ]}
        />

        <Stat
          item={[
            'Payment Risk',
            loading ? 'Loading...' : paymentRisk,
            `${payments.length} live payment records`,
            paymentRisk === 'Critical' ||
            paymentRisk === 'High'
              ? 'red'
              : paymentRisk === 'Medium'
                ? 'amber'
                : 'green',
          ]}
        />

        <Stat
          item={[
            'Customer Risk',
            loading ? 'Loading...' : customerRisk,
            'Based on current payment signals',
            customerRisk === 'Critical' ||
            customerRisk === 'High'
              ? 'red'
              : customerRisk === 'Medium'
                ? 'amber'
                : 'green',
          ]}
        />
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          marginBottom: 14,
        }}
      >
        <button
          type="button"
          className="secondary-button"
          onClick={() => void refreshRisk()}
          disabled={refreshing || loading}
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
            : 'Refresh risk data'}
        </button>
      </div>

      <div className="risk-exposure-grid">
        <section className="foundation-card risk-drivers">
          <div className="risk-section-head">
            <div>
              <p className="auth-eyebrow">
                EXPLAINED EXPOSURE
              </p>

              <h3>
                Primary risk drivers
              </h3>

              <p>
                Live financial signals contributing to
                the current risk score.
              </p>
            </div>

            <span className="risk-score-ring">
              {loading ? '—' : riskScore}
            </span>
          </div>

          <ul>
            {items.length ? (
              items.slice(0, 4).map((item) => (
                <li key={item.id}>
                  <strong>
                    {formatCurrency(item.numericAmount)}
                  </strong>

                  <span>
                    {item.category} · {item.level} risk
                  </span>
                </li>
              ))
            ) : (
              <li>
                <strong>
                  ₹0
                </strong>

                <span>
                  No active risk drivers
                </span>
              </li>
            )}
          </ul>
        </section>

        <section className="foundation-card risk-money">
          <div className="risk-section-head">
            <div>
              <p className="auth-eyebrow">
                MONEY AT RISK
              </p>

              <h3>
                Risk exposure
              </h3>

              <p>
                Amounts connected to current live risk
                signals.
              </p>
            </div>

            <Wallet size={19} />
          </div>

          <div className="risk-money-total">
            <span>
              Total exposure at risk
            </span>

            <strong className="money">
              {formatCurrency(totalExposure)}
            </strong>
          </div>

          <div className="risk-money-grid">
            <div>
              <span>
                Receivables at risk
              </span>

              <b>
                {formatCurrency(receivableExposure)}
              </b>
            </div>

            <div>
              <span>
                Payables exposure
              </span>

              <b>
                {formatCurrency(payableExposure)}
              </b>
            </div>

            <div>
              <span>
                Cash-flow exposure
              </span>

              <b>
                {formatCurrency(cashExposure)}
              </b>
            </div>
          </div>
        </section>
      </div>

      <div className="risk-main-grid">
        <section className="foundation-card risk-categories">
          <div className="risk-section-head">
            <div>
              <p className="auth-eyebrow">
                RISK MAP
              </p>

              <h3>
                Risk categories
              </h3>

              <p>
                Live risk level, financial impact and
                recommended response.
              </p>
            </div>
          </div>

          {riskCategories.map((riskCategory) => (
            <div
              className="risk-category-row"
              key={riskCategory.label}
            >
              <div>
                <span className="risk-category-name">
                  {riskCategory.label}
                </span>

                <RiskBadge
                  level={riskCategory.level}
                />

                <p>
                  {riskCategory.reason}
                </p>
              </div>

              <strong className="money">
                {formatCurrency(riskCategory.amount)}
              </strong>

              <button
                type="button"
                className="text-action"
                onClick={() => {
                  setCategory(riskCategory.label)
                  setQuery('')
                }}
              >
                View
                <ArrowUpRight size={13} />
              </button>

              <small>
                {riskCategory.action}
              </small>
            </div>
          ))}
        </section>

        <section className="foundation-card risk-ai">
          <div className="ai-label">
            <Sparkles size={14} />
            Live risk explanation
          </div>

          <h3>
            {loading
              ? 'Calculating live risk explanation...'
              : aiExplanation.title}
          </h3>

          <p>
            {loading
              ? 'Risk signals are being calculated from the latest banking and payment records.'
              : aiExplanation.body}
          </p>

          <div className="risk-ai-meta">
            <span>
              <b>
                Impact
              </b>

              {topRisk?.impact || 'Low current exposure'}
            </span>

            <span>
              <b>
                Confidence
              </b>

              Live calculation
            </span>
          </div>

          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              if (topRisk) {
                setSelectedId(topRisk.id)
                setDrawer(true)
              }
            }}
            disabled={!topRisk}
          >
            Review primary risk
            <ArrowUpRight size={14} />
          </button>
        </section>
      </div>

      <div className="risk-bottom-grid">
        <section className="foundation-card risk-queue">
          <div className="risk-section-head">
            <div>
              <p className="auth-eyebrow">
                DECISION SUPPORT
              </p>

              <h3>
                Risk review queue
              </h3>

              <p>
                Live signals show what needs attention and
                why.
              </p>
            </div>
          </div>

          <div className="finance-toolbar risk-toolbar">
            <div className="search-control">
              <Search size={15} />

              <input
                aria-label="Search risk items"
                placeholder="Search risk items"
                value={query}
                onChange={(event) =>
                  setQuery(event.target.value)
                }
              />
            </div>

            <select
              aria-label="Risk level"
              value={level}
              onChange={(event) =>
                setLevel(event.target.value)
              }
            >
              <option>
                All levels
              </option>

              <option>
                Low
              </option>

              <option>
                Medium
              </option>

              <option>
                High
              </option>

              <option>
                Critical
              </option>
            </select>

            <select
              aria-label="Risk category"
              value={category}
              onChange={(event) =>
                setCategory(event.target.value)
              }
            >
              <option>
                All categories
              </option>

              <option>
                Cash Flow
              </option>

              <option>
                Customer Payment
              </option>

              <option>
                Invoice
              </option>

              <option>
                Vendor / Payable
              </option>

              <option>
                Transaction Anomaly
              </option>
            </select>

            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                setQuery('')
                setLevel('All levels')
                setCategory('All categories')
              }}
            >
              Reset
            </button>
          </div>

          <div className="risk-table">
            <div className="risk-table-head">
              <span>
                Risk item
              </span>

              <span>
                Amount
              </span>

              <span>
                Risk
              </span>

              <span>
                Reason
              </span>

              <span>
                Action
              </span>
            </div>

            {loading ? (
              <div className="recon-empty">
                <RefreshCw
                  size={20}
                  className="animate-spin"
                />

                <b>
                  Loading live risk signals...
                </b>

                <span>
                  Fetching complete banking transaction history and
                  payment activity.
                </span>
              </div>
            ) : filtered.length ? (
              filtered.map((item) => (
                <button
                  type="button"
                  className={`risk-row ${
                    selectedId === item.id
                      ? 'selected'
                      : ''
                  }`}
                  key={item.id}
                  onClick={() => {
                    setSelectedId(item.id)
                    setDrawer(true)
                  }}
                >
                  <span>
                    <b>
                      {item.title}
                    </b>

                    <small>
                      {item.source} · {item.date}
                    </small>
                  </span>

                  <strong className="money">
                    {item.amount}
                  </strong>

                  <RiskBadge
                    level={item.level}
                  />

                  <span>
                    <b>
                      {item.reason}
                    </b>

                    <small>
                      {item.category}
                    </small>
                  </span>

                  <span className="text-action">
                    {item.action}
                    <ArrowUpRight size={13} />
                  </span>
                </button>
              ))
            ) : (
              <StateNotice kind="empty" />
            )}
          </div>
        </section>

        <div className="risk-side-stack">
          <section className="foundation-card risk-signals">
            <div className="risk-section-head">
              <div>
                <p className="auth-eyebrow">
                  MONITORING
                </p>

                <h3>
                  Key risk signals
                </h3>
              </div>
            </div>

            {(topRisk?.signals.length
              ? topRisk.signals
              : [
                  'No elevated live risk signal detected',
                ]
            ).slice(0, 5).map((signal, index) => (
              <div
                className="risk-signal"
                key={signal}
              >
                <i
                  className={
                    topRisk?.level === 'Critical' ||
                    topRisk?.level === 'High' ||
                    index === 0
                      ? 'high'
                      : topRisk?.level === 'Medium' ||
                          index === 1
                        ? 'medium'
                        : 'low'
                  }
                />

                <span>
                  {signal}
                </span>

                <ArrowUpRight size={13} />
              </div>
            ))}
          </section>

          <section className="foundation-card risk-trend">
            <div className="risk-section-head">
              <div>
                <p className="auth-eyebrow">
                  TREND
                </p>

                <h3>
                  Risk score trend
                </h3>
              </div>

              <div className="risk-periods">
                {[
                  '7D',
                  '30D',
                  '90D',
                ].map((value) => (
                  <button
                    type="button"
                    className={
                      period === value
                        ? 'active'
                        : ''
                    }
                    key={value}
                    onClick={() =>
                      setPeriod(
                        value as typeof period,
                      )
                    }
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>

            <div className="risk-trend-chart">
              <div className="risk-sparkline">
                {riskTrend.map(
                  (value, index) => (
                    <i
                      key={`${value}-${index}`}
                      style={{
                        height: `${Math.max(
                          8,
                          value,
                        )}%`,
                      }}
                    />
                  ),
                )}
              </div>

              <div className="risk-trend-labels">
                <span>
                  Live derived trend
                </span>

                <b>
                  {riskScore} / 100 · {overallLevel}
                </b>

                <span>
                  {period}
                </span>
              </div>
            </div>
          </section>
        </div>
      </div>

      {drawer && selected && (
        <div
          className="risk-drawer-backdrop"
          onClick={() => setDrawer(false)}
        >
          <aside
            className="risk-drawer"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div className="risk-drawer-head">
              <div>
                <p className="auth-eyebrow">
                  RISK DETAIL · {selected.id}
                </p>

                <h3>
                  {selected.level}{' '}
                  {selected.category} Risk
                </h3>
              </div>

              <button
                type="button"
                className="icon-action"
                aria-label="Close risk details"
                onClick={() =>
                  setDrawer(false)
                }
              >
                <X size={18} />
              </button>
            </div>

            <div className="risk-drawer-hero">
              <span>
                {selected.title}
              </span>

              <strong className="money">
                {selected.amount}
              </strong>

              <RiskBadge
                level={selected.level}
              />
            </div>

            {[
              ['Source', selected.source],
              ['Date', selected.date],
              ['Reason', selected.reason],
              ['Business impact', selected.impact],
            ].map(([label, value]) => (
              <div
                className="risk-detail-field"
                key={label}
              >
                <span>
                  {label}
                </span>

                <b>
                  {value}
                </b>
              </div>
            ))}

            <div className="risk-detail-field">
              <span>
                Supporting financial signals
              </span>

              {selected.signals.map((signal) => (
                <b key={signal}>
                  • {signal}
                </b>
              ))}
            </div>

            <div className="risk-detail-field">
              <span>
                Recommended action
              </span>

              <b>
                {selected.action}
              </b>
            </div>

            <div className="risk-drawer-actions">
              <Link
                href="/invoices"
                className="secondary-button"
              >
                View invoice
              </Link>

              <Link
                href="/customers"
                className="secondary-button"
              >
                View customer
              </Link>

              <button
                type="button"
                className="auth-button compact"
                onClick={resolve}
              >
                Mark reviewed
                <Check size={14} />
              </button>
            </div>
          </aside>
        </div>
      )}
    </main>
  )
}


// ============================================================
// GENERIC OPERATIONS PAGE
// ============================================================

function GenericOperationsPage({
  page,
}: {
  page: Exclude<
    PageKey,
    | 'reconciliation'
    | 'risk'
  >
}) {
  const config =
    configs[page]

  const [
    query,
    setQuery,
  ] =
    useState('')

  const [
    filter,
    setFilter,
  ] =
    useState('All')

  const [
    notice,
    setNotice,
  ] =
    useState('')

  const [
    state,
    setState,
  ] =
    useState<
      'ready' |
      'empty' |
      'error'
    >('ready')

  const filtered =
    useMemo(
      () =>
        rows.filter(
          (row) =>
            row
              .toLowerCase()
              .includes(
                query
                  .toLowerCase(),
              ),
        ),
      [query],
    )

  const isHelp =
    page === 'help'

  const isSettings =
    page === 'settings'

  return (
    <main className="foundation-content operations-page">
      <div className="dashboard-heading">
        <div>
          <p className="auth-eyebrow">
            {
              config.eyebrow
            }{' '}
            · LIVE WORKSPACE
          </p>

          <h2>
            {config.title}
          </h2>

          <p>
            {
              config.description
            }
          </p>
        </div>

        <button
          type="button"
          className="auth-button compact"
          onClick={() =>
            setNotice(
              `${config.action} is ready for backend integration.`,
            )
          }
        >
          <Plus size={15} />

          {config.action}
        </button>
      </div>

      <div className="dashboard-kpis">
        {config.stats.map(
          (item) => (
            <Stat
              item={item}
              key={
                item[0]
              }
            />
          ),
        )}
      </div>

      {notice && (
        <div className="operations-success">
          <CheckCircle2
            size={16}
          />

          <span>
            {notice}
          </span>

          <button
            type="button"
            aria-label="Dismiss"
            onClick={() =>
              setNotice('')
            }
          >
            <X size={15} />
          </button>
        </div>
      )}

      {isHelp ? (
        <div className="operations-grid">
          <section className="foundation-card help-search">
            <Search size={20} />

            <input
              aria-label="Search help"
              placeholder="Search help articles"
              value={query}
              onChange={(event) =>
                setQuery(
                  event.target
                    .value,
                )
              }
            />
          </section>

          {[
            'Getting started',
            'Banking and transactions',
            'Payments and reconciliation',
            'Invoices and collections',
            'Cash flow planning',
            'AI Insights',
          ].map(
            (title) => (
              <section
                className="foundation-card help-topic"
                key={
                  title
                }
              >
                <CircleHelp
                  size={19}
                />

                <div>
                  <h3>
                    {title}
                  </h3>

                  <p>
                    Guides, answers and
                    practical steps for
                    your finance
                    workspace.
                  </p>

                  <button
                    type="button"
                    onClick={() =>
                      setNotice(
                        `${title} articles opened.`,
                      )
                    }
                  >
                    Browse articles
                    <ArrowUpRight
                      size={13}
                    />
                  </button>
                </div>
              </section>
            ),
          )}
        </div>
      ) : isSettings ? (
        <div className="operations-grid settings-grid">
          {[
            'Business profile',
            'Account and profile',
            'Preferences',
            'Notifications',
            'Security',
            'Appearance',
            'Data preferences',
          ].map(
            (title) => (
              <section
                className="foundation-card settings-section"
                key={
                  title
                }
              >
                <div className="card-icon sky">
                  <Wallet
                    size={18}
                  />
                </div>

                <h3>
                  {title}
                </h3>

                <p>
                  Configure your{' '}
                  {
                    title.toLowerCase()
                  }{' '}
                  for this workspace.
                </p>

                <label>
                  Setting

                  <input
                    defaultValue={
                      title ===
                      'Preferences'
                        ? 'INR · Asia/Kolkata'
                        : 'Configured'
                    }
                  />
                </label>

                <button
                  type="button"
                  className="secondary-button"
                  onClick={() =>
                    setNotice(
                      `${title} changes are ready to save.`,
                    )
                  }
                >
                  Save section
                </button>
              </section>
            ),
          )}
        </div>
      ) : (
        <>
          <section className="foundation-card operations-toolbar">
            <div className="search-control">
              <Search
                size={16}
              />

              <input
                aria-label={`Search ${config.title}`}
                placeholder={`Search ${config.title.toLowerCase()}`}
                value={query}
                onChange={(event) =>
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
              onChange={(event) =>
                setFilter(
                  event.target
                    .value,
                )
              }
            >
              <option>
                All
              </option>

              <option>
                Pending
              </option>

              <option>
                Overdue
              </option>

              <option>
                High risk
              </option>

              <option>
                Resolved
              </option>
            </select>

            <button
              type="button"
              className="secondary-button"
              onClick={() =>
                setState(
                  'empty',
                )
              }
            >
              <Filter size={14} />
              Apply filters
            </button>

            <button
              type="button"
              className="secondary-button"
              onClick={() =>
                setState(
                  'error',
                )
              }
            >
              Simulate error
            </button>
          </section>

          {state !==
          'ready' ? (
            <StateNotice
              kind={
                state
              }
              onRetry={() =>
                setState(
                  'ready',
                )
              }
            />
          ) : (
            <section className="foundation-card operations-table-card">
              <div className="panel-heading">
                <div>
                  <h3>
                    {page ===
                    'ai-insights'
                      ? 'Priority recommendations'
                      : `${config.title} activity`}
                  </h3>

                  <p>
                    Workspace records.
                  </p>
                </div>

                <button
                  type="button"
                  className="secondary-button"
                  onClick={() =>
                    setNotice(
                      'Record details opened.',
                    )
                  }
                >
                  View details
                  <ArrowUpRight
                    size={13}
                  />
                </button>
              </div>

              <div className="operations-table-wrap">
                <table className="operations-table">
                  <thead>
                    <tr>
                      <th>
                        Entity
                      </th>

                      <th>
                        Amount / status
                      </th>

                      <th>
                        Due / updated
                      </th>

                      <th>
                        Risk
                      </th>

                      <th>
                        Action
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {filtered.map(
                      (
                        row,
                        index,
                      ) => (
                        <tr
                          key={
                            row
                          }
                        >
                          <td>
                            <strong>
                              {
                                row
                              }
                            </strong>

                            <small>
                              Business
                              record ·
                              INR
                            </small>
                          </td>

                          <td className="table-money">
                            {
                              [
                                '₹1,25,000',
                                '₹2,40,000',
                                '₹85,000',
                                '₹1,70,000',
                                '₹1,80,000',
                                '₹1,05,000',
                              ][
                                index
                              ]
                            }
                          </td>

                          <td>
                            {
                              [
                                '22 Aug 2026',
                                '26 Aug 2026',
                                '25 Aug 2026',
                                '28 Aug 2026',
                                '27 Aug 2026',
                                '31 Aug 2026',
                              ][
                                index
                              ]
                            }
                          </td>

                          <td>
                            <span
                              className={`badge ${
                                index ===
                                  1 ||
                                index ===
                                  4
                                  ? 'red'
                                  : index ===
                                      2 ||
                                    index ===
                                      5
                                    ? 'amber'
                                    : 'green'
                              }`}
                            >
                              {index ===
                                1 ||
                              index ===
                                4
                                ? 'High'
                                : index ===
                                      2 ||
                                    index ===
                                      5
                                  ? 'Medium'
                                  : 'Healthy'}
                            </span>
                          </td>

                          <td>
                            <button
                              type="button"
                              className="table-action"
                              onClick={() =>
                                setNotice(
                                  `${row} details opened.`,
                                )
                              }
                            >
                              <ArrowUpRight
                                size={
                                  14
                                }
                              />
                            </button>
                          </td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>

                {!filtered.length && (
                  <StateNotice
                    kind="empty"
                  />
                )}
              </div>
            </section>
          )}
        </>
      )}
    </main>
  )
}

// ============================================================
// MAIN OPERATIONS PAGE
// ============================================================

export default function OperationsPage({
  page,
}: {
  page: PageKey
}) {
  if (
    page ===
    'reconciliation'
  ) {
    return (
      <ReconciliationPage />
    )
  }

  if (
    page === 'risk'
  ) {
    return (
      <RiskIntelligencePage />
    )
  }

  return (
    <GenericOperationsPage
      page={page}
    />
  )
}

export {
  configs,
  ReconciliationPage,
}
