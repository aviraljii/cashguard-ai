'use client'

import {
  useEffect,
  useState,
} from 'react'

import type {
  FormEvent,
  ReactNode,
} from 'react'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import {
  AlertCircle,
  ArrowUpRight,
  Bell,
  Building2,
  Check,
  ChevronDown,
  CircleHelp,
  Eye,
  EyeOff,
  FileText,
  LayoutDashboard,
  Menu,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Wallet,
  X,
} from 'lucide-react'

import CashFlowPage from '@/components/cash-flow-page'
import OperationsPage from '@/components/operations-pages'

import {
  BankingPage,
  BankingTransactionPage,
  PaymentsPage,
} from '@/components/banking-payments-pages'

import ReceivablesPayablesPage from '@/components/receivables-payables-pages'
import ProfessionalDashboardPage from '@/components/dashboard-page'
import AlertsPage from '@/components/alerts-page'
import NotificationsPage from '@/components/notifications-page'
import AIInsightsPage from '@/components/ai-insights-page'
import PaisaAgent from '@/components/paisa-agent'
import DataAnalyticsPage from '@/components/data-analytics-page'
import VendorsPage from '@/components/vendors-page'
import CustomersPage from '@/components/customer-page'
import PaymentReceiptsPage from '@/components/payment-receipts-page'
import UserProfilePage from '@/components/user-profile-page'

import {
  HelpPage,
  ReceiptDetail,
  SettingsPage,
} from '@/components/support-pages'

// ============================================================
// API CONFIGURATION
// ============================================================

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL ||
  'http://127.0.0.1:8000'
).replace(/\/+$/, '')

const DEFAULT_BUSINESS_ID =
  process.env.NEXT_PUBLIC_BUSINESS_ID?.trim() || ''

// ============================================================
// AUTH STORAGE KEYS
// ============================================================

const AUTH_TOKEN_KEYS = [
  'cashguard_access_token',
] as const

const LEGACY_AUTH_TOKEN_KEYS = [
  'access_token',
  'accessToken',
  'token',
  'auth_token',
  'jwt_token',
  'jwt',
  'cashguard_token',
] as const

const BUSINESS_ID_KEYS = [
  'business_id',
  'businessId',
  'cashguard_business_id',
] as const

// ============================================================
// AUTH TYPES
// ============================================================

type AuthPayload = {
  access_token?: unknown
  token?: unknown
  expires_in?: unknown

  business_id?: unknown
  businessId?: unknown

  user?: Record<string, unknown> | null

  data?: unknown
  result?: unknown

  [key: string]: unknown
}

type CurrentUserProfile = {
  id?: unknown
  name: string
  email: string
  role: string
  mobile?: string
  job_title?: string
  city?: string
  state?: string
  business_id?: string
}

const DEFAULT_CURRENT_USER: CurrentUserProfile = {
  name: 'User',
  email: '',
  role: 'user',
}

// ============================================================
// AUTH HELPERS
// ============================================================

