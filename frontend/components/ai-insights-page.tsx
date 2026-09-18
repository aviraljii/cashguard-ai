'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'

import Link from 'next/link'

import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Bookmark,
  Check,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Cloud,
  CreditCard,
  Loader2,
  RefreshCw,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
  X,
} from 'lucide-react'

type Category =
  | 'Cash Flow'
  | 'Revenue'
  | 'Expenses'
  | 'Customers'
  | 'Vendors'
  | 'Risk'

type Priority =
  | 'Critical'
  | 'High'
  | 'Medium'
  | 'Low'
  | 'Positive'

type CategoryFilter = 'All' | Category

type TrendPoint = {
  month: string
  revenue: number
  expenses: number
  cash: number
}

type BackendInsight = {
  id: string
  title: string
  category: Category
  priority: Priority
  summary: string
  metric?: number | string | null
  metric_label?: string | null
  impact: string
  recommendation: string
  action?: string | null
  related_entity?: string | null
  related_route?: string | null
  confidence?: number | null
  created_at?: string | null
  reviewed?: boolean
  saved?: boolean
}

type Insight = {
  id: string
  title: string
  category: Category
  priority: Priority
  summary: string
  metric: string
  metricLabel: string
  impact: string
  recommendation: string
  action?: string
  relatedEntity: string
  relatedRoute: string
  confidence: number
  createdAt: string
  reviewed: boolean
  saved: boolean
}

type ExecutiveSummary = {
  headline: string
  bullets: string[]
  confidence: number
}

type KPIData = {
  financial_health?: number
  financial_health_label?: string
  cash_position?: number
  cash_position_change_percent?: number
  outstanding_receivables?: number
  outstanding_receivables_count?: number
  risk_signals?: number
  high_priority_risk_signals?: number
}

type RecommendedAction = {
  title: string
  description: string
  route: string
}

type FreshnessData = {
  updated_at?: string
  coverage_days?: number
}

type AIInsightResponse = {
  success: boolean
  generated_at?: string
  executive_summary?: ExecutiveSummary
  kpis?: KPIData
  trends?: TrendPoint[]
  insights?: BackendInsight[]
  recommended_actions?: RecommendedAction[]
  freshness?: FreshnessData
}

type ErrorResponse = {
  detail?: string
}

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  'http://127.0.0.1:8000'

const BUSINESS_ID =
  process.env.NEXT_PUBLIC_BUSINESS_ID || ''

const categories: readonly CategoryFilter[] = [
  'All',
  'Cash Flow',
  'Revenue',
  'Expenses',
  'Customers',
  'Vendors',
  'Risk',
]

const priorityTone: Record<Priority, string> = {
  Critical:
    'border-destructive/30 bg-destructive/5 text-destructive',
  High:
    'border-warning/30 bg-warning/5 text-warning',
  Medium:
    'border-info/30 bg-info/5 text-info',
  Low:
    'border-border bg-muted text-muted-foreground',
  Positive:
    'border-success/30 bg-success/5 text-success',
}

const iconFor: Record<
  Category,
  typeof Sparkles
> = {
  'Cash Flow': CircleDollarSign,
  Revenue: TrendingUp,
  Expenses: TrendingDown,
  Customers: Users,
  Vendors: CreditCard,
  Risk: ShieldAlert,
}

function formatINR(
  value: number | string | null | undefined,
): string {
  if (
    value === undefined ||
    value === null ||
    value === ''
  ) {
    return '₹0'
  }

  const numericValue =
    typeof value === 'string'
      ? Number(value)
      : value

  if (!Number.isFinite(numericValue)) {
    return '₹0'
  }

  return `₹${numericValue.toLocaleString(
    'en-IN',
    {
      maximumFractionDigits: 2,
    },
  )}`
}

function formatPercent(
  value: number | null | undefined,
): string {
  if (
    value === undefined ||
    value === null ||
    !Number.isFinite(value)
  ) {
    return '0%'
  }

  return `${value >= 0 ? '+' : ''}${value.toFixed(
    1,
  )}%`
}

