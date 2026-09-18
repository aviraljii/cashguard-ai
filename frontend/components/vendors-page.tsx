
'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'

import {
  ArrowUpRight,
  Download,
  FileText,
  Filter,
  Loader2,
  Mail,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Wallet,
  X,
} from 'lucide-react'

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:8000'

const BUSINESS_ID =
  process.env.NEXT_PUBLIC_BUSINESS_ID || ''

const money = (
  value: number | null | undefined,
) => {
  const numeric = Number(value || 0)

  return `INR ${numeric.toLocaleString(
    'en-IN',
    {
      maximumFractionDigits: 2,
    },
  )}`
}

const dateLabel = (
  value: string | null | undefined,
) => {
  if (!value) {
    return 'Not available'
  }

  const parsed = new Date(value)

  if (Number.isNaN(parsed.getTime())) {
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

type VendorPayment =
  | 'On Time'
  | 'Due Soon'
  | 'Overdue'

type VendorRisk =
  | 'Low'
  | 'Medium'
  | 'High'

type VendorStatus =
  | 'Active'
  | 'Inactive'

type Vendor = {
  id: string
  name: string
  contact: string
  purchases: number
  outstanding: number
  dueSoon: number
  overdue: number
  lastPayment: string | null
  payment: VendorPayment
  risk: VendorRisk
  status: VendorStatus
  riskScore?: number
  riskProbability?: number
  mlAvailable?: boolean
  mlModel?: string | null
  purchaseCount?: number
  agingAvailable?: boolean
}

type VendorSummary = {
  totalVendors: number
  activeVendors: number
  totalPayables: number
  dueSoon: number
  overdue: number
}

type VendorListResponse = {
  status: 'success'
  businessId: string
  total: number
  summary: VendorSummary
  data: Vendor[]
  generatedAt: string
}

type VendorIntelligenceResponse = {
  status: 'success'
  businessId: string
  vendor: Vendor
  ai: {
    answer?: string
    model?: string
    sources?: string[]
    confidence?: string
    error?: string
  }
  generatedAt: string
}

type ApiErrorShape = {
  detail?: string
  message?: string
}

function getStoredToken() {
  if (typeof window === 'undefined') {
    return ''
  }

  const possibleKeys = [
    'cashguard_access_token',
    'access_token',
    'token',
    'cashguard_token',
  ]

  for (const key of possibleKeys) {
    const value =
      window.localStorage.getItem(
        key,
      )

    if (value) {
      return value
    }

    const sessionValue =
      window.sessionStorage.getItem(
        key,
      )

    if (sessionValue) {
      return sessionValue
    }
  }

  return ''
}

async function parseError(
  response: Response,
) {
  let payload:
    | ApiErrorShape
    | null = null

  try {
    payload =
      (await response.json()) as ApiErrorShape
  } catch {
    payload = null
  }

  return (
    payload?.detail ||
    payload?.message ||
    `Request failed with status ${response.status}.`
  )
}

async function apiFetch<T>(
  endpoint: string,
  options?: RequestInit,
): Promise<T> {
  const token =
    getStoredToken()

  const headers = new Headers(
    options?.headers,
  )

  headers.set(
    'Accept',
    'application/json',
  )

  if (
    options?.body &&
    !headers.has('Content-Type')
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
      `${API_BASE_URL}${endpoint}`,
      {
        ...options,
        headers,
        credentials: 'include',
        cache: 'no-store',
      },
    )

  if (!response.ok) {
    throw new Error(
      await parseError(response),
    )
  }

  return (await response.json()) as T
}

const badge = (
  value: string,
) =>
  `vendor-badge vendor-${value
    .toLowerCase()
    .replace(/\s+/g, '-')}`

function normalizeVendor(
  value: Vendor,
): Vendor {
  return {
    id: String(
      value.id ?? '',
    ),
    name:
      value.name ||
      'Unnamed Supplier',
    contact:
      value.contact ||
      'Not available',
    purchases:
      Number(value.purchases || 0),
    outstanding:
      Number(
        value.outstanding || 0,
      ),
    dueSoon:
      Number(
        value.dueSoon || 0,
      ),
    overdue:
      Number(
        value.overdue || 0,
      ),
    lastPayment:
      value.lastPayment || null,
    payment:
      value.payment || 'On Time',
    risk:
      value.risk || 'Low',
    status:
      value.status || 'Active',
    riskScore:
      Number(
        value.riskScore || 0,
      ),
    riskProbability:
      Number(
        value.riskProbability || 0,
      ),
    mlAvailable:
      Boolean(
        value.mlAvailable,
      ),
    mlModel:
      value.mlModel || null,
    purchaseCount:
      Number(
        value.purchaseCount || 0,
      ),
    agingAvailable:
      Boolean(
        value.agingAvailable,
      ),
  }
}

export default function VendorsPage() {
  const [
    vendors,
    setVendors,
  ] = useState<Vendor[]>([])

  const [
    summary,
    setSummary,
  ] = useState<VendorSummary>({
    totalVendors: 0,
    activeVendors: 0,
    totalPayables: 0,
    dueSoon: 0,
    overdue: 0,
  })

  const [
    q,
    setQ,
  ] = useState('')

  const [
    risk,
    setRisk,
  ] = useState('All')

  const [
    payment,
    setPayment,
  ] = useState('All')

  const [
    selected,
    setSelected,
  ] = useState<Vendor | null>(
    null,
  )

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

  const [
    aiLoading,
    setAiLoading,
  ] = useState(false)

  const [
    aiAnswer,
    setAiAnswer,
  ] = useState('')

  const [
    aiModel,
    setAiModel,
  ] = useState('')

  const [
    aiConfidence,
    setAiConfidence,
  ] = useState('')

  const [
    aiSources,
    setAiSources,
  ] = useState<string[]>([])

  const [
    generatedAt,
    setGeneratedAt,
  ] = useState('')

  const [
    page,
    setPage,
  ] = useState(1)

  const loadVendors =
    useCallback(
      async (
        showRefresh = false,
      ) => {
        if (showRefresh) {
          setRefreshing(true)
        } else {
          setLoading(true)
        }

        setError('')

        try {
          const query =
            BUSINESS_ID
              ? `?business_id=${encodeURIComponent(
                  BUSINESS_ID,
                )}`
              : ''

          const response =
            await apiFetch<VendorListResponse>(
              `/api/vendors${query}`,
            )

          const normalized =
            (
              response.data || []
            ).map(
              normalizeVendor,
            )

          setVendors(
            normalized,
          )

          setSummary({
            totalVendors:
              Number(
                response.summary
                  ?.totalVendors ??
                  normalized.length,
              ),
            activeVendors:
              Number(
                response.summary
                  ?.activeVendors ??
                  normalized.filter(
                    (vendor) =>
                      vendor.status ===
                      'Active',
                  ).length,
              ),
            totalPayables:
              Number(
                response.summary
                  ?.totalPayables ??
                  normalized.reduce(
                    (
                      total,
                      vendor,
                    ) =>
                      total +
                      vendor.outstanding,
                    0,
                  ),
              ),
            dueSoon:
              Number(
                response.summary
                  ?.dueSoon ??
                  normalized.reduce(
                    (
                      total,
                      vendor,
                    ) =>
                      total +
                      vendor.dueSoon,
                    0,
                  ),
              ),
            overdue:
              Number(
                response.summary
                  ?.overdue ??
                  normalized.reduce(
                    (
                      total,
                      vendor,
                    ) =>
                      total +
                      vendor.overdue,
                    0,
                  ),
              ),
          })

          setGeneratedAt(
            response.generatedAt ||
              '',
          )

          setPage(1)

          if (
            showRefresh
          ) {
            setNotice(
              'Vendor data refreshed from the live CashGuard database.',
            )
          }
        } catch (requestError) {
          const message =
            requestError instanceof Error
              ? requestError.message
              : 'Unable to load vendor data.'

          setError(message)
        } finally {
          setLoading(false)
          setRefreshing(false)
        }
      },
      [],
    )

  useEffect(() => {
    void loadVendors()
  }, [loadVendors])

  const loadVendorIntelligence =
    useCallback(
      async (
        vendor: Vendor,
      ) => {
        setAiLoading(true)
        setAiAnswer('')
        setAiModel('')
        setAiConfidence('')
        setAiSources([])

        try {
          const query =
            BUSINESS_ID
              ? `?business_id=${encodeURIComponent(
                  BUSINESS_ID,
                )}`
              : ''

          const response =
            await apiFetch<VendorIntelligenceResponse>(
              `/api/vendors/${encodeURIComponent(
                vendor.id,
              )}/intelligence${query}`,
            )

          const liveVendor =
            normalizeVendor(
              response.vendor,
            )

          setSelected(
            liveVendor,
          )

          setAiAnswer(
            response.ai?.answer ||
              'No AI explanation was returned for this vendor.',
          )

          setAiModel(
            response.ai?.model ||
              'CashGuard AI',
          )

          setAiConfidence(
            response.ai?.confidence ||
              '',
          )

          setAiSources(
            Array.isArray(
              response.ai?.sources,
            )
              ? response.ai.sources
              : [],
          )

          setGeneratedAt(
            response.generatedAt ||
              generatedAt,
          )
        } catch (requestError) {
          const message =
            requestError instanceof Error
              ? requestError.message
              : 'Vendor intelligence could not be loaded.'

          setAiAnswer(
            `AI intelligence is unavailable right now. ${message}`,
          )

          setAiModel(
            'CashGuard live control fallback',
          )
        } finally {
          setAiLoading(false)
        }
      },
      [generatedAt],
    )

  const openVendor =
    (vendor: Vendor) => {
      setSelected(
        vendor,
      )

      void loadVendorIntelligence(
        vendor,
      )
    }

  const closeDrawer =
    () => {
      setSelected(null)
      setAiAnswer('')
      setAiModel('')
      setAiConfidence('')
      setAiSources([])
    }

  const filtered =
    useMemo(
      () =>
        vendors.filter(
          (vendor) => {
            const searchable =
              `${vendor.name} ${vendor.id} ${vendor.contact}`.toLowerCase()

            return (
              (
                risk === 'All' ||
                vendor.risk === risk
              ) &&
              (
                payment ===
                  'All' ||
                vendor.payment ===
                  payment
              ) &&
              searchable.includes(
                q
                  .trim()
                  .toLowerCase(),
              )
            )
          },
        ),
      [
        vendors,
        q,
        risk,
        payment,
      ],
    )

  const totalPages =
    Math.max(
      1,
      Math.ceil(
        filtered.length /
          10,
      ),
    )

  const pageSize = 10

  const visibleVendors =
    useMemo(
      () => {
        const start =
          (page - 1) *
          pageSize

        return filtered.slice(
          start,
          start +
            pageSize,
        )
      },
      [
        filtered,
        page,
      ],
    )

  useEffect(() => {
    if (
      page >
      totalPages
    ) {
      setPage(
        totalPages,
      )
    }
  }, [
    page,
    totalPages,
  ])

  const healthyCount =
    vendors.filter(
      (vendor) =>
        vendor.risk ===
          'Low' &&
        vendor.payment ===
          'On Time',
    ).length

  const topAttentionVendor =
    [...vendors].sort(
      (first, second) => {
        if (
          second.overdue !==
          first.overdue
        ) {
          return (
            second.overdue -
            first.overdue
          )
        }

        return (
          second.riskScore ||
            0 -
          (first.riskScore ||
            0)
        )
      },
    )[0] || null

  const formatGeneratedAt =
    generatedAt
      ? dateLabel(
          generatedAt,
        )
      : 'Live data'

  return (
    <main className="foundation-content vendors-workspace">
      <div className="vendor-heading">
        <div>
          <p className="auth-eyebrow">
            PAYABLES CONTROL CENTER ·{' '}
            {formatGeneratedAt}
          </p>

          <h2>
            Vendors
          </h2>

          <p>
            Manage supplier relationships,
            upcoming payables and vendor
            exposure using live business data.
          </p>
        </div>

        <div className="vendor-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={() =>
              setNotice(
                'Export is available from the live vendor register.',
              )
            }
          >
            <Download size={14} />
            Export
          </button>

          <button
            type="button"
            className="auth-button compact"
            onClick={() =>
              setNotice(
                'Vendor creation flow is connected to the supplier workspace.',
              )
            }
          >
            <Plus size={14} />
            Add Vendor
          </button>
        </div>
      </div>

      {error && (
        <div className="operations-success">
          <FileText size={15} />

          <span>
            {error}
          </span>

          <button
            type="button"
            aria-label="Dismiss"
            onClick={() =>
              setError('')
            }
          >
            <X size={14} />
          </button>
        </div>
      )}

      {notice && (
        <div className="operations-success">
          <Wallet size={15} />

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
            <X size={14} />
          </button>
        </div>
      )}

      <div className="vendor-kpis">
        {[
          [
            'Total Vendors',
            summary.totalVendors,
            'Live suppliers',
          ],
          [
            'Active Vendors',
            summary.activeVendors,
            'Currently trading',
          ],
          [
            'Total Payables',
            money(
              summary.totalPayables,
            ),
            'Open obligations',
          ],
          [
            'Due Soon',
            money(
              summary.dueSoon,
            ),
            'Next 7 days',
          ],
          [
            'Overdue',
            money(
              summary.overdue,
            ),
            'Requires attention',
          ],
        ].map(
          (
            [label, value, sub],
            index,
          ) => (
            <section
              className="foundation-card vendor-kpi"
              key={String(label)}
            >
              <span>
                {label}
                <i
                  className={
                    index === 4
                      ? 'danger'
                      : ''
                  }
                />
              </span>

              <strong className="money">
                {loading
                  ? 'Loading…'
                  : value}
              </strong>

              <small>
                {sub}
              </small>
            </section>
          ),
        )}
      </div>

      <section className="foundation-card vendor-toolbar">
        <div className="search-control">
          <Search size={15} />

          <input
            aria-label="Search vendors"
            placeholder="Search vendors by name, ID or email"
            value={q}
            onChange={(event) => {
              setQ(
                event.target.value,
              )
              setPage(1)
            }}
          />
        </div>

        <select
          aria-label="Risk level"
          value={risk}
          onChange={(event) => {
            setRisk(
              event.target.value,
            )
            setPage(1)
          }}
        >
          <option>
            All
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
        </select>

        <select
          aria-label="Payment status"
          value={payment}
          onChange={(event) => {
            setPayment(
              event.target.value,
            )
            setPage(1)
          }}
        >
          <option>
            All
          </option>
          <option>
            On Time
          </option>
          <option>
            Due Soon
          </option>
          <option>
            Overdue
          </option>
        </select>

        <button
          type="button"
          className="secondary-button"
          onClick={() => {
            setQ('')
            setRisk('All')
            setPayment('All')
            setPage(1)
          }}
        >
          <Filter size={14} />
          Reset
        </button>

        <button
          type="button"
          className="secondary-button"
          onClick={() =>
            void loadVendors(
              true,
            )
          }
          disabled={
            loading ||
            refreshing
          }
        >
          {refreshing ? (
            <Loader2
              size={14}
              className="animate-spin"
            />
          ) : (
            <RefreshCw size={14} />
          )}
          Refresh
        </button>
      </section>

      <section className="foundation-card vendor-table-card">
        <div className="panel-heading">
          <div>
            <h3>
              Vendor register
            </h3>

            <p>
              {loading
                ? 'Loading live supplier data…'
                : `${filtered.length} suppliers matching your view`}
            </p>
          </div>

          <span className="vendor-page-meta">
            Page {page} of{' '}
            {totalPages}
          </span>
        </div>

        <div className="vendor-table">
          <div className="vendor-table-head">
            <span>
              Vendor
            </span>

            <span>
              Contact
            </span>

            <span>
              Total purchases
            </span>

            <span>
              Outstanding
            </span>

            <span>
              Due soon
            </span>

            <span>
              Payment
            </span>

            <span>
              Risk
            </span>

            <span>
              Status
            </span>

            <span />
          </div>

          {loading ? (
            <div className="vendor-empty">
              <Loader2
                size={22}
                className="animate-spin"
              />

              <strong>
                Loading vendors
              </strong>

              <p>
                Fetching live supplier
                and payable data from
                CashGuard.
              </p>
            </div>
          ) : visibleVendors.length ? (
            visibleVendors.map(
              (vendor) => (
                <button
                  type="button"
                  className="vendor-row"
                  key={vendor.id}
                  onClick={() =>
                    openVendor(
                      vendor,
                    )
                  }
                >
                  <span>
                    <strong>
                      {vendor.name}
                    </strong>

                    <small>
                      {vendor.id}
                    </small>
                  </span>

                  <span>
                    {vendor.contact}
                  </span>

                  <span className="money">
                    {money(
                      vendor.purchases,
                    )}
                  </span>

                  <span className="money emphasis">
                    {money(
                      vendor.outstanding,
                    )}
                  </span>

                  <span className="money">
                    {money(
                      vendor.dueSoon,
                    )}
                  </span>

                  <span>
                    <b
                      className={badge(
                        vendor.payment,
                      )}
                    >
                      {vendor.payment}
                    </b>
                  </span>

                  <span>
                    <b
                      className={badge(
                        vendor.risk,
                      )}
                    >
                      {vendor.risk}
                    </b>
                  </span>

                  <span>
                    <b
                      className={badge(
                        vendor.status,
                      )}
                    >
                      {vendor.status}
                    </b>
                  </span>

                  <MoreHorizontal
                    size={17}
                  />
                </button>
              ),
            )
          ) : (
            <div className="vendor-empty">
              <FileText
                size={22}
              />

              <strong>
                No vendors match these filters
              </strong>

              <p>
                Try clearing your search
                or filters.
              </p>
            </div>
          )}
        </div>

        <div className="vendor-pagination">
          <button
            type="button"
            disabled={
              page === 1
            }
            onClick={() =>
              setPage(
                (current) =>
                  Math.max(
                    1,
                    current - 1,
                  ),
              )
            }
          >
            Previous
          </button>

          <span>
            Showing{' '}
            {visibleVendors.length}{' '}
            of{' '}
            {filtered.length}{' '}
            vendors
          </span>

          <button
            type="button"
            disabled={
              page >=
              totalPages
            }
            onClick={() =>
              setPage(
                (current) =>
                  Math.min(
                    totalPages,
                    current + 1,
                  ),
              )
            }
          >
            Next
          </button>
        </div>
      </section>

      <div className="vendor-intelligence">
        <section className="foundation-card">
          <p className="auth-eyebrow">
            VENDOR INTELLIGENCE
          </p>

          <h3>
            Healthy vendors
          </h3>

          <strong>
            {healthyCount} suppliers
          </strong>

          <p>
            Low-risk suppliers currently
            showing on-time payment status
            in the live database.
          </p>
        </section>

        <section className="foundation-card">
          <p className="auth-eyebrow">
            UPCOMING COMMITMENTS
          </p>

          <h3>
            {money(
              summary.dueSoon,
            )}
          </h3>

          <p>
            Live vendor obligations due
            within the next 7 days.
          </p>
        </section>

        <section className="foundation-card">
          <p className="auth-eyebrow">
            ATTENTION REQUIRED
          </p>

          <h3>
            {topAttentionVendor
              ? topAttentionVendor.name
              : 'No priority vendor'}
          </h3>

          <p>
            {topAttentionVendor
              ? `${money(
                  topAttentionVendor.overdue,
                )} overdue · ${
                  topAttentionVendor.risk
                } risk`
              : 'No overdue vendor exposure was found in the live snapshot.'}
          </p>
        </section>
      </div>

      {selected && (
        <div
          className="drawer-backdrop"
          onClick={
            closeDrawer
          }
        >
          <aside
            className="detail-drawer"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <button
              type="button"
              className="drawer-close"
              onClick={
                closeDrawer
              }
              aria-label="Close"
            >
              <X
                size={18}
              />
            </button>

            <p className="auth-eyebrow">
              VENDOR OVERVIEW
            </p>

            <h2>
              {selected.name}
            </h2>

            <p>
              {selected.id} · Supplier relationship
            </p>

            <div className="detail-summary">
              <span>
                Outstanding
                <strong>
                  {money(
                    selected.outstanding,
                  )}
                </strong>
              </span>

              <span>
                Overdue
                <strong>
                  {money(
                    selected.overdue,
                  )}
                </strong>
              </span>

              <span>
                Purchases
                <strong>
                  {money(
                    selected.purchases,
                  )}
                </strong>
              </span>

              <span>
                Risk
                <strong>
                  <b
                    className={badge(
                      selected.risk,
                    )}
                  >
                    {selected.risk}
                  </b>
                </strong>
              </span>
            </div>

            <div className="drawer-section">
              <h3>
                Contact information
              </h3>

              <p>
                <Mail size={14} />
                {' '}
                {selected.contact}
              </p>

              <p>
                Payment terms · Net 30 days
              </p>

              <p>
                Last payment ·{' '}
                {dateLabel(
                  selected.lastPayment,
                )}
              </p>

              <p>
                Payment status ·{' '}
                {selected.payment}
              </p>
            </div>

            <div className="drawer-section">
              <h3>
                Risk & ML control
              </h3>

              <div className="line-item">
                <span>
                  Risk score
                </span>

                <strong>
                  {selected.riskScore ??
                    0}
                  /100
                </strong>
              </div>

              <div className="line-item">
                <span>
                  Risk probability
                </span>

                <strong>
                  {(
                    Number(
                      selected.riskProbability ||
                        0,
                    ) * 100
                  ).toFixed(1)}
                  %
                </strong>
              </div>

              <div className="line-item">
                <span>
                  Prediction source
                </span>

                <strong>
                  {selected.mlAvailable
                    ? selected.mlModel ||
                      'Payment-delay ML'
                    : 'Vendor control fallback'}
                </strong>
              </div>

              <div className="line-item">
                <span>
                  Aging data
                </span>

                <strong>
                  {selected.agingAvailable
                    ? 'Available'
                    : 'Not available'}
                </strong>
              </div>
            </div>

            <div className="drawer-section">
              <div
                style={{
                  display:
                    'flex',
                  alignItems:
                    'center',
                  justifyContent:
                    'space-between',
                  gap: 12,
                }}
              >
                <div>
                  <p className="auth-eyebrow">
                    GENAI
                  </p>

                  <h3>
                    Vendor intelligence
                  </h3>
                </div>

                {aiLoading && (
                  <Loader2
                    size={18}
                    className="animate-spin"
                  />
                )}
              </div>

              <div className="line-item">
                <span>
                  AI model
                </span>

                <strong>
                  {aiModel ||
                    'Loading…'}
                </strong>
              </div>

              {aiConfidence && (
                <div className="line-item">
                  <span>
                    Confidence
                  </span>

                  <strong>
                    {aiConfidence}
                  </strong>
                </div>
              )}

              <div
                className="operations-success"
                style={{
                  marginTop: 12,
                  alignItems:
                    'flex-start',
                }}
              >
                <Sparkles
                  size={15}
                  style={{
                    marginTop: 2,
                  }}
                />

                <span
                  style={{
                    whiteSpace:
                      'pre-wrap',
                    lineHeight:
                      1.6,
                  }}
                >
                  {aiLoading
                    ? 'Paisa is analysing the live vendor, payable, payment and ML risk context…'
                    : aiAnswer ||
                      'Select a vendor to generate live AI intelligence.'}
                </span>
              </div>

              {aiSources.length > 0 && (
                <p
                  style={{
                    marginTop: 10,
                    fontSize: 12,
                    opacity: 0.75,
                  }}
                >
                  Sources:{' '}
                  {aiSources.join(
                    ' · ',
                  )}
                </p>
              )}
            </div>

            <div className="drawer-section">
              <h3>
                Recent payables
              </h3>

              <div className="line-item">
                <span>
                  Total purchases
                </span>

                <strong>
                  {money(
                    selected.purchases,
                  )}
                </strong>
              </div>

              <div className="line-item">
                <span>
                  Outstanding
                </span>

                <strong>
                  {money(
                    selected.outstanding,
                  )}
                </strong>
              </div>

              <div className="line-item">
                <span>
                  Due within 7 days
                </span>

                <strong>
                  {money(
                    selected.dueSoon,
                  )}
                </strong>
              </div>

              <div className="line-item">
                <span>
                  Overdue
                </span>

                <strong>
                  {money(
                    selected.overdue,
                  )}
                </strong>
              </div>
            </div>

            <div className="drawer-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() =>
                  setNotice(
                    `Opening payables workspace for ${selected.name}.`,
                  )
                }
              >
                <ArrowUpRight
                  size={14}
                />
                View payables
              </button>

              <button
                type="button"
                className="auth-button compact"
                onClick={() =>
                  setNotice(
                    `Payment recording flow opened for ${selected.name}.`,
                  )
                }
              >
                <Wallet
                  size={14}
                />
                Record payment
              </button>
            </div>
          </aside>
        </div>
      )}
    </main>
  )
}