function cleanToken(
  value: unknown,
): string {
  if (typeof value !== 'string') {
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

function getTokenFromPayload(
  body: unknown,
): string {
  if (
    !body ||
    typeof body !== 'object'
  ) {
    return ''
  }

  const root =
    body as Record<
      string,
      unknown
    >

  const data =
    root.data &&
    typeof root.data === 'object'
      ? root.data as Record<
          string,
          unknown
        >
      : null

  const result =
    root.result &&
    typeof root.result === 'object'
      ? resultRecord(root.result)
      : null

  const candidates = [
    root.access_token,
    root.token,
    data?.access_token,
    data?.token,
    result?.access_token,
    result?.token,
  ]

  for (
    const candidate of candidates
  ) {
    const token =
      cleanToken(
        candidate,
      )

    if (token) {
      return token
    }
  }

  return ''
}

function resultRecord(
  value: unknown,
): Record<string, unknown> | null {
  if (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value)
  ) {
    return value as Record<
      string,
      unknown
    >
  }

  return null
}

function getBusinessIdFromPayload(
  body: unknown,
): string {
  if (
    !body ||
    typeof body !== 'object'
  ) {
    return ''
  }

  const root =
    body as Record<
      string,
      unknown
    >

  const data =
    root.data &&
    typeof root.data === 'object'
      ? root.data as Record<
          string,
          unknown
        >
      : null

  const result =
    root.result &&
    typeof root.result === 'object'
      ? resultRecord(
          root.result,
        )
      : null

  const user =
    root.user &&
    typeof root.user === 'object'
      ? root.user as Record<
          string,
          unknown
        >
      : null

  const dataUser =
    data?.user &&
    typeof data.user === 'object'
      ? data.user as Record<
          string,
          unknown
        >
      : null

  const candidates = [
    root.business_id,
    root.businessId,
    data?.business_id,
    data?.businessId,
    result?.business_id,
    result?.businessId,
    user?.business_id,
    user?.businessId,
    dataUser?.business_id,
    dataUser?.businessId,
  ]

  for (
    const candidate of candidates
  ) {
    if (
      typeof candidate === 'string' &&
      candidate.trim()
    ) {
      return candidate.trim()
    }

    if (
      typeof candidate === 'number'
    ) {
      return String(candidate)
    }
  }

  return ''
}

function getUserFromPayload(
  body: unknown,
): Record<string, unknown> | null {
  if (
    !body ||
    typeof body !== 'object'
  ) {
    return null
  }

  const root =
    body as Record<
      string,
      unknown
    >

  if (
    root.user &&
    typeof root.user === 'object'
  ) {
    return root.user as Record<
      string,
      unknown
    >
  }

  if (
    root.data &&
    typeof root.data === 'object'
  ) {
    const data =
      root.data as Record<
        string,
        unknown
      >

    if (
      data.user &&
      typeof data.user === 'object'
    ) {
      return data.user as Record<
        string,
        unknown
      >
    }

    return data
  }

  return null
}

function clearAuthStorage(): void {
  if (
    typeof window === 'undefined'
  ) {
    return
  }

  for (
    const key of AUTH_TOKEN_KEYS
  ) {
    window.localStorage.removeItem(key)
    window.sessionStorage.removeItem(key)
  }

  for (
    const key of LEGACY_AUTH_TOKEN_KEYS
  ) {
    window.localStorage.removeItem(key)
    window.sessionStorage.removeItem(key)
  }

  for (
    const key of BUSINESS_ID_KEYS
  ) {
    window.localStorage.removeItem(key)
    window.sessionStorage.removeItem(key)
  }

  window.localStorage.removeItem(
    'auth_email',
  )

  window.localStorage.removeItem(
    'auth_logged_in',
  )

  window.localStorage.removeItem(
    'auth_expires_in',
  )

  window.localStorage.removeItem(
    'user_email',
  )

  window.localStorage.removeItem(
    'user_name',
  )

  window.localStorage.removeItem(
    'user_role',
  )
}

function saveAuthSession(
  body: unknown,
  fallbackEmail = '',
): void {
  if (
    typeof window === 'undefined'
  ) {
    throw new Error(
      'Authentication session can only be stored in the browser.',
    )
  }

  const token =
    getTokenFromPayload(
      body,
    )

  if (!token) {
    throw new Error(
      'Login succeeded, but the backend did not return an access token.',
    )
  }

  const normalizedToken =
    cleanToken(
      token,
    )

  for (
    const key of LEGACY_AUTH_TOKEN_KEYS
  ) {
    window.localStorage.removeItem(key)
    window.sessionStorage.removeItem(key)
  }

  for (
    const storage of [
      window.localStorage,
      window.sessionStorage,
    ]
  ) {
    try {
      storage.setItem(
        'cashguard_access_token',
        normalizedToken,
      )
    } catch {
      // Ignore storage failures.
    }
  }

  const payloadBusinessId =
    getBusinessIdFromPayload(
      body,
    )

  const resolvedBusinessId =
    payloadBusinessId ||
    DEFAULT_BUSINESS_ID

  if (resolvedBusinessId) {
    for (
      const storage of [
        window.localStorage,
        window.sessionStorage,
      ]
    ) {
      for (
        const key of BUSINESS_ID_KEYS
      ) {
        try {
          storage.setItem(
            key,
            resolvedBusinessId,
          )
        } catch {
          // Ignore storage failures.
        }
      }
    }
  }

  let expiresIn = ''

  if (
    body &&
    typeof body === 'object'
  ) {
    const root =
      body as Record<
        string,
        unknown
      >

    if (
      root.expires_in !== undefined
    ) {
      expiresIn =
        String(
          root.expires_in,
        )
    }
  }

  if (expiresIn) {
    for (
      const storage of [
        window.localStorage,
        window.sessionStorage,
      ]
    ) {
      try {
        storage.setItem(
          'auth_expires_in',
          expiresIn,
        )
      } catch {
        // Ignore storage failures.
      }
    }
  }

  const user =
    getUserFromPayload(
      body,
    )

  if (user) {
    const email =
      user.email

    const name =
      user.full_name ||
      user.name

    const role =
      user.role

    const userBusinessId =
      user.business_id ||
      user.businessId

    if (
      email !== undefined &&
      email !== null
    ) {
      for (
        const storage of [
          window.localStorage,
          window.sessionStorage,
        ]
      ) {
        try {
          storage.setItem(
            'user_email',
            String(email),
          )
        } catch {
          // Ignore storage failures.
        }
      }
    }

    if (
      name !== undefined &&
      name !== null
    ) {
      for (
        const storage of [
          window.localStorage,
          window.sessionStorage,
        ]
      ) {
        try {
          storage.setItem(
            'user_name',
            String(name),
          )
        } catch {
          // Ignore storage failures.
        }
      }
    }

    if (
      role !== undefined &&
      role !== null
    ) {
      for (
        const storage of [
          window.localStorage,
          window.sessionStorage,
        ]
      ) {
        try {
          storage.setItem(
            'user_role',
            String(role),
          )
        } catch {
          // Ignore storage failures.
        }
      }
    }

    if (
      userBusinessId !== undefined &&
      userBusinessId !== null &&
      String(
        userBusinessId,
      ).trim()
    ) {
      const normalizedBusinessId =
        String(
          userBusinessId,
        ).trim()

      for (
        const storage of [
          window.localStorage,
          window.sessionStorage,
        ]
      ) {
        for (
          const key of BUSINESS_ID_KEYS
        ) {
          try {
            storage.setItem(
              key,
              normalizedBusinessId,
            )
          } catch {
            // Ignore storage failures.
          }
        }
      }
    }
  }

  if (
    fallbackEmail.trim()
  ) {
    const normalizedEmail =
      fallbackEmail
        .trim()
        .toLowerCase()

    for (
      const storage of [
        window.localStorage,
        window.sessionStorage,
      ]
    ) {
      try {
        storage.setItem(
          'auth_email',
          normalizedEmail,
        )
      } catch {
        // Ignore storage failures.
      }
    }
  }

  for (
    const storage of [
      window.localStorage,
      window.sessionStorage,
    ]
  ) {
    try {
      storage.setItem(
        'auth_logged_in',
        'true',
      )
    } catch {
      // Ignore storage failures.
    }
  }

  window.dispatchEvent(
    new Event(
      'auth-changed',
    ),
  )
}

function getStoredToken(): string {
  if (
    typeof window === 'undefined'
  ) {
    return ''
  }

  const storages = [
    window.localStorage,
    window.sessionStorage,
  ]

  for (
    const storage of storages
  ) {
    for (
      const key of AUTH_TOKEN_KEYS
    ) {
      const token =
        cleanToken(
          storage.getItem(
            key,
          ),
        )

      if (token) {
        return token
      }
    }
  }

  return ''
}

function getStoredBusinessId(): string {
  if (
    typeof window === 'undefined'
  ) {
    return DEFAULT_BUSINESS_ID
  }

  const storages = [
    window.localStorage,
    window.sessionStorage,
  ]

  for (
    const storage of storages
  ) {
    for (
      const key of BUSINESS_ID_KEYS
    ) {
      const value =
        storage
          .getItem(key)
          ?.trim()

      if (value) {
        return value
      }
    }
  }

  return DEFAULT_BUSINESS_ID
}

function dispatchAuthChanged(): void {
  if (
    typeof window !== 'undefined'
  ) {
    window.dispatchEvent(
      new Event(
        'auth-changed',
      ),
    )
  }
}

function normalizeUserProfile(
  value: unknown,
): CurrentUserProfile | null {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    return null
  }

  const source =
    value as Record<
      string,
      unknown
    >

  const nameValue =
    source.full_name ||
    source.name ||
    ''

  const emailValue =
    source.email ||
    ''

  const roleValue =
    source.role ||
    'user'

  return {
    id: source.id,
    name:
      String(
        nameValue,
      ).trim() ||
      'User',
    email:
      String(
        emailValue,
      ).trim(),
    role:
      String(
        roleValue,
      ).trim() ||
      'user',
    mobile:
      source.mobile !== undefined &&
      source.mobile !== null
        ? String(
            source.mobile,
          )
        : undefined,
    job_title:
      source.job_title !== undefined &&
      source.job_title !== null
        ? String(
            source.job_title,
          )
        : undefined,
    city:
      source.city !== undefined &&
      source.city !== null
        ? String(
            source.city,
          )
        : undefined,
    state:
      source.state !== undefined &&
      source.state !== null
        ? String(
            source.state,
          )
        : undefined,
    business_id:
      source.business_id !== undefined &&
      source.business_id !== null
        ? String(
            source.business_id,
          )
        : source.businessId !== undefined &&
          source.businessId !== null
          ? String(
              source.businessId,
            )
          : undefined,
  }
}

function getStoredUserProfile(): CurrentUserProfile {
  if (
    typeof window === 'undefined'
  ) {
    return {
      name: 'User',
      email: '',
      role: 'user',
    }
  }

  return {
    name:
      window.localStorage.getItem(
        'user_name',
      )?.trim() ||
      'User',
    email:
      window.localStorage.getItem(
        'user_email',
      )?.trim() ||
      window.localStorage.getItem(
        'auth_email',
      )?.trim() ||
      '',
    role:
      window.localStorage.getItem(
        'user_role',
      )?.trim() ||
      'user',
  }
}