function formatCreatedAt(
  value?: string | null,
): string {
  if (!value) {
    return 'Just now'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  const diffMs =
    Date.now() - date.getTime()

  const diffMinutes = Math.floor(
    diffMs / 60000,
  )

  if (diffMinutes <= 0) {
    return 'Just now'
  }

  if (diffMinutes === 1) {
    return '1 min ago'
  }

  if (diffMinutes < 60) {
    return `${diffMinutes} mins ago`
  }

  const diffHours = Math.floor(
    diffMinutes / 60,
  )

  if (diffHours === 1) {
    return '1 hour ago'
  }

  if (diffHours < 24) {
    return `${diffHours} hours ago`
  }

  return date.toLocaleDateString(
    'en-IN',
  )
}

function getStoredToken(): string {
  if (typeof window === 'undefined') {
    return ''
  }

  return (
    localStorage.getItem(
      'access_token',
    ) ||
    localStorage.getItem('token') ||
    sessionStorage.getItem(
      'access_token',
    ) ||
    sessionStorage.getItem('token') ||
    ''
  )
}

function normalizeTrendPoints(
  value: unknown,
): TrendPoint[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map(
      (
        item,
      ): TrendPoint | null => {
        if (
          !item ||
          typeof item !== 'object'
        ) {
          return null
        }

        const source =
          item as Record<
            string,
            unknown
          >

        const month =
          typeof source.month ===
          'string'
            ? source.month
            : typeof source.label ===
                'string'
              ? source.label
              : typeof source.period ===
                  'string'
                ? source.period
                : ''

        if (!month) {
          return null
        }

        const revenue =
          Number(
            source.revenue,
          ) || 0

        const expenses =
          Number(
            source.expenses,
          ) || 0

        const cash =
          Number(source.cash) || 0

        return {
          month,
          revenue,
          expenses,
          cash,
        }
      },
    )
    .filter(
      (
        item,
      ): item is TrendPoint =>
        item !== null,
    )
}

function mapBackendInsight(
  item: BackendInsight,
): Insight {
  const metric =
    typeof item.metric === 'number'
      ? formatINR(item.metric)
      : item.metric || '—'

  return {
    id: item.id,
    title: item.title,
    category: item.category,
    priority: item.priority,
    summary: item.summary,
    metric,
    metricLabel:
      item.metric_label ||
      'AI detected metric',
    impact: item.impact,
    recommendation:
      item.recommendation,
    action:
      item.action || undefined,
    relatedEntity:
      item.related_entity ||
      'Related financial record',
    relatedRoute:
      item.related_route ||
      '/dashboard',
    confidence:
      Number(item.confidence ?? 0),
    createdAt:
      formatCreatedAt(
        item.created_at,
      ),
    reviewed:
      Boolean(item.reviewed),
    saved:
      Boolean(item.saved),
  }
}

function getMaxTrendValue(
  trends: TrendPoint[],
): number {
  if (!trends.length) {
    return 1
  }

  const values = trends.flatMap(
    (item) => [
      Number(item.revenue) || 0,
      Number(item.expenses) || 0,
      Number(item.cash) || 0,
    ],
  )

  const max = Math.max(...values)

  return max > 0 ? max : 1
}

function KPI({
  label,
  value,
  detail,
  tone,
  icon: Icon,
}: {
  label: string
  value: string
  detail: string
  tone: string
  icon: typeof Sparkles
}) {
  return (
    <div className="foundation-card flex min-w-0 flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {label}
        </span>

        <span
          className={`rounded-lg p-2 ${tone}`}
        >
          <Icon size={16} />
        </span>
      </div>

      <strong className="money text-2xl tracking-tight">
        {value}
      </strong>

      <span className="text-xs text-muted-foreground">
        {detail}
      </span>
    </div>
  )
}

export default function AIInsightsPage() {
  const [insights, setInsights] =
    useState<Insight[]>([])

  const [category, setCategory] =
    useState<CategoryFilter>('All')

  const [savedOnly, setSavedOnly] =
    useState(false)

  const [selected, setSelected] =
    useState<Insight | null>(null)

  const [analyzing, setAnalyzing] =
    useState(false)

  const [loading, setLoading] =
    useState(true)

  const [lastUpdated, setLastUpdated] =
    useState('Loading...')

  const [toast, setToast] =
    useState('')

  const [search, setSearch] =
    useState('')

  const [error, setError] =
    useState('')

  const [summary, setSummary] =
    useState<ExecutiveSummary>({
      headline:
        'Analyzing your business financial activity...',
      bullets: [],
      confidence: 0,
    })

  const [kpis, setKpis] =
    useState<KPIData>({})

  const [trends, setTrends] =
    useState<TrendPoint[]>([])

  const [
    recommendedActions,
    setRecommendedActions,
  ] =
    useState<RecommendedAction[]>(
      [],
    )

  const [freshness, setFreshness] =
    useState<FreshnessData>({})

  const filtered = useMemo(() => {
    const normalizedSearch =
      search.trim().toLowerCase()

    return insights.filter((item) => {
      const matchesCategory =
        category === 'All' ||
        item.category === category

      const matchesSaved =
        !savedOnly || item.saved

      const searchableText = [
        item.title,
        item.summary,
        item.category,
        item.recommendation,
        item.relatedEntity,
      ]
        .join(' ')
        .toLowerCase()

      const matchesSearch =
        !normalizedSearch ||
        searchableText.includes(
          normalizedSearch,
        )

      return (
        matchesCategory &&
        matchesSaved &&
        matchesSearch
      )
    })
  }, [
    category,
    insights,
    savedOnly,
    search,
  ])

  const visibleTrends = useMemo(
    () => trends.slice(-6),
    [trends],
  )

  const trendMax = useMemo(
    () =>
      getMaxTrendValue(
        visibleTrends,
      ),
    [visibleTrends],
  )

  useEffect(() => {
    if (!toast) {
      return
    }

    const id =
      window.setTimeout(
        () => setToast(''),
        2600,
      )

    return () =>
      window.clearTimeout(id)
  }, [toast])

  const loadInsights = useCallback(
    async (
      analyze = false,
    ): Promise<void> => {
      if (analyze) {
        setAnalyzing(true)
      } else {
        setLoading(true)
      }

      setError('')

      try {
        const token =
          getStoredToken()

        if (!BUSINESS_ID) {
          throw new Error(
            'Business ID is not configured.',
          )
        }

        const query =
          new URLSearchParams()

        query.set(
          'business_id',
          BUSINESS_ID,
        )

        query.set(
          'limit',
          '50',
        )

        query.set(
          'analyze',
          analyze
            ? 'true'
            : 'false',
        )

        const url =
          `${API_BASE_URL}/api/ai/insights` +
          `?${query.toString()}`

        const response =
          await fetch(url, {
            method: 'GET',

            /*
             * Important:
             * This allows the backend's
             * HttpOnly cashguard_access_token
             * cookie to be sent with the request.
             */
            credentials: 'include',

            headers: {
              Accept:
                'application/json',

              /*
               * Preserve Bearer authentication
               * when an access token exists.
               */
              ...(token
                ? {
                    Authorization:
                      `Bearer ${token}`,
                  }
                : {}),
            },

            cache: 'no-store',
          })

        const responseBody:
          | AIInsightResponse
          | ErrorResponse
          | null =
          await response
            .json()
            .catch(
              () => null,
            )

        if (!response.ok) {
          const detail =
            responseBody &&
            'detail' in
              responseBody &&
            typeof responseBody.detail ===
              'string'
              ? responseBody.detail
              : `AI Insights API failed with ${response.status}`

          throw new Error(
            detail,
          )
        }

        if (
          !responseBody ||
          !(
            'success' in
            responseBody
          ) ||
          responseBody.success !==
            true
        ) {
          throw new Error(
            'AI Insights backend returned an invalid response.',
          )
        }

        const data =
          responseBody as AIInsightResponse

        const normalizedTrends =
          normalizeTrendPoints(
            data.trends,
          )

        setInsights(
          Array.isArray(
            data.insights,
          )
            ? data.insights.map(
                mapBackendInsight,
              )
            : [],
        )

        setSummary(
          data.executive_summary ||
            {
              headline:
                'No executive summary available yet.',
              bullets: [],
              confidence: 0,
            },
        )

        setKpis(
          data.kpis || {},
        )

        setTrends(
          normalizedTrends,
        )

        setRecommendedActions(
          Array.isArray(
            data.recommended_actions,
          )
            ? data.recommended_actions
            : [],
        )

        setFreshness(
          data.freshness || {},
        )

        setLastUpdated(
          formatCreatedAt(
            data.generated_at,
          ),
        )

        if (analyze) {
          setToast(
            'AI analysis refreshed successfully.',
          )
        }
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : 'Unable to load AI insights.'

        setError(message)

        if (!analyze) {
          setInsights([])
          setTrends([])
          setRecommendedActions(
            [],
          )
        }
      } finally {
        setLoading(false)
        setAnalyzing(false)
      }
    },
    [],
  )

  useEffect(() => {
    void loadInsights(false)
  }, [loadInsights])

  const updateInsight = (
    id: string,
    patch: Partial<Insight>,
    message: string,
  ) => {
    setInsights((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              ...patch,
            }
          : item,
      ),
    )

    setSelected((current) =>
      current?.id === id
        ? {
            ...current,
            ...patch,
          }
        : current,
    )

    setToast(message)
  }

  return (
    <main className="foundation-content dashboard-content space-y-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="auth-eyebrow flex items-center gap-2">
            <Sparkles size={13} />
            FINANCIAL INTELLIGENCE
          </p>

          <h2 className="text-balance">
            AI Insights
          </h2>

          <p>
            Understand your business finances with intelligent,
            actionable MSME insights.
          </p>

          <span className="mt-2 inline-flex items-center gap-2 text-xs text-success">
            <span className="h-2 w-2 animate-pulse rounded-full bg-success" />
            AI Analysis Updated:{' '}
            {lastUpdated}
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="secondary-button"
            onClick={() =>
              void loadInsights(true)
            }
            disabled={analyzing}
          >
            {analyzing ? (
              <>
                <Loader2
                  size={15}
                  className="animate-spin"
                />
                Analyzing...
              </>
            ) : (
              <>
                <RefreshCw size={15} />
                Refresh Analysis
              </>
            )}
          </button>

          <button
            type="button"
            className="secondary-button"
          >
            <Settings size={15} />
            Insight Preferences
          </button>
        </div>
      </div>

      {error && (
        <section className="foundation-card border-destructive/30 bg-destructive/5 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle
              size={18}
              className="mt-0.5 shrink-0 text-destructive"
            />

            <div>
              <h4 className="font-semibold text-destructive">
                AI Insights unavailable
              </h4>

              <p className="mt-1 text-sm text-muted-foreground">
                {error}
              </p>
            </div>
          </div>
        </section>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KPI
          label="Financial Health"
          value={
            kpis.financial_health !==
            undefined
              ? `${Math.round(
                  kpis.financial_health,
                )} / 100`
              : '—'
          }
          detail={
            kpis.financial_health_label ||
            'AI assessment'
          }
          tone="bg-success/10 text-success"
          icon={ShieldCheck}
        />

        <KPI
          label="Cash Position"
          value={formatINR(
            kpis.cash_position,
          )}
          detail={
            kpis.cash_position_change_percent !==
            undefined
              ? `${formatPercent(
                  kpis.cash_position_change_percent,
                )} vs previous period`
              : 'Live business cash position'
          }
          tone="bg-info/10 text-info"
          icon={CircleDollarSign}
        />

        <KPI
          label="Outstanding Receivables"
          value={formatINR(
            kpis.outstanding_receivables,
          )}
          detail={`${kpis.outstanding_receivables_count ?? 0} invoices require monitoring`}
          tone="bg-warning/10 text-warning"
          icon={Users}
        />

        <KPI
          label="Risk Signals"
          value={String(
            kpis.risk_signals ?? 0,
          )}
          detail={`${kpis.high_priority_risk_signals ?? 0} high priority`}
          tone="bg-destructive/10 text-destructive"
          icon={AlertTriangle}
        />
      </div>

      <section className="foundation-card overflow-hidden border-info/20 bg-info/[0.035] p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex gap-3">
            <div className="rounded-xl bg-info/10 p-3 text-info">
              <Sparkles size={22} />
            </div>

            <div>
              <div className="mb-1 flex items-center gap-2">
                <h3>
                  AI Executive Summary
                </h3>

                <span className="badge blue">
                  Live AI Analysis
                </span>
              </div>

              <p className="text-lg font-semibold text-foreground">
                {summary.headline}
              </p>

              <div className="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                {summary.bullets.length > 0 ? (
                  summary.bullets.map(
                    (
                      bullet,
                      index,
                    ) => (
                      <span
                        key={`${index}-${bullet}`}
                      >
                        • {bullet}
                      </span>
                    ),
                  )
                ) : (
                  <span>
                    AI-generated explanation will appear here after analysis.
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="shrink-0 rounded-xl border border-border bg-background/70 p-3 text-center">
            <span className="block text-xs text-muted-foreground">
              Analysis confidence
            </span>

            <strong className="text-xl text-info">
              {Math.round(
                summary.confidence || 0,
              )}
              %
            </strong>
          </div>
        </div>
      </section>

      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex max-w-full gap-1 overflow-x-auto pb-1">
          {categories.map(
            (item) => (
              <button
                key={item}
                type="button"
                onClick={() =>
                  setCategory(item)
                }
                className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  category === item
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                {item}
              </button>
            ),
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />

            <input
              aria-label="Search insights"
              value={search}
              onChange={(event) =>
                setSearch(
                  event.target.value,
                )
              }
              placeholder="Search insights"
              className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring sm:w-56"
            />
          </div>

          <button
            type="button"
            onClick={() =>
              setSavedOnly(
                (value) => !value,
              )
            }
            className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm ${
              savedOnly
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-muted-foreground'
            }`}
          >
            <Bookmark size={14} />
            Saved
          </button>
        </div>
      </div>

      {analyzing && (
        <div className="flex items-center gap-3 rounded-lg border border-info/20 bg-info/5 px-4 py-3 text-sm text-info">
          <Activity
            size={16}
            className="animate-pulse"
          />
          ML + GenAI are analyzing your latest MSME financial activity...
        </div>
      )}

      <section>
        <div className="mb-3 flex items-end justify-between">
          <div>
            <h3>
              Actionable insights
            </h3>

            <p className="text-sm text-muted-foreground">
              AI-generated patterns from real business financial data.
            </p>
          </div>

          <span className="text-sm text-muted-foreground">
            {loading
              ? 'Loading...'
              : `${filtered.length} insights`}
          </span>
        </div>

        {loading ? (
          <div className="foundation-card flex items-center justify-center gap-3 p-10 text-sm text-muted-foreground">
            <Loader2
              size={18}
              className="animate-spin"
            />
            Loading live AI insights...
          </div>
        ) : filtered.length > 0 ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {filtered.map(
              (item) => {
                const Icon =
                  iconFor[
                    item.category
                  ]

                return (
                  <article
                    key={item.id}
                    className="foundation-card group flex cursor-pointer flex-col gap-4 p-4 transition-shadow hover:shadow-lg"
                    onClick={() =>
                      setSelected(item)
                    }
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="rounded-lg bg-muted p-2 text-primary">
                          <Icon size={17} />
                        </span>

                        <span className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                          {item.category}
                        </span>
                      </div>

                      <span
                        className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${priorityTone[item.priority]}`}
                      >
                        {item.priority}
                      </span>
                    </div>

                    <div>
                      <h4 className="text-base font-semibold text-foreground">
                        {item.title}
                      </h4>

                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        {item.summary}
                      </p>
                    </div>

                    <div className="flex items-end justify-between gap-3 border-y border-border/70 py-3">
                      <div>
                        <strong className="money text-xl">
                          {item.metric}
                        </strong>

                        <span className="ml-2 text-xs text-muted-foreground">
                          {item.metricLabel}
                        </span>
                      </div>

                      <span className="text-xs text-muted-foreground">
                        {item.createdAt}
                      </span>
                    </div>

                    <div className="rounded-lg bg-muted/50 p-3 text-sm">
                      <span className="font-semibold text-foreground">
                        Recommendation
                      </span>

                      <p className="mt-1 text-muted-foreground">
                        {item.recommendation}
                      </p>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        className="text-sm font-semibold text-primary hover:underline"
                        onClick={(event) => {
                          event.stopPropagation()

                          updateInsight(
                            item.id,
                            {
                              saved:
                                !item.saved,
                            },
                            item.saved
                              ? 'Insight removed from saved'
                              : 'Insight saved',
                          )
                        }}
                      >
                        <Bookmark
                          size={14}
                          className="mr-1 inline"
                          fill={
                            item.saved
                              ? 'currentColor'
                              : 'none'
                          }
                        />

                        {item.saved
                          ? 'Saved'
                          : 'Save insight'}
                      </button>

                      {item.action ? (
                        <Link
                          href={
                            item.relatedRoute
                          }
                          onClick={(event) =>
                            event.stopPropagation()
                          }
                          className="inline-flex items-center gap-1 text-sm font-semibold text-primary"
                        >
                          {item.action}
                          <ArrowRight
                            size={14}
                          />
                        </Link>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          View details
                          <ChevronRight
                            size={14}
                          />
                        </span>
                      )}
                    </div>
                  </article>
                )
              },
            )}
          </div>
        ) : (
          <div className="foundation-card flex flex-col items-center gap-2 p-10 text-center">
            <Search
              size={22}
              className="text-muted-foreground"
            />

            <h4>
              {error
                ? 'Unable to load AI insights'
                : savedOnly
                  ? "You haven't saved any insights yet"
                  : category !== 'All'
                    ? 'No insights match your selected category.'
                    : 'No insights available'}
            </h4>

            <p className="text-sm text-muted-foreground">
              {error
                ? 'Check the AI backend and refresh the analysis.'
                : 'The AI engine will populate insights as business activity is analyzed.'}
            </p>
          </div>
        )}
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <section className="foundation-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3>
                Financial trends
              </h3>

              <p className="text-sm text-muted-foreground">
                Live business data · INR
              </p>
            </div>

            <BarChart3
              size={18}
              className="text-muted-foreground"
            />
          </div>

          {visibleTrends.length > 0 ? (
            <>
              <div
                className="grid min-h-[280px] items-end gap-3 border-b border-l border-border px-3 pb-3 pt-8"
                style={{
                  gridTemplateColumns: `repeat(${visibleTrends.length}, minmax(0, 1fr))`,
                }}
              >
                {visibleTrends.map(
                  (point) => {
                    const revenue =
                      Number(
                        point.revenue,
                      ) || 0

                    const expenses =
                      Number(
                        point.expenses,
                      ) || 0

                    const cash =
                      Number(
                        point.cash,
                      ) || 0

                    const revenueHeight =
                      revenue > 0
                        ? Math.min(
                            100,
                            Math.max(
                              6,
                              (revenue /
                                trendMax) *
                                100,
                            ),
                          )
                        : 4

                    const expensesHeight =
                      expenses > 0
                        ? Math.min(
                            100,
                            Math.max(
                              6,
                              (expenses /
                                trendMax) *
                                100,
                            ),
                          )
                        : 4

                    const cashHeight =
                      cash > 0
                        ? Math.min(
                            100,
                            Math.max(
                              6,
                              (cash /
                                trendMax) *
                                100,
                            ),
                          )
                        : 4

                    return (
                      <div
                        key={point.month}
                        className="flex min-w-0 h-full flex-col items-center justify-end gap-2"
                      >
                        <div
                          className="flex h-full w-full items-end justify-center gap-1"
                          title={`${point.month} · Revenue ${formatINR(
                            revenue,
                          )} · Expenses ${formatINR(
                            expenses,
                          )} · Cash ${formatINR(
                            cash,
                          )}`}
                        >
                          <i
                            aria-label={`${point.month} revenue ${formatINR(
                              revenue,
                            )}`}
                            className="w-3 max-w-[24%] rounded-t bg-chart-1 transition-all duration-500"
                            style={{
                              height: `${revenueHeight}%`,
                            }}
                          />

                          <i
                            aria-label={`${point.month} expenses ${formatINR(
                              expenses,
                            )}`}
                            className="w-3 max-w-[24%] rounded-t bg-chart-2 transition-all duration-500"
                            style={{
                              height: `${expensesHeight}%`,
                            }}
                          />

                          <i
                            aria-label={`${point.month} cash position ${formatINR(
                              cash,
                            )}`}
                            className="w-3 max-w-[24%] rounded-t bg-chart-3 transition-all duration-500"
                            style={{
                              height: `${cashHeight}%`,
                            }}
                          />
                        </div>

                        <div className="w-full text-center">
                          <span className="block truncate text-[11px] font-medium text-muted-foreground">
                            {point.month}
                          </span>
                        </div>
                      </div>
                    )
                  },
                )}
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                {visibleTrends
                  .slice(-3)
                  .map(
                    (point) => (
                      <div
                        key={`trend-${point.month}`}
                        className="rounded-lg border border-border bg-muted/30 p-3"
                      >
                        <span className="block text-xs font-semibold text-foreground">
                          {point.month}
                        </span>

                        <div className="mt-2 grid grid-cols-3 gap-2">
                          <div>
                            <span className="block text-[10px] text-muted-foreground">
                              Revenue
                            </span>

                            <strong className="money text-xs">
                              {formatINR(
                                point.revenue,
                              )}
                            </strong>
                          </div>

                          <div>
                            <span className="block text-[10px] text-muted-foreground">
                              Expenses
                            </span>

                            <strong className="money text-xs">
                              {formatINR(
                                point.expenses,
                              )}
                            </strong>
                          </div>

                          <div>
                            <span className="block text-[10px] text-muted-foreground">
                              Cash
                            </span>

                            <strong className="money text-xs">
                              {formatINR(
                                point.cash,
                              )}
                            </strong>
                          </div>
                        </div>
                      </div>
                    ),
                  )}
              </div>

              <div className="mt-4 flex flex-wrap gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-2">
                  <i className="h-2.5 w-2.5 rounded-full bg-chart-1" />
                  Revenue
                </span>

                <span className="flex items-center gap-2">
                  <i className="h-2.5 w-2.5 rounded-full bg-chart-2" />
                  Expenses
                </span>

                <span className="flex items-center gap-2">
                  <i className="h-2.5 w-2.5 rounded-full bg-chart-3" />
                  Cash position
                </span>
              </div>
            </>
          ) : (
            <div className="flex h-[280px] flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
              <BarChart3
                size={28}
                className="text-muted-foreground"
              />

              <span>
                Financial trend data is not available yet.
              </span>

              <span className="max-w-md text-xs leading-5">
                The chart will populate from live business
                financial activity after the AI Insights API
                returns trend data.
              </span>
            </div>
          )}
        </section>

        <section className="foundation-card p-5">
          <div className="mb-4">
            <h3>
              Recommended actions
            </h3>

            <p className="text-sm text-muted-foreground">
              Highest-impact actions identified by the AI engine.
            </p>
          </div>

          <div className="space-y-3">
            {recommendedActions.length >
            0 ? (
              recommendedActions.map(
                (action) => (
                  <Link
                    key={`${action.title}-${action.route}`}
                    href={action.route}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-muted"
                  >
                    <span>
                      <strong className="block text-sm">
                        {action.title}
                      </strong>

                      <small className="text-muted-foreground">
                        {
                          action.description
                        }
                      </small>
                    </span>

                    <ArrowRight
                      size={16}
                      className="text-primary"
                    />
                  </Link>
                ),
              )
            ) : (
              <div className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
                No high-priority action has been generated yet.
              </div>
            )}
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2 border-t border-border pt-4 text-center">
            <div>
              <Clock3
                size={15}
                className="mx-auto mb-1 text-muted-foreground"
              />

              <span className="block text-[11px] text-muted-foreground">
                Freshness
              </span>

              <strong className="text-sm">
                {freshness.updated_at
                  ? formatCreatedAt(
                      freshness.updated_at,
                    )
                  : 'Live'}
              </strong>
            </div>

            <div>
              <Cloud
                size={15}
                className="mx-auto mb-1 text-muted-foreground"
              />

              <span className="block text-[11px] text-muted-foreground">
                Coverage
              </span>

              <strong className="text-sm">
                {freshness.coverage_days
                  ? `${freshness.coverage_days} days`
                  : 'Live DB'}
              </strong>
            </div>

            <div>
              <Target
                size={15}
                className="mx-auto mb-1 text-muted-foreground"
              />

              <span className="block text-[11px] text-muted-foreground">
                Confidence
              </span>

              <strong className="text-sm">
                {Math.round(
                  summary.confidence || 0,
                )}
                %
              </strong>
            </div>
          </div>
        </section>
      </div>

      {selected && (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            aria-label="Close insight details"
            className="absolute inset-0 bg-black/40"
            onClick={() =>
              setSelected(null)
            }
          />

          <aside className="absolute right-0 top-0 flex h-full w-full max-w-lg flex-col overflow-y-auto border-l border-border bg-background p-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div>
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">
                  Insight detail
                </span>

                <h3 className="mt-1">
                  {selected.title}
                </h3>
              </div>

              <button
                type="button"
                className="rounded-lg p-2 hover:bg-muted"
                onClick={() =>
                  setSelected(null)
                }
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-5 py-5">
              <div className="flex items-center justify-between">
                <span
                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${priorityTone[selected.priority]}`}
                >
                  {selected.priority}{' '}
                  priority
                </span>

                <span className="text-sm text-muted-foreground">
                  {selected.category}
                </span>
              </div>

              <p className="text-sm leading-6 text-muted-foreground">
                {selected.summary}
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-muted/60 p-3">
                  <span className="text-xs text-muted-foreground">
                    Supporting metric
                  </span>

                  <strong className="money mt-1 block text-xl">
                    {selected.metric}
                  </strong>

                  <small className="text-muted-foreground">
                    {
                      selected.metricLabel
                    }
                  </small>
                </div>

                <div className="rounded-lg bg-muted/60 p-3">
                  <span className="text-xs text-muted-foreground">
                    Confidence
                  </span>

                  <strong className="mt-1 block text-xl text-info">
                    {selected.confidence}%
                  </strong>

                  <small className="text-muted-foreground">
                    ML + GenAI
                  </small>
                </div>
              </div>

              <div>
                <h4 className="mb-2 text-sm font-semibold">
                  Why this matters
                </h4>

                <p className="text-sm leading-6 text-muted-foreground">
                  {selected.impact}
                </p>
              </div>

              <div>
                <h4 className="mb-2 text-sm font-semibold">
                  Recommended next action
                </h4>

                <div className="rounded-lg border border-info/20 bg-info/5 p-3 text-sm text-muted-foreground">
                  {selected.recommendation}
                </div>
              </div>

              <div>
                <h4 className="mb-2 text-sm font-semibold">
                  Related record
                </h4>

                <Link
                  href={
                    selected.relatedRoute
                  }
                  className="flex items-center justify-between rounded-lg border border-border p-3 text-sm font-medium hover:bg-muted"
                >
                  {
                    selected.relatedEntity
                  }

                  <ArrowUpRight
                    size={15}
                    className="text-primary"
                  />
                </Link>
              </div>

              <div className="flex items-center justify-between border-t border-border pt-4 text-xs text-muted-foreground">
                <span>
                  Generated{' '}
                  {selected.createdAt}
                </span>

                <span>
                  AI analysis ·{' '}
                  {selected.confidence}%
                  {' '}
                  confidence
                </span>
              </div>
            </div>

            <div className="mt-auto flex gap-2 border-t border-border pt-4">
              <button
                type="button"
                className="secondary-button flex-1"
                onClick={() =>
                  updateInsight(
                    selected.id,
                    {
                      reviewed: true,
                    },
                    'Insight marked as reviewed',
                  )
                }
              >
                <Check size={15} />
                Mark reviewed
              </button>

              <button
                type="button"
                className="auth-button compact flex-1"
                onClick={() =>
                  updateInsight(
                    selected.id,
                    {
                      saved:
                        !selected.saved,
                    },
                    selected.saved
                      ? 'Insight removed from saved'
                      : 'Insight saved',
                  )
                }
              >
                <Bookmark
                  size={15}
                  fill={
                    selected.saved
                      ? 'currentColor'
                      : 'none'
                  }
                />

                {selected.saved
                  ? 'Saved'
                  : 'Save insight'}
              </button>
            </div>
          </aside>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-5 right-5 z-[60] flex items-center gap-2 rounded-lg bg-foreground px-4 py-3 text-sm text-background shadow-xl">
          <Check
            size={16}
            className="text-success"
          />

          {toast}
        </div>
      )}
    </main>
  )
}