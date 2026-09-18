export type AnalyticsRange = '7d' | '30d' | 'quarter' | 'year'
export type AnalyticsCompare = 'previous_period' | 'previous_year' | 'none'
export type AnalyticsMetric = 'all' | 'revenue' | 'cash_flow' | 'receivables' | 'payables'
export type AnalyticsRisk = 'all' | 'low' | 'medium' | 'high' | 'unknown'
export type AnalyticsScope = 'all' | 'customers' | 'vendors'
export type AnalyticsMethod = 'all' | 'upi' | 'neft' | 'rtgs' | 'imps' | 'bank_transfer' | 'cash' | 'card' | 'cheque'

export type AnalyticsFilters = {
  businessId: string
  range: AnalyticsRange
  compare: AnalyticsCompare
  metric: AnalyticsMetric
  risk: AnalyticsRisk
  scope: AnalyticsScope
  method: AnalyticsMethod
}

const optionalFilterValues = new Set(['all', 'none'])

export function buildAnalyticsQuery(filters: AnalyticsFilters): string {
  const params = new URLSearchParams()
  params.set('business_id', filters.businessId)
  params.set('range', filters.range)
  params.set('compare', filters.compare)

  const optional = [
    ['metric', filters.metric],
    ['risk', filters.risk],
    ['scope', filters.scope],
    ['method', filters.method],
  ] as const

  for (const [key, value] of optional) {
    if (!optionalFilterValues.has(value)) {
      params.set(key, value)
    }
  }

  return params.toString()
}