function persistCurrentUserProfile(
  profile: CurrentUserProfile,
): void {
  if (
    typeof window === 'undefined'
  ) {
    return
  }

  const values: Record<
    string,
    string
  > = {
    user_name:
      profile.name,
    user_email:
      profile.email,
    user_role:
      profile.role,
  }

  if (
    profile.business_id
  ) {
    values.business_id =
      profile.business_id
    values.businessId =
      profile.business_id
    values.cashguard_business_id =
      profile.business_id
  }

  for (
    const [
      key,
      value,
    ] of Object.entries(
      values,
    )
  ) {
    try {
      window.localStorage.setItem(
        key,
        value,
      )
    } catch {
      // Ignore storage failures.
    }
  }
}

function getProfileInitials(
  name: string,
  email = '',
): string {
  const normalizedName =
    name.trim()

  if (
    normalizedName
  ) {
    const parts =
      normalizedName
        .split(
          /\\s+/,
        )
        .filter(Boolean)

    if (
      parts.length >= 2
    ) {
      return (
        parts[0][0] +
        parts[
          parts.length - 1
        ][0]
      )
        .toUpperCase()
    }

    if (
      parts[0]?.length >= 2
    ) {
      return parts[0]
        .slice(0, 2)
        .toUpperCase()
    }

    if (
      parts[0]
    ) {
      return parts[0][0]
        .toUpperCase()
    }
  }

  if (
    email.trim()
  ) {
    return email
      .trim()
      .slice(0, 2)
      .toUpperCase()
  }

  return 'CG'
}

function getRoleLabel(
  role: string,
): string {
  const normalized =
    role.trim().toLowerCase()

  const labels: Record<
    string,
    string
  > = {
    admin:
      'Administrator',
    administrator:
      'Administrator',
    owner:
      'Owner',
    super_admin:
      'Super Administrator',
    superadmin:
      'Super Administrator',
    platform_admin:
      'Platform Administrator',
    'platform-admin':
      'Platform Administrator',
    finance_manager:
      'Finance Manager',
    viewer:
      'Viewer',
    user:
      'User',
  }

  return (
    labels[normalized] ||
    (
      normalized
        .replace(
          /[_-]+/g,
          ' ',
        )
        .replace(
          /\\b\\w/g,
          (match) =>
            match.toUpperCase(),
        )
    ) ||
    'User'
  )
}

// ============================================================
// GLOBAL LOGOUT
// ============================================================

async function logoutFromCashGuard(): Promise<void> {
  try {
    await fetch(
      `${API_BASE_URL}/api/auth/logout`,
      {
        method: 'POST',
        headers: {
          Accept:
            'application/json',
          Authorization:
            getStoredToken()
              ? `Bearer ${getStoredToken()}`
              : '',
        },
        credentials: 'include',
        cache: 'no-store',
      },
    )
  } catch {
    // Browser session is cleared even when API logout fails.
  }

  clearAuthStorage()
  dispatchAuthChanged()

  window.location.href =
    '/login'
}

// ============================================================
// NAVIGATION TYPES
// ============================================================

type NavIcon =
  typeof LayoutDashboard

type NavItem = readonly [
  label: string,
  href: string,
  icon: NavIcon,
]

type NavSection = readonly [
  label: string,
  items: readonly NavItem[],
]

// ============================================================
// NAVIGATION
// ============================================================

const sections: readonly NavSection[] = [
  [
    'Workspace',
    [
      [
        'Dashboard',
        '/dashboard',
        LayoutDashboard,
      ],
      [
        'Cash Flow',
        '/cash-flow',
        Wallet,
      ],
      [
        'Banking',
        '/dashboard/banking',
        Wallet,
      ],
      [
        'Payments',
        '/payments',
        Wallet,
      ],
      [
        'Payment Receipts',
        '/payment-receipts',
        FileText,
      ],
      [
        'Reconciliation',
        '/reconciliation',
        ShieldCheck,
      ],
    ],
  ],
  [
    'Intelligence',
    [
      [
        'Risk Intelligence',
        '/risk-intelligence',
        ShieldCheck,
      ],
      [
        'Alerts',
        '/alerts',
        AlertCircle,
      ],
      [
        'Notifications',
        '/notifications',
        Bell,
      ],
      [
        'AI Insights',
        '/ai-insights',
        Sparkles,
      ],
      [
        'Paisa AI',
        '/paisa',
        Sparkles,
      ],
    ],
  ],
  [
    'Manage',
    [
      [
        'Invoices',
        '/invoices',
        FileText,
      ],
      [
        'Customers',
        '/customers',
        Wallet,
      ],
      [
        'Vendors',
        '/vendors',
        Wallet,
      ],
      [
        'Analytics',
        '/analytics',
        Sparkles,
      ],
    ],
  ],
]

// ============================================================
// AUTH ROUTES
// ============================================================

const authCopy: Record<
  string,
  {
    title: string
    subtitle: string
  }
> = {
  '/login': {
    title:
      'Welcome back to CashGuard-AI',
    subtitle:
      'Stay ahead of your cash flow, collections and payments.',
  },

  '/register': {
    title:
      'Create your CashGuard-AI account',
    subtitle:
      'Set up your business finance control centre in minutes.',
  },

  '/forgot-password': {
    title:
      'Reset your CashGuard-AI account password.',
    subtitle:
      'We will send a secure reset link to your business email.',
  },

  '/reset-password': {
    title:
      'Create a new password',
    subtitle:
      'Use a strong password to keep your business account secure.',
  },
}

// ============================================================
// BRAND
// ============================================================

function Brand() {
  return (
    <Link
      href="/login"
      className="foundation-brand"
    >
      <span className="foundation-mark">
        <span />
      </span>

      <span>
        cashguard
        <span>
          -ai
        </span>
      </span>
    </Link>
  )
}

// ============================================================
// AUTH PAGE
// ============================================================

