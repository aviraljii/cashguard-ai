'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ChangeEvent } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  BarChart3,
  Check,
  Download,
  Filter,
  Info,
  RefreshCw,
  Sparkles,
  Wallet,
  X,
} from 'lucide-react'
import {
  buildAnalyticsQuery,
  type AnalyticsCompare,
  type AnalyticsFilters,
  type AnalyticsMethod,
  type AnalyticsMetric,
  type AnalyticsRange,
  type AnalyticsRisk,
  type AnalyticsScope,
} from './analytics-query'

type AnalyticsLoadState = 'loading' | 'ready' | 'error'
type Tone = 'info' | 'warning' | 'neutral' | 'success'
type Severity = 'low' | 'medium' | 'high' | 'unknown'

type MetricValue = {
  value: number | null
  detail?: string | null
  change_percent?: number | null
}

type CashPoint = {
  label: string
  inflow: number | null
  outflow: number | null
  net: number | null
}

type RevenueExpensePoint = {
  label: string
  revenue: number | null
  expenses: number | null
}

type AgingBucket = {
  label: string
  amount: number | null
}

type PaymentMethodPoint = {
  method: string
  count: number | null
  amount: number | null
}

type Insight = {
  id: string
  title: string
  text: string
  severity: Severity
  source?: string | null
}

type FinancialSignal = {
  id: string
  title: string
  value: string
  detail: string
  severity: Severity
}

type AnalyticsOverview = {
  generated_at?: string | null
  currency?: string | null
  kpis?: {
    revenue?: MetricValue
    expenses?: MetricValue
    net_cash_flow?: MetricValue
    gross_margin?: MetricValue
    receivables?: MetricValue
    payables?: MetricValue
  }
  cash_flow?: CashPoint[]
  revenue_vs_expenses?: RevenueExpensePoint[]
  receivables?: {
    outstanding?: number | null
    overdue?: number | null
    due_7d?: number | null
    due_30d?: number | null
    collection_rate?: number | null
    aging?: AgingBucket[]
  }
  payables?: {
    outstanding?: number | null
    overdue?: number | null
    due_7d?: number | null
    due_30d?: number | null
    aging?: AgingBucket[]
  }
  payment_methods?: PaymentMethodPoint[]
  risk_exposure?: {
    low?: number | null
    medium?: number | null
    high?: number | null
    unknown?: number | null
  }
  insights?: Insight[]
  financial_signals?: FinancialSignal[]
  ml?: {
    cash_flow_forecast?: Array<{ label: string; value: number | null }>
    payment_delay_risk?: number | null
    anomaly_count?: number | null
  }
  data_quality?: {
    status?: 'ready' | 'partial' | 'unavailable'
    warning?: string | null
    record_count?: number | null
    last_updated?: string | null
  }
}

type AiInsight = {
  executive_summary?: string | null
  title?: string | null
  risks?: string[]
  opportunities?: string[]
  actions?: string[]
  model?: string | null
  generated_at?: string | null
}

type ApiEnvelope<T> = T | { data?: T; result?: T; success?: boolean; message?: string; detail?: string }

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000'
).replace(/\/+$/, '')

function getBusinessId(): string | null {
  if (typeof window === 'undefined') {
    return process.env.NEXT_PUBLIC_BUSINESS_ID?.trim() || null
  }

  for (const storage of [window.localStorage, window.sessionStorage]) {
    for (const key of ['business_id', 'businessId', 'cashguard_business_id']) {
      const value = storage.getItem(key)?.trim()
      if (value) return value
    }
  }

  return process.env.NEXT_PUBLIC_BUSINESS_ID?.trim() || null
}

function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null

  for (const storage of [window.localStorage, window.sessionStorage]) {
    for (const key of [
      'cashguard_access_token',
      'access_token',
      'accessToken',
      'token',
      'auth_token',
      'jwt_token',
      'jwt',
      'cashguard_token',
    ]) {
      const value = storage.getItem(key)?.trim().replace(/^Bearer\s+/i, '')
      if (value) return value
    }
  }

  return null
}

class AnalyticsApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'AnalyticsApiError'
    this.status = status
  }
}

