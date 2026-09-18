'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import type { ReactNode } from 'react'
import Link from 'next/link'

import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  FileText,
  IndianRupee,
  Landmark,
  ListChecks,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  WalletCards,
} from 'lucide-react'

/* ==========================================================================
   TYPES
   ========================================================================== */

type Period = '7D' | '30D' | '90D'

type JsonRecord = Record<string, unknown>

type SummaryData = {
  cash: number | null
  receivables: number | null
  payables: number | null
  netCashFlow: number | null
  overdue: number | null
  upcoming: number | null

  businessName: string
  businessType: string
  userName: string

  cashAccountsCount: number | null
  overduePercentage: number | null
  upcomingCount: number | null

  cashTrend: number | null
  receivableTrend: number | null
  payableTrend: number | null
  netTrend: number | null
}

type AuthUserData = {
  id: number | string | null
  name: string
  email: string
  role: string
  mobile: string
  jobTitle: string
  city: string
  state: string
  isActive: boolean | null
}

type ForecastData = {
  current: number | null
  inflow: number | null
  outflow: number | null
  projected: number | null
  lowPoint: number | null
  lowDate: string | null
}

type ChartPoint = {
  label: string
  inflow: number
  outflow: number
  net: number
}

type RiskRow = {
  id: string
  name: string
  reference: string
  amount: number
  timing: string
  risk: string
}

type ActivityItem = {
  id: string
  title: string
  detail: string
  timestamp?: string
}

type AlertItem = {
  id: string
  title: string
  detail: string
  action: string
  href: string
}

type AiInsight = {
  available: boolean
  summary: string
  recommendation: string
  priority: string
  risk: string
  confidence: string
  error?: string
  generatedAt?: string
}

type DashboardState = {
  summary: SummaryData
  authUser: AuthUserData
  forecast: ForecastData
  charts: Record<Period, ChartPoint[]>
  receivables: RiskRow[]
  payables: RiskRow[]
  activities: ActivityItem[]
  alerts: AlertItem[]
  ai: AiInsight
}

type EndpointResult = {
  ok: boolean
  data: unknown
  error?: string
  status?: number
}

type ApiMLForecastRow = {
  forecast_date: string
  predicted_inflow: number | null
  predicted_outflow: number | null
  predicted_net_cash_flow: number
}

type ApiMLForecastResponse = {
  business_id: string | null
  horizon_days: number
  forecast_days: number
  model: string
  target: string
  forecast: ApiMLForecastRow[]
}

/* ==========================================================================
   CONFIG
   ========================================================================== */

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL ||
  'http://127.0.0.1:8000'
).replace(/\/+$/, '')

const ML_API_BASE_URL = (
  process.env.NEXT_PUBLIC_ML_API_URL ||
  'http://127.0.0.1:8001'
).replace(/\/+$/, '')

const DEFAULT_BUSINESS_ID =
  process.env.NEXT_PUBLIC_BUSINESS_ID?.trim() || ''

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

/* ==========================================================================
   EMPTY STATES
   ========================================================================== */

const EMPTY_AUTH_USER: AuthUserData = {
  id: null,
  name: 'Business owner',
  email: '',
  role: 'user',
  mobile: '',
  jobTitle: '',
  city: '',
  state: '',
  isActive: null,
}

const EMPTY_SUMMARY: SummaryData = {
  cash: null,
  receivables: null,
  payables: null,
  netCashFlow: null,
  overdue: null,
  upcoming: null,

  businessName: 'Your business',
  businessType: 'MSME',
  userName: 'Business owner',

  cashAccountsCount: null,
  overduePercentage: null,
  upcomingCount: null,

  cashTrend: null,
  receivableTrend: null,
  payableTrend: null,
  netTrend: null,
}

const EMPTY_FORECAST: ForecastData = {
  current: null,
  inflow: null,
  outflow: null,
  projected: null,
  lowPoint: null,
  lowDate: null,
}

const EMPTY_AI: AiInsight = {
  available: false,
  summary:
    'AI insight is being generated from your live CashGuard-AI business data.',
  recommendation:
    'Refresh the dashboard to generate the latest AI recommendation.',
  priority: 'PENDING',
  risk: 'UNKNOWN',
  confidence: '—',
}

/* ==========================================================================
   GENERIC HELPERS
   ========================================================================== */

function isRecord(
  value: unknown,
): value is JsonRecord {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  )
}

function unwrapData(
  value: unknown,
): unknown {
  if (!isRecord(value)) {
    return value
  }

  if (
    'data' in value &&
    value.data !== undefined
  ) {
    return value.data
  }

  if (
    'result' in value &&
    value.result !== undefined
  ) {
    return value.result
  }

  return value
}

function firstValue(
  source: unknown,
  keys: string[],
): unknown {
  if (!isRecord(source)) {
    return undefined
  }

  for (const key of keys) {
    const value = source[key]

    if (
      value !== undefined &&
      value !== null
    ) {
      return value
    }
  }

  return undefined
}

/* ==========================================================================
   AUTH
   ========================================================================== */

function cleanToken(
  value: unknown,
): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const token = value
    .trim()
    .replace(/^Bearer\s+/i, '')
    .trim()

  return token || null
}

function getAuthToken(): string | null {
  if (
    typeof window === 'undefined'
  ) {
    return null
  }

  const storages = [
    window.localStorage,
    window.sessionStorage,
  ]

  for (const storage of storages) {
    for (const key of AUTH_KEYS) {
      try {
        const token = cleanToken(
          storage.getItem(key),
        )

        if (token) {
          return token
        }
      } catch {
        // Ignore inaccessible storage.
      }
    }
  }

  return null
}

function clearAuthStorage(): void {
  if (
    typeof window === 'undefined'
  ) {
    return
  }

  for (const key of AUTH_KEYS) {
    try {
      window.localStorage.removeItem(key)
    } catch {
      // Ignore.
    }

    try {
      window.sessionStorage.removeItem(key)
    } catch {
      // Ignore.
    }
  }
}

/* ==========================================================================
   BUSINESS
   ========================================================================== */