function AuthPage({
  path,
}: {
  path: string
}) {
  const copy =
    authCopy[path]

  const [
    showPassword,
    setShowPassword,
  ] = useState(false)

  const [
    submitted,
    setSubmitted,
  ] = useState(false)

  const [
    loading,
    setLoading,
  ] = useState(false)

  const [
    error,
    setError,
  ] = useState('')

  const isRegister =
    path === '/register'

  const isForgot =
    path === '/forgot-password'

  const isReset =
    path === '/reset-password'

  const submit = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault()

    setError('')

    if (
      isRegister ||
      isForgot ||
      isReset
    ) {
      setSubmitted(true)
      return
    }

    const formData =
      new FormData(
        event.currentTarget,
      )

    const email =
      String(
        formData.get(
          'email',
        ) || '',
      )
        .trim()
        .toLowerCase()

    const password =
      String(
        formData.get(
          'password',
        ) || '',
      )

    if (
      !email ||
      !password
    ) {
      setError(
        'Please enter your business email and password.',
      )

      return
    }

    try {
      setLoading(true)

      clearAuthStorage()

      let response =
        await fetch(
          `${API_BASE_URL}/api/auth/login`,
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json',
              Accept:
                'application/json',
            },
            body: JSON.stringify({
              email,
              password,
            }),
            credentials: 'include',
            cache: 'no-store',
          },
        )

      if (
        response.status ===
        422
      ) {
        const form =
          new URLSearchParams()

        form.set(
          'username',
          email,
        )

        form.set(
          'email',
          email,
        )

        form.set(
          'password',
          password,
        )

        response =
          await fetch(
            `${API_BASE_URL}/api/auth/login`,
            {
              method: 'POST',
              headers: {
                'Content-Type':
                  'application/x-www-form-urlencoded',
                Accept:
                  'application/json',
              },
              body:
                form.toString(),
              credentials:
                'include',
              cache:
                'no-store',
            },
          )
      }

      let body: unknown =
        null

      const rawResponse =
        await response.text()

      if (
        rawResponse.trim()
      ) {
        try {
          body =
            JSON.parse(
              rawResponse,
            )
        } catch {
          body = null
        }
      }

      if (
        !response.ok
      ) {
        let detail =
          `Login failed (${response.status}).`

        if (
          body &&
          typeof body ===
            'object'
        ) {
          const root =
            body as Record<
              string,
              unknown
            >

          const candidate =
            root.detail ||
            root.message ||
            root.error

          if (
            Array.isArray(
              candidate,
            )
          ) {
            detail =
              candidate
                .map(
                  (item) => {
                    if (
                      item &&
                      typeof item ===
                        'object'
                    ) {
                      return String(
                        (
                          item as Record<
                            string,
                            unknown
                          >
                        ).msg ||
                        item,
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
            candidate
          ) {
            detail =
              String(
                candidate,
              )
          }
        } else if (
          rawResponse.trim()
        ) {
          detail =
            rawResponse
        }

        throw new Error(
          detail,
        )
      }

      saveAuthSession(
        body,
        email,
      )

      window.localStorage.setItem(
        'auth_email',
        email,
      )

      window.localStorage.setItem(
        'auth_logged_in',
        'true',
      )

      window.location.href =
        '/dashboard'
    } catch (
      err
    ) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to sign in. Please check the backend and your credentials.',
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-art">
        <Brand />

        <div className="auth-art-content">
          <div className="auth-art-badge">
            <Sparkles size={15} />
            Built for Indian MSMEs
          </div>

          <h1>
            Know your cash.
            <br />
            <span>
              Predict your risk.
            </span>
            <br />
            Pay smarter.
          </h1>

          <p>
            One clear view for
            collections, payments,
            working capital and the
            decisions that keep your
            business moving.
          </p>

          <div className="auth-quote">
            <strong>
              ₹8,50,000
            </strong>

            <span>
              Cash in bank · Shree
              Balaji Electricals
            </span>
          </div>
        </div>

        <p className="auth-art-footer">
          © 2026 CashGuard-AI ·
          Financial operations,
          made clear.
        </p>
      </div>

      <div className="auth-form-wrap">
        <div className="auth-mobile-brand">
          <Brand />
        </div>

        <div className="auth-form-card">
          <div className="auth-heading">
            <p className="auth-eyebrow">
              {isRegister
                ? 'GET STARTED'
                : 'SECURE BUSINESS ACCESS'}
            </p>

            <h2>
              {copy.title}
            </h2>

            <p>
              {copy.subtitle}
            </p>
          </div>

          {submitted ? (
            <div className="auth-success">
              <div className="success-icon">
                ✓
              </div>

              <h3>
                {isForgot
                  ? 'Check your inbox'
                  : 'You are all set'}
              </h3>

              <p>
                {isForgot
                  ? 'If an account exists for this email, you will receive reset instructions shortly.'
                  : 'Your request has been captured.'}
              </p>

              <Link
                href="/login"
                className="auth-button"
              >
                Back to login
              </Link>
            </div>
          ) : (
            <form
              onSubmit={submit}
              className="auth-form"
            >
              {isRegister && (
                <>
                  <label>
                    Full name

                    <input
                      name="full_name"
                      required
                      placeholder="e.g. Ankit Mehta"
                    />
                  </label>

                  <label>
                    Business name

                    <input
                      name="business_name"
                      required
                      placeholder="e.g. Shree Balaji Electricals"
                    />
                  </label>

                  <div className="form-row">
                    <label>
                      Mobile number

                      <input
                        name="phone"
                        required
                        placeholder="+91 98765 43210"
                      />
                    </label>

                    <label>
                      Business type

                      <select
                        name="business_type"
                        defaultValue=""
                      >
                        <option
                          value=""
                          disabled
                        >
                          Select type
                        </option>

                        <option>
                          Retail
                        </option>

                        <option>
                          Wholesale
                        </option>

                        <option>
                          Manufacturing
                        </option>

                        <option>
                          Services
                        </option>

                        <option>
                          Trading
                        </option>
                      </select>
                    </label>
                  </div>
                </>
              )}

              {!isReset && (
                <label>
                  Business email

                  <input
                    name="email"
                    type="email"
                    required
                    placeholder="you@company.in"
                  />
                </label>
              )}

              {!isForgot && (
                <label>
                  {isReset
                    ? 'New password'
                    : 'Password'}

                  <span className="password-field">
                    <input
                      name="password"
                      required
                      type={
                        showPassword
                          ? 'text'
                          : 'password'
                      }
                      placeholder="At least 8 characters"
                      minLength={8}
                    />

                    <button
                      type="button"
                      onClick={() =>
                        setShowPassword(
                          !showPassword,
                        )
                      }
                      aria-label="Toggle password visibility"
                    >
                      {showPassword ? (
                        <EyeOff size={16} />
                      ) : (
                        <Eye size={16} />
                      )}
                    </button>
                  </span>
                </label>
              )}

              {(isRegister ||
                isReset) && (
                <label>
                  Confirm password

                  <input
                    name="confirm_password"
                    required
                    type="password"
                    placeholder="Re-enter your password"
                    minLength={8}
                  />
                </label>
              )}

              {error && (
                <p className="form-error">
                  {error}
                </p>
              )}

              {path === '/login' && (
                <div className="form-options">
                  <label className="check-label">
                    <input
                      type="checkbox"
                    />
                    Remember this device
                  </label>

                  <Link href="/forgot-password">
                    Forgot password?
                  </Link>
                </div>
              )}

              <button
                className="auth-button"
                type="submit"
                disabled={loading}
              >
                {loading
                  ? 'Signing in...'
                  : isRegister
                    ? 'Create account'
                    : isForgot
                      ? 'Send reset link'
                      : isReset
                        ? 'Update password'
                        : 'Sign in'}

                {!loading && (
                  <span>
                    →
                  </span>
                )}
              </button>

              <p className="auth-disclaimer">
                By continuing, you
                agree to
                CashGuard-AI&apos;s
                Terms and Privacy
                Policy.
              </p>
            </form>
          )}

          {!isReset && (
            <p className="auth-switch">
              {isRegister
                ? 'Already have an account?'
                : 'New to CashGuard-AI?'}

              {' '}

              <Link
                href={
                  isRegister
                    ? '/login'
                    : '/register'
                }
              >
                {isRegister
                  ? 'Sign in'
                  : 'Create an account'}
              </Link>
            </p>
          )}
        </div>
      </div>
    </main>
  )
}

// ============================================================
// SHELL
// ============================================================

function Shell({
  children,
}: {
  children: ReactNode
}) {
  const pathname =
    usePathname()

  const [
    open,
    setOpen,
  ] = useState(false)

  const [
    currentUser,
    setCurrentUser,
  ] = useState<CurrentUserProfile>(
    () => ({
      ...DEFAULT_CURRENT_USER,
    }),
  )

  const currentUserInitials =
    getProfileInitials(
      currentUser.name,
      currentUser.email,
    )

  const currentUserRole =
    getRoleLabel(
      currentUser.role,
    )

  useEffect(
    () => {
      let cancelled = false

      const storedProfile =
        getStoredUserProfile()

      if (
        storedProfile.name !== DEFAULT_CURRENT_USER.name ||
        storedProfile.email ||
        storedProfile.role !== DEFAULT_CURRENT_USER.role
      ) {
        setCurrentUser(storedProfile)
      }

      const loadCurrentUser =
        async () => {
          const token =
            getStoredToken()

          if (!token) {
            if (!cancelled) {
              setCurrentUser({
                ...DEFAULT_CURRENT_USER,
              })
            }
            return
          }

          try {
            const response =
              await fetch(
                `${API_BASE_URL}/api/auth/me`,
                {
                  method: 'GET',
                  headers: {
                    Accept: 'application/json',
                    Authorization: `Bearer ${token}`,
                  },
                  credentials: 'include',
                  cache: 'no-store',
                },
              )

            if (response.status === 401) {
              clearAuthStorage()

              if (!cancelled) {
                setCurrentUser({
                  ...DEFAULT_CURRENT_USER,
                })
              }

              return
            }

            if (response.status === 403 || !response.ok) {
              return
            }

            const body =
              (await response.json()) as unknown

            const payloadUser =
              getUserFromPayload(body)

            const profile =
              normalizeUserProfile(
                payloadUser || body,
              )

            if (profile && !cancelled) {
              setCurrentUser(profile)
              persistCurrentUserProfile(profile)
            }
          } catch {
            // Keep the locally stored session profile as fallback.
          }
        }

      void loadCurrentUser()

      const handleAuthChanged =
        () => {
          void loadCurrentUser()
        }

      const handleAuthExpired =
        () => {
          if (cancelled) {
            return
          }

          clearAuthStorage()
          setCurrentUser({
            ...DEFAULT_CURRENT_USER,
          })

          if (window.location.pathname !== '/login') {
            window.location.href = '/login'
          }
        }

      window.addEventListener(
        'auth-changed',
        handleAuthChanged,
      )

      window.addEventListener(
        'cashguard-auth-expired',
        handleAuthExpired,
      )

      window.addEventListener(
        'cashguard-auth-required',
        handleAuthExpired,
      )

      return () => {
        cancelled = true

        window.removeEventListener(
          'auth-changed',
          handleAuthChanged,
        )

        window.removeEventListener(
          'cashguard-auth-expired',
          handleAuthExpired,
        )

        window.removeEventListener(
          'cashguard-auth-required',
          handleAuthExpired,
        )
      }
    },
    [],
  )

  useEffect(
    () => {
      setOpen(false)
    },
    [
      pathname,
    ],
  )

  return (
    <div className="foundation-shell">
      <aside
        className={`foundation-sidebar ${
          open ? 'open' : ''
        }`}
      >
        <div className="sidebar-top">
          <Brand />

          <button
            onClick={() =>
              setOpen(false)
            }
            className="sidebar-close"
            aria-label="Close navigation"
          >
            <X size={18} />
          </button>
        </div>

        <p className="nav-label">
          MAIN MENU
        </p>

        <nav>
          {sections
            .flatMap(
              ([, items]) =>
                items,
            )
            .map(
              ([
                label,
                href,
                Icon,
              ]) => (
                <Link
                  key={href}
                  href={href}
                  className={`foundation-nav-link ${
                    pathname ===
                    href
                      ? 'active'
                      : ''
                  }`}
                >
                  <Icon size={17} />

                  <span>
                    {label}
                  </span>

                </Link>
              ),
            )}
        </nav>

        <div className="sidebar-footer">
          <Link href="/help">
            <CircleHelp size={17} />
            Help centre
          </Link>

          <Link href="/settings">
            <Settings size={17} />
            Settings
          </Link>

          <Link
            href="/profile"
            className="profile-mini profile-mini-button"
            aria-label="Open user profile"
          >
            <span>
              {currentUserInitials}
            </span>

            <div>
              <strong>
                {currentUser.name}
              </strong>

              <small>
                {currentUserRole}
              </small>
            </div>

            <ChevronDown size={15} />
          </Link>
        </div>
      </aside>

      <div className="foundation-main">
        <header className="foundation-header">
          <button
            className="mobile-menu"
            onClick={() =>
              setOpen(true)
            }
            aria-label="Open navigation"
          >
            <Menu size={20} />
          </button>

          <div>
            <p className="crumb">
              Workspace /
              <strong>
                Foundation
              </strong>
            </p>

            <h1>
              Application foundation
            </h1>
          </div>

          <div className="header-tools">
            <Link
              href="/notifications"
              className="notification-button"
              aria-label="Open notifications"
              title="Notifications"
            >
              <Bell size={18} />
            </Link>

            <Link
              href="/profile"
              className="header-profile"
              aria-label="Open user profile"
              title={currentUser.name}
            >
              {currentUserInitials}
            </Link>
          </div>
        </header>

        {children}
      </div>
    </div>
  )
}

// ============================================================
// DASHBOARD SUPPORT COMPONENTS
// ============================================================

function Money({
  children,
}: {
  children: ReactNode
}) {
  return (
    <strong className="money">
      {children}
    </strong>
  )
}

function DashboardPage() {
  const priorities = [
    [
      'Follow up on overdue customer collections',
      '₹1,75,000 overdue',
      'View receivables',
      'amber',
    ],
    [
      'Vendor payment due soon',
      'ABC Electrical Suppliers · ₹2,40,000 due in 7 days',
      'Review payment',
      'blue',
    ],
    [
      'High-risk payment requires review',
      'Risk score: 78',
      'Review risk',
      'red',
    ],
    [
      'GST payment upcoming',
      '₹1,80,000 · Due 27 Aug 2026',
      'View obligation',
      'amber',
    ],
  ]

  const receivables = [
    [
      'Current',
      '₹10,55,000',
      72,
    ],
    [
      '1–30 days overdue',
      '₹2,40,000',
      16,
    ],
    [
      '31–60 days overdue',
      '₹1,30,000',
      9,
    ],
    [
      '60+ days overdue',
      '₹50,000',
      3,
    ],
  ]

  const payables = [
    [
      'Due now',
      '₹1,40,000',
      15,
    ],
    [
      'Due in 7 days',
      '₹3,10,000',
      34,
    ],
    [
      'Due in 30 days',
      '₹4,70,000',
      51,
    ],
  ]

  return (
    <main className="foundation-content dashboard-content">
      <div className="dashboard-heading">
        <div>
          <p className="auth-eyebrow">
            WEDNESDAY, 19 AUG 2026 · IST
          </p>

          <h2>
            Good evening, Alex
          </h2>

          <p>
            Here&apos;s your business
            cash position and the
            actions that matter today.
          </p>
        </div>

        <div className="dashboard-actions">
          <button className="business-selector">
            <Building2 size={15} />

            <span>
              Shree Balaji
              Electricals Pvt. Ltd.

              <small>
                Electrical Distributor
                · MSME
              </small>
            </span>

            <ChevronDown size={15} />
          </button>

          <Link
            href="/dashboard/banking"
            className="secondary-button"
          >
            Connect Bank
          </Link>

          <Link
            href="/cash-flow"
            className="auth-button compact"
          >
            View Cash Flow
          </Link>
        </div>
      </div>

      <div className="dashboard-kpis">
        <Kpi
          title="Cash in Bank"
          value="₹8,50,000"
          sub="Across 2 connected accounts"
          trend="+8.4% vs last month"
          tone="green"
        />

        <Kpi
          title="Customer Receivables"
          value="₹14,75,000"
          sub="₹4,20,000 overdue"
          trend="Collections need focus"
          tone="amber"
        />

        <Kpi
          title="Vendor Payables"
          value="₹9,20,000"
          sub="₹3,10,000 due within 7 days"
          trend="Upcoming obligations"
          tone="blue"
        />

        <Kpi
          title="Upcoming Obligations"
          value="₹6,05,000"
          sub="Salaries · GST · EMI · Vendors"
          trend="Next 14 days"
          tone="amber"
        />

        <Kpi
          title="Net Working Capital"
          value="₹14,05,000"
          sub="Receivables less payables"
          trend="Healthy buffer"
          tone="green"
        />

        <Kpi
          title="Cash Shortfall Risk"
          value="MEDIUM"
          sub="Potential pressure in next 14 days"
          trend="Monitor closely"
          tone="amber"
        />
      </div>

      <div className="dashboard-main-grid">
        <section className="foundation-card dashboard-chart-card">
          <div className="panel-heading">
            <div>
              <h3>
                Cash Position
              </h3>

              <p>
                Bank balance,
                collections and
                scheduled payments
              </p>
            </div>

            <div className="chart-tabs">
              <button>
                7 Days
              </button>

              <button className="active">
                30 Days
              </button>

              <button>
                90 Days
              </button>
            </div>
          </div>

          <div className="cash-chart">
            <div className="axis-labels">
              <span>
                ₹10L
              </span>

              <span>
                ₹7.5L
              </span>

              <span>
                ₹5L
              </span>

              <span>
                ₹2.5L
              </span>

              <span>
                ₹0
              </span>
            </div>

            <div className="chart-lines">
              <div className="chart-line l1" />
              <div className="chart-line l2" />
              <div className="chart-line l3" />

              <svg
                viewBox="0 0 720 220"
                preserveAspectRatio="none"
                aria-label="Cash position trend"
              >
                <path
                  className="chart-area"
                  d="M0,152 C65,145 76,121 130,127 S190,145 240,117 S305,135 355,92 S430,98 480,77 S545,92 600,55 S650,66 720,32 L720,220 L0,220Z"
                />

                <path
                  className="chart-stroke"
                  d="M0,152 C65,145 76,121 130,127 S190,145 240,117 S305,135 355,92 S430,98 480,77 S545,92 600,55 S650,66 720,32"
                />
              </svg>

              <div className="chart-dates">
                <span>
                  01 Aug
                </span>

                <span>
                  08 Aug
                </span>

                <span>
                  15 Aug
                </span>

                <span>
                  19 Aug
                </span>
              </div>
            </div>
          </div>

          <div className="chart-legend">
            <span>
              <i className="legend-dot sky" />
              Current cash
            </span>

            <span>
              <i className="legend-dot green" />
              Expected collections
            </span>

            <span>
              <i className="legend-dot amber" />
              Upcoming payments
            </span>
          </div>
        </section>

        <aside className="foundation-card warning-card">
          <div className="warning-icon">
            <AlertCircle size={18} />
          </div>

          <p className="auth-eyebrow">
            CASHGUARD WATCH
          </p>

          <h3>
            Cash pressure may increase
            in the next 14 days
          </h3>

          <p>
            ₹6.05 lakh of obligations
            are expected before
            projected customer
            collections of ₹4.80 lakh.
          </p>

          <div className="warning-stat">
            <span>
              Projected gap
            </span>

            <Money>
              ₹1,25,000
            </Money>
          </div>

          <div className="card-actions">
            <button>
              View obligations
            </button>

            <button>
              View collections
            </button>
          </div>
        </aside>
      </div>

      <div className="dashboard-section">
        <div className="section-heading">
          <div>
            <p className="auth-eyebrow">
              ACTION CENTRE
            </p>

            <h3>
              Today&apos;s priorities
            </h3>
          </div>

          <Link
            href="/alerts"
            className="text-link"
          >
            View all actions
          </Link>
        </div>

        <div className="priority-grid">
          {priorities.map(
            ([
              title,
              sub,
              action,
              tone,
            ]) => (
              <div
                className="priority-card"
                key={title}
              >
                <div
                  className={`priority-icon ${tone}`}
                >
                  <Check size={15} />
                </div>

                <div>
                  <h4>
                    {title}
                  </h4>

                  <p>
                    {sub}
                  </p>

                  <button>
                    {action}

                    <ArrowUpRight
                      size={13}
                    />
                  </button>
                </div>
              </div>
            ),
          )}
        </div>
      </div>

      <div className="dashboard-two-col">
        <Compare
          title="Customer Receivables"
          total="₹14,75,000"
          rows={receivables}
        />

        <Compare
          title="Vendor Payables"
          total="₹9,20,000"
          rows={payables}
        />
      </div>

      <div className="dashboard-two-col">
        <section className="foundation-card table-card">
          <div className="panel-heading">
            <div>
              <h3>
                Payment Risk Overview
              </h3>

              <p>
                Payments requiring the
                right level of attention
              </p>
            </div>

            <Link
              href="/risk-intelligence"
              className="text-link"
            >
              View Risk Intelligence
            </Link>
          </div>

          <div className="risk-summary">
            <RiskStat
              label="LOW"
              value="42"
              tone="low"
            />

            <RiskStat
              label="MEDIUM"
              value="18"
              tone="medium"
            />

            <RiskStat
              label="HIGH"
              value="6"
              tone="high"
            />

            <RiskStat
              label="CRITICAL"
              value="2"
              tone="critical"
            />
          </div>

          <div className="risk-spark">
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
        </section>

        <section className="foundation-card table-card">
          <div className="panel-heading">
            <div>
              <h3>
                Bank Account Summary
              </h3>

              <p>
                Last synced with
                connected accounts
              </p>
            </div>

            <Link
              href="/banking"
              className="text-link"
            >
              View Banking
            </Link>
          </div>

          <BankAccount
            name="HDFC Bank"
            number="•••• 4821"
            amount="₹5,25,000"
            synced="8 mins ago"
          />

          <BankAccount
            name="ICICI Bank"
            number="•••• 7142"
            amount="₹3,25,000"
            synced="12 mins ago"
          />
        </section>
      </div>

      <section className="foundation-card table-card wide-table">
        <div className="panel-heading">
          <div>
            <h3>
              Recent Payments
            </h3>

            <p>
              Latest payment activity
              across your business
            </p>
          </div>

          <Link
            href="/payments"
            className="text-link"
          >
            View payments
          </Link>
        </div>

        <div className="data-table">
          <div className="table-row table-head">
            <span>
              Payment
            </span>

            <span>
              Customer
            </span>

            <span>
              Amount
            </span>

            <span>
              Method
            </span>

            <span>
              Status
            </span>

            <span>
              Risk
            </span>
          </div>

          {[
            [
              'Sharma Traders',
              '₹85,000',
              'UPI',
              'Completed',
              'Low',
              'low',
            ],
            [
              'Mehta Electricals',
              '₹2,40,000',
              'NEFT',
              'Processing',
              'Medium',
              'medium',
            ],
            [
              'Rajput Enterprises',
              '₹1,75,000',
              'Bank Transfer',
              'Failed',
              'High',
              'high',
            ],
          ].map(
            ([
              customer,
              amount,
              method,
              status,
              risk,
              tone,
            ]) => (
              <div
                className="table-row"
                key={String(customer)}
              >
                <span>
                  Payment
                </span>

                <span>
                  {customer}
                </span>

                <Money>
                  {amount}
                </Money>

                <span>
                  {method}
                </span>

                <span
                  className={`status-pill ${tone}`}
                >
                  {status}
                </span>

                <span
                  className={`badge ${tone}`}
                >
                  {risk}
                </span>
              </div>
            ),
          )}
        </div>
      </section>

      <div className="dashboard-two-col">
        <section className="foundation-card table-card">
          <div className="panel-heading">
            <div>
              <h3>
                Overdue Invoices
              </h3>

              <p>
                Prioritise collections
                to protect working capital
              </p>
            </div>

            <Link
              href="/invoices"
              className="text-link"
            >
              View invoices
            </Link>
          </div>

          <div className="invoice-list">
            <Invoice
              customer="Sharma Traders"
              invoice="INV-2026-1042"
              amount="₹1,25,000"
              days="14 days"
              tone="high"
            />

            <Invoice
              customer="Rajasthan Hardware"
              invoice="INV-2026-1088"
              amount="₹85,000"
              days="8 days"
              tone="medium"
            />
          </div>
        </section>

        <section className="foundation-card table-card">
          <div className="panel-heading">
            <div>
              <h3>
                Recent Activity
              </h3>

              <p>
                Your latest finance
                team signals
              </p>
            </div>
          </div>

          <div className="activity-feed">
            <ActivityItem
              title="Payment completed"
              sub="₹1,00,000 received from Sharma Traders"
            />

            <ActivityItem
              title="Risk analysis updated"
              sub="Payment risk score changed to 72"
            />

            <ActivityItem
              title="Invoice overdue"
              sub="INV-2026-1042 is now 14 days overdue"
            />

            <ActivityItem
              title="Bank account synced"
              sub="HDFC Bank synced successfully"
            />
          </div>
        </section>
      </div>

      <section className="ai-dashboard-panel">
        <div>
          <p className="auth-eyebrow">
            AI-GENERATED INSIGHTS ·
            BACKEND-READY
          </p>

          <h3>
            CashGuard AI Insights
          </h3>

          <p>
            Business intelligence based
            on your cash flow, collections
            and payment activity.
          </p>
        </div>

        <div className="insight-grid">
          <Insight
            title="Collection opportunity"
            body="₹2.40 lakh of receivables are overdue by more than 7 days."
            action="Review collections"
          />

          <Insight
            title="Cash-flow warning"
            body="Projected obligations exceed expected collections over the next 14 days."
            action="View forecast"
          />

          <Insight
            title="Payment risk"
            body="Two recent transactions show elevated risk signals."
            action="Review risk"
          />
        </div>
      </section>
    </main>
  )
}

// ============================================================
// DASHBOARD COMPONENTS
// ============================================================

function Kpi({
  title,
  value,
  sub,
  trend,
  tone,
}: {
  title: string
  value: string
  sub: string
  trend: string
  tone: string
}) {
  return (
    <div className="foundation-card kpi-card">
      <div>
        <span className="kpi-label">
          {title}
        </span>

        <span
          className={`kpi-status ${tone}`}
        />
      </div>

      <Money>
        {value}
      </Money>

      <p>
        {sub}
      </p>

      <small
        className={
          tone === 'green'
            ? 'positive-text'
            : tone === 'amber'
              ? 'warning-text'
              : ''
        }
      >
        {trend}
      </small>
    </div>
  )
}

function Compare({
  title,
  total,
  rows,
}: {
  title: string
  total: string
  rows: (
    string | number
  )[][]
}) {
  return (
    <section className="foundation-card compare-card">
      <div className="panel-heading">
        <div>
          <h3>
            {title}
          </h3>

          <p>
            Total outstanding
          </p>
        </div>

        <Money>
          {total}
        </Money>
      </div>

      {rows.map(
        ([
          label,
          amount,
          width,
        ]) => (
          <div
            className="compare-row"
            key={String(label)}
          >
            <div>
              <span>
                {label}
              </span>

              <b>
                {amount}
              </b>
            </div>

            <div className="compare-track">
              <i
                style={{
                  width:
                    `${width}%`,
                }}
              />
            </div>
          </div>
        ),
      )}
    </section>
  )
}

function RiskStat({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: string
}) {
  return (
    <div>
      <span
        className={`risk-bullet ${tone}`}
      />

      <small>
        {label}
      </small>

      <strong>
        {value}
      </strong>
    </div>
  )
}

function BankAccount({
  name,
  number,
  amount,
  synced,
}: {
  name: string
  number: string
  amount: string
  synced: string
}) {
  return (
    <div className="bank-row">
      <div className="bank-icon">
        <Building2 size={16} />
      </div>

      <div>
        <strong>
          {name}
        </strong>

        <span>
          {number} · Synced {synced}
        </span>
      </div>

      <Money>
        {amount}
      </Money>
    </div>
  )
}

function Invoice({
  customer,
  invoice,
  amount,
  days,
  tone,
}: {
  customer: string
  invoice: string
  amount: string
  days: string
  tone: string
}) {
  return (
    <div className="invoice-row">
      <div className="avatar blue-avatar">
        {customer[0]}
      </div>

      <div>
        <strong>
          {customer}
        </strong>

        <span>
          {invoice} · {amount}
        </span>
      </div>

      <span
        className={`badge ${tone}`}
      >
        {days}
      </span>

      <button>
        <ArrowUpRight size={14} />
      </button>
    </div>
  )
}

function ActivityItem({
  title,
  sub,
}: {
  title: string
  sub: string
}) {
  return (
    <div className="activity-item">
      <span />

      <div>
        <strong>
          {title}
        </strong>

        <p>
          {sub}
        </p>

        <small>
          Today · IST
        </small>
      </div>
    </div>
  )
}

function Insight({
  title,
  body,
  action,
}: {
  title: string
  body: string
  action: string
}) {
  return (
    <div className="insight-card">
      <span>
        <Sparkles size={14} />
        AI insight
      </span>

      <h4>
        {title}
      </h4>

      <p>
        {body}
      </p>

      <button>
        {action}

        <ArrowUpRight size={13} />
      </button>
    </div>
  )
}

// ============================================================
// FOUNDATION HOME
// ============================================================

function FoundationHome() {
  return (
    <main className="foundation-content">
      <div className="foundation-intro">
        <div>
          <p className="auth-eyebrow">
            CASHGUARD-AI FOUNDATION
          </p>

          <h2>
            Your financial control
            centre starts here.
          </h2>

          <p>
            Connect your business
            systems to understand
            cash in bank, collections,
            vendor dues and upcoming
            obligations in one place.
          </p>
        </div>

        <Link
          href="/dashboard/banking"
          className="auth-button compact"
        >
          <Sparkles size={16} />
          Start onboarding
        </Link>
      </div>

      <div className="foundation-grid">
        <section className="foundation-card">
          <div className="card-icon sky">
            <Wallet size={20} />
          </div>

          <h3>
            Business context ready
          </h3>

          <p>
            INR formatting, Indian
            states, GSTIN and
            Asia/Kolkata time are
            prepared for your
            onboarding flow.
          </p>

          <span className="status-pill ready">
            Ready to connect
          </span>
        </section>

        <section className="foundation-card">
          <div className="card-icon green">
            <ShieldCheck size={20} />
          </div>

          <h3>
            Secure by design
          </h3>

          <p>
            Authentication screens
            and a typed API boundary
            are ready for JWT sessions
            with your FastAPI backend.
          </p>

          <span className="status-pill">
            Backend-ready
          </span>
        </section>

        <section className="foundation-card">
          <div className="card-icon amber">
            <Sparkles size={20} />
          </div>

          <h3>
            AI-ready workspace
          </h3>

          <p>
            Risk badges,
            recommendation cards and
            unavailable states can
            plug into your ML and
            GenAI responses.
          </p>

          <span className="status-pill">
            ML-ready
          </span>
        </section>
      </div>

      <section className="empty-foundation">
        <div className="empty-illustration">
          <Search size={24} />
        </div>

        <h3>
          No bank accounts connected yet.
        </h3>

        <p>
          Connect your business bank
          account to start monitoring
          cash flow and transactions.
        </p>

        <Link
          href="/dashboard/banking"
          className="secondary-button"
        >
          Connect a bank account
        </Link>
      </section>
    </main>
  )
}

// ============================================================
// OPERATION ROUTES
// ============================================================

type OperationPage =
  | 'banking'
  | 'payments'
  | 'reconciliation'
  | 'risk'
  | 'notifications'
  | 'ai-insights'
  | 'analytics'
  | 'settings'
  | 'help'

// IMPORTANT:
// /alerts has intentionally been removed from this generic
// OperationsPage mapping.
//
// This prevents:
//     /alerts -> OperationsPage
//
// and allows:
//
//     /alerts -> AlertsPage
// ============================================================

const operationRoutes: Record<
  string,
  OperationPage
> = {
  '/banking':
    'banking',

  '/payments':
    'payments',

  '/reconciliation':
    'reconciliation',

  '/risk':
    'risk',

  '/risk-intelligence':
    'risk',

  '/notifications':
    'notifications',

  '/ai-insights':
    'ai-insights',

  '/analytics':
    'analytics',

  '/settings':
    'settings',

  '/help':
    'help',
}

const relationshipRoutes: Record<
  string,
  'invoices' | 'vendors'
> = {
  '/invoices':
    'invoices',

  '/vendors':
    'vendors',
}

// ============================================================
// FOUNDATION APP
// ============================================================

export function FoundationApp() {
  const pathname =
    usePathname()

  // ----------------------------------------------------------
  // Authentication pages
  // ----------------------------------------------------------

  if (
    authCopy[pathname]
  ) {
    return (
      <AuthPage
        path={pathname}
      />
    )
  }

  // ----------------------------------------------------------
  // Payment receipts
  // ----------------------------------------------------------

  if (
    pathname ===
    '/payment-receipts'
  ) {
    return (
      <PaymentReceiptsPage />
    )
  }

  // ----------------------------------------------------------
  // Individual receipt detail
  // ----------------------------------------------------------

  if (
    pathname.startsWith(
      '/payment-receipts/',
    )
  ) {
    return (
      <ReceiptDetail
        id={
          pathname
            .split('/')
            .pop() ||
          'unknown'
        }
      />
    )
  }

  // ----------------------------------------------------------
  // Route resolution
  // ----------------------------------------------------------

  const operation =
    operationRoutes[pathname]

  const relationship =
    relationshipRoutes[pathname]

  return (
    <Shell>
      {pathname === '/' ? (
        <ProfessionalDashboardPage />

      ) : pathname ===
        '/profile' ? (
        <UserProfilePage />

      ) : pathname ===
        '/userpanel' ? (
        <FoundationHome />

      ) : pathname ===
        '/dashboard' ? (
        <ProfessionalDashboardPage />

      ) : pathname ===
        '/cash-flow' ? (
        <CashFlowPage />

      ) : pathname ===
        '/dashboard/banking' ? (
        <BankingTransactionPage />

      ) : pathname ===
        '/customers' ? (
        <CustomersPage />

      ) : pathname ===
        '/analytics' ? (
        <DataAnalyticsPage />

      ) : pathname ===
        '/ai-insights' ? (
        <AIInsightsPage />

      ) : pathname ===
        '/paisa' ? (
        <PaisaAgent />

      ) : pathname ===
        '/alerts' ? (
        /*
         * IMPORTANT:
         *
         * Alerts gets its own dedicated page.
         * It is NOT rendered through OperationsPage.
         */
        <AlertsPage />

      ) : pathname ===
        '/notifications' ? (
        <NotificationsPage />

      ) : pathname ===
        '/banking' ? (
        <BankingPage />

      ) : pathname ===
        '/payments' ? (
        <PaymentsPage />

      ) : pathname ===
        '/vendors' ? (
        <VendorsPage />

      ) : pathname ===
        '/help' ? (
        <HelpPage />

      ) : pathname ===
        '/settings' ? (
        <SettingsPage />

      ) : relationship ? (
        <ReceivablesPayablesPage
          module={
            relationship
          }
        />

      ) : operation ? (
        <OperationsPage
          page={operation}
        />

      ) : (
        <FoundationHome />
      )}
    </Shell>
  )
}