async function analyticsApiFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getAuthToken()
  if (!token) {
    throw new AnalyticsApiError('Authentication required. Please sign in again.', 401)
  }

  const headers = new Headers(options.headers || {})
  headers.set('Accept', 'application/json')
  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  headers.set('Authorization', `Bearer ${token}`)

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
    credentials: 'include',
    cache: 'no-store',
  })

  if (!response.ok) {
    let message = `Analytics API request failed (${response.status})`
    try {
      const body = await response.json()
      if (typeof body?.detail === 'string') message = body.detail
      else if (typeof body?.message === 'string') message = body.message
    } catch {
      // Keep HTTP fallback message.
    }
    throw new AnalyticsApiError(message, response.status)
  }

  if (response.status === 204) return undefined as T

  const contentType = response.headers.get('content-type') || ''
  if (!contentType.toLowerCase().includes('application/json')) {
    if (contentType.toLowerCase().includes('application/pdf') || contentType.toLowerCase().includes('application/octet-stream')) {
      return (await response.blob()) as T
    }
    return (await response.text()) as T
  }

  return response.json() as Promise<T>
}

function unwrapEnvelope<T>(payload: ApiEnvelope<T>): T {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const candidate = payload as { data?: T; result?: T }
    if (candidate.data !== undefined) return candidate.data
    if (candidate.result !== undefined) return candidate.result
  }
  return payload as T
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function normalizeMetric(value: unknown): MetricValue {
  if (value && typeof value === 'object') {
    const item = value as Record<string, unknown>
    return {
      value: toNumber(item.value),
      detail: typeof item.detail === 'string' ? item.detail : null,
      change_percent: toNumber(item.change_percent),
    }
  }
  return { value: toNumber(value) }
}

function normalizeOverview(payload: unknown): AnalyticsOverview {
  const source = unwrapEnvelope(payload as ApiEnvelope<Record<string, unknown>>) as Record<string, unknown>
  const kpis = (source.kpis || {}) as Record<string, unknown>
  const rawCash = Array.isArray(source.cash_flow) ? source.cash_flow : []
  const rawRevenueExpense = Array.isArray(source.revenue_vs_expenses) ? source.revenue_vs_expenses : []
  const rawInsights = Array.isArray(source.insights) ? source.insights : []
  const rawSignals = Array.isArray(source.financial_signals) ? source.financial_signals : []

  return {
    generated_at: typeof source.generated_at === 'string' ? source.generated_at : null,
    currency: typeof source.currency === 'string' ? source.currency : 'INR',
    kpis: {
      revenue: normalizeMetric(kpis.revenue),
      expenses: normalizeMetric(kpis.expenses),
      net_cash_flow: normalizeMetric(kpis.net_cash_flow),
      gross_margin: normalizeMetric(kpis.gross_margin),
      receivables: normalizeMetric(kpis.receivables),
      payables: normalizeMetric(kpis.payables),
    },
    cash_flow: rawCash.map((item) => {
      const row = item as Record<string, unknown>
      return {
        label: String(row.label ?? row.date ?? ''),
        inflow: toNumber(row.inflow),
        outflow: toNumber(row.outflow),
        net: toNumber(row.net),
      }
    }),
    revenue_vs_expenses: rawRevenueExpense.map((item) => {
      const row = item as Record<string, unknown>
      return {
        label: String(row.label ?? row.date ?? ''),
        revenue: toNumber(row.revenue),
        expenses: toNumber(row.expenses),
      }
    }),
    receivables: (source.receivables || {}) as AnalyticsOverview['receivables'],
    payables: (source.payables || {}) as AnalyticsOverview['payables'],
    payment_methods: Array.isArray(source.payment_methods) ? source.payment_methods.map((item) => {
      const row = item as Record<string, unknown>
      return { method: String(row.method ?? 'Unknown'), count: toNumber(row.count), amount: toNumber(row.amount) }
    }) : [],
    risk_exposure: (source.risk_exposure || {}) as AnalyticsOverview['risk_exposure'],
    insights: rawInsights.map((item, index) => {
      const row = item as Record<string, unknown>
      return {
        id: String(row.id ?? `insight-${index}`),
        title: String(row.title ?? 'Business signal'),
        text: String(row.text ?? row.description ?? ''),
        severity: normalizeSeverity(row.severity),
        source: typeof row.source === 'string' ? row.source : null,
      }
    }),
    financial_signals: rawSignals.map((item, index) => {
      const row = item as Record<string, unknown>
      return {
        id: String(row.id ?? `signal-${index}`),
        title: String(row.title ?? 'Financial signal'),
        value: String(row.value ?? '—'),
        detail: String(row.detail ?? row.description ?? ''),
        severity: normalizeSeverity(row.severity),
      }
    }),
    ml: (source.ml || {}) as AnalyticsOverview['ml'],
    data_quality: (source.data_quality || {}) as AnalyticsOverview['data_quality'],
  }
}