function getBusinessId(): string | null {
  if (
    typeof window === 'undefined'
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

  const storages = [
    window.localStorage,
    window.sessionStorage,
  ]

  for (const storage of storages) {
    for (const key of keys) {
      try {
        const value =
          storage
            .getItem(key)
            ?.trim()

        if (value) {
          return value
        }
      } catch {
        // Ignore inaccessible storage.
      }
    }
  }

  return (
    DEFAULT_BUSINESS_ID ||
    null
  )
}

/* ==========================================================================
   NUMBER / TEXT / MONEY
   ========================================================================== */

function toNumber(
  value: unknown,
): number | null {
  if (
    typeof value === 'number' &&
    Number.isFinite(value)
  ) {
    return value
  }

  if (
    typeof value === 'string'
  ) {
    const cleaned =
      value
        .replace(/₹/g, '')
        .replace(/,/g, '')
        .replace(/%/g, '')
        .trim()

    if (!cleaned) {
      return null
    }

    const parsed =
      Number(cleaned)

    if (
      Number.isFinite(parsed)
    ) {
      return parsed
    }
  }

  return null
}

function toText(
  value: unknown,
  fallback = '',
): string {
  if (
    typeof value === 'string' &&
    value.trim()
  ) {
    return value.trim()
  }

  if (
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return String(value)
  }

  return fallback
}

function toBoolean(
  value: unknown,
): boolean | null {
  if (
    typeof value === 'boolean'
  ) {
    return value
  }

  if (
    typeof value === 'string'
  ) {
    const normalised =
      value
        .trim()
        .toLowerCase()

    if (
      normalised === 'true' ||
      normalised === '1' ||
      normalised === 'active' ||
      normalised === 'enabled'
    ) {
      return true
    }

    if (
      normalised === 'false' ||
      normalised === '0' ||
      normalised === 'inactive' ||
      normalised === 'disabled'
    ) {
      return false
    }
  }

  if (
    typeof value === 'number'
  ) {
    return value === 1
  }

  return null
}

function formatMoney(
  value: number | null,
): string {
  if (
    value === null ||
    !Number.isFinite(value)
  ) {
    return '—'
  }

  return new Intl.NumberFormat(
    'en-IN',
    {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    },
  ).format(value)
}

function formatCompactMoney(
  value: number | null,
): string {
  if (
    value === null ||
    !Number.isFinite(value)
  ) {
    return '—'
  }

  const absolute =
    Math.abs(value)

  if (
    absolute >=
    10000000
  ) {
    return `₹${(
      value /
      10000000
    ).toFixed(2)}Cr`
  }

  if (
    absolute >=
    100000
  ) {
    return `₹${(
      value /
      100000
    ).toFixed(2)}L`
  }

  if (
    absolute >=
    1000
  ) {
    return `₹${(
      value /
      1000
    ).toFixed(1)}K`
  }

  return formatMoney(value)
}

function formatTrend(
  value: number | null,
): string {
  if (
    value === null ||
    !Number.isFinite(value)
  ) {
    return 'Live trend unavailable'
  }

  const sign =
    value > 0
      ? '+'
      : ''

  return `${sign}${value.toFixed(
    1,
  )}% vs prior period`
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

/* ==========================================================================
   AUTH USER EXTRACTION
   ========================================================================== */

function extractAuthUser(
  payload: unknown,
): AuthUserData {
  const root =
    unwrapData(payload)

  if (!isRecord(root)) {
    return {
      ...EMPTY_AUTH_USER,
    }
  }

  const source =
    isRecord(root.user)
      ? root.user
      : root

  const idValue =
    firstValue(
      source,
      [
        'id',
        'user_id',
        'userId',
      ],
    )

  const name =
    toText(
      firstValue(
        source,
        [
          'name',
          'full_name',
          'fullName',
          'display_name',
          'displayName',
          'username',
        ],
      ),
      '',
    )

  const email =
    toText(
      firstValue(
        source,
        [
          'email',
          'email_address',
          'emailAddress',
        ],
      ),
      '',
    )

  const role =
    toText(
      firstValue(
        source,
        [
          'role',
          'user_role',
          'userRole',
        ],
      ),
      'user',
    )

  const mobile =
    toText(
      firstValue(
        source,
        [
          'mobile',
          'phone',
          'phone_number',
          'phoneNumber',
        ],
      ),
      '',
    )

  const jobTitle =
    toText(
      firstValue(
        source,
        [
          'job_title',
          'jobTitle',
          'designation',
          'position',
        ],
      ),
      '',
    )

  const city =
    toText(
      firstValue(
        source,
        ['city'],
      ),
      '',
    )

  const state =
    toText(
      firstValue(
        source,
        ['state'],
      ),
      '',
    )

  const isActive =
    toBoolean(
      firstValue(
        source,
        [
          'is_active',
          'isActive',
          'active',
        ],
      ),
    )

  return {
    id:
      typeof idValue ===
        'string' ||
      typeof idValue ===
        'number'
        ? idValue
        : null,

    name:
      name ||
      EMPTY_AUTH_USER.name,

    email,

    role:
      role ||
      'user',

    mobile,
    jobTitle,
    city,
    state,
    isActive,
  }
}

/* ==========================================================================
   CHART DATA
   ========================================================================== */

function normaliseChartRows(
  value: unknown,
): ChartPoint[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map(
      (
        row,
        index,
      ) => {
        if (!isRecord(row)) {
          return null
        }

        const inflow =
          toNumber(
            firstValue(
              row,
              [
                'inflow',
                'cash_inflow',
                'cashInflow',
                'income',
                'credit',
                'predicted_inflow',
              ],
            ),
          ) ?? 0

        const outflow =
          toNumber(
            firstValue(
              row,
              [
                'outflow',
                'cash_outflow',
                'cashOutflow',
                'expense',
                'debit',
                'predicted_outflow',
              ],
            ),
          ) ?? 0

        const directNet =
          toNumber(
            firstValue(
              row,
              [
                'net',
                'net_cash_flow',
                'netCashFlow',
                'net_flow',
                'predicted_net_cash_flow',
              ],
            ),
          )

        const rawLabel =
          firstValue(
            row,
            [
              'label',
              'date',
              'flow_date',
              'flowDate',
              'period',
              'day',
              'name',
            ],
          )

        const label =
          toText(
            rawLabel,
            `P${index + 1}`,
          )

        return {
          label,
          inflow,
          outflow,
          net:
            directNet ??
            inflow -
              outflow,
        }
      },
    )
    .filter(
      (
        item,
      ): item is ChartPoint =>
        item !== null,
    )
}

function extractHistoryRows(
  payload: unknown,
): ChartPoint[] {
  const root =
    unwrapData(payload)

  if (
    Array.isArray(root)
  ) {
    return normaliseChartRows(
      root,
    )
  }

  if (
    !isRecord(root)
  ) {
    return []
  }

  const directSeries =
    firstValue(
      root,
      [
        'data',
        'items',
        'rows',
        'results',
        'points',
        'series',
        'history',
        'cash_flow',
        'cashFlow',
      ],
    )

  if (
    Array.isArray(
      directSeries,
    )
  ) {
    return normaliseChartRows(
      directSeries,
    )
  }

  if (
    isRecord(
      directSeries,
    )
  ) {
    const nested =
      firstValue(
        directSeries,
        [
          'data',
          'items',
          'rows',
          'results',
          'points',
          'series',
        ],
      )

    return normaliseChartRows(
      nested,
    )
  }

  return []
}

/* ==========================================================================
   SUMMARY
   ========================================================================== */

function extractSummary(
  payload: unknown,
): SummaryData {
  const root =
    unwrapData(payload)

  if (
    !isRecord(root)
  ) {
    return {
      ...EMPTY_SUMMARY,
    }
  }

  const source =
    isRecord(
      root.summary,
    )
      ? root.summary
      : root

  const business =
    isRecord(
      source.business,
    )
      ? source.business
      : isRecord(
          root.business,
        )
        ? root.business
        : {}

  const user =
    isRecord(
      source.user,
    )
      ? source.user
      : isRecord(
          root.user,
        )
        ? root.user
        : {}

  const cashFlow =
    isRecord(
      source.cash_flow,
    )
      ? source.cash_flow
      : isRecord(
          source.cashFlow,
        )
        ? source.cashFlow
        : {}

  const cash =
    toNumber(
      firstValue(
        source,
        [
          'cash',
          'available_cash',
          'availableCash',
          'cash_in_bank',
          'cashInBank',
          'bank_balance',
          'bankBalance',
          'current_cash',
          'currentCash',
        ],
      ),
    )

  const receivables =
    toNumber(
      firstValue(
        source,
        [
          'receivables',
          'total_receivables',
          'totalReceivables',
          'outstanding_receivables',
          'outstandingReceivables',
        ],
      ),
    )

  const payables =
    toNumber(
      firstValue(
        source,
        [
          'payables',
          'total_payables',
          'totalPayables',
          'outstanding_payables',
          'outstandingPayables',
        ],
      ),
    )

  const directNet =
    toNumber(
      firstValue(
        source,
        [
          'netCashFlow',
          'net_cash_flow',
          'net',
        ],
      ),
    )

  const nestedNet =
    toNumber(
      firstValue(
        cashFlow,
        [
          'net',
          'net_cash_flow',
          'netCashFlow',
        ],
      ),
    )

  const overdue =
    toNumber(
      firstValue(
        source,
        [
          'overdue',
          'overdue_receivables',
          'overdueReceivables',
          'overdue_amount',
          'overdueAmount',
        ],
      ),
    )

  const upcoming =
    toNumber(
      firstValue(
        source,
        [
          'upcoming',
          'upcoming_payments',
          'upcomingPayments',
          'upcoming_obligations',
          'upcomingObligations',
        ],
      ),
    )

  return {
    cash,
    receivables,
    payables,

    netCashFlow:
      directNet ??
      nestedNet ??
      null,

    overdue,
    upcoming,

    businessName:
      toText(
        firstValue(
          business,
          [
            'name',
            'business_name',
            'businessName',
            'company_name',
            'companyName',
          ],
        ),
        toText(
          firstValue(
            source,
            [
              'business_name',
              'businessName',
              'company_name',
              'companyName',
            ],
          ),
          'Your business',
        ),
      ),

    businessType:
      toText(
        firstValue(
          business,
          [
            'type',
            'business_type',
            'businessType',
            'industry',
          ],
        ),
        toText(
          firstValue(
            source,
            [
              'business_type',
              'businessType',
              'industry',
            ],
          ),
          'MSME',
        ),
      ),

    userName:
      toText(
        firstValue(
          user,
          [
            'name',
            'full_name',
            'fullName',
            'display_name',
            'displayName',
          ],
        ),
        toText(
          firstValue(
            source,
            [
              'user_name',
              'userName',
              'owner_name',
              'ownerName',
            ],
          ),
          'Business owner',
        ),
      ),

    cashAccountsCount:
      toNumber(
        firstValue(
          source,
          [
            'cash_accounts',
            'cashAccounts',
            'connected_accounts',
            'connectedAccounts',
            'bank_accounts',
            'bankAccounts',
          ],
        ),
      ),

    overduePercentage:
      toNumber(
        firstValue(
          source,
          [
            'overdue_percentage',
            'overduePercentage',
            'overdue_percent',
            'overduePercent',
          ],
        ),
      ),

    upcomingCount:
      toNumber(
        firstValue(
          source,
          [
            'upcoming_count',
            'upcomingCount',
            'upcoming_obligation_count',
            'upcomingObligationCount',
          ],
        ),
      ),

    cashTrend:
      toNumber(
        firstValue(
          source,
          [
            'cash_trend',
            'cashTrend',
            'cash_growth',
            'cashGrowth',
          ],
        ),
      ),

    receivableTrend:
      toNumber(
        firstValue(
          source,
          [
            'receivable_trend',
            'receivableTrend',
          ],
        ),
      ),

    payableTrend:
      toNumber(
        firstValue(
          source,
          [
            'payable_trend',
            'payableTrend',
          ],
        ),
      ),

    netTrend:
      toNumber(
        firstValue(
          source,
          [
            'net_trend',
            'netTrend',
            'cash_flow_trend',
            'cashFlowTrend',
          ],
        ),
      ),
  }
}

/* ==========================================================================
   ROW EXTRACTION
   ========================================================================== */

function extractRows(
  payload: unknown,
): JsonRecord[] {
  const root =
    unwrapData(payload)

  if (
    Array.isArray(root)
  ) {
    return root.filter(
      isRecord,
    )
  }

  if (
    !isRecord(root)
  ) {
    return []
  }

  const rowSources = [
    'data',
    'items',
    'rows',
    'results',
    'customers',
    'vendors',
    'invoices',
    'transactions',
    'alerts',
    'activities',
    'history',
  ]

  for (
    const key of rowSources
  ) {
    const rows =
      root[key]

    if (
      Array.isArray(rows)
    ) {
      return rows.filter(
        isRecord,
      )
    }
  }

  return []
}

/* ==========================================================================
   RECEIVABLES
   ========================================================================== */

function extractReceivables(
  payload: unknown,
): RiskRow[] {
  return extractRows(
    payload,
  )
    .map(
      (
        row,
        index,
      ) => {
        const amount =
          toNumber(
            firstValue(
              row,
              [
                'outstanding',
                'amount',
                'due_amount',
                'dueAmount',
                'invoice_amount',
                'invoiceAmount',
                'balance',
                'total_due',
                'totalDue',
              ],
            ),
          ) ?? 0

        const reference =
          toText(
            firstValue(
              row,
              [
                'invoice',
                'invoice_number',
                'invoiceNumber',
                'reference',
                'invoice_no',
                'invoiceNo',
              ],
            ),
            '',
          )

        const name =
          toText(
            firstValue(
              row,
              [
                'customer',
                'customer_name',
                'customerName',
                'name',
                'company',
                'customer_company',
              ],
            ),
            'Customer',
          )

        const timing =
          toText(
            firstValue(
              row,
              [
                'timing',
                'days_overdue',
                'daysOverdue',
                'due_in',
                'dueIn',
                'status',
                'payment_status',
                'paymentStatus',
              ],
            ),
            '',
          )

        const risk =
          toText(
            firstValue(
              row,
              [
                'risk',
                'risk_level',
                'riskLevel',
                'priority',
              ],
            ),
            'Review',
          )

        return {
          id:
            toText(
              firstValue(
                row,
                [
                  'id',
                  'invoice_id',
                  'invoiceId',
                ],
              ),
              `receivable-${index}`,
            ),

          name,
          reference,
          amount,
          timing,
          risk,
        }
      },
    )
    .filter(
      (row) =>
        row.amount !== 0 ||
        Boolean(
          row.reference,
        ),
    )
    .slice(
      0,
      8,
    )
}

/* ==========================================================================
   ACTIVITY
   ========================================================================== */

function extractActivities(
  payload: unknown,
): ActivityItem[] {
  return extractRows(
    payload,
  )
    .map(
      (
        row,
        index,
      ) => ({
        id:
          toText(
            firstValue(
              row,
              [
                'id',
                'transaction_id',
                'transactionId',
                'activity_id',
                'activityId',
              ],
            ),
            `activity-${index}`,
          ),

        title:
          toText(
            firstValue(
              row,
              [
                'title',
                'type',
                'event',
                'activity',
                'name',
              ],
            ),
            'Financial activity',
          ),

        detail:
          toText(
            firstValue(
              row,
              [
                'detail',
                'description',
                'message',
                'summary',
                'remarks',
              ],
            ),
            '',
          ),

        timestamp:
          toText(
            firstValue(
              row,
              [
                'timestamp',
                'created_at',
                'createdAt',
                'date',
                'transaction_date',
                'transactionDate',
              ],
            ),
            '',
          ),
      }),
    )
    .slice(
      0,
      8,
    )
}

/* ==========================================================================
   ALERTS
   ========================================================================== */

function extractAlerts(
  payload: unknown,
): AlertItem[] {
  return extractRows(
    payload,
  )
    .map(
      (
        row,
        index,
      ) => {
        const title =
          toText(
            firstValue(
              row,
              [
                'title',
                'name',
                'type',
                'alert_type',
                'alertType',
              ],
            ),
            'Business alert',
          )

        const detail =
          toText(
            firstValue(
              row,
              [
                'detail',
                'description',
                'message',
                'summary',
              ],
            ),
            '',
          )

        const action =
          toText(
            firstValue(
              row,
              [
                'action',
                'action_label',
                'actionLabel',
              ],
            ),
            'Review',
          )

        const explicitHref =
          toText(
            firstValue(
              row,
              [
                'href',
                'url',
                'link',
                'action_url',
                'actionUrl',
              ],
            ),
            '',
          )

        let href =
          explicitHref

        if (!href) {
          const combined =
            `${title} ${detail}`.toLowerCase()

          if (
            combined.includes(
              'invoice',
            ) ||
            combined.includes(
              'receivable',
            ) ||
            combined.includes(
              'collection',
            )
          ) {
            href =
              '/invoices'
          } else if (
            combined.includes(
              'reconcil',
            )
          ) {
            href =
              '/reconciliation'
          } else if (
            combined.includes(
              'payment',
            ) ||
            combined.includes(
              'payable',
            )
          ) {
            href =
              '/payments'
          } else {
            href =
              '/alerts'
          }
        }

        return {
          id:
            toText(
              firstValue(
                row,
                [
                  'id',
                  'alert_id',
                  'alertId',
                ],
              ),
              `alert-${index}`,
            ),

          title,

          detail,

          action,

          href,
        }
      },
    )
    .slice(
      0,
      8,
    )
}

/* ==========================================================================
   BACKEND REQUEST
   ========================================================================== */

async function requestJson(
  endpoint: string,
): Promise<EndpointResult> {
  try {
    const headers =
      new Headers()

    headers.set(
      'Accept',
      'application/json',
    )

    const token =
      getAuthToken()

    if (token) {
      headers.set(
        'Authorization',
        `Bearer ${token}`,
      )
    }

    const response =
      await fetch(
        `${API_BASE_URL}${endpoint}`,
        {
          method: 'GET',
          headers,
          credentials: 'include',
          cache: 'no-store',
        },
      )

    const contentType =
      response.headers.get(
        'content-type',
      ) || ''

    let data: unknown =
      null

    if (
      contentType.includes(
        'application/json',
      )
    ) {
      try {
        data =
          await response.json()
      } catch {
        data = null
      }
    } else {
      try {
        data =
          await response.text()
      } catch {
        data = null
      }
    }

    if (!response.ok) {
      let message =
        `API request failed: ${response.status}`

      if (
        isRecord(data)
      ) {
        const detail =
          data.detail

        const apiMessage =
          data.message

        const errorMessage =
          data.error

        if (
          typeof detail ===
            'string' &&
          detail.trim()
        ) {
          message =
            detail.trim()
        } else if (
          typeof apiMessage ===
            'string' &&
          apiMessage.trim()
        ) {
          message =
            apiMessage.trim()
        } else if (
          typeof errorMessage ===
            'string' &&
          errorMessage.trim()
        ) {
          message =
            errorMessage.trim()
        }
      } else if (
        typeof data ===
        'string'
      ) {
        const trimmed =
          data.trim()

        if (trimmed) {
          message =
            trimmed
        }
      }

      if (
        response.status ===
        401
      ) {
        clearAuthStorage()

        if (
          typeof window !==
          'undefined'
        ) {
          window.dispatchEvent(
            new CustomEvent(
              'cashguard-auth-expired',
            ),
          )
        }
      }

      return {
        ok: false,
        data: null,
        error: message,
        status:
          response.status,
      }
    }

    return {
      ok: true,
      data,
      status:
        response.status,
    }
  } catch (error) {
    return {
      ok: false,
      data: null,
      error:
        error instanceof Error
          ? error.message
          : 'Unable to connect to CashGuard-AI API.',
    }
  }
}

/* ==========================================================================
   ML FORECAST
   ========================================================================== */

async function requestMLForecast(
  businessId: string,
): Promise<
  ApiMLForecastResponse | null
> {
  const horizonDays =
    7

  const endpoint =
    `/predict/cash-flow?business_id=${encodeURIComponent(
      businessId,
    )}&horizon_days=${horizonDays}`

  try {
    const response =
      await fetch(
        `${ML_API_BASE_URL}${endpoint}`,
        {
          method: 'GET',
          headers: {
            Accept:
              'application/json',
          },
          cache:
            'no-store',
        },
      )

    const contentType =
      response.headers.get(
        'content-type',
      ) || ''

    let body: unknown =
      null

    if (
      contentType.includes(
        'application/json',
      )
    ) {
      try {
        body =
          await response.json()
      } catch {
        body = null
      }
    } else {
      try {
        body =
          await response.text()
      } catch {
        body = null
      }
    }

    if (
      !response.ok
    ) {
      console.warn(
        `[Dashboard] ML forecast unavailable (${response.status}).`,
        body,
      )

      return null
    }

    if (
      !isRecord(body)
    ) {
      console.warn(
        '[Dashboard] Invalid ML forecast response.',
      )

      return null
    }

    if (
      !Array.isArray(
        body.forecast,
      )
    ) {
      console.warn(
        '[Dashboard] ML response does not contain forecast[].',
      )

      return null
    }

    const forecastRows =
      body.forecast
        .filter(
          isRecord,
        )
        .map(
          (
            row,
          ) => ({
            forecast_date:
              toText(
                row.forecast_date,
                '',
              ),

            predicted_inflow:
              toNumber(
                row.predicted_inflow,
              ),

            predicted_outflow:
              toNumber(
                row.predicted_outflow,
              ),

            predicted_net_cash_flow:
              toNumber(
                row.predicted_net_cash_flow,
              ) ?? 0,
          }),
        )
        .filter(
          (
            row,
          ) =>
            Boolean(
              row.forecast_date,
            ),
        )

    return {
      business_id:
        typeof body.business_id ===
          'string' ||
        body.business_id ===
          null
          ? (
              body.business_id as
                | string
                | null
            )
          : businessId,

      horizon_days:
        toNumber(
          body.horizon_days,
        ) ??
        horizonDays,

      forecast_days:
        toNumber(
          body.forecast_days,
        ) ??
        forecastRows.length,

      model:
        toText(
          body.model,
          'cash_flow_forecast_model.joblib',
        ),

      target:
        toText(
          body.target,
          'net_cash_flow',
        ),

      forecast:
        forecastRows,
    }
  } catch (
    error
  ) {
    console.warn(
      '[Dashboard] ML service unavailable. Core dashboard remains active.',
      error,
    )

    return null
  }
}

/* ==========================================================================
   BUILD FORECAST
   ========================================================================== */

function buildForecastFromML(
  currentCash:
    | number
    | null,
  forecast:
    | ApiMLForecastResponse
    | null,
): ForecastData {
  if (
    !forecast ||
    !forecast.forecast.length
  ) {
    return {
      ...EMPTY_FORECAST,
      current:
        currentCash,
    }
  }

  let running =
    currentCash ??
    0

  let lowest =
    running

  let lowestDate:
    | string
    | null =
    null

  for (
    const row of forecast.forecast
  ) {
    const net =
      Number.isFinite(
        row.predicted_net_cash_flow,
      )
        ? row.predicted_net_cash_flow
        : 0

    running +=
      net

    if (
      running <
      lowest
    ) {
      lowest =
        running

      lowestDate =
        row.forecast_date
    }
  }

  return {
    current:
      currentCash,

    inflow:
      null,

    outflow:
      null,

    projected:
      running,

    lowPoint:
      lowest,

    lowDate:
      lowestDate,
  }
}

/* ==========================================================================
   AI INSIGHT REQUEST
   ========================================================================== */

async function requestAiCashFlowInsight(
  payload: JsonRecord,
): Promise<AiInsight> {
  try {
    const businessId =
      toText(
        payload.business_id,
        '',
      ).trim()

    if (
      !businessId
    ) {
      return {
        ...EMPTY_AI,
        error:
          'Business ID is missing. AI insight cannot be generated.',
      }
    }

    const headers =
      new Headers()

    headers.set(
      'Accept',
      'application/json',
    )

    headers.set(
      'Content-Type',
      'application/json',
    )

    const token =
      getAuthToken()

    if (token) {
      headers.set(
        'Authorization',
        `Bearer ${token}`,
      )
    }

    /*
     * IMPORTANT:
     *
     * The backend InsightRequest requires business_id
     * at the TOP LEVEL.
     *
     * The intelligence object contains the complete
     * business analysis context.
     */
    const requestBody = {
      business_id:
        businessId,

      intelligence: {
        ...payload,

        /*
         * Keep business_id inside intelligence too,
         * because the domain prompt can use it as context.
         */
        business_id:
          businessId,
      },
    }

    console.info(
      '[Dashboard] AI cash-flow request prepared.',
      {
        business_id:
          businessId,
        intelligenceKeys:
          Object.keys(
            requestBody.intelligence,
          ),
      },
    )

    const response =
      await fetch(
        `${API_BASE_URL}/api/ai/insight/cash-flow`,
        {
          method: 'POST',
          headers,
          credentials: 'include',
          cache: 'no-store',
          body:
            JSON.stringify(
              requestBody,
            ),
        },
      )

    const contentType =
      response.headers.get(
        'content-type',
      ) || ''

    let body: unknown =
      null

    if (
      contentType.includes(
        'application/json',
      )
    ) {
      try {
        body =
          await response.json()
      } catch {
        body = null
      }
    } else {
      try {
        body =
          await response.text()
      } catch {
        body = null
      }
    }

    if (
      !response.ok
    ) {
      let message =
        `AI insight request failed: ${response.status}`

      if (
        isRecord(body)
      ) {
        const detail =
          body.detail

        const errorMessage =
          body.error

        const messageValue =
          body.message

        if (
          typeof detail ===
            'string' &&
          detail.trim()
        ) {
          message =
            detail.trim()
        } else if (
          Array.isArray(
            detail,
          )
        ) {
          message =
            detail
              .map(
                (
                  item,
                ) => {
                  if (
                    isRecord(item)
                  ) {
                    return toText(
                      item.msg,
                      'Validation error',
                    )
                  }

                  return String(
                    item,
                  )
                },
              )
              .join(
                ', ',
              )
        } else if (
          typeof errorMessage ===
            'string' &&
          errorMessage.trim()
        ) {
          message =
            errorMessage.trim()
        } else if (
          typeof messageValue ===
            'string' &&
          messageValue.trim()
        ) {
          message =
            messageValue.trim()
        }
      }

      console.warn(
        '[Dashboard] AI insight request failed:',
        {
          status:
            response.status,
          body,
        },
      )

      return {
        ...EMPTY_AI,
        error:
          message,
      }
    }

    const root =
      unwrapData(body)

    /*
     * Expected backend response:
     *
     * {
     *   "status": "success",
     *   "insight": {
     *      "domain": "cash_flow",
     *      "summary": "...",
     *      "confidence_note": "...",
     *      "recommendations": [...],
     *      "priority": "...",
     *      "risk_level": "...",
     *      "recommended_actions": [...]
     *   }
     * }
     */

    let insightPayload:
      unknown =
        root

    if (
      isRecord(root) &&
      isRecord(root.insight)
    ) {
      insightPayload =
        root.insight
    }

    if (
      isRecord(
        insightPayload,
      )
    ) {
      const summary =
        toText(
          firstValue(
            insightPayload,
            [
              'summary',
              'insight',
              'message',
              'analysis',
              'overview',
              'text',
            ],
          ),
          '',
        )

      const recommendation =
        toText(
          firstValue(
            insightPayload,
            [
              'recommendation',
              'recommended_action',
              'recommendedAction',
              'action',
              'next_action',
              'nextAction',
            ],
          ),
          '',
        )

      const recommendationValues =
        firstValue(
          insightPayload,
          [
            'recommendations',
            'recommended_actions',
            'recommendedActions',
          ],
        )

      const recommendationList =
        Array.isArray(
          recommendationValues,
        )
          ? recommendationValues
              .filter(
                (
                  item,
                ) =>
                  typeof item ===
                  'string',
              )
              .map(
                (
                  item,
                ) =>
                  item.trim(),
              )
              .filter(
                Boolean,
              )
          : []

      const finalRecommendation =
        recommendation ||
        recommendationList[0] ||
        'Continue monitoring liquidity, collections and upcoming obligations.'

      const priority =
        toText(
          firstValue(
            insightPayload,
            [
              'priority',
              'priority_level',
              'priorityLevel',
              'severity',
            ],
          ),
          'MONITOR',
        )

      const risk =
        toText(
          firstValue(
            insightPayload,
            [
              'risk_level',
              'riskLevel',
              'risk',
            ],
          ),
          'MODERATE',
        )

      const confidence =
        toText(
          firstValue(
            insightPayload,
            [
              'confidence_note',
              'confidenceNote',
              'confidence',
            ],
          ),
          'Generated from the current CashGuard-AI business data.',
        )

      return {
        available:
          Boolean(
            summary ||
            finalRecommendation,
          ),

        summary:
          summary ||
          'AI analysed the current CashGuard-AI business position.',

        recommendation:
          finalRecommendation,

        priority:
          priority.toUpperCase(),

        risk:
          risk.toUpperCase(),

        confidence,

        generatedAt:
          new Date().toISOString(),
      }
    }

    if (
      typeof insightPayload ===
      'string'
    ) {
      const text =
        insightPayload.trim()

      if (text) {
        return {
          available:
            true,

          summary:
            text,

          recommendation:
            'Review this recommendation against the current cash position before taking action.',

          priority:
            'MONITOR',

          risk:
            'MODERATE',

          confidence:
            'Generated from live business data.',

          generatedAt:
            new Date().toISOString(),
        }
      }
    }

    console.warn(
      '[Dashboard] AI returned an unexpected response.',
      body,
    )

    return {
      ...EMPTY_AI,
      error:
        'AI returned an invalid insight response.',
    }
  } catch (
    error
  ) {
    console.warn(
      '[Dashboard] AI cash-flow insight unavailable.',
      error,
    )

    return {
      ...EMPTY_AI,
      error:
        error instanceof Error
          ? error.message
          : 'Unable to connect to AI insight service.',
    }
  }
}

/* ==========================================================================
   BUILD AI INPUT
   ========================================================================== */

function buildAiCashFlowPayload(
  businessId: string | null,
  summary: SummaryData,
  chart: ChartPoint[],
  forecast: ForecastData,
  receivables: RiskRow[],
  alerts: AlertItem[],
): JsonRecord {
  return {
    business_id:
      businessId,

    business: {
      name:
        summary.businessName,

      type:
        summary.businessType,

      owner:
        summary.userName,
    },

    cash_position: {
      available_cash:
        summary.cash,

      receivables:
        summary.receivables,

      payables:
        summary.payables,

      net_cash_flow:
        summary.netCashFlow,

      overdue_receivables:
        summary.overdue,

      upcoming_payments:
        summary.upcoming,
    },

    trends: {
      cash:
        summary.cashTrend,

      receivables:
        summary.receivableTrend,

      payables:
        summary.payableTrend,

      net_cash_flow:
        summary.netTrend,
    },

    historical_cash_flow:
      chart.map(
        (
          point,
        ) => ({
          label:
            point.label,

          inflow:
            point.inflow,

          outflow:
            point.outflow,

          net:
            point.net,
        }),
      ),

    ml_forecast: {
      current:
        forecast.current,

      projected:
        forecast.projected,

      lowest:
        forecast.lowPoint,

      lowest_date:
        forecast.lowDate,
    },

    receivables_risk:
      receivables.map(
        (
          row,
        ) => ({
          customer:
            row.name,

          reference:
            row.reference,

          amount:
            row.amount,

          timing:
            row.timing,

          risk:
            row.risk,
        }),
      ),

    alerts:
      alerts.map(
        (
          alert,
        ) => ({
          title:
            alert.title,

          detail:
            alert.detail,

          action:
            alert.action,
        }),
      ),

    requested_analysis: [
      'current liquidity',
      'cash-flow risk',
      'receivables risk',
      'payables pressure',
      'near-term cash shortage',
      'recommended business action',
    ],
  }
}

/* ==========================================================================
   INITIAL STATE
   ========================================================================== */

function buildInitialState(): DashboardState {
  return {
    summary:
      EMPTY_SUMMARY,

    authUser:
      EMPTY_AUTH_USER,

    forecast:
      EMPTY_FORECAST,

    charts: {
      '7D': [],
      '30D': [],
      '90D': [],
    },

    receivables: [],
    payables: [],
    activities: [],
    alerts: [],

    ai:
      EMPTY_AI,
  }
}

/* ==========================================================================
   PAGE
   ========================================================================== */

export default function DashboardPage() {
  const [
    period,
    setPeriod,
  ] =
    useState<Period>('30D')

  const [
    state,
    setState,
  ] =
    useState<DashboardState>(
      buildInitialState,
    )

  const [
    loading,
    setLoading,
  ] =
    useState(true)

  const [
    refreshing,
    setRefreshing,
  ] =
    useState(false)

  const [
    error,
    setError,
  ] =
    useState('')

  const [
    notice,
    setNotice,
  ] =
    useState('')

  const loadInFlight =
    useRef(false)

  /* ------------------------------------------------------------------------
     LOAD DASHBOARD
     ------------------------------------------------------------------------ */

  const loadDashboard =
    useCallback(
      async (
        showRefreshState = false,
      ) => {
        if (
          loadInFlight.current
        ) {
          return
        }

        loadInFlight.current =
          true

        if (
          showRefreshState
        ) {
          setRefreshing(true)
        } else {
          setLoading(true)
        }

        setError('')

        try {
          const [
            authResult,
            summaryResult,
            cashFlow7Result,
            cashFlow30Result,
            cashFlow90Result,
            transactionResult,
            alertResult,
            invoiceResult,
          ] =
            await Promise.all([
              requestJson(
                '/api/auth/me',
              ),

              requestJson(
                '/api/dashboard/summary',
              ),

              requestJson(
                '/api/dashboard/cash-flow/history?days=7',
              ),

              requestJson(
                '/api/dashboard/cash-flow/history?days=30',
              ),

              requestJson(
                '/api/dashboard/cash-flow/history?days=90',
              ),

              requestJson(
                '/api/dashboard/recent-transactions',
              ),

              requestJson(
                '/api/dashboard/alerts',
              ),

              requestJson(
                '/api/invoices?limit=8&offset=0',
              ),
            ])

          const authUser =
            authResult.ok
              ? extractAuthUser(
                  authResult.data,
                )
              : {
                  ...EMPTY_AUTH_USER,
                }

          const summaryFromApi =
            summaryResult.ok
              ? extractSummary(
                  summaryResult.data,
                )
              : {
                  ...EMPTY_SUMMARY,
                }

          const resolvedSummary:
            SummaryData = {
              ...summaryFromApi,

              userName:
                authUser.name &&
                authUser.name !==
                  EMPTY_AUTH_USER.name
                  ? authUser.name
                  : summaryFromApi.userName,
            }

          const chart7 =
            cashFlow7Result.ok
              ? extractHistoryRows(
                  cashFlow7Result.data,
                )
              : []

          const chart30 =
            cashFlow30Result.ok
              ? extractHistoryRows(
                  cashFlow30Result.data,
                )
              : []

          const chart90 =
            cashFlow90Result.ok
              ? extractHistoryRows(
                  cashFlow90Result.data,
                )
              : []

          const receivables =
            invoiceResult.ok
              ? extractReceivables(
                  invoiceResult.data,
                )
              : []

          const activities =
            transactionResult.ok
              ? extractActivities(
                  transactionResult.data,
                )
              : []

          const alerts =
            alertResult.ok
              ? extractAlerts(
                  alertResult.data,
                )
              : []

          /*
           * Keep this empty until an authenticated payables
           * contract is explicitly confirmed.
           */
          const payables:
            RiskRow[] = []

          const businessId =
            getBusinessId()

          let forecast:
            ForecastData = {
              ...EMPTY_FORECAST,
              current:
                resolvedSummary.cash,
            }

          let ai:
            AiInsight = {
              ...EMPTY_AI,
            }

          /* ----------------------------------------------------------------
             ML FORECAST
             ---------------------------------------------------------------- */

          if (
            businessId &&
            (
              resolvedSummary.cash !==
                null ||
              chart30.length >
                0
            )
          ) {
            const ml =
              await requestMLForecast(
                businessId,
              )

            forecast =
              buildForecastFromML(
                resolvedSummary.cash,
                ml,
              )
          }

          /* ----------------------------------------------------------------
             AI INSIGHT
             ---------------------------------------------------------------- */

          if (
            businessId &&
            (
              resolvedSummary.cash !==
                null ||
              resolvedSummary.receivables !==
                null ||
              resolvedSummary.payables !==
                null ||
              chart30.length >
                0
            )
          ) {
            const aiPayload =
              buildAiCashFlowPayload(
                businessId,
                resolvedSummary,
                chart30,
                forecast,
                receivables,
                alerts,
              )

            ai =
              await requestAiCashFlowInsight(
                aiPayload,
              )
          }

          /* ----------------------------------------------------------------
             STATE
             ---------------------------------------------------------------- */

          setState({
            summary:
              resolvedSummary,

            authUser,

            forecast,

            charts: {
              '7D':
                chart7,

              '30D':
                chart30,

              '90D':
                chart90,
            },

            receivables,

            payables,

            activities,

            alerts,

            ai,
          })

          /* ----------------------------------------------------------------
             ERROR CLASSIFICATION
             ---------------------------------------------------------------- */

          const coreResults = [
            authResult,
            summaryResult,
            cashFlow7Result,
            cashFlow30Result,
            cashFlow90Result,
          ]

          const authFailure =
            authResult.status ===
              401 ||
            coreResults.some(
              (
                result,
              ) =>
                result.status ===
                401,
            )

          if (
            authFailure
          ) {
            setError(
              'Your login session has expired. Please login again.',
            )
          } else {
            const failedCoreCalls =
              [
                summaryResult,
                cashFlow7Result,
                cashFlow30Result,
                cashFlow90Result,
              ].filter(
                (
                  result,
                ) =>
                  !result.ok,
              )

            if (
              failedCoreCalls.length
            ) {
              setError(
                'Some live dashboard data could not be loaded. Check the FastAPI dashboard routes.',
              )
            } else {
              setError('')
            }
          }

          if (
            !authResult.ok &&
            authResult.status !==
              401
          ) {
            console.warn(
              '[Dashboard] /api/auth/me unavailable:',
              authResult.error,
            )
          }

          if (
            !transactionResult.ok
          ) {
            console.warn(
              '[Dashboard] Recent transactions unavailable:',
              transactionResult.error,
            )
          }

          if (
            !alertResult.ok
          ) {
            console.warn(
              '[Dashboard] Alerts unavailable:',
              alertResult.error,
            )
          }

          if (
            !invoiceResult.ok
          ) {
            console.warn(
              '[Dashboard] Invoice data unavailable:',
              invoiceResult.error,
            )
          }

          if (
            ai.error
          ) {
            console.warn(
              '[Dashboard] AI insight unavailable:',
              ai.error,
            )
          }
        } catch (
          requestError
        ) {
          console.error(
            '[DashboardPage]',
            requestError,
          )

          setError(
            requestError instanceof
              Error
              ? requestError.message
              : 'Unable to load live dashboard data.',
          )
        } finally {
          setLoading(false)
          setRefreshing(false)

          loadInFlight.current =
            false
        }
      },
      [],
    )

  /* ------------------------------------------------------------------------
     INITIAL LOAD + AUTO REFRESH
     ------------------------------------------------------------------------ */

  useEffect(() => {
    void loadDashboard()

    const interval =
      window.setInterval(
        () => {
          void loadDashboard(
            true,
          )
        },
        30000,
      )

    return () => {
      window.clearInterval(
        interval,
      )
    }
  }, [
    loadDashboard,
  ])

  /* ------------------------------------------------------------------------
     AUTH EVENTS
     ------------------------------------------------------------------------ */

  useEffect(() => {
    const onAuthChanged =
      () => {
        void loadDashboard(
          true,
        )
      }

    const onAuthExpired =
      () => {
        setError(
          'Your login session has expired. Please login again.',
        )

        setLoading(false)
        setRefreshing(false)
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
    loadDashboard,
  ])

  /* ------------------------------------------------------------------------
     CHART
     ------------------------------------------------------------------------ */

  const chart =
    state.charts[period]

  const max =
    useMemo(() => {
      if (
        !chart.length
      ) {
        return 0
      }

      return Math.max(
        1,
        ...chart.flatMap(
          (
            point,
          ) => [
            Math.abs(
              point.inflow,
            ),

            Math.abs(
              point.outflow,
            ),

            Math.abs(
              point.net,
            ),
          ],
        ),
      )
    }, [
      chart,
    ])

  const points =
    useMemo(() => {
      if (
        !chart.length
      ) {
        return {
          inflow: '',
          outflow: '',
          net: '',
        }
      }

      const makePoints =
        (
          getter: (
            point: ChartPoint,
          ) => number,
        ) =>
          chart
            .map(
              (
                point,
                index,
              ) => {
                const x =
                  chart.length ===
                  1
                    ? 50
                    : (
                        index /
                        (
                          chart.length -
                          1
                        )
                      ) *
                      100

                const value =
                  getter(point)

                const safeValue =
                  Number.isFinite(
                    value,
                  )
                    ? value
                    : 0

                const y =
                  92 -
                  (
                    Math.max(
                      -max,
                      Math.min(
                        max,
                        safeValue,
                      ),
                    ) /
                    max
                  ) *
                    42

                return `${x},${y}`
              },
            )
            .join(' ')

      return {
        inflow:
          makePoints(
            (
              point,
            ) =>
              point.inflow,
          ),

        outflow:
          makePoints(
            (
              point,
            ) =>
              point.outflow,
          ),

        net:
          makePoints(
            (
              point,
            ) =>
              point.net,
          ),
      }
    }, [
      chart,
      max,
    ])

  const summary =
    state.summary

  const forecast =
    state.forecast

  const authUser =
    state.authUser

  /* ------------------------------------------------------------------------
     FEEDBACK
     ------------------------------------------------------------------------ */

  const handleFeedback =
    (
      message: string,
    ) => {
      setNotice(
        message,
      )

      window.setTimeout(
        () => {
          setNotice('')
        },
        2800,
      )
    }

  /* ------------------------------------------------------------------------
     RENDER
     ------------------------------------------------------------------------ */

  return (
    <>
      <main className="foundation-content dashboard-content dashboard-professional">

        {notice && (
          <div
            className="dashboard-toast"
            role="status"
          >
            <CheckCircle2
              size={16}
            />

            {notice}
          </div>
        )}

        {error && (
          <div
            className="dashboard-toast dashboard-error"
            role="alert"
          >
            <CircleAlert
              size={16}
            />

            <span>
              {error}
            </span>

            <button
              type="button"
              onClick={() =>
                void loadDashboard(
                  true,
                )
              }
            >
              Retry
            </button>
          </div>
        )}

        {/* ================================================================
           HEADER
           ================================================================ */}

        <div className="dashboard-heading">

          <div>

            <p className="auth-eyebrow">
              LIVE BUSINESS CONTROL · IST
            </p>

            <h2>
              Welcome back,{' '}
              {authUser.name ||
                summary.userName}
            </h2>

            <p>
              Monitor liquidity,
              collections,
              payments and
              business risk using
              your current
              CashGuard-AI data.
            </p>

          </div>

          <div className="dashboard-actions">

            <button
              className="business-selector"
              type="button"
              onClick={() =>
                handleFeedback(
                  'Business profile is connected to live API data.',
                )
              }
            >

              <Landmark
                size={15}
              />

              <span>

                <b>
                  {summary.businessName}
                </b>

                <small>
                  {summary.businessType}
                </small>

              </span>

            </button>

            <button
              className="secondary-button"
              type="button"
              onClick={() =>
                void loadDashboard(
                  true,
                )
              }
              disabled={
                refreshing
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
                ? 'Refreshing…'
                : 'Refresh data'}

            </button>

            <Link
              href="/cash-flow"
              className="auth-button compact"
            >
              View Cash Flow
            </Link>

          </div>

        </div>

        {/* ================================================================
           KPI
           ================================================================ */}

        {loading ? (

          <section
            className="dashboard-kpis"
            aria-label="Loading dashboard"
          >

            {Array.from({
              length: 6,
            }).map(
              (
                _,
                index,
              ) => (

                <div
                  className="foundation-card kpi-card"
                  key={`loading-${index}`}
                >

                  <div
                    className="dashboard-skeleton"
                    style={{
                      height: 15,
                      width: '42%',
                    }}
                  />

                  <div
                    className="dashboard-skeleton"
                    style={{
                      height: 32,
                      width: '66%',
                      marginTop: 12,
                    }}
                  />

                  <div
                    className="dashboard-skeleton"
                    style={{
                      height: 11,
                      width: '82%',
                      marginTop: 10,
                    }}
                  />

                </div>
              ),
            )}

          </section>

        ) : (

          <section
            className="dashboard-kpis"
            aria-label="Executive cash position"
          >

            <Metric
              icon={
                <WalletCards
                  size={15}
                />
              }
              title="Available cash"
              value={formatCompactMoney(
                summary.cash,
              )}
              detail="Current live cash position"
              trend={formatTrend(
                summary.cashTrend,
              )}
              good={
                summary.cashTrend !==
                  null &&
                summary.cashTrend >=
                  0
              }
            />

            <Metric
              icon={
                <ArrowDownRight
                  size={15}
                />
              }
              title="Total receivables"
              value={formatCompactMoney(
                summary.receivables,
              )}
              detail={
                summary.overdue !==
                null
                  ? `${formatCompactMoney(
                      summary.overdue,
                    )} overdue`
                  : 'Current outstanding receivables'
              }
              trend={formatTrend(
                summary.receivableTrend,
              )}
              warn={
                summary.overdue !==
                  null &&
                summary.overdue >
                  0
              }
              href="/invoices"
            />

            <Metric
              icon={
                <ArrowUpRight
                  size={15}
                />
              }
              title="Total payables"
              value={formatCompactMoney(
                summary.payables,
              )}
              detail={
                summary.payables !==
                null
                  ? 'Current outstanding payables'
                  : 'Payables endpoint not connected yet'
              }
              trend={formatTrend(
                summary.payableTrend,
              )}
              warn={
                summary.payables !==
                  null &&
                summary.payables >
                  0
              }
              href="/vendors"
            />

            <Metric
              icon={
                <IndianRupee
                  size={15}
                />
              }
              title="Net cash flow"
              value={formatCompactMoney(
                summary.netCashFlow,
              )}
              detail="Current available period"
              trend={formatTrend(
                summary.netTrend,
              )}
              good={
                summary.netCashFlow !==
                  null &&
                summary.netCashFlow >=
                  0
              }
            />

            <Metric
              icon={
                <CircleAlert
                  size={15}
                />
              }
              title="Overdue receivables"
              value={formatCompactMoney(
                summary.overdue,
              )}
              detail={
                summary.overduePercentage !==
                null
                  ? `${summary.overduePercentage.toFixed(
                      1,
                    )}% of receivables`
                  : 'Current overdue exposure'
              }
              trend="Collection attention"
              warn={
                summary.overdue !==
                  null &&
                summary.overdue >
                  0
              }
              href="/invoices"
            />

            <Metric
              icon={
                <CalendarClock
                  size={15}
                />
              }
              title="Upcoming payments"
              value={formatCompactMoney(
                summary.upcoming,
              )}
              detail={
                summary.upcomingCount !==
                null
                  ? `${summary.upcomingCount} upcoming obligations`
                  : 'Upcoming business obligations'
              }
              trend="Review priority"
              warn={
                summary.upcoming !==
                  null &&
                summary.upcoming >
                  0
              }
              href="/payments"
            />

          </section>

        )}

        {/* ================================================================
           CHART + FORECAST
           ================================================================ */}

        <div className="dashboard-main-grid">

          <section className="foundation-card dashboard-chart-card">

            <div className="panel-heading">

              <div>

                <h3>
                  Cash flow control center
                </h3>

                <p>
                  Live historical movement from
                  the CashGuard backend
                </p>

              </div>

              <div className="chart-tabs">

                {(
                  [
                    '7D',
                    '30D',
                    '90D',
                  ] as Period[]
                ).map(
                  (
                    item,
                  ) => (

                    <button
                      key={item}
                      type="button"
                      className={
                        period ===
                        item
                          ? 'active'
                          : ''
                      }
                      onClick={() =>
                        setPeriod(
                          item,
                        )
                      }
                    >
                      {item}
                    </button>

                  ),
                )}

              </div>

            </div>

            {!chart.length ? (

              <EmptyState
                title="No cash-flow series available"
                detail="The dashboard could not find chart data in the live cash-flow history response."
              />

            ) : (

              <>

                <div className="dashboard-chart-wrap">

                  <div className="chart-axis">

                    <span>
                      {formatCompactMoney(
                        max,
                      )}
                    </span>

                    <span>
                      {formatCompactMoney(
                        max *
                          0.75,
                      )}
                    </span>

                    <span>
                      {formatCompactMoney(
                        max *
                          0.5,
                      )}
                    </span>

                    <span>
                      {formatCompactMoney(
                        max *
                          0.25,
                      )}
                    </span>

                    <span>
                      ₹0
                    </span>

                  </div>

                  <div className="dashboard-chart">

                    <div className="chart-gridlines">
                      <i />
                      <i />
                      <i />
                      <i />
                    </div>

                    <svg
                      viewBox="0 0 100 100"
                      preserveAspectRatio="none"
                      aria-label={`Cash flow chart for ${period}`}
                    >

                      <polyline
                        points={
                          points.inflow
                        }
                        fill="none"
                        stroke="#0ea5e9"
                        strokeWidth="2.5"
                        vectorEffect="non-scaling-stroke"
                      />

                      <polyline
                        points={
                          points.outflow
                        }
                        fill="none"
                        stroke="#f59e0b"
                        strokeWidth="2.5"
                        vectorEffect="non-scaling-stroke"
                      />

                      <polyline
                        points={
                          points.net
                        }
                        fill="none"
                        stroke="#22c55e"
                        strokeWidth="2.5"
                        vectorEffect="non-scaling-stroke"
                      />

                    </svg>

                  </div>

                </div>

                <div className="chart-legend">

                  <span>
                    <i className="legend-blue" />
                    Cash inflow
                  </span>

                  <span>
                    <i className="legend-amber" />
                    Cash outflow
                  </span>

                  <span>
                    <i className="legend-green" />
                    Net cash flow
                  </span>

                </div>

                <div className="chart-support">

                  <div>

                    <small>
                      Total inflow
                    </small>

                    <strong>
                      {formatMoney(
                        chart.reduce(
                          (
                            sum,
                            row,
                          ) =>
                            sum +
                            row.inflow,
                          0,
                        ),
                      )}
                    </strong>

                  </div>

                  <div>

                    <small>
                      Total outflow
                    </small>

                    <strong>
                      {formatMoney(
                        chart.reduce(
                          (
                            sum,
                            row,
                          ) =>
                            sum +
                            row.outflow,
                          0,
                        ),
                      )}
                    </strong>

                  </div>

                  <div>

                    <small>
                      Period net
                    </small>

                    <strong
                      className={
                        chart.reduce(
                          (
                            sum,
                            row,
                          ) =>
                            sum +
                            row.net,
                          0,
                        ) >=
                        0
                          ? 'positive-text'
                          : 'warning-text'
                      }
                    >
                      {formatMoney(
                        chart.reduce(
                          (
                            sum,
                            row,
                          ) =>
                            sum +
                            row.net,
                          0,
                        ),
                      )}
                    </strong>

                  </div>

                </div>

              </>

            )}

          </section>

          <section className="foundation-card forecast-card">

            <div className="panel-heading">

              <div>

                <h3>
                  Liquidity outlook
                </h3>

                <p>
                  Existing Cash Flow ML forecast
                </p>

              </div>

              <Sparkles
                size={18}
                className="icon-sky"
              />

            </div>

            {forecast.projected ===
              null ? (

              <EmptyState
                title="Forecast unavailable"
                detail="The Cash Flow ML service did not return a forecast for the selected business."
              />

            ) : (

              <div className="live-forecast-content">

                <div className="dashboard-forecast-grid">

                  <div className="dashboard-forecast-item">

                    <small>
                      Current
                    </small>

                    <strong>
                      {formatCompactMoney(
                        forecast.current,
                      )}
                    </strong>

                  </div>

                  <div className="dashboard-forecast-item">

                    <small>
                      Projected
                    </small>

                    <strong
                      className={
                        (
                          forecast.projected ??
                          0
                        ) <
                        0
                          ? 'warning-text'
                          : 'positive-text'
                      }
                    >
                      {formatCompactMoney(
                        forecast.projected,
                      )}
                    </strong>

                  </div>

                  <div className="dashboard-forecast-item">

                    <small>
                      Lowest
                    </small>

                    <strong
                      className={
                        (
                          forecast.lowPoint ??
                          0
                        ) <
                        0
                          ? 'warning-text'
                          : ''
                      }
                    >
                      {formatCompactMoney(
                        forecast.lowPoint,
                      )}
                    </strong>

                  </div>

                </div>

                <div className="forecast-low-date">

                  <small>
                    Lowest projected date
                  </small>

                  <strong>
                    {forecast.lowDate
                      ? formatDate(
                          forecast.lowDate,
                        )
                      : 'No shortfall point detected'}
                  </strong>

                </div>

                <div className="forecast-model-info">

                  <span>
                    <Sparkles
                      size={12}
                    />

                    ML forecast
                  </span>

                  <small>
                    Existing trained cash-flow
                    model
                  </small>

                </div>

                <Link
                  href="/cash-flow"
                  className="text-link"
                >
                  Open Cash Flow

                  <ArrowUpRight
                    size={13}
                  />
                </Link>

              </div>

            )}

          </section>

        </div>

        {/* ================================================================
           AI
           ================================================================ */}

        <div className="dashboard-two-col">

          <section className="foundation-card insight-dashboard-card">

            <div className="panel-heading">

              <div>

                <h3>
                  AI cash-flow insight
                </h3>

                <p>
                  Live analysis from CashGuard-AI business data
                </p>

              </div>

              <span className="priority-chip">
                {state.ai.priority}
              </span>

            </div>

            <div className="ai-insight-body">

              <Sparkles
                size={20}
              />

              <div>

                <strong>
                  {state.ai.available
                    ? 'AI analysis ready'
                    : 'AI analysis unavailable'}
                </strong>

                <p>
                  {state.ai.summary}
                </p>

              </div>

            </div>

            <div className="ai-recommendation">

              <small>
                Recommended action
              </small>

              <span>
                {state.ai.recommendation}
              </span>

            </div>

            <div className="ai-live-meta">

              <span>
                Risk:{' '}

                <b>
                  {state.ai.risk}
                </b>
              </span>

              <span>
                Confidence:{' '}

                <b>
                  {state.ai.confidence}
                </b>
              </span>

              {state.ai.generatedAt && (
                <span>
                  Updated:{' '}

                  <b>
                    {formatDate(
                      state.ai.generatedAt,
                    )}
                  </b>
                </span>
              )}

            </div>

            {state.ai.error && (
              <div className="ai-error-message">
                {state.ai.error}
              </div>
            )}

            <button
              type="button"
              className="auth-button compact ai-refresh-button"
              onClick={() =>
                void loadDashboard(
                  true,
                )
              }
              disabled={
                refreshing
              }
            >

              <Sparkles
                size={14}
              />

              {refreshing
                ? 'Refreshing AI…'
                : 'Refresh AI insight'}

            </button>

          </section>

          <section className="foundation-card risk-dashboard-card">

            <div className="panel-heading">

              <div>

                <h3>
                  Business risk snapshot
                </h3>

                <p>
                  Current liquidity exposure
                </p>

              </div>

              <span className="risk-level medium">
                {state.ai.risk}
              </span>

            </div>

            <div className="risk-score">

              <strong>
                ✓
              </strong>

              <span>
                Core dashboard connected
              </span>

            </div>

            <p>
              Live summary, historical
              cash-flow and ML forecasting
              are connected to the FastAPI
              stack.
            </p>

            <Link
              href="/risk-intelligence"
              className="text-link"
            >
              Review risk intelligence

              <ArrowUpRight
                size={13}
              />
            </Link>

          </section>

        </div>

        {/* ================================================================
           RECEIVABLES + PAYABLES
           ================================================================ */}

        <div className="dashboard-two-col">

          <section className="foundation-card compare-card">

            <div className="panel-heading">

              <div>

                <h3>
                  Receivables intelligence
                </h3>

                <p>
                  Live customer collection exposure
                </p>

              </div>

              <Link
                href="/invoices"
                className="text-link"
              >
                View receivables
              </Link>

            </div>

            <div className="mini-finance-stats">

              <Stat
                label="Outstanding"
                value={formatCompactMoney(
                  summary.receivables,
                )}
              />

              <Stat
                label="Overdue"
                value={formatCompactMoney(
                  summary.overdue,
                )}
                tone="warn"
              />

              <Stat
                label="Risk rows"
                value={String(
                  state.receivables.length,
                )}
              />

              <Stat
                label="Status"
                value={
                  summary.overdue !==
                    null &&
                  summary.overdue >
                    0
                    ? 'Attention'
                    : 'Monitor'
                }
                tone={
                  summary.overdue !==
                    null &&
                  summary.overdue >
                    0
                    ? 'warn'
                    : undefined
                }
              />

            </div>

            {state.receivables
              .length ? (

              state.receivables.map(
                (
                  row,
                ) => (

                  <FinanceRiskRow
                    key={
                      row.id
                    }
                    values={
                      row
                    }
                    kind="customer"
                  />

                ),
              )

            ) : (

              <EmptyState
                title="No receivable intelligence"
                detail="The live invoice endpoint did not return receivable rows."
              />

            )}

          </section>

          <section className="foundation-card compare-card">

            <div className="panel-heading">

              <div>

                <h3>
                  Payables control
                </h3>

                <p>
                  Live payment and obligation
                  exposure
                </p>

              </div>

              <Link
                href="/vendors"
                className="text-link"
              >
                View payables
              </Link>

            </div>

            <div className="mini-finance-stats">

              <Stat
                label="Total payables"
                value={formatCompactMoney(
                  summary.payables,
                )}
              />

              <Stat
                label="Upcoming"
                value={formatCompactMoney(
                  summary.upcoming,
                )}
                tone="warn"
              />

              <Stat
                label="Risk rows"
                value="0"
              />

              <Stat
                label="Status"
                value={
                  summary.payables !==
                    null &&
                  summary.payables >
                    0
                    ? 'Review'
                    : 'Monitor'
                }
              />

            </div>

            <EmptyState
              title="Payment authentication required"
              detail="The dashboard does not call an unconfirmed payables endpoint. Use the authenticated Payments page."
            />

          </section>

        </div>

        {/* ================================================================
           ACTIVITY + ALERTS
           ================================================================ */}

        <div className="dashboard-two-col">

          <section className="foundation-card activity-dashboard-card">

            <div className="panel-heading">

              <div>

                <h3>
                  Recent financial activity
                </h3>

                <p>
                  Latest live events from
                  the workspace
                </p>

              </div>

              <button
                type="button"
                className="text-link"
                onClick={() =>
                  void loadDashboard(
                    true,
                  )
                }
                aria-label="Refresh activity"
              >

                <RefreshCw
                  size={15}
                />

              </button>

            </div>

            {state.activities
              .length ? (

              state.activities.map(
                (
                  activity,
                ) => (

                  <div
                    className="dashboard-activity"
                    key={
                      activity.id
                    }
                  >

                    <span className="activity-dot" />

                    <div>

                      <strong>
                        {
                          activity.title
                        }
                      </strong>

                      <p>
                        {
                          activity.detail
                        }
                      </p>

                      {activity.timestamp && (
                        <small>
                          {
                            activity.timestamp
                          }
                        </small>
                      )}

                    </div>

                    <CheckCircle2
                      size={15}
                      className="positive-text"
                    />

                  </div>

                ),
              )

            ) : (

              <EmptyState
                title="No recent activity"
                detail="The current dashboard transaction endpoint returned no activity rows."
              />

            )}

          </section>

          <section className="foundation-card alerts-dashboard-card">

            <div className="panel-heading">

              <div>

                <h3>
                  Priority alerts
                </h3>

                <p>
                  Unresolved actions from
                  the live alert service
                </p>

              </div>

              <Link
                href="/alerts"
                className="text-link"
              >
                View all
              </Link>

            </div>

            {state.alerts
              .length ? (

              state.alerts.map(
                (
                  alert,
                ) => (

                  <div
                    className="dashboard-alert"
                    key={
                      alert.id
                    }
                  >

                    <ShieldAlert
                      size={16}
                    />

                    <div>

                      <strong>
                        {
                          alert.title
                        }
                      </strong>

                      <p>
                        {
                          alert.detail
                        }
                      </p>

                    </div>

                    <Link
                      href={
                        alert.href
                      }
                    >
                      {
                        alert.action
                      }
                    </Link>

                  </div>

                ),
              )

            ) : (

              <EmptyState
                title="No priority alerts"
                detail="The live alerts endpoint currently returned no unresolved alert rows."
              />

            )}

          </section>

        </div>

        {/* ================================================================
           QUICK ACTIONS
           ================================================================ */}

        <section className="foundation-card quick-actions-card">

          <div className="panel-heading">

            <div>

              <h3>
                Quick business actions
              </h3>

              <p>
                Move from financial insight
                to business action
              </p>

            </div>

          </div>

          <div className="quick-actions">

            {[
              [
                'Create invoice',
                '/invoices',
                FileText,
              ],

              [
                'Record payment',
                '/payments',
                Banknote,
              ],

              [
                'Manage customers',
                '/customers',
                WalletCards,
              ],

              [
                'Manage vendors',
                '/vendors',
                Landmark,
              ],

              [
                'Reconcile transaction',
                '/reconciliation',
                ListChecks,
              ],
            ].map(
              ([
                label,
                href,
                Icon,
              ]) => {

                const ActionIcon =
                  Icon as typeof FileText

                return (
                  <Link
                    href={
                      href as string
                    }
                    key={
                      label as string
                    }
                  >

                    <ActionIcon
                      size={16}
                    />

                    <span>
                      {
                        label
                      }
                    </span>

                    <ArrowUpRight
                      size={13}
                    />

                  </Link>
                )
              },
            )}

          </div>

        </section>

      </main>

      {/* ====================================================================
          COMPLETE DASHBOARD CSS
          ==================================================================== */}

      <style jsx global>{`

        /* ================================================================
           BASE
           ================================================================ */

        .dashboard-professional {
          width: 100%;
          max-width: 1440px;
          margin: 0 auto;
          padding: 34px 32px 60px;
        }

        .dashboard-professional,
        .dashboard-professional * {
          box-sizing: border-box;
        }

        .dashboard-professional button,
        .dashboard-professional input,
        .dashboard-professional select {
          font: inherit;
        }

        .dashboard-professional a {
          text-decoration: none;
        }

        /* ================================================================
           HEADER
           ================================================================ */

        .dashboard-heading {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 24px;
          margin-bottom: 18px;
        }

        .dashboard-heading > div:first-child {
          min-width: 0;
        }

        .dashboard-heading h2 {
          margin: 0 0 8px;
          color: #0f172a;
          font-size: 34px;
          line-height: 1.05;
          letter-spacing: -0.055em;
        }

        .dashboard-heading p:not(.auth-eyebrow) {
          max-width: 760px;
          margin: 0;
          color: #64748b;
          font-size: 13px;
          line-height: 1.6;
        }

        .dashboard-actions {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          flex-wrap: wrap;
          gap: 9px;
        }

        .business-selector {
          min-width: 285px;
          max-width: 360px;
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 10px 12px;
          border: 1px solid #dbe4ee;
          border-radius: 9px;
          background: #fff;
          color: #334155;
          text-align: left;
          cursor: pointer;
        }

        .business-selector > span {
          min-width: 0;
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .business-selector b {
          font-size: 11px;
          line-height: 1.2;
        }

        .business-selector small {
          color: #94a3b8;
          font-size: 9px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .business-selector:hover {
          border-color: #bae6fd;
          background: #f8fdff;
        }

        /* ================================================================
           TOAST / ERROR
           ================================================================ */

        .dashboard-toast {
          display: flex;
          align-items: center;
          gap: 9px;
          margin-bottom: 14px;
          padding: 10px 12px;
          border: 1px solid #bbf7d0;
          border-radius: 8px;
          background: #f0fdf4;
          color: #166534;
          font-size: 11px;
        }

        .dashboard-toast button {
          margin-left: auto;
          border: 0;
          background: transparent;
          color: inherit;
          font-size: 10px;
          font-weight: 700;
          cursor: pointer;
        }

        .dashboard-error {
          border-color: #fecaca;
          background: #fff7f7;
          color: #b91c1c;
        }

        /* ================================================================
           KPI
           ================================================================ */

        .dashboard-kpis {
          display: grid;
          grid-template-columns:
            repeat(
              6,
              minmax(0, 1fr)
            );
          gap: 11px;
        }

        .dashboard-professional .kpi-card {
          min-width: 0;
          min-height: 122px;
          padding: 16px;
          border: 1px solid #e2e8f0;
          border-radius: 11px;
          background: #fff;
        }

        .dashboard-professional .metric-link {
          transition:
            border-color 0.18s ease,
            transform 0.18s ease,
            box-shadow 0.18s ease;
        }

        .dashboard-professional .metric-link:hover {
          border-color: #bae6fd;
          transform: translateY(-1px);
          box-shadow:
            0 7px 20px rgba(
              15,
              23,
              42,
              0.05
            );
        }

        .metric-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }

        .metric-top > span {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          color: #64748b;
          font-size: 10px;
          font-weight: 750;
        }

        .metric-top > i {
          width: 7px;
          height: 7px;
          flex: 0 0 auto;
          border-radius: 50%;
          background: #38bdf8;
        }

        .metric-top > i.green {
          background: #22c55e;
        }

        .metric-top > i.amber {
          background: #f59e0b;
        }

        .dashboard-professional .money {
          display: block;
          margin: 14px 0 7px;
          color: #0f172a;
          font-size: clamp(
            18px,
            1.9vw,
            23px
          );
          font-weight: 780;
          line-height: 1.05;
          letter-spacing: -0.05em;
          overflow-wrap: anywhere;
        }

        .kpi-card p {
          margin: 0;
          color: #94a3b8;
          font-size: 10px;
          line-height: 1.4;
        }

        .kpi-card > small {
          display: block;
          margin-top: 10px;
          color: #64748b;
          font-size: 9px;
          line-height: 1.35;
        }

        .positive-text {
          color: #16a34a !important;
        }

        .warning-text {
          color: #d97706 !important;
        }

        .danger-text {
          color: #dc2626 !important;
        }

        /* ================================================================
           MAIN GRID
           ================================================================ */

        .dashboard-main-grid {
          display: grid;
          grid-template-columns:
            minmax(0, 1.65fr)
            minmax(320px, 0.85fr);
          gap: 14px;
          margin-top: 14px;
        }

        .dashboard-two-col {
          display: grid;
          grid-template-columns:
            minmax(0, 1fr)
            minmax(0, 1fr);
          gap: 14px;
          margin-top: 14px;
        }

        .dashboard-chart-card,
        .forecast-card,
        .compare-card,
        .activity-dashboard-card,
        .alerts-dashboard-card,
        .quick-actions-card,
        .insight-dashboard-card,
        .risk-dashboard-card {
          min-width: 0;
          overflow: hidden;
        }

        .dashboard-chart-card,
        .forecast-card {
          min-height: 430px;
          padding: 20px;
        }

        /* ================================================================
           PANEL HEAD
           ================================================================ */

        .panel-heading {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 14px;
        }

        .panel-heading > div:first-child {
          min-width: 0;
        }

        .panel-heading h3 {
          margin: 0;
          color: #0f172a;
          font-size: 15px;
          line-height: 1.25;
          letter-spacing: -0.025em;
        }

        .panel-heading p {
          margin: 5px 0 0;
          color: #94a3b8;
          font-size: 11px;
          line-height: 1.55;
        }

        .icon-sky {
          color: #0284c7;
        }

        /* ================================================================
           CHART TABS
           ================================================================ */

        .chart-tabs {
          display: inline-flex;
          gap: 3px;
          flex: 0 0 auto;
          padding: 3px;
          border: 1px solid #dbe4ee;
          border-radius: 8px;
          background: #fff;
        }

        .chart-tabs button {
          border: 0;
          border-radius: 6px;
          padding: 7px 10px;
          background: transparent;
          color: #64748b;
          font-size: 10px;
          font-weight: 700;
          cursor: pointer;
        }

        .chart-tabs button:hover {
          background: #f8fafc;
        }

        .chart-tabs button.active {
          background: #e0f2fe;
          color: #0284c7;
        }

        /* ================================================================
           CHART
           ================================================================ */

        .dashboard-chart-wrap {
          display: grid;
          grid-template-columns:
            56px
            minmax(0, 1fr);
          gap: 9px;
          width: 100%;
          margin-top: 19px;
        }

        .chart-axis {
          display: flex;
          height: 286px;
          flex-direction: column;
          justify-content: space-between;
          padding: 1px 0;
        }

        .chart-axis span {
          color: #94a3b8;
          font-size: 9px;
          white-space: nowrap;
        }

        .dashboard-chart {
          position: relative;
          width: 100%;
          height: 286px;
          min-width: 0;
          overflow: hidden;
          border-radius: 8px;
        }

        .dashboard-chart svg {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
        }

        .chart-gridlines {
          position: absolute;
          inset: 0;
          display: grid;
          grid-template-rows:
            repeat(
              4,
              1fr
            );
          pointer-events: none;
        }

        .chart-gridlines i {
          display: block;
          border-top:
            1px dashed
            #e2e8f0;
        }

        .chart-legend {
          display: flex;
          flex-wrap: wrap;
          gap: 18px;
          margin-top: 12px;
          color: #64748b;
          font-size: 10px;
        }

        .chart-legend span {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }

        .chart-legend i {
          width: 18px;
          border-top: 2px solid;
        }

        .legend-blue {
          border-color: #0ea5e9;
        }

        .legend-amber {
          border-color: #f59e0b;
        }

        .legend-green {
          border-color: #22c55e;
        }

        .chart-support {
          display: grid;
          grid-template-columns:
            repeat(
              3,
              minmax(0, 1fr)
            );
          gap: 10px;
          margin-top: 17px;
          padding-top: 14px;
          border-top:
            1px solid
            #e2e8f0;
        }

        .chart-support > div {
          min-width: 0;
        }

        .chart-support small {
          display: block;
          margin-bottom: 5px;
          color: #94a3b8;
          font-size: 9px;
        }

        .chart-support strong {
          display: block;
          color: #334155;
          font-size: 13px;
          overflow-wrap: anywhere;
        }

        /* ================================================================
           FORECAST
           ================================================================ */

        .forecast-card {
          display: flex;
          flex-direction: column;
        }

        .live-forecast-content {
          width: 100%;
          min-width: 0;
          margin-top: 18px;
        }

        .dashboard-forecast-grid {
          display: grid;
          grid-template-columns:
            repeat(
              3,
              minmax(0, 1fr)
            );
          gap: 10px;
          width: 100%;
        }

        .dashboard-forecast-item {
          min-width: 0;
          padding: 13px;
          border: 1px solid #e2e8f0;
          border-radius: 9px;
          background: #fff;
        }

        .dashboard-forecast-item small {
          display: block;
          margin-bottom: 7px;
          color: #64748b;
          font-size: 10px;
          font-weight: 600;
          line-height: 1.25;
        }

        .dashboard-forecast-item strong {
          display: block;
          max-width: 100%;
          color: #0f172a;
          font-size: 15px;
          font-weight: 760;
          line-height: 1.2;
          overflow-wrap: anywhere;
        }

        .forecast-low-date {
          width: 100%;
          margin-top: 12px;
          padding: 13px;
          border: 1px solid #bae6fd;
          border-radius: 9px;
          background: #f8fdff;
        }

        .forecast-low-date small {
          display: block;
          margin-bottom: 7px;
          color: #64748b;
          font-size: 10px;
          line-height: 1.3;
        }

        .forecast-low-date strong {
          display: block;
          color: #0f172a;
          font-size: 14px;
          line-height: 1.25;
          overflow-wrap: anywhere;
        }

        .forecast-model-info {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-top: 12px;
          padding: 10px 12px;
          border: 1px solid #dbeafe;
          border-radius: 8px;
          background: #f8fbff;
        }

        .forecast-model-info span {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          color: #0284c7;
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 0.05em;
          text-transform: uppercase;
        }

        .forecast-model-info small {
          color: #94a3b8;
          font-size: 9px;
          text-align: right;
        }

        .live-forecast-content > .text-link {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          margin-top: 14px;
          color: #0284c7;
          font-size: 10px;
          font-weight: 750;
        }

        /* ================================================================
           AI / RISK
           ================================================================ */

        .insight-dashboard-card,
        .risk-dashboard-card {
          padding: 20px;
        }

        .insight-dashboard-card {
          border-color: #bae6fd;
          background: #f0f9ff;
        }

        .priority-chip {
          flex: 0 0 auto;
          padding: 5px 8px;
          border-radius: 20px;
          background: #fef3c7;
          color: #b45309;
          font-size: 9px;
          font-weight: 800;
        }

        .ai-insight-body {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          margin-top: 17px;
          padding: 14px;
          border: 1px solid #e0f2fe;
          border-radius: 9px;
          background: #fff;
          color: #0284c7;
        }

        .ai-insight-body > div {
          min-width: 0;
        }

        .ai-insight-body strong {
          display: block;
          color: #0f172a;
          font-size: 12px;
        }

        .ai-insight-body p {
          margin: 5px 0 0;
          color: #64748b;
          font-size: 10px;
          line-height: 1.55;
        }

        .ai-recommendation {
          display: grid;
          gap: 4px;
          margin-top: 10px;
          padding: 12px 0;
          border-top: 1px solid #e0f2fe;
        }

        .ai-recommendation small {
          color: #94a3b8;
          font-size: 9px;
          font-weight: 700;
          text-transform: uppercase;
        }

        .ai-recommendation span {
          color: #475569;
          font-size: 10px;
          line-height: 1.5;
        }

        .ai-live-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 10px;
        }

        .ai-live-meta span {
          padding: 5px 8px;
          border: 1px solid #dbeafe;
          border-radius: 999px;
          background: #fff;
          color: #64748b;
          font-size: 9px;
        }

        .ai-live-meta b {
          color: #334155;
        }

        .ai-error-message {
          margin-top: 10px;
          padding: 9px 10px;
          border: 1px solid #fecaca;
          border-radius: 7px;
          background: #fff7f7;
          color: #b91c1c;
          font-size: 9px;
          line-height: 1.4;
        }

        .ai-refresh-button {
          margin-top: 12px;
          display: inline-flex;
          align-items: center;
          gap: 7px;
        }

        .risk-level {
          flex: 0 0 auto;
          padding: 5px 8px;
          border-radius: 20px;
          font-size: 9px;
          font-weight: 800;
        }

        .risk-level.medium {
          background: #fef3c7;
          color: #b45309;
        }

        .risk-score {
          display: flex;
          align-items: center;
          gap: 9px;
          margin-top: 17px;
        }

        .risk-score strong {
          width: 30px;
          height: 30px;
          display: grid;
          place-items: center;
          border-radius: 8px;
          background: #dcfce7;
          color: #15803d;
          font-size: 16px;
        }

        .risk-score span {
          color: #334155;
          font-size: 11px;
          font-weight: 700;
        }

        .risk-dashboard-card > p {
          margin: 12px 0 0;
          color: #64748b;
          font-size: 10px;
          line-height: 1.55;
        }

        .risk-dashboard-card > .text-link {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          margin-top: 14px;
          color: #0284c7;
          font-size: 10px;
          font-weight: 750;
        }

        /* ================================================================
           COMPARE
           ================================================================ */

        .compare-card {
          padding: 20px;
        }

        .mini-finance-stats {
          display: grid;
          grid-template-columns:
            repeat(
              4,
              minmax(0, 1fr)
            );
          gap: 9px;
          margin: 16px 0 4px;
        }

        .mini-finance-stats > div {
          min-width: 0;
          padding: 10px;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          background: #f8fafc;
        }

        .mini-finance-stats small {
          display: block;
          margin-bottom: 5px;
          color: #94a3b8;
          font-size: 8px;
          line-height: 1.2;
        }

        .mini-finance-stats strong {
          display: block;
          color: #334155;
          font-size: 12px;
          overflow-wrap: anywhere;
        }

        .finance-risk-row {
          display: grid;
          grid-template-columns:
            32px
            minmax(0, 1fr)
            auto;
          align-items: center;
          gap: 10px;
          padding: 12px 0;
          border-bottom: 1px solid #f1f5f9;
        }

        .finance-risk-row:last-child {
          border-bottom: 0;
        }

        .finance-risk-avatar {
          width: 32px;
          height: 32px;
          display: grid;
          place-items: center;
          border-radius: 8px;
          background: #e0f2fe;
          color: #0284c7;
          font-size: 11px;
          font-weight: 800;
        }

        .finance-risk-row > div:nth-child(2) {
          min-width: 0;
        }

        .finance-risk-row strong {
          display: block;
          color: #334155;
          font-size: 11px;
          line-height: 1.3;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .finance-risk-row small {
          display: block;
          margin-top: 3px;
          color: #94a3b8;
          font-size: 9px;
          line-height: 1.35;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .risk-pill {
          padding: 4px 7px;
          border-radius: 20px;
          background: #fef3c7;
          color: #b45309;
          font-size: 8px;
          font-weight: 800;
          white-space: nowrap;
        }

        .risk-pill.high,
        .risk-pill.critical {
          background: #fee2e2;
          color: #dc2626;
        }

        .risk-pill.low {
          background: #dcfce7;
          color: #15803d;
        }

        /* ================================================================
           ACTIVITY
           ================================================================ */

        .activity-dashboard-card,
        .alerts-dashboard-card {
          padding: 20px;
        }

        .dashboard-activity {
          display: grid;
          grid-template-columns:
            8px
            minmax(0, 1fr)
            auto;
          align-items: flex-start;
          gap: 10px;
          padding: 12px 0;
          border-bottom: 1px solid #f1f5f9;
        }

        .dashboard-activity:last-child {
          border-bottom: 0;
        }

        .activity-dot {
          width: 7px;
          height: 7px;
          margin-top: 5px;
          border-radius: 50%;
          background: #0ea5e9;
        }

        .dashboard-activity strong {
          display: block;
          color: #334155;
          font-size: 11px;
          line-height: 1.35;
        }

        .dashboard-activity p {
          margin: 3px 0 0;
          color: #64748b;
          font-size: 9px;
          line-height: 1.45;
        }

        .dashboard-activity small {
          display: block;
          margin-top: 4px;
          color: #94a3b8;
          font-size: 8px;
        }

        /* ================================================================
           ALERTS
           ================================================================ */

        .dashboard-alert {
          display: grid;
          grid-template-columns:
            18px
            minmax(0, 1fr)
            auto;
          align-items: flex-start;
          gap: 10px;
          padding: 12px 0;
          border-bottom: 1px solid #f1f5f9;
          color: #b45309;
        }

        .dashboard-alert:last-child {
          border-bottom: 0;
        }

        .dashboard-alert > div {
          min-width: 0;
        }

        .dashboard-alert strong {
          display: block;
          color: #334155;
          font-size: 11px;
        }

        .dashboard-alert p {
          margin: 3px 0 0;
          color: #64748b;
          font-size: 9px;
          line-height: 1.45;
        }

        .dashboard-alert a {
          color: #0284c7;
          font-size: 9px;
          font-weight: 750;
          white-space: nowrap;
        }

        /* ================================================================
           QUICK ACTIONS
           ================================================================ */

        .quick-actions-card {
          margin-top: 14px;
          padding: 20px;
        }

        .quick-actions {
          display: grid;
          grid-template-columns:
            repeat(
              5,
              minmax(0, 1fr)
            );
          gap: 9px;
          margin-top: 16px;
        }

        .quick-actions a {
          min-width: 0;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 11px 12px;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          background: #fff;
          color: #334155;
          transition:
            border-color 0.18s ease,
            transform 0.18s ease;
        }

        .quick-actions a:hover {
          border-color: #bae6fd;
          transform: translateY(-1px);
        }

        .quick-actions a > span {
          min-width: 0;
          flex: 1;
          overflow: hidden;
          font-size: 10px;
          font-weight: 700;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .quick-actions a > svg:first-child {
          color: #0284c7;
          flex: 0 0 auto;
        }

        .quick-actions a > svg:last-child {
          color: #94a3b8;
          flex: 0 0 auto;
        }

        /* ================================================================
           SKELETON
           ================================================================ */

        .dashboard-skeleton {
          border-radius: 6px;
          background:
            linear-gradient(
              90deg,
              #f1f5f9 25%,
              #e2e8f0 50%,
              #f1f5f9 75%
            );
          background-size:
            200%
            100%;
          animation:
            dashboardSkeleton
            1.4s
            infinite;
        }

        @keyframes dashboardSkeleton {

          0% {
            background-position:
              200% 0;
          }

          100% {
            background-position:
              -200% 0;
          }

        }

        /* ================================================================
           RESPONSIVE
           ================================================================ */

        @media (max-width: 1250px) {

          .dashboard-kpis {
            grid-template-columns:
              repeat(
                3,
                minmax(0, 1fr)
              );
          }

          .dashboard-main-grid {
            grid-template-columns:
              minmax(0, 1.5fr)
              minmax(300px, 0.9fr);
          }

          .quick-actions {
            grid-template-columns:
              repeat(
                3,
                minmax(0, 1fr)
              );
          }

        }

        @media (max-width: 1050px) {

          .dashboard-main-grid,
          .dashboard-two-col {
            grid-template-columns:
              1fr;
          }

          .dashboard-chart-card,
          .forecast-card {
            min-height: auto;
          }

          .mini-finance-stats {
            grid-template-columns:
              repeat(
                4,
                minmax(0, 1fr)
              );
          }

        }

        @media (max-width: 800px) {

          .dashboard-professional {
            padding:
              28px 20px 48px;
          }

          .dashboard-heading {
            align-items: flex-start;
            flex-direction: column;
          }

          .dashboard-actions {
            width: 100%;
            justify-content: flex-start;
          }

          .business-selector {
            min-width: 0;
            flex: 1;
          }

          .dashboard-forecast-grid {
            grid-template-columns:
              repeat(
                3,
                minmax(0, 1fr)
              );
          }

          .quick-actions {
            grid-template-columns:
              repeat(
                2,
                minmax(0, 1fr)
              );
          }

        }

        @media (max-width: 650px) {

          .dashboard-professional {
            padding:
              22px 16px 40px;
          }

          .dashboard-heading h2 {
            font-size: 30px;
          }

          .dashboard-kpis {
            grid-template-columns:
              repeat(
                2,
                minmax(0, 1fr)
              );
          }

          .dashboard-chart-card,
          .forecast-card,
          .compare-card,
          .activity-dashboard-card,
          .alerts-dashboard-card,
          .quick-actions-card,
          .insight-dashboard-card,
          .risk-dashboard-card {
            padding: 16px;
          }

          .dashboard-actions {
            flex-direction: column;
            align-items: stretch;
          }

          .dashboard-actions > * {
            width: 100%;
            max-width: none;
          }

          .chart-tabs {
            width: 100%;
          }

          .chart-tabs button {
            flex: 1;
          }

          .dashboard-chart-wrap {
            grid-template-columns:
              45px
              minmax(
                480px,
                1fr
              );
            overflow-x: auto;
            padding-bottom: 4px;
          }

          .dashboard-chart {
            min-width: 480px;
          }

          .dashboard-forecast-grid {
            grid-template-columns:
              1fr;
          }

          .mini-finance-stats {
            grid-template-columns:
              repeat(
                2,
                minmax(0, 1fr)
              );
          }

          .chart-support {
            grid-template-columns:
              1fr;
          }

          .quick-actions {
            grid-template-columns:
              1fr;
          }

        }

        @media (max-width: 480px) {

          .dashboard-kpis {
            grid-template-columns:
              1fr;
          }

          .dashboard-heading h2 {
            font-size: 27px;
          }

          .business-selector {
            width: 100%;
          }

          .mini-finance-stats {
            grid-template-columns:
              1fr 1fr;
          }

          .finance-risk-row {
            grid-template-columns:
              30px
              minmax(0, 1fr)
              auto;
          }

          .forecast-model-info {
            align-items: flex-start;
            flex-direction: column;
          }

          .forecast-model-info small {
            text-align: left;
          }

          .ai-live-meta {
            flex-direction: column;
            align-items: flex-start;
          }

        }

      `}</style>
    </>
  )
}

/* ==========================================================================
   COMPONENTS
   ========================================================================== */

function Metric({
  icon,
  title,
  value,
  detail,
  trend,
  good,
  warn,
  href,
}: {
  icon: ReactNode
  title: string
  value: string
  detail: string
  trend: string
  good?: boolean
  warn?: boolean
  href?: string
}) {
  const body = (
    <>
      <div className="metric-top">

        <span>
          {icon}
          {title}
        </span>

        <i
          className={
            good
              ? 'green'
              : warn
                ? 'amber'
                : ''
          }
        />

      </div>

      <strong className="money">
        {value}
      </strong>

      <p>
        {detail}
      </p>

      <small
        className={
          good
            ? 'positive-text'
            : warn
              ? 'warning-text'
              : ''
        }
      >
        {trend}
      </small>
    </>
  )

  if (href) {
    return (
      <Link
        href={href}
        className="foundation-card kpi-card metric-link"
      >
        {body}
      </Link>
    )
  }

  return (
    <div className="foundation-card kpi-card">
      {body}
    </div>
  )
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: string
}) {
  return (
    <div>

      <small>
        {label}
      </small>

      <strong
        className={
          tone === 'warn'
            ? 'warning-text'
            : ''
        }
      >
        {value}
      </strong>

    </div>
  )
}

function FinanceRiskRow({
  values,
  kind,
}: {
  values: RiskRow
  kind:
    | 'customer'
    | 'vendor'
}) {
  const timing =
    values.timing ||
    'Current'

  const risk =
    values.risk ||
    'Review'

  const safeRiskClass =
    risk
      .toLowerCase()
      .replace(
        /\s+/g,
        '-',
      )

  return (
    <div className="finance-risk-row">

      <div className="finance-risk-avatar">
        {values.name
          ?.charAt(0)
          ?.toUpperCase() ||
          '?'}
      </div>

      <div>

        <strong>
          {values.name}
        </strong>

        <small>
          {kind ===
            'customer' &&
          values.reference
            ? `${values.reference} · ${formatCompactMoney(
                values.amount,
              )} · ${timing}`
            : `${formatCompactMoney(
                values.amount,
              )} · ${timing}`}
        </small>

      </div>

      <span
        className={`risk-pill ${safeRiskClass}`}
      >
        {risk}
      </span>

    </div>
  )
}

function EmptyState({
  title,
  detail,
}: {
  title: string
  detail: string
}) {
  return (
    <div
      style={{
        padding:
          '24px 4px',
        color:
          '#64748b',
      }}
    >

      <strong
        style={{
          display:
            'block',
          color:
            '#334155',
          marginBottom:
            5,
          fontSize:
            12,
        }}
      >
        {title}
      </strong>

      <span
        style={{
          fontSize: 11,
          lineHeight: 1.5,
        }}
      >
        {detail}
      </span>

    </div>
  )
}

export type DashboardPageProps =
  Record<string, never>