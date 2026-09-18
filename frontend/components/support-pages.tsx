
'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import {
  Check,
  ChevronDown,
  CircleHelp,
  ExternalLink,
  Mail,
  MessageSquare,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'

type FaqCategory =
  | 'Getting started'
  | 'Banking'
  | 'Reports'
  | 'Risk'

type Faq = {
  question: string
  answer: string
  category: FaqCategory
}

const faqs: Faq[] = [
  {
    category: 'Getting started',
    question: 'How do I connect a bank account?',
    answer:
      'Open Banking and use the connected banking flow. CashGuard-AI reads verified banking data from the backend when a supported account connection is available.',
  },
  {
    category: 'Banking',
    question: 'Why is some banking data unavailable?',
    answer:
      'CashGuard-AI only displays verified backend data. An unavailable section normally means that the required source or account connection is not available yet.',
  },
  {
    category: 'Reports',
    question: 'Can I export analytics reports?',
    answer:
      'Yes. Open Analytics and use Export Report. The report is generated from the selected backend analytics filters.',
  },
  {
    category: 'Risk',
    question: 'How are risk scores calculated?',
    answer:
      'CashGuard-AI combines available payment, due-date, receivable, cash-flow and risk-engine signals. The application does not invent risk data when a source is unavailable.',
  },
  {
    category: 'Getting started',
    question: 'Where can I manage my business profile?',
    answer:
      'Open Settings from the workspace navigation. Current account and business information is loaded from the connected backend profile.',
  },
  {
    category: 'Reports',
    question: 'Why can an analytics section show no data?',
    answer:
      'Analytics only renders validated results returned by the backend. A section can be empty when the selected period has no matching records or when that source is unavailable.',
  },
]

type ApiEnvelope<T> =
  | T
  | {
      data?: T
      result?: T
      user?: T
      business?: T
      success?: boolean
      message?: string
      detail?: string
    }

type UserRecord = {
  id?: number | string
  name?: string
  full_name?: string
  username?: string
  email?: string
  mobile?: string
  phone?: string
  job_title?: string
  city?: string
  state?: string
}

type BusinessRecord = {
  id?: string
  business_id?: string
  name?: string
  business_name?: string
  legal_name?: string
  city?: string
  state?: string
}

type ServiceHealth = {
  status?: string
  database?: string
  modules?: Record<string, boolean>
}

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL ||
  'http://127.0.0.1:8000'
).replace(/\/+$/, '')

function getAuthToken(): string | null {
  if (typeof window === 'undefined') {
    return null
  }

  const storages = [
    window.localStorage,
    window.sessionStorage,
  ]

  const keys = [
    'cashguard_access_token',
    'access_token',
    'accessToken',
    'token',
    'auth_token',
    'jwt_token',
    'jwt',
    'cashguard_token',
  ]

  for (const storage of storages) {
    for (const key of keys) {
      const value = storage
        .getItem(key)
        ?.trim()
        .replace(/^Bearer\s+/i, '')

      if (value) {
        return value
      }
    }
  }

  return null
}

async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getAuthToken()

  const headers = new Headers(
    options.headers || {},
  )

  headers.set(
    'Accept',
    'application/json',
  )

  if (
    !headers.has('Content-Type') &&
    !(options.body instanceof FormData)
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

  const response = await fetch(
    `${API_BASE_URL}${endpoint}`,
    {
      ...options,
      headers,
      credentials: 'include',
      cache: 'no-store',
    },
  )

  let body: unknown = null

  try {
    body = await response.json()
  } catch {
    body = null
  }

  if (!response.ok) {
    const payload = body as
      | {
          detail?: unknown
          message?: string
        }
      | null

    let message = `Request failed (${response.status}).`

    if (
      typeof payload?.message === 'string'
    ) {
      message = payload.message
    } else if (
      typeof payload?.detail === 'string'
    ) {
      message = payload.detail
    }

    throw new Error(message)
  }

  return body as T
}