function normalizeSeverity(value: unknown): Severity {
  return value === 'low' || value === 'medium' || value === 'high' ? value : 'unknown'
}

function formatMoney(value: number | null, currency = 'INR'): string {
  if (value === null) return '—'
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value)
}

function formatPercent(value: number | null): string {
  if (value === null) return '—'
  return `${value.toFixed(1)}%`
}

function metricDetail(metric: MetricValue | undefined, fallback: string): string {
  if (!metric) return fallback
  if (metric.detail) return metric.detail
  if (metric.change_percent !== null && metric.change_percent !== undefined) {
    const sign = metric.change_percent > 0 ? '+' : ''
    return `${sign}${metric.change_percent.toFixed(1)}% vs comparison period`
  }
  return fallback
}

function severityClass(severity: Severity): string {
  return `analytics-severity ${severity}`
}

function StatePanel({
  title,
  state,
  onRetry,
}: {
  title: string
  state: AnalyticsLoadState
  onRetry?: () => void
}) {
  const copy = state === 'loading'
    ? 'Loading connected financial data…'
    : state === 'error'
      ? 'We could not load this dataset.'
      : 'No connected data for this section'

  return (
    <div className={`analytics-state ${state === 'error' ? 'error' : ''}`}>
      <div className="analytics-state-icon">
        {state === 'loading' ? <RefreshCw size={18} className="animate-spin" /> : state === 'error' ? <AlertTriangle size={18} /> : <BarChart3 size={18} />}
      </div>
      <strong>{copy}</strong>
      <p>{state === 'error' ? 'Check the connection and try again.' : `${title} will appear when the analytics API returns validated data.`}</p>
      {state === 'error' && onRetry && <button className="secondary-button" onClick={onRetry}>Retry</button>}
    </div>
  )
}

function UnavailablePanel({ title, description, action }: { title: string; description: string; action?: { label: string; href: string } }) {
  return (
    <div className="analytics-unavailable">
      <Info size={18} />
      <div>
        <strong>{title}</strong>
        <p>{description}</p>
        {action && <Link href={action.href}>{action.label}</Link>}
      </div>
    </div>
  )
}

function CashFlowChart({ points, currency }: { points: CashPoint[]; currency: string }) {
  const plotted = points.filter((point) => point.inflow !== null || point.outflow !== null)
  if (!plotted.length) return <UnavailablePanel title="No cash-flow points returned" description="The backend did not return any usable inflow or outflow points for this period." />

  const maxValue = Math.max(1, ...plotted.flatMap((point) => [Math.abs(point.inflow ?? 0), Math.abs(point.outflow ?? 0)]))
  const width = 720
  const height = 220
  const innerWidth = width - 70
  const innerHeight = height - 40
  const step = plotted.length > 1 ? innerWidth / (plotted.length - 1) : innerWidth
  const makePath = (key: 'inflow' | 'outflow') => plotted.map((point, index) => {
    const x = 40 + index * step
    const value = Math.abs(point[key] ?? 0)
    const y = 20 + innerHeight - (value / maxValue) * innerHeight
    return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
  }).join(' ')

  return (
    <div className="analytics-chart" aria-label="Cash flow performance chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img">
        <path d={makePath('inflow')} fill="none" stroke="currentColor" strokeWidth="3" className="text-primary" />
        <path d={makePath('outflow')} fill="none" stroke="currentColor" strokeWidth="3" className="text-amber-500" />
      </svg>
      <div className="chart-legend">
        <span><i className="legend-blue" />Inflow</span>
        <span><i className="legend-amber" />Outflow</span>
      </div>
      <div className="chart-support">
        <div><small>Latest inflow</small><strong>{formatMoney(plotted.at(-1)?.inflow ?? null, currency)}</strong></div>
        <div><small>Latest outflow</small><strong>{formatMoney(plotted.at(-1)?.outflow ?? null, currency)}</strong></div>
        <div><small>Latest net</small><strong>{formatMoney(plotted.at(-1)?.net ?? null, currency)}</strong></div>
      </div>
    </div>
  )
}

function RevenueExpenseChart({ points, currency }: { points: RevenueExpensePoint[]; currency: string }) {
  if (!points.length) return <UnavailablePanel title="No revenue/expense points returned" description="The backend did not return comparable revenue and expense points for this period." />

  const maxValue = Math.max(1, ...points.flatMap((point) => [Math.abs(point.revenue ?? 0), Math.abs(point.expenses ?? 0)]))

  return (
    <div className="analytics-table">
      <div className="analytics-chart-wrap">
        {points.map((point) => (
          <div className="analytics-chart-column" key={point.label} title={point.label}>
            <div className="analytics-bar revenue" style={{ height: `${((point.revenue ?? 0) / maxValue) * 100}%` }} />
            <div className="analytics-bar expense" style={{ height: `${((point.expenses ?? 0) / maxValue) * 100}%` }} />
            <span>{point.label}</span>
          </div>
        ))}
      </div>
      <div className="chart-legend">
        <span><i className="legend-blue" />Revenue</span>
        <span><i className="legend-amber" />Expenses</span>
      </div>
      <div className="chart-support">
        <div><small>Latest revenue</small><strong>{formatMoney(points.at(-1)?.revenue ?? null, currency)}</strong></div>
        <div><small>Latest expenses</small><strong>{formatMoney(points.at(-1)?.expenses ?? null, currency)}</strong></div>
      </div>
    </div>
  )
}

function InsightCard({ insight }: { insight: Insight; key?: string }) {
  return (
    <article className="analytics-insight">
      <div><span className={severityClass(insight.severity)}>{insight.severity}</span><Sparkles size={15} className="text-primary" /></div>
      <h4>{insight.title}</h4>
      <p>{insight.text || 'The backend returned no additional explanation for this signal.'}</p>
      <span className="text-muted-foreground">{insight.source || 'CashGuard analytics engine'}</span>
    </article>
  )
}