function unwrapEnvelope<T>(
  payload: ApiEnvelope<T>,
): T {
  if (
    payload &&
    typeof payload === 'object' &&
    !Array.isArray(payload)
  ) {
    const candidate = payload as {
      data?: T
      result?: T
      user?: T
      business?: T
    }

    if (candidate.data !== undefined) {
      return candidate.data
    }

    if (candidate.result !== undefined) {
      return candidate.result
    }

    if (candidate.user !== undefined) {
      return candidate.user
    }

    if (candidate.business !== undefined) {
      return candidate.business
    }
  }

  return payload as T
}

function firstText(
  ...values: unknown[]
): string {
  for (const value of values) {
    if (
      typeof value === 'string' &&
      value.trim()
    ) {
      return value.trim()
    }
  }

  return ''
}

function Toast({
  text,
}: {
  text: string
}) {
  return (
    <div className="fixed bottom-5 right-5 z-50 rounded-lg bg-foreground px-4 py-3 text-sm text-background shadow-xl">
      <Check
        className="mr-2 inline text-success"
        size={15}
      />
      {text}
    </div>
  )
}

export function HelpPage() {
  const [query, setQuery] = useState('')
  const [
    category,
    setCategory,
  ] = useState<'All' | FaqCategory>('All')
  const [open, setOpen] = useState<number>(0)
  const [toast, setToast] = useState('')

  const visibleFaqs = useMemo(() => {
    const normalizedQuery = query
      .trim()
      .toLowerCase()

    return faqs.filter((faq) => {
      const matchesCategory =
        category === 'All' ||
        faq.category === category

      const searchable =
        `${faq.question} ${faq.answer} ${faq.category}`.toLowerCase()

      const matchesSearch =
        !normalizedQuery ||
        searchable.includes(
          normalizedQuery,
        )

      return (
        matchesCategory &&
        matchesSearch
      )
    })
  }, [category, query])

  const contactSupport = () => {
    window.location.href =
      'mailto:support@cashguard.ai?subject=CashGuard-AI%20Support%20Request'
  }

  const requestGuidance = () => {
    setToast('Opening support email...')

    window.setTimeout(() => {
      window.location.href =
        'mailto:support@cashguard.ai?subject=CashGuard-AI%20Guided%20Support'
    }, 150)
  }

  useEffect(() => {
    if (!toast) {
      return
    }

    const timer = window.setTimeout(() => {
      setToast('')
    }, 2400)

    return () => {
      window.clearTimeout(timer)
    }
  }, [toast])

  useEffect(() => {
    if (open >= visibleFaqs.length) {
      setOpen(
        visibleFaqs.length
          ? 0
          : -1,
      )
    }
  }, [open, visibleFaqs.length])

  return (
    <main className="foundation-content dashboard-content space-y-5">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="auth-eyebrow flex items-center gap-2">
            <CircleHelp size={14} />
            SUPPORT CENTRE
          </p>

          <h2>How can we help?</h2>

          <p>
            Find clear answers about your CashGuard-AI workspace.
          </p>
        </div>

        <button
          type="button"
          className="secondary-button"
          onClick={contactSupport}
        >
          <MessageSquare size={15} />
          Contact support
        </button>
      </header>

      <section className="foundation-card p-4">
        <label className="relative block">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            size={17}
          />

          <input
            aria-label="Search help"
            value={query}
            onChange={(event) =>
              setQuery(event.target.value)
            }
            placeholder="Search help articles, alerts, banking..."
            className="h-11 w-full rounded-lg border border-border bg-background pl-10 pr-3"
          />
        </label>

        <div className="mt-3 flex flex-wrap gap-2">
          {[
            'All',
            'Getting started',
            'Banking',
            'Reports',
            'Risk',
          ].map((item) => (
            <button
              type="button"
              key={item}
              onClick={() => {
                setCategory(
                  item as
                    | 'All'
                    | FaqCategory,
                )
                setOpen(0)
              }}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                category === item
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[1.35fr_.65fr]">
        <section className="foundation-card p-5">
          <h3>
            Frequently asked questions
          </h3>

          <p className="mt-1 text-sm text-muted-foreground">
            Practical answers for your daily finance workflow.
          </p>

          <div className="mt-4 divide-y divide-border">
            {visibleFaqs.map(
              (faq, index) => (
                <div key={faq.question}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-4 py-4 text-left font-semibold"
                    onClick={() =>
                      setOpen(
                        open === index
                          ? -1
                          : index,
                      )
                    }
                  >
                    <span className="flex-1">
                      {faq.question}
                    </span>

                    <span className="flex items-center gap-2">
                      <span className="text-[10px] font-semibold uppercase text-muted-foreground">
                        {faq.category}
                      </span>

                      <ChevronDown
                        size={17}
                        className={
                          open === index
                            ? 'rotate-180 text-primary'
                            : 'text-muted-foreground'
                        }
                      />
                    </span>
                  </button>

                  {open === index && (
                    <p className="pb-4 pr-8 text-sm leading-6 text-muted-foreground">
                      {faq.answer}
                    </p>
                  )}
                </div>
              ),
            )}

            {!visibleFaqs.length && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No articles match your search.
              </p>
            )}
          </div>
        </section>

        <div className="space-y-4">
          <section className="foundation-card p-5">
            <Sparkles
              className="mb-3 text-primary"
              size={20}
            />

            <h3>
              Need a guided answer?
            </h3>

            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Ask the CashGuard-AI support team for guidance about your connected finance workspace.
            </p>

            <button
              type="button"
              className="auth-button compact mt-4"
              onClick={requestGuidance}
            >
              Request help
            </button>
          </section>

          <section className="foundation-card p-5">
            <Mail
              className="mb-3 text-info"
              size={20}
            />

            <h3>
              Support channels
            </h3>

            <a
              href="mailto:support@cashguard.ai"
              className="mt-2 block text-sm text-primary"
            >
              support@cashguard.ai
            </a>

            <p className="mt-1 text-sm text-muted-foreground">
              Mon–Fri, 9:00–18:00 IST
            </p>
          </section>

          <section className="foundation-card p-5">
            <h3>
              Open connected areas
            </h3>

            <div className="mt-4 grid gap-2">
              <Link
                href="/analytics"
                className="secondary-button justify-between"
              >
                Analytics
                <ExternalLink size={14} />
              </Link>

              <Link
                href="/dashboard/banking"
                className="secondary-button justify-between"
              >
                Banking
                <ExternalLink size={14} />
              </Link>

              <Link
                href="/ai-insights"
                className="secondary-button justify-between"
              >
                AI Insights
                <ExternalLink size={14} />
              </Link>
            </div>
          </section>
        </div>
      </div>

      {toast && <Toast text={toast} />}
    </main>
  )
}

export function SettingsPage() {
  const [name, setName] = useState('')
  const [business, setBusiness] =
    useState('')
  const [email, setEmail] = useState('')
  const [mobile, setMobile] = useState('')
  const [jobTitle, setJobTitle] =
    useState('')
  const [city, setCity] = useState('')
  const [stateName, setStateName] =
    useState('')
  const [businessId, setBusinessId] =
    useState('')

  const [loading, setLoading] =
    useState(true)
  const [error, setError] = useState('')
  const [refreshing, setRefreshing] =
    useState(false)
  const [dirty, setDirty] =
    useState(false)
  const [toast, setToast] =
    useState('')

  const [
    serviceHealth,
    setServiceHealth,
  ] = useState<ServiceHealth | null>(
    null,
  )

  useEffect(() => {
    if (!toast) {
      return
    }

    const timer = window.setTimeout(() => {
      setToast('')
    }, 2600)

    return () => {
      window.clearTimeout(timer)
    }
  }, [toast])

  const loadSettings = async (
    showRefresh = false,
  ) => {
    try {
      if (showRefresh) {
        setRefreshing(true)
      } else {
        setLoading(true)
      }

      setError('')

      const [
        userResult,
        businessResult,
        healthResult,
      ] = await Promise.allSettled([
        apiFetch<
          ApiEnvelope<UserRecord>
        >('/api/auth/me'),

        apiFetch<
          ApiEnvelope<BusinessRecord>
        >('/api/businesses/me'),

        apiFetch<ServiceHealth>(
          '/health/services',
        ),
      ])

      let loadedAnything = false

      let backendCity = ''
      let backendState = ''

      if (
        userResult.status ===
        'fulfilled'
      ) {
        const user =
          unwrapEnvelope(
            userResult.value,
          )

        setName(
          firstText(
            user?.name,
            user?.full_name,
            user?.username,
          ),
        )

        setEmail(
          firstText(
            user?.email,
          ),
        )

        setMobile(
          firstText(
            user?.mobile,
            user?.phone,
          ),
        )

        setJobTitle(
          firstText(
            user?.job_title,
          ),
        )

        backendCity = firstText(
          user?.city,
        )

        backendState = firstText(
          user?.state,
        )

        setCity(backendCity)
        setStateName(
          backendState,
        )

        loadedAnything = true
      }

      if (
        businessResult.status ===
        'fulfilled'
      ) {
        const businessRecord =
          unwrapEnvelope(
            businessResult.value,
          )

        setBusiness(
          firstText(
            businessRecord?.name,
            businessRecord?.business_name,
            businessRecord?.legal_name,
          ),
        )

        const resolvedBusinessId =
          firstText(
            businessRecord?.id,
            businessRecord?.business_id,
          )

        setBusinessId(
          resolvedBusinessId,
        )

        if (
          !backendCity &&
          businessRecord?.city
        ) {
          setCity(
            businessRecord.city,
          )
        }

        if (
          !backendState &&
          businessRecord?.state
        ) {
          setStateName(
            businessRecord.state,
          )
        }

        if (
          typeof window !==
            'undefined' &&
          resolvedBusinessId
        ) {
          window.localStorage.setItem(
            'business_id',
            resolvedBusinessId,
          )
        }

        loadedAnything = true
      }

      if (
        healthResult.status ===
        'fulfilled'
      ) {
        setServiceHealth(
          healthResult.value,
        )
      }

      if (!loadedAnything) {
        throw new Error(
          'Unable to load your connected profile.',
        )
      }

      setDirty(false)
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Unable to load settings.',
      )
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    void loadSettings()
  }, [])

  const saveLocally = () => {
    if (
      typeof window === 'undefined'
    ) {
      return
    }

    window.localStorage.setItem(
      'cashguard_profile_name',
      name,
    )

    window.localStorage.setItem(
      'cashguard_profile_email',
      email,
    )

    window.localStorage.setItem(
      'cashguard_business_name',
      business,
    )

    window.localStorage.setItem(
      'cashguard_profile_mobile',
      mobile,
    )

    window.localStorage.setItem(
      'cashguard_profile_job_title',
      jobTitle,
    )

    window.localStorage.setItem(
      'cashguard_profile_city',
      city,
    )

    window.localStorage.setItem(
      'cashguard_profile_state',
      stateName,
    )

    setDirty(false)

    setToast(
      'Preferences saved on this browser.',
    )
  }

  const moduleStatus = (
    key: string,
  ) =>
    Boolean(
      serviceHealth?.modules?.[key],
    )

  return (
    <main className="foundation-content dashboard-content space-y-5">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="auth-eyebrow flex items-center gap-2">
            <Settings size={14} />
            WORKSPACE CONFIGURATION
          </p>

          <h2>Settings</h2>

          <p>
            Manage your account preferences and connected workspace information.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {dirty && (
            <span className="text-xs font-semibold text-warning">
              Unsaved changes
            </span>
          )}

          <button
            type="button"
            className="secondary-button"
            onClick={() =>
              void loadSettings(true)
            }
            disabled={
              loading ||
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
            Refresh
          </button>
        </div>
      </header>

      {error && (
        <section className="foundation-card border border-warning/30 p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <strong>
                Settings data could not be loaded
              </strong>

              <p className="mt-1 text-sm text-muted-foreground">
                {error}
              </p>
            </div>

            <button
              type="button"
              className="secondary-button"
              onClick={() =>
                void loadSettings(true)
              }
            >
              Retry
            </button>
          </div>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <section className="foundation-card p-5">
          <div>
            <h3>
              Business profile
            </h3>

            <p className="mt-1 text-sm text-muted-foreground">
              Current values are loaded from your authenticated CashGuard-AI backend profile.
            </p>
          </div>

          {loading ? (
            <div className="mt-6 flex items-center gap-3 text-sm text-muted-foreground">
              <RefreshCw
                size={16}
                className="animate-spin"
              />
              Loading connected profile...
            </div>
          ) : (
            <>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-semibold">
                  Administrator name

                  <input
                    value={name}
                    onChange={(event) => {
                      setName(
                        event.target.value,
                      )
                      setDirty(true)
                    }}
                    className="mt-2 h-10 w-full rounded-lg border border-border bg-background px-3 font-normal"
                  />
                </label>

                <label className="text-sm font-semibold">
                  Business email

                  <input
                    type="email"
                    value={email}
                    onChange={(event) => {
                      setEmail(
                        event.target.value,
                      )
                      setDirty(true)
                    }}
                    className="mt-2 h-10 w-full rounded-lg border border-border bg-background px-3 font-normal"
                  />
                </label>

                <label className="text-sm font-semibold">
                  Mobile

                  <input
                    value={mobile}
                    onChange={(event) => {
                      setMobile(
                        event.target.value,
                      )
                      setDirty(true)
                    }}
                    className="mt-2 h-10 w-full rounded-lg border border-border bg-background px-3 font-normal"
                  />
                </label>

                <label className="text-sm font-semibold">
                  Job title

                  <input
                    value={jobTitle}
                    onChange={(event) => {
                      setJobTitle(
                        event.target.value,
                      )
                      setDirty(true)
                    }}
                    className="mt-2 h-10 w-full rounded-lg border border-border bg-background px-3 font-normal"
                  />
                </label>

                <label className="text-sm font-semibold">
                  City

                  <input
                    value={city}
                    onChange={(event) => {
                      setCity(
                        event.target.value,
                      )
                      setDirty(true)
                    }}
                    className="mt-2 h-10 w-full rounded-lg border border-border bg-background px-3 font-normal"
                  />
                </label>

                <label className="text-sm font-semibold">
                  State

                  <input
                    value={stateName}
                    onChange={(event) => {
                      setStateName(
                        event.target.value,
                      )
                      setDirty(true)
                    }}
                    className="mt-2 h-10 w-full rounded-lg border border-border bg-background px-3 font-normal"
                  />
                </label>

                <label className="text-sm font-semibold sm:col-span-2">
                  Legal business name

                  <input
                    value={business}
                    onChange={(event) => {
                      setBusiness(
                        event.target.value,
                      )
                      setDirty(true)
                    }}
                    className="mt-2 h-10 w-full rounded-lg border border-border bg-background px-3 font-normal"
                  />
                </label>

                <label className="text-sm font-semibold sm:col-span-2">
                  Business ID

                  <input
                    value={businessId}
                    readOnly
                    className="mt-2 h-10 w-full rounded-lg border border-border bg-muted px-3 font-mono text-xs font-normal text-muted-foreground"
                  />
                </label>
              </div>

              <div className="mt-6 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="auth-button compact"
                  onClick={saveLocally}
                  disabled={!dirty}
                >
                  <Check size={15} />
                  Save preferences
                </button>

                <button
                  type="button"
                  className="secondary-button"
                  onClick={() =>
                    void loadSettings(
                      true,
                    )
                  }
                  disabled={
                    loading ||
                    refreshing
                  }
                >
                  Reset from backend
                </button>
              </div>

              <p className="mt-3 text-xs text-muted-foreground">
                Profile reads are live from the FastAPI backend. Browser preferences are stored locally until a profile update endpoint is enabled.
              </p>
            </>
          )}
        </section>

        <div className="space-y-4">
          <section className="foundation-card p-5">
            <ShieldCheck
              className="mb-3 text-success"
              size={20}
            />

            <h3>Security</h3>

            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Manage your account password through the existing authentication flow.
            </p>

            <Link
              href="/forgot-password"
              className="secondary-button mt-4 inline-flex"
            >
              Manage password
            </Link>
          </section>

          <section className="foundation-card p-5">
            <h3>
              Connected services
            </h3>

            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between border-b border-border pb-3 text-sm">
                <span>
                  Banking
                </span>

                <span className="status-pill">
                  {moduleStatus(
                    'banking',
                  )
                    ? 'API ready'
                    : 'Unavailable'}
                </span>
              </div>

              <div className="flex items-center justify-between border-b border-border pb-3 text-sm">
                <span>
                  AI insights
                </span>

                <span className="status-pill">
                  {moduleStatus(
                    'ai_insights',
                  )
                    ? 'Connected'
                    : 'Unavailable'}
                </span>
              </div>

              <div className="flex items-center justify-between border-b border-border pb-3 text-sm">
                <span>
                  Analytics
                </span>

                <span className="status-pill">
                  {moduleStatus(
                    'analytics',
                  )
                    ? 'Connected'
                    : 'Unavailable'}
                </span>
              </div>

              <div className="flex items-center justify-between text-sm">
                <span>
                  Database
                </span>

                <span className="status-pill">
                  {serviceHealth?.database ===
                  'connected'
                    ? 'Connected'
                    : 'Unavailable'}
                </span>
              </div>
            </div>
          </section>

          <section className="foundation-card p-5">
            <h3>
              Workspace shortcuts
            </h3>

            <div className="mt-4 grid gap-2">
              <Link
                href="/analytics"
                className="secondary-button"
              >
                Open Analytics
              </Link>

              <Link
                href="/dashboard/banking"
                className="secondary-button"
              >
                Open Banking
              </Link>

              <Link
                href="/ai-insights"
                className="secondary-button"
              >
                Open AI Insights
              </Link>
            </div>
          </section>
        </div>
      </div>

      {toast && (
        <Toast text={toast} />
      )}
    </main>
  )
}

export function ReceiptDetail({
  id,
}: {
  id: string
}) {
  return (
    <main className="receipt-document">
      <div className="receipt-document-actions">
        <button
          type="button"
          className="secondary-button"
          onClick={() =>
            window.print()
          }
        >
          Print receipt
        </button>

        <button
          type="button"
          className="secondary-button"
          onClick={() =>
            window.history.back()
          }
        >
          Back
        </button>
      </div>

      <article className="receipt-paper">
        <p className="auth-eyebrow">
          CASHGUARD-AI · PAYMENT RECEIPT
        </p>

        <h1>
          Receipt unavailable
        </h1>

        <p className="mt-3">
          Receipt <strong>{id}</strong>{' '}
          will render once the payments API returns the verified receipt record.
        </p>

        <div className="mt-8 rounded-lg border border-dashed border-border p-5 text-sm text-muted-foreground">
          No receipt record has been invented. Connect the backend receipt endpoint to display verified payer, amount, date, reference, and GST details.
        </div>
      </article>
    </main>
  )
}