export default function DataAnalyticsPage() {
  const [range, setRange] = useState<AnalyticsRange>('30d')
  const [compare, setCompare] = useState<AnalyticsCompare>('previous_period')
  const [metric, setMetric] = useState<AnalyticsMetric>('all')
  const [risk, setRisk] = useState<AnalyticsRisk>('all')
  const [scope, setScope] = useState<AnalyticsScope>('all')
  const [method, setMethod] = useState<AnalyticsMethod>('all')
  const [state, setState] = useState<AnalyticsLoadState>('loading')
  const [data, setData] = useState<AnalyticsOverview | null>(null)
  const [error, setError] = useState('')
  const [aiState, setAiState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [aiInsight, setAiInsight] = useState<AiInsight | null>(null)
  const [aiIntent, setAiIntent] = useState('')
  const [exportOpen, setExportOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [toast, setToast] = useState('')

  const filters = useMemo<AnalyticsFilters>(() => ({
    businessId: getBusinessId() || '',
    range,
    compare,
    metric,
    risk,
    scope,
    method,
  }), [range, compare, metric, risk, scope, method])

  const showToast = useCallback((message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 2600)
  }, [])

  const loadOverview = useCallback(async (showRefreshState = false) => {
    const businessId = getBusinessId()
    if (!businessId) {
      setError('Business ID is missing. Configure NEXT_PUBLIC_BUSINESS_ID in frontend/.env.local.')
      setState('error')
      return
    }

    if (showRefreshState) setRefreshing(true)
    else setState('loading')

    try {
      setError('')
      const query = buildAnalyticsQuery({ ...filters, businessId })
      const response = await analyticsApiFetch<ApiEnvelope<AnalyticsOverview>>(`/api/analytics/overview?${query}`)
      setData(normalizeOverview(response))
      setState('ready')
    } catch (err) {
      const apiError = err as Partial<AnalyticsApiError>
      if (apiError.status === 401) {
        setError('Authentication failed. Please login again.')
      } else if (apiError.status === 403) {
        setError('You are not authorized to access this business analytics data.')
      } else {
        setError(err instanceof Error ? err.message : 'Unable to load analytics data.')
      }
      setState('error')
    } finally {
      setRefreshing(false)
    }
  }, [filters])

  useEffect(() => {
    void loadOverview()

    const handleAuthChanged = () => {
      void loadOverview(true)
    }

    window.addEventListener('auth-changed', handleAuthChanged)
    return () => window.removeEventListener('auth-changed', handleAuthChanged)
  }, [loadOverview])

  const reset = () => {
    setRange('30d')
    setCompare('previous_period')
    setMetric('all')
    setRisk('all')
    setScope('all')
    setMethod('all')
    showToast('Filters reset')
  }

  const analyze = async (intent: string) => {
    const businessId = getBusinessId()
    if (!businessId) {
      showToast('Business ID is missing')
      return
    }

    setAiState('loading')
    setAiIntent(intent)

    try {
      const query = buildAnalyticsQuery({ ...filters, businessId })
      const response = await analyticsApiFetch<ApiEnvelope<AiInsight>>(`/api/analytics/ai/insight?${query}&intent=${encodeURIComponent(intent)}`)
      setAiInsight(unwrapEnvelope(response))
      setAiState('ready')
    } catch (err) {
      setAiState('error')
      showToast(err instanceof Error ? err.message : 'AI analysis failed')
    }
  }

  const exportReport = async () => {
    const businessId = getBusinessId()
    if (!businessId) {
      showToast('Business ID is missing')
      return
    }

    setExporting(true)
    try {
      const response = await analyticsApiFetch<Blob>('/api/analytics/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...filters, business_id: businessId, format: 'pdf' }),
      })

      const blob = response instanceof Blob ? response : new Blob([String(response)], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `cashguard-analytics-${new Date().toISOString().slice(0, 10)}.pdf`
      anchor.click()
      URL.revokeObjectURL(url)
      setExportOpen(false)
      showToast('Analytics report exported')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  const currency = data?.currency || 'INR'
  const quality = data?.data_quality
  const hasFinancialData = state === 'ready' && Boolean(data)
  const kpis = data?.kpis || {}

  return (
    <main className="foundation-content analytics-page">
      <div className="analytics-header">
        <div>
          <p className="auth-eyebrow flex items-center gap-2"><BarChart3 size={13} /> FINANCIAL ANALYTICS</p>
          <h2>Business Analytics</h2>
          <p>Control revenue, cash movement, collections, liabilities, risk and decision intelligence from one live business view.</p>
        </div>
        <div className="analytics-actions">
          <button className="secondary-button" onClick={() => void loadOverview(true)} disabled={state === 'loading' || refreshing}>
            <RefreshCw size={15} className={state === 'loading' || refreshing ? 'animate-spin' : ''} /> {refreshing ? 'Refreshing' : 'Refresh'}
          </button>
          <button className="auth-button compact" onClick={() => setExportOpen(true)}>
            <Download size={15} /> Export Report
          </button>
        </div>
      </div>

      <section className="analytics-filter-bar">
        <div className="analytics-filter-grid">
          <label>Date range<select value={range} onChange={(e: ChangeEvent<HTMLSelectElement>) => setRange(e.target.value as AnalyticsRange)}><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="quarter">This quarter</option><option value="year">This year</option></select></label>
          <label>Compare period<select value={compare} onChange={(e: ChangeEvent<HTMLSelectElement>) => setCompare(e.target.value as AnalyticsCompare)}><option value="previous_period">Previous period</option><option value="previous_year">Previous year</option><option value="none">No comparison</option></select></label>
          <label>Metric<select value={metric} onChange={(e: ChangeEvent<HTMLSelectElement>) => setMetric(e.target.value as AnalyticsMetric)}><option value="all">All metrics</option><option value="revenue">Revenue</option><option value="cash_flow">Cash flow</option><option value="receivables">Receivables</option><option value="payables">Payables</option></select></label>
          <label>Risk<select value={risk} onChange={(e: ChangeEvent<HTMLSelectElement>) => setRisk(e.target.value as AnalyticsRisk)}><option value="all">All risk levels</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="unknown">Unknown</option></select></label>
          <label>Customer / vendor scope<select value={scope} onChange={(e: ChangeEvent<HTMLSelectElement>) => setScope(e.target.value as AnalyticsScope)}><option value="all">All customers and vendors</option><option value="customers">Customers only</option><option value="vendors">Vendors only</option></select></label>
          <label>Payment method<select value={method} onChange={(e: ChangeEvent<HTMLSelectElement>) => setMethod(e.target.value as AnalyticsMethod)}><option value="all">All payment methods</option><option value="upi">UPI</option><option value="neft">NEFT</option><option value="rtgs">RTGS</option><option value="imps">IMPS</option><option value="bank_transfer">Bank transfer</option><option value="cash">Cash</option><option value="card">Card</option><option value="cheque">Cheque</option></select></label>
        </div>
        <div className="analytics-filter-actions">
          <button className="secondary-button" onClick={reset}><X size={14} /> Reset</button>
          <button className="auth-button compact" onClick={() => void loadOverview()}><Filter size={14} /> Apply filters</button>
        </div>
      </section>

      {error && (
        <div className="analytics-data-banner">
          <AlertTriangle size={17} />
          <div><strong>Analytics could not be loaded</strong><p>{error}</p></div>
          <button className="secondary-button" onClick={() => void loadOverview(true)}>Retry</button>
        </div>
      )}

      {quality?.warning && (
        <div className="analytics-data-banner">
          <Info size={17} />
          <div><strong>Data-quality notice</strong><p>{quality.warning}</p></div>
          {quality.record_count !== null && quality.record_count !== undefined && <span className="status-pill">{quality.record_count.toLocaleString('en-IN')} records</span>}
        </div>
      )}

      <section className="analytics-kpis">
        {[
          ['Revenue', kpis.revenue, 'Revenue recorded in selected period', 'info'],
          ['Expenses', kpis.expenses, 'Operating and recorded business expenses', 'neutral'],
          ['Net cash flow', kpis.net_cash_flow, 'Inflow minus outflow from connected sources', 'info'],
          ['Gross margin', kpis.gross_margin, 'Revenue less cost of sales where cost data exists', 'success'],
          ['Receivables', kpis.receivables, 'Outstanding customer receivables', 'warning'],
          ['Payables', kpis.payables, 'Outstanding vendor liabilities', 'warning'],
        ].map(([label, item, fallback, tone]) => {
          const metricValue = item as MetricValue | undefined
          return (
            <div className="foundation-card analytics-kpi" key={String(label)}>
              <div><span>{label}</span><i className={tone as string} /></div>
              <strong>{formatMoney(metricValue?.value ?? null, currency)}</strong>
              <small>{metricDetail(metricValue, String(fallback))}</small>
            </div>
          )
        })}
      </section>

      {!hasFinancialData && state !== 'error' && <StatePanel title="Financial analytics" state="loading" onRetry={() => void loadOverview(true)} />}

      {hasFinancialData && (
        <>
          <section className="analytics-chart-grid">
            <div className="foundation-card analytics-primary-panel">
              <div className="analytics-panel-head"><div><h3>Cash Flow Performance</h3><p>Live inflow, outflow and net movement · {range}</p></div><Wallet size={18} className="text-primary" /></div>
              {data?.cash_flow?.length ? <CashFlowChart points={data.cash_flow} currency={currency} /> : <StatePanel title="Cash flow" state="ready" />}
            </div>
            <div className="foundation-card analytics-panel">
              <div className="analytics-panel-head"><div><h3>Revenue vs Expenses</h3><p>{compare === 'none' ? 'Selected period' : compare}</p></div><BarChart3 size={18} className="text-primary" /></div>
              {data?.revenue_vs_expenses?.length ? <RevenueExpenseChart points={data.revenue_vs_expenses} currency={currency} /> : <StatePanel title="Revenue" state="ready" />}
            </div>
          </section>

          <section className="analytics-detail-grid">
            <div className="foundation-card analytics-panel">
              <div className="analytics-panel-head"><div><h3>Receivables</h3><p>Collection health and due-date exposure</p></div><Link href="/invoices" className="text-link">View invoices</Link></div>
              <div className="chart-support">
                <div><small>Outstanding</small><strong>{formatMoney(data?.receivables?.outstanding ?? kpis.receivables?.value ?? null, currency)}</strong></div>
                <div><small>Overdue</small><strong>{formatMoney(data?.receivables?.overdue ?? null, currency)}</strong></div>
                <div><small>Collection rate</small><strong>{formatPercent(data?.receivables?.collection_rate ?? null)}</strong></div>
              </div>
              <div className="analytics-empty-table">
                <strong>Receivable aging</strong>
                {(data?.receivables?.aging || []).map((bucket) => <p key={bucket.label}>{bucket.label}: {formatMoney(bucket.amount, currency)}</p>)}
                {!data?.receivables?.aging?.length && <p>No aging buckets returned by the backend.</p>}
              </div>
            </div>

            <div className="foundation-card analytics-panel">
              <div className="analytics-panel-head"><div><h3>Payables</h3><p>Upcoming obligations and payment exposure</p></div><Link href="/vendors" className="text-link">View vendors</Link></div>
              <div className="chart-support">
                <div><small>Outstanding</small><strong>{formatMoney(data?.payables?.outstanding ?? kpis.payables?.value ?? null, currency)}</strong></div>
                <div><small>Overdue</small><strong>{formatMoney(data?.payables?.overdue ?? null, currency)}</strong></div>
                <div><small>Due in 7 days</small><strong>{formatMoney(data?.payables?.due_7d ?? null, currency)}</strong></div>
              </div>
              <div className="analytics-empty-table">
                <strong>Payable aging</strong>
                {(data?.payables?.aging || []).map((bucket) => <p key={bucket.label}>{bucket.label}: {formatMoney(bucket.amount, currency)}</p>)}
                {!data?.payables?.aging?.length && <p>No aging buckets returned by the backend.</p>}
              </div>
            </div>

            <div className="foundation-card analytics-panel">
              <div className="analytics-panel-head"><div><h3>Payment Methods</h3><p>Observed mix from connected transaction data</p></div></div>
              <div className="analytics-empty-table">
                {(data?.payment_methods || []).map((item) => <p key={item.method}>{item.method}: {formatMoney(item.amount, currency)}{item.count !== null ? ` · ${item.count.toLocaleString('en-IN')} transactions` : ''}</p>)}
                {!data?.payment_methods?.length && <p>No payment-method records returned.</p>}
              </div>
            </div>

            <div className="foundation-card analytics-panel">
              <div className="analytics-panel-head"><div><h3>Risk Exposure</h3><p>Backend-calculated exposure by risk level</p></div><Link href="/risk-intelligence" className="text-link">View risk intelligence</Link></div>
              <div className="chart-support">
                <div><small>Low</small><strong>{data?.risk_exposure?.low ?? '—'}</strong></div>
                <div><small>Medium</small><strong>{data?.risk_exposure?.medium ?? '—'}</strong></div>
                <div><small>High</small><strong>{data?.risk_exposure?.high ?? '—'}</strong></div>
              </div>
              <div className="analytics-empty-table"><strong>Unknown exposure: {data?.risk_exposure?.unknown ?? '—'}</strong><p>Risk counts come from the backend risk/ML pipeline; no frontend score is invented.</p></div>
            </div>
          </section>

          <section>
            <div className="analytics-section-title"><div><p className="auth-eyebrow">DECISION SUPPORT</p><h3>Business Insights</h3><p>Structured observations from live analytics and ML outputs.</p></div></div>
            <div className="analytics-insight-grid">
              {(data?.insights || []).length ? data?.insights?.map((insight) => <InsightCard key={insight.id} insight={insight} />) : <UnavailablePanel title="No decision signals returned" description="The backend returned analytics data but no structured insight records for this selection." />}
            </div>
          </section>

          <section className="foundation-card ai-intelligence-panel">
            <div className="analytics-panel-head"><div><p className="auth-eyebrow">CASHGUARD-AI</p><h3>AI Data Intelligence</h3><p>GenAI explains validated financial metrics and ML outputs without inventing financial facts.</p></div><Sparkles size={20} className="text-primary" /></div>
            <div className="ai-intelligence-body">
              {aiState === 'loading' && <StatePanel title="AI analysis" state="loading" />}
              {aiState === 'error' && <UnavailablePanel title="AI analysis failed" description="The backend AI endpoint did not return a validated response. Retry after checking the analytics and GenAI services." />}
              {aiState === 'idle' && <p>Run an analysis against the selected period and filters.</p>}
              {aiState === 'ready' && aiInsight && (
                <div className="analytics-empty-table" style={{ textAlign: 'left', justifyItems: 'stretch' }}>
                  <strong>{aiInsight.title || 'AI executive insight'}</strong>
                  <p>{aiInsight.executive_summary || 'No executive summary returned.'}</p>
                  {aiInsight.risks?.length ? <p><strong>Risks:</strong> {aiInsight.risks.join(' · ')}</p> : null}
                  {aiInsight.opportunities?.length ? <p><strong>Opportunities:</strong> {aiInsight.opportunities.join(' · ')}</p> : null}
                  {aiInsight.actions?.length ? <p><strong>Recommended actions:</strong> {aiInsight.actions.join(' · ')}</p> : null}
                  {aiIntent && <p>Analysis intent: {aiIntent}</p>}
                </div>
              )}
            </div>
            <div className="ai-action-row">
              <button className="auth-button compact" onClick={() => void analyze('current_period')} disabled={aiState === 'loading'}><Sparkles size={14} /> Analyze current period</button>
              <button className="secondary-button" onClick={() => void analyze('explain_trend')} disabled={aiState === 'loading'}>Explain this trend</button>
              <button className="secondary-button" onClick={() => void analyze('executive_summary')} disabled={aiState === 'loading'}>Generate executive summary</button>
            </div>
          </section>

          <section className="foundation-card analytics-signals">
            <div className="analytics-panel-head"><div><h3>Financial Signals</h3><p>Validated signals from analytics, ML and connected business sources.</p></div><span className="status-pill">{quality?.status === 'partial' ? 'Partial data' : 'Live data'}</span></div>
            <div className="analytics-empty-table">
              {(data?.financial_signals || []).map((signal) => <div key={signal.id} className="w-full text-left border-b border-slate-100 py-3 last:border-0"><span className={severityClass(signal.severity)}>{signal.severity}</span><strong className="block mt-1">{signal.title}: {signal.value}</strong><p>{signal.detail}</p></div>)}
              {!data?.financial_signals?.length && <><BarChart3 size={22} /><strong>No financial signals returned</strong><p>The backend did not return a validated signal for this selection.</p></>}
            </div>
          </section>
        </>
      )}

      {exportOpen && (
        <div className="fixed inset-0 z-50">
          <button aria-label="Close export dialog" className="absolute inset-0 bg-black/40" onClick={() => !exporting && setExportOpen(false)} />
          <div className="analytics-dialog">
            <div className="flex items-start justify-between"><div><p className="auth-eyebrow">REPORT BUILDER</p><h3>Export Analytics Report</h3><p>Generate the report from the currently selected live analytics filters.</p></div><button aria-label="Close" onClick={() => !exporting && setExportOpen(false)}><X size={18} /></button></div>
            <div className="analytics-dialog-state"><Download size={18} /><span>{exporting ? 'Generating validated PDF report…' : 'The report will use current backend analytics results.'}</span></div>
            <button className="auth-button w-full" onClick={() => void exportReport()} disabled={exporting}>{exporting ? 'Generating…' : 'Generate PDF report'}</button>
          </div>
        </div>
      )}

      {toast && <div className="fixed bottom-5 right-5 z-[60] flex items-center gap-2 rounded-lg bg-foreground px-4 py-3 text-sm text-background shadow-xl"><Check size={16} className="text-success" /> {toast}</div>}
    </main>
  )
}

export { analyticsApiFetch, buildAnalyticsQuery, formatMoney, normalizeOverview }
