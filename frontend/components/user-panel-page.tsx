'use client'

import type { ReactNode } from 'react'

import {
  Bell,
  Bot,
  Check,
  ChevronDown,
  ChevronUp,
  CircleHelp,
  Database,
  Download,
  Eye,
  EyeOff,
  FileText,
  Link2,
  LockKeyhole,
  LogOut,
  Mail,
  MonitorSmartphone,
  RefreshCw,
  Save,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  UserPlus,
  UserRound,
  Users,
  Wifi,
  X,
  Zap,
} from 'lucide-react'

import Link from 'next/link'

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'

/* ============================================================================
   TYPES
============================================================================ */

export type UserRole =
  | 'Administrator'
  | 'Finance Manager'
  | 'Viewer'
  | string

export type AccessLevel =
  | 'Full Access'
  | 'View Only'
  | 'Restricted'

export type Permission = {
  label: string
  access: AccessLevel
}

export type UserProfile = {
  id: string
  fullName: string
  email: string
  mobile: string
  jobTitle: string
  city: string
  state: string
  role: UserRole
  memberSince: string
  status: string
}

export type BusinessProfile = {
  id: string
  legalName: string
  type: string
  gstin: string
  email: string
  phone: string
  city: string
  state: string
  address: string
  verification: string
}

export type Session = {
  id: string
  device: string
  browser: string
  location: string
  lastActive: string
  current: boolean
}

export type ConnectedService = {
  id: string
  name: string
  description: string
  status:
    | 'Connected'
    | 'Pending'
    | 'Not Connected'
    | 'Unavailable'
  synced: string
}

export type UserActivity = {
  id: string
  label: string
  date: string
  tone: string
}

export type TeamMember = {
  id: string
  name: string
  email: string
  role: UserRole
  status: 'Active' | 'Pending' | 'Suspended'
}

export type AISettings = {
  enabled: boolean
  assistantEnabled: boolean
  insightsEnabled: boolean
  riskMonitoring: boolean
  cashFlowForecasting: boolean
  paymentDelayPrediction: boolean
  anomalyDetection: boolean
  aiNotifications: boolean
  learningMode: boolean
  insightFrequency:
    | 'Real-time'
    | 'Daily'
    | 'Weekly'
  permission:
    | 'Full AI Access'
    | 'Insights Only'
    | 'Restricted'
}

export type UserPreferences = {
  currency: string
  timezone: string
  dateFormat: string
  landingPage: string
  compactMode: boolean
}

export type NotificationPreferences = {
  payments: boolean
  invoices: boolean
  cash: boolean
  risk: boolean
  ai: boolean
  system: boolean
}

/* ============================================================================
   API
============================================================================ */

const API_URL = (
  process.env.NEXT_PUBLIC_API_URL ||
  'http://127.0.0.1:8000'
).replace(/\/+$/, '')

const API_ENDPOINTS = {
  me: '/api/auth/me',
  updateProfile: '/api/auth/me',

  business: '/api/businesses/me',
  updateBusiness: '/api/businesses/me',

  changePassword:
    '/api/auth/change-password',

  logout:
    '/api/auth/logout',

  sessions:
    '/api/auth/sessions',

  preferences:
    '/api/auth/preferences',

  notifications:
    '/api/auth/notifications',

  services:
    '/api/auth/services',

  activity:
    '/api/auth/activity',

  team:
    '/api/auth/team',

  aiSettings:
    '/api/auth/ai-settings',

  exportData:
    '/api/auth/export',
}

/* ============================================================================
   DEFAULTS
============================================================================ */

const EMPTY_USER: UserProfile = {
  id: '',
  fullName: '',
  email: '',
  mobile: '',
  jobTitle: '',
  city: '',
  state: '',
  role: 'Viewer',
  memberSince: '—',
  status: 'Pending',
}

const EMPTY_BUSINESS: BusinessProfile = {
  id: '',
  legalName: '',
  type: '',
  gstin: '',
  email: '',
  phone: '',
  city: '',
  state: '',
  address: '',
  verification: 'Not connected',
}

const DEFAULT_PREFERENCES: UserPreferences = {
  currency: 'INR ₹',
  timezone: 'Asia/Kolkata',
  dateFormat: 'DD/MM/YYYY',
  landingPage: 'Dashboard',
  compactMode: false,
}

const DEFAULT_NOTIFICATIONS: NotificationPreferences = {
  payments: true,
  invoices: true,
  cash: true,
  risk: true,
  ai: true,
  system: true,
}

const DEFAULT_AI: AISettings = {
  enabled: true,
  assistantEnabled: true,
  insightsEnabled: true,
  riskMonitoring: true,
  cashFlowForecasting: true,
  paymentDelayPrediction: true,
  anomalyDetection: true,
  aiNotifications: true,
  learningMode: true,
  insightFrequency: 'Daily',
  permission: 'Full AI Access',
}

const DEFAULT_SERVICES: ConnectedService[] = [
  {
    id: 'banking',
    name: 'Banking API',
    description:
      'Bank account and transaction synchronization',
    status: 'Not Connected',
    synced: 'No sync yet',
  },
  {
    id: 'payments',
    name: 'Payments',
    description:
      'Payment processing and reconciliation',
    status: 'Not Connected',
    synced: 'No sync yet',
  },
  {
    id: 'erp',
    name: 'ERP',
    description:
      'Business and accounting system integration',
    status: 'Not Connected',
    synced: 'No sync yet',
  },
  {
    id: 'ai',
    name: 'AI / Intelligence',
    description:
      'CashGuard AI and predictive intelligence',
    status: 'Connected',
    synced: 'AI service available',
  },
]

/* ============================================================================
   UI HELPERS
============================================================================ */

const inputClass =
  'mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100'

function Section({
  title,
  eyebrow,
  children,
  action,
}: {
  title: string
  eyebrow?: string
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_25px_rgba(15,23,42,0.04)]">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          {eyebrow && (
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-sky-600">
              {eyebrow}
            </p>
          )}

          <h2 className="mt-1 text-base font-bold text-slate-900">
            {title}
          </h2>
        </div>

        {action}
      </div>

      {children}
    </section>
  )
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  disabled = false,
}: {
  label: string
  value: string
  onChange?: (value: string) => void
  type?: string
  disabled?: boolean
}) {
  return (
    <label className="text-xs font-semibold text-slate-600">
      {label}

      <input
        className={`${inputClass} ${
          disabled
            ? 'cursor-not-allowed bg-slate-50 text-slate-400'
            : ''
        }`}
        type={type}
        value={value}
        disabled={disabled}
        onChange={(event) => {
          onChange?.(event.target.value)
        }}
      />
    </label>
  )
}

function Status({
  value,
}: {
  value: string
}) {
  const normalized =
    value.trim().toLowerCase()

  let classes =
    'bg-slate-100 text-slate-600'

  if (
    [
      'active',
      'connected',
      'verified',
      'full access',
      'full ai access',
      'healthy',
      'enabled',
      'ready',
    ].includes(normalized)
  ) {
    classes =
      'bg-emerald-50 text-emerald-700'
  }

  if (
    [
      'pending',
      'view only',
      'daily',
      'weekly',
    ].includes(normalized)
  ) {
    classes =
      'bg-amber-50 text-amber-700'
  }

  if (
    [
      'suspended',
      'restricted',
      'inactive',
      'unavailable',
      'not connected',
      'disabled',
    ].includes(normalized)
  ) {
    classes =
      'bg-rose-50 text-rose-700'
  }

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-1 text-[10px] font-bold ${classes}`}
    >
      {value}
    </span>
  )
}

function Toggle({
  checked,
  onChange,
  disabled = false,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={checked}
      onClick={() =>
        onChange(!checked)
      }
      className={`relative h-6 w-11 shrink-0 rounded-full transition ${
        checked
          ? 'bg-sky-600'
          : 'bg-slate-200'
      } ${
        disabled
          ? 'cursor-not-allowed opacity-50'
          : ''
      }`}
    >
      <span
        className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition ${
          checked
            ? 'left-6'
            : 'left-1'
        }`}
      />
    </button>
  )
}

function Modal({
  title,
  eyebrow,
  children,
  onClose,
  footer,
}: {
  title: string
  eyebrow?: string
  children: ReactNode
  onClose: () => void
  footer?: ReactNode
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            {eyebrow && (
              <p className="text-[10px] font-bold uppercase tracking-widest text-sky-600">
                {eyebrow}
              </p>
            )}

            <h2 className="mt-1 text-lg font-bold text-slate-900">
              {title}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"
            aria-label="Close"
          >
            <X size={17} />
          </button>
        </div>

        <div className="mt-5">
          {children}
        </div>

        {footer && (
          <div className="mt-5 flex justify-end gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

/* ============================================================================
   AUTH HELPERS
============================================================================ */

const AUTH_STORAGE_KEYS = [
  'access_token',
  'accessToken',
  'token',
  'auth_token',
  'jwt_token',
  'jwt',
  'cashguard_access_token',
  'cashguard_token',
]

const BUSINESS_STORAGE_KEYS = [
  'business_id',
  'businessId',
  'cashguard_business_id',
]

function cleanToken(
  value: unknown,
): string {
  if (
    typeof value !== 'string'
  ) {
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

function getAuthToken(): string {
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
      const key of AUTH_STORAGE_KEYS
    ) {
      try {
        const value =
          cleanToken(
            storage.getItem(key),
          )

        if (value) {
          return value
        }
      } catch {
        // Ignore inaccessible storage.
      }
    }
  }

  return ''
}

function clearAuthStorage(): void {
  if (
    typeof window === 'undefined'
  ) {
    return
  }

  for (
    const key of AUTH_STORAGE_KEYS
  ) {
    try {
      window.localStorage.removeItem(
        key,
      )
    } catch {
      // Ignore.
    }

    try {
      window.sessionStorage.removeItem(
        key,
      )
    } catch {
      // Ignore.
    }
  }
}

function getStoredBusinessId(): string {
  if (
    typeof window === 'undefined'
  ) {
    return (
      process.env
        .NEXT_PUBLIC_BUSINESS_ID
        ?.trim() || ''
    )
  }

  const storages = [
    window.localStorage,
    window.sessionStorage,
  ]

  for (
    const storage of storages
  ) {
    for (
      const key of BUSINESS_STORAGE_KEYS
    ) {
      try {
        const value =
          storage
            .getItem(key)
            ?.trim() || ''

        if (value) {
          return value
        }
      } catch {
        // Ignore.
      }
    }
  }

  return (
    process.env
      .NEXT_PUBLIC_BUSINESS_ID
      ?.trim() || ''
  )
}

function dispatchAuthChanged(): void {
  if (
    typeof window ===
    'undefined'
  ) {
    return
  }

  window.dispatchEvent(
    new CustomEvent(
      'auth-changed',
    ),
  )
}

/* ============================================================================
   GENERAL HELPERS
============================================================================ */

function safeBoolean(
  value: unknown,
  fallback = false,
): boolean {
  if (
    typeof value === 'boolean'
  ) {
    return value
  }

  if (
    value === 1 ||
    value === '1' ||
    value === 'true' ||
    value === 'True' ||
    value === 'yes' ||
    value === 'Yes' ||
    value === 'enabled'
  ) {
    return true
  }

  if (
    value === 0 ||
    value === '0' ||
    value === 'false' ||
    value === 'False' ||
    value === 'no' ||
    value === 'No' ||
    value === 'disabled'
  ) {
    return false
  }

  return fallback
}

function safeString(
  value: unknown,
  fallback = '',
): string {
  if (
    typeof value === 'string'
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

function isRecord(
  value: unknown,
): value is Record<
  string,
  unknown
> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  )
}

function formatDate(
  value: unknown,
): string {
  if (!value) {
    return '—'
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

  return new Intl.DateTimeFormat(
    'en-IN',
    {
      month: 'long',
      year: 'numeric',
    },
  ).format(date)
}

function formatDateTime(
  value: unknown,
): string {
  if (!value) {
    return '—'
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

  return new Intl.DateTimeFormat(
    'en-IN',
    {
      dateStyle: 'medium',
      timeStyle: 'short',
    },
  ).format(date)
}

function initials(
  name: string,
): string {
  const parts =
    name
      .trim()
      .split(/\s+/)
      .filter(Boolean)

  if (!parts.length) {
    return 'U'
  }

  if (parts.length === 1) {
    return parts[0]
      .slice(0, 2)
      .toUpperCase()
  }

  return `${parts[0][0]}${
    parts[parts.length - 1][0]
  }`.toUpperCase()
}

function normalizeRole(
  value: unknown,
): UserRole {
  const role =
    safeString(
      value,
      'Viewer',
    )

  switch (
    role.toLowerCase()
  ) {
    case 'admin':
    case 'administrator':
    case 'super_admin':
    case 'superadmin':
    case 'platform_admin':
    case 'platform-admin':
      return 'Administrator'

    case 'finance_manager':
    case 'finance manager':
      return 'Finance Manager'

    case 'viewer':
      return 'Viewer'

    default:
      return role || 'Viewer'
  }
}

function unwrapPayload<T>(
  value: unknown,
): T {
  if (
    isRecord(value) &&
    'data' in value &&
    value.data !== undefined
  ) {
    return value.data as T
  }

  if (
    isRecord(value) &&
    'result' in value &&
    value.result !== undefined
  ) {
    return value.result as T
  }

  return value as T
}

function getErrorMessage(
  payload: unknown,
  statusCode: number,
): string {
  let message =
    `Request failed with status ${statusCode}`

  if (isRecord(payload)) {
    const detail =
      payload.detail

    const apiMessage =
      payload.message

    const error =
      payload.error

    if (
      typeof detail === 'string' &&
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
      typeof error === 'string' &&
      error.trim()
    ) {
      message =
        error.trim()
    }
  }

  if (
    typeof payload ===
      'string' &&
    payload.trim()
  ) {
    message =
      payload.trim()
  }

  return message
}

function isOptionalEndpointError(
  statusCode?: number,
): boolean {
  return (
    statusCode === 404 ||
    statusCode === 405
  )
}

/* ============================================================================
   NORMALIZERS
============================================================================ */

function normalizeUser(
  payload: unknown,
): UserProfile {
  const value =
    unwrapPayload<
      Record<
        string,
        unknown
      >
    >(payload) || {}

  const active =
    safeBoolean(
      value.is_active ??
        value.isActive ??
        value.active,
      true,
    )

  const name =
    safeString(
      value.name ||
        value.full_name ||
        value.fullName ||
        value.display_name ||
        value.displayName ||
        value.username,
    )

  const email =
    safeString(
      value.email ||
        value.email_address ||
        value.emailAddress,
    )

  return {
    id: safeString(
      value.id ||
        value.user_id ||
        value.userId,
    ),

    fullName: name,

    email,

    mobile: safeString(
      value.mobile ||
        value.phone ||
        value.phone_number ||
        value.phoneNumber,
    ),

    jobTitle: safeString(
      value.job_title ||
        value.jobTitle ||
        value.designation ||
        value.position,
    ),

    city: safeString(
      value.city,
    ),

    state: safeString(
      value.state,
    ),

    role: normalizeRole(
      value.role ||
        value.user_role ||
        value.userRole,
    ),

    memberSince: formatDate(
      value.member_since ||
        value.memberSince ||
        value.created_at ||
        value.createdAt,
    ),

    status: safeString(
      value.status,
      active
        ? 'Active'
        : 'Inactive',
    ),
  }
}

function normalizeBusiness(
  payload: unknown,
): BusinessProfile {
  const value =
    unwrapPayload<
      Record<
        string,
        unknown
      >
    >(payload) || {}

  return {
    id: safeString(
      value.id ||
        value.business_id ||
        value.businessId,
    ),

    legalName: safeString(
      value.legal_name ||
        value.legalName ||
        value.display_name ||
        value.name,
    ),

    type: safeString(
      value.type ||
        value.business_type ||
        value.businessType ||
        value.industry,
    ),

    gstin: safeString(
      value.gstin ||
        value.gst_number ||
        value.gst_no ||
        value.gstIn,
    ).toUpperCase(),

    email: safeString(
      value.email ||
        value.business_email ||
        value.businessEmail,
    ),

    phone: safeString(
      value.phone ||
        value.business_phone ||
        value.businessPhone,
    ),

    city: safeString(
      value.city,
    ),

    state: safeString(
      value.state,
    ),

    address: safeString(
      value.address ||
        value.location,
    ),

    verification: safeString(
      value.verification ||
        value.verification_status ||
        value.verificationStatus,
      'Not connected',
    ),
  }
}

function normalizeStatus(
  value: unknown,
): TeamMember['status'] {
  const normalized =
    safeString(
      value,
      'Active',
    ).toLowerCase()

  if (
    normalized ===
      'pending'
  ) {
    return 'Pending'
  }

  if (
    normalized ===
      'suspended'
  ) {
    return 'Suspended'
  }

  return 'Active'
}

function normalizeServiceStatus(
  value: unknown,
): ConnectedService['status'] {
  const normalized =
    safeString(
      value,
      'Unavailable',
    ).toLowerCase()

  if (
    normalized ===
    'connected'
  ) {
    return 'Connected'
  }

  if (
    normalized ===
    'pending'
  ) {
    return 'Pending'
  }

  if (
    normalized ===
    'not connected'
  ) {
    return 'Not Connected'
  }

  return 'Unavailable'
}

/* ============================================================================
   PAGE
============================================================================ */

export default function UserPanelPage() {
  const [user, setUser] =
    useState<UserProfile>(
      EMPTY_USER,
    )

  const [
    business,
    setBusiness,
  ] =
    useState<BusinessProfile>(
      EMPTY_BUSINESS,
    )

  const [
    originalUser,
    setOriginalUser,
  ] =
    useState<UserProfile>(
      EMPTY_USER,
    )

  const [
    originalBusiness,
    setOriginalBusiness,
  ] =
    useState<BusinessProfile>(
      EMPTY_BUSINESS,
    )

  const [
    sessions,
    setSessions,
  ] =
    useState<Session[]>([])

  const [
    services,
    setServices,
  ] =
    useState<ConnectedService[]>(
      DEFAULT_SERVICES,
    )

  const [
    team,
    setTeam,
  ] =
    useState<TeamMember[]>([])

  const [
    activity,
    setActivity,
  ] =
    useState<UserActivity[]>(
      [],
    )

  const [
    preferences,
    setPreferences,
  ] =
    useState<UserPreferences>(
      DEFAULT_PREFERENCES,
    )

  const [
    notifications,
    setNotifications,
  ] =
    useState<NotificationPreferences>(
      DEFAULT_NOTIFICATIONS,
    )

  const [ai, setAi] =
    useState<AISettings>(
      DEFAULT_AI,
    )

  const [loading, setLoading] =
    useState(true)

  const [
    refreshing,
    setRefreshing,
  ] =
    useState(false)

  const [saving, setSaving] =
    useState(false)

  const [
    editingProfile,
    setEditingProfile,
  ] =
    useState(false)

  const [
    editingBusiness,
    setEditingBusiness,
  ] =
    useState(false)

  const [
    savedMessage,
    setSavedMessage,
  ] =
    useState('')

  const [
    errorMessage,
    setErrorMessage,
  ] =
    useState('')

  const [
    passwordModal,
    setPasswordModal,
  ] =
    useState(false)

  const [
    twoFactorModal,
    setTwoFactorModal,
  ] =
    useState(false)

  const [
    teamModal,
    setTeamModal,
  ] =
    useState(false)

  const [
    exportModal,
    setExportModal,
  ] =
    useState(false)

  const [
    showPassword,
    setShowPassword,
  ] =
    useState(false)

  const [
    expandedAI,
    setExpandedAI,
  ] =
    useState(true)

  const [
    expandedSecurity,
    setExpandedSecurity,
  ] =
    useState(true)

  const [
    teamSearch,
    setTeamSearch,
  ] =
    useState('')

  const [
    serviceSearch,
    setServiceSearch,
  ] =
    useState('')

  const [
    newMember,
    setNewMember,
  ] =
    useState({
      name: '',
      email: '',
      role: 'Viewer',
    })

  const [
    passwords,
    setPasswords,
  ] =
    useState({
      current: '',
      next: '',
      confirm: '',
    })

  /* ========================================================================
     FEEDBACK
  ======================================================================== */

  const feedback =
    useCallback(
      (message: string) => {
        setErrorMessage('')
        setSavedMessage(message)

        if (
          typeof window !==
          'undefined'
        ) {
          window.setTimeout(
            () => {
              setSavedMessage('')
            },
            3500,
          )
        }
      },
      [],
    )

  /* ========================================================================
     API REQUEST
  ======================================================================== */

  const apiRequest =
    useCallback(
      async <T,>(
        endpoint: string,
        options: RequestInit = {},
      ): Promise<T> => {
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
          options.body
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
            `${API_URL}${endpoint}`,
            {
              ...options,
              headers,
              credentials:
                'include',
              cache:
                'no-store',
            },
          )

        const contentType =
          response.headers.get(
            'content-type',
          ) || ''

        let payload: unknown =
          null

        if (
          contentType.includes(
            'application/json',
          )
        ) {
          try {
            payload =
              await response.json()
          } catch {
            payload = null
          }
        } else {
          try {
            payload =
              await response.text()
          } catch {
            payload = null
          }
        }

        if (
          !response.ok
        ) {
          const message =
            getErrorMessage(
              payload,
              response.status,
            )

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

          const error =
            new Error(
              message,
            )

          ;(
            error as Error & {
              status?: number
            }
          ).status =
            response.status

          throw error
        }

        return payload as T
      },
      [],
    )

  /* ========================================================================
     LOAD USER PANEL
  ======================================================================== */

  const loadUserPanel =
    useCallback(
      async () => {
        setErrorMessage('')

        /*
         * /api/auth/me is the required endpoint.
         * Other user-panel endpoints are optional because their
         * backend routes may be enabled independently.
         */

        const results =
          await Promise.allSettled([
            apiRequest(
              API_ENDPOINTS.me,
            ),

            apiRequest(
              API_ENDPOINTS.business,
            ),

            apiRequest(
              API_ENDPOINTS.preferences,
            ),

            apiRequest(
              API_ENDPOINTS.notifications,
            ),

            apiRequest(
              API_ENDPOINTS.sessions,
            ),

            apiRequest(
              API_ENDPOINTS.services,
            ),

            apiRequest(
              API_ENDPOINTS.activity,
            ),

            apiRequest(
              API_ENDPOINTS.team,
            ),

            apiRequest(
              API_ENDPOINTS.aiSettings,
            ),
          ])

        /* ------------------------------------------------------------------
           CURRENT USER
        ------------------------------------------------------------------ */

        if (
          results[0].status ===
          'fulfilled'
        ) {
          const normalized =
            normalizeUser(
              results[0].value,
            )

          setUser(
            normalized,
          )

          setOriginalUser(
            normalized,
          )
        } else {
          const reason =
            results[0].reason

          const statusCode =
            reason instanceof Error
              ? (
                  reason as Error & {
                    status?: number
                  }
                ).status
              : undefined

          if (
            statusCode ===
            401
          ) {
            throw new Error(
              'Your login session has expired. Please login again.',
            )
          }

          throw new Error(
            reason instanceof
              Error
              ? reason.message
              : 'Unable to load your authenticated user.',
          )
        }

        /* ------------------------------------------------------------------
           BUSINESS
        ------------------------------------------------------------------ */

        if (
          results[1].status ===
          'fulfilled'
        ) {
          const normalized =
            normalizeBusiness(
              results[1].value,
            )

          setBusiness(
            normalized,
          )

          setOriginalBusiness(
            normalized,
          )
        } else {
          const reason =
            results[1].reason

          const statusCode =
            reason instanceof Error
              ? (
                  reason as Error & {
                    status?: number
                  }
                ).status
              : undefined

          if (
            !isOptionalEndpointError(
              statusCode,
            )
          ) {
            console.warn(
              '[UserPanel] Business endpoint unavailable:',
              reason,
            )
          }
        }

        /* ------------------------------------------------------------------
           PREFERENCES
        ------------------------------------------------------------------ */

        if (
          results[2].status ===
          'fulfilled'
        ) {
          const payload =
            unwrapPayload<
              Record<
                string,
                unknown
              >
            >(
              results[2].value,
            )

          if (isRecord(payload)) {
            setPreferences(
              (
                current,
              ) => ({
                currency:
                  safeString(
                    payload.currency,
                    current.currency,
                  ),

                timezone:
                  safeString(
                    payload.timezone,
                    current.timezone,
                  ),

                dateFormat:
                  safeString(
                    payload.date_format ??
                      payload.dateFormat,
                    current.dateFormat,
                  ),

                landingPage:
                  safeString(
                    payload.landing_page ??
                      payload.landingPage,
                    current.landingPage,
                  ),

                compactMode:
                  safeBoolean(
                    payload.compact_mode ??
                      payload.compactMode,
                    current.compactMode,
                  ),
              }),
            )
          }
        } else {
          console.warn(
            '[UserPanel] Workspace preferences endpoint unavailable.',
          )
        }

        /* ------------------------------------------------------------------
           NOTIFICATIONS
        ------------------------------------------------------------------ */

        if (
          results[3].status ===
          'fulfilled'
        ) {
          const payload =
            unwrapPayload<
              Record<
                string,
                unknown
              >
            >(
              results[3].value,
            )

          if (isRecord(payload)) {
            setNotifications(
              (
                current,
              ) => ({
                payments:
                  safeBoolean(
                    payload.payments,
                    current.payments,
                  ),

                invoices:
                  safeBoolean(
                    payload.invoices,
                    current.invoices,
                  ),

                cash:
                  safeBoolean(
                    payload.cash,
                    current.cash,
                  ),

                risk:
                  safeBoolean(
                    payload.risk,
                    current.risk,
                  ),

                ai:
                  safeBoolean(
                    payload.ai,
                    current.ai,
                  ),

                system:
                  safeBoolean(
                    payload.system,
                    current.system,
                  ),
              }),
            )
          }
        } else {
          console.warn(
            '[UserPanel] Notification endpoint unavailable.',
          )
        }

        /* ------------------------------------------------------------------
           SESSIONS
        ------------------------------------------------------------------ */

        if (
          results[4].status ===
          'fulfilled'
        ) {
          const payload =
            unwrapPayload<
              unknown
            >(
              results[4].value,
            )

          if (
            Array.isArray(
              payload,
            )
          ) {
            setSessions(
              payload.map(
                (
                  item,
                  index,
                ) => {
                  const value =
                    isRecord(
                      item,
                    )
                      ? item
                      : {}

                  return {
                    id: safeString(
                      value.id ||
                        value.session_id ||
                        value.sessionId,
                      `session-${index}`,
                    ),

                    device:
                      safeString(
                        value.device ||
                          value.device_name ||
                          value.deviceName,
                        'Unknown device',
                      ),

                    browser:
                      safeString(
                        value.browser ||
                          value.browser_name ||
                          value.browserName,
                        'Unknown browser',
                      ),

                    location:
                      safeString(
                        value.location ||
                          value.city ||
                          value.ip_location,
                        'Unknown',
                      ),

                    lastActive:
                      formatDateTime(
                        value.last_active ||
                          value.lastActive ||
                          value.updated_at ||
                          value.updatedAt ||
                          value.created_at,
                      ),

                    current:
                      safeBoolean(
                        value.current ??
                          value.is_current ??
                          value.isCurrent,
                        false,
                      ),
                  }
                },
              ),
            )
          }
        } else {
          console.warn(
            '[UserPanel] Sessions endpoint unavailable.',
          )
        }

        /* ------------------------------------------------------------------
           SERVICES
        ------------------------------------------------------------------ */

        if (
          results[5].status ===
          'fulfilled'
        ) {
          const payload =
            unwrapPayload<
              unknown
            >(
              results[5].value,
            )

          if (
            Array.isArray(
              payload,
            ) &&
            payload.length
          ) {
            setServices(
              payload.map(
                (
                  item,
                  index,
                ) => {
                  const value =
                    isRecord(
                      item,
                    )
                      ? item
                      : {}

                  return {
                    id: safeString(
                      value.id ||
                        value.service_id ||
                        value.serviceId,
                      `service-${index}`,
                    ),

                    name:
                      safeString(
                        value.name ||
                          value.service,
                        'Service',
                      ),

                    description:
                      safeString(
                        value.description,
                        'Connected service',
                      ),

                    status:
                      normalizeServiceStatus(
                        value.status,
                      ),

                    synced:
                      safeString(
                        value.synced ||
                          value.last_sync ||
                          value.lastSync,
                        'No sync information',
                      ),
                  }
                },
              ),
            )
          }
        } else {
          console.warn(
            '[UserPanel] Services endpoint unavailable.',
          )
        }

        /* ------------------------------------------------------------------
           ACTIVITY
        ------------------------------------------------------------------ */

        if (
          results[6].status ===
          'fulfilled'
        ) {
          const payload =
            unwrapPayload<
              unknown
            >(
              results[6].value,
            )

          if (
            Array.isArray(
              payload,
            )
          ) {
            const tones = [
              'bg-sky-500',
              'bg-indigo-500',
              'bg-emerald-500',
              'bg-violet-500',
              'bg-slate-400',
            ]

            setActivity(
              payload.map(
                (
                  item,
                  index,
                ) => {
                  const value =
                    isRecord(
                      item,
                    )
                      ? item
                      : {}

                  return {
                    id:
                      safeString(
                        value.id,
                        `activity-${index}`,
                      ),

                    label:
                      safeString(
                        value.label ||
                          value.action ||
                          value.event ||
                          value.message,
                        'Activity',
                      ),

                    date:
                      formatDateTime(
                        value.date ||
                          value.created_at ||
                          value.createdAt,
                      ),

                    tone:
                      safeString(
                        value.tone,
                        tones[
                          index %
                            tones.length
                        ],
                      ),
                  }
                },
              ),
            )
          }
        } else {
          console.warn(
            '[UserPanel] Activity endpoint unavailable.',
          )
        }

        /* ------------------------------------------------------------------
           TEAM
        ------------------------------------------------------------------ */

        if (
          results[7].status ===
          'fulfilled'
        ) {
          const payload =
            unwrapPayload<
              unknown
            >(
              results[7].value,
            )

          if (
            Array.isArray(
              payload,
            )
          ) {
            setTeam(
              payload.map(
                (
                  item,
                  index,
                ) => {
                  const value =
                    isRecord(
                      item,
                    )
                      ? item
                      : {}

                  return {
                    id:
                      safeString(
                        value.id ||
                          value.user_id ||
                          value.userId,
                        `member-${index}`,
                      ),

                    name:
                      safeString(
                        value.name ||
                          value.full_name ||
                          value.fullName,
                        'User',
                      ),

                    email:
                      safeString(
                        value.email,
                      ),

                    role:
                      normalizeRole(
                        value.role ||
                          value.user_role,
                      ),

                    status:
                      normalizeStatus(
                        value.status,
                      ),
                  }
                },
              ),
            )
          }
        } else {
          console.warn(
            '[UserPanel] Team endpoint unavailable.',
          )
        }

        /* ------------------------------------------------------------------
           AI SETTINGS
        ------------------------------------------------------------------ */

        if (
          results[8].status ===
          'fulfilled'
        ) {
          const payload =
            unwrapPayload<
              Record<
                string,
                unknown
              >
            >(
              results[8].value,
            )

          if (
            isRecord(payload)
          ) {
            setAi(
              (
                current,
              ) => {
                const rawFrequency =
                  safeString(
                    payload.insight_frequency ??
                      payload.insightFrequency,
                    current.insightFrequency,
                  )

                const rawPermission =
                  safeString(
                    payload.permission,
                    current.permission,
                  )

                const validFrequency:
                  AISettings['insightFrequency'] =
                  (
                    [
                      'Real-time',
                      'Daily',
                      'Weekly',
                    ] as string[]
                  ).includes(
                    rawFrequency,
                  )
                    ? (rawFrequency as AISettings['insightFrequency'])
                    : current.insightFrequency

                const validPermission:
                  AISettings['permission'] =
                  (
                    [
                      'Full AI Access',
                      'Insights Only',
                      'Restricted',
                    ] as string[]
                  ).includes(
                    rawPermission,
                  )
                    ? (rawPermission as AISettings['permission'])
                    : current.permission

                return {
                  enabled:
                    safeBoolean(
                      payload.enabled,
                      current.enabled,
                    ),

                  assistantEnabled:
                    safeBoolean(
                      payload.assistant_enabled ??
                        payload.assistantEnabled,
                      current.assistantEnabled,
                    ),

                  insightsEnabled:
                    safeBoolean(
                      payload.insights_enabled ??
                        payload.insightsEnabled,
                      current.insightsEnabled,
                    ),

                  riskMonitoring:
                    safeBoolean(
                      payload.risk_monitoring ??
                        payload.riskMonitoring,
                      current.riskMonitoring,
                    ),

                  cashFlowForecasting:
                    safeBoolean(
                      payload.cash_flow_forecasting ??
                        payload.cashFlowForecasting,
                      current.cashFlowForecasting,
                    ),

                  paymentDelayPrediction:
                    safeBoolean(
                      payload.payment_delay_prediction ??
                        payload.paymentDelayPrediction,
                      current.paymentDelayPrediction,
                    ),

                  anomalyDetection:
                    safeBoolean(
                      payload.anomaly_detection ??
                        payload.anomalyDetection,
                      current.anomalyDetection,
                    ),

                  aiNotifications:
                    safeBoolean(
                      payload.ai_notifications ??
                        payload.aiNotifications,
                      current.aiNotifications,
                    ),

                  learningMode:
                    safeBoolean(
                      payload.learning_mode ??
                        payload.learningMode,
                      current.learningMode,
                    ),

                  insightFrequency:
                    validFrequency,

                  permission:
                    validPermission,
                }
              },
            )
          }
        } else {
          console.warn(
            '[UserPanel] AI settings endpoint unavailable.',
          )
        }
      },
      [apiRequest],
    )

  /* ========================================================================
     INITIAL LOAD
  ======================================================================== */

  useEffect(() => {
    let cancelled = false

    const run =
      async () => {
        try {
          setLoading(true)
          setErrorMessage('')

          await loadUserPanel()
        } catch (error) {
          if (
            cancelled
          ) {
            return
          }

          setErrorMessage(
            error instanceof Error
              ? error.message
              : 'Unable to load account data.',
          )
        } finally {
          if (
            !cancelled
          ) {
            setLoading(false)
            setRefreshing(false)
          }
        }
      }

    void run()

    return () => {
      cancelled = true
    }
  }, [
    loadUserPanel,
  ])

  /* ========================================================================
     PROFILE SAVE
  ======================================================================== */

  const saveProfile =
    useCallback(
      async () => {
        const trimmedName =
          user.fullName.trim()

        const trimmedEmail =
          user.email
            .trim()
            .toLowerCase()

        if (
          !trimmedName
        ) {
          setErrorMessage(
            'Enter your full name.',
          )
          return
        }

        if (
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
            trimmedEmail,
          )
        ) {
          setErrorMessage(
            'Enter a valid email address.',
          )
          return
        }

        try {
          setSaving(true)
          setErrorMessage('')

          const response =
            await apiRequest(
              API_ENDPOINTS.updateProfile,
              {
                method:
                  'PATCH',
                body:
                  JSON.stringify({
                    name:
                      trimmedName,

                    full_name:
                      trimmedName,

                    email:
                      trimmedEmail,

                    mobile:
                      user.mobile.trim(),

                    phone:
                      user.mobile.trim(),

                    job_title:
                      user.jobTitle.trim(),

                    city:
                      user.city.trim(),

                    state:
                      user.state.trim(),
                  }),
              },
            )

          const normalized =
            normalizeUser(
              response,
            )

          setUser(
            normalized,
          )

          setOriginalUser(
            normalized,
          )

          setEditingProfile(
            false,
          )

          dispatchAuthChanged()

          feedback(
            'Profile updated successfully.',
          )
        } catch (
          error
        ) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : 'Failed to update profile.',
          )
        } finally {
          setSaving(false)
        }
      },
      [
        apiRequest,
        feedback,
        user,
      ],
    )

  /* ========================================================================
     BUSINESS SAVE
  ======================================================================== */

  const saveBusiness =
    useCallback(
      async () => {
        if (
          !business.legalName.trim()
        ) {
          setErrorMessage(
            'Legal business name is required.',
          )
          return
        }

        const gstin =
          business.gstin
            .trim()
            .toUpperCase()

        if (
          gstin &&
          gstin.length !== 15
        ) {
          setErrorMessage(
            'GSTIN must contain 15 characters.',
          )
          return
        }

        if (
          !business.id &&
          !getStoredBusinessId()
        ) {
          setErrorMessage(
            'No connected business identifier is available for this account.',
          )
          return
        }

        try {
          setSaving(true)
          setErrorMessage('')

          const response =
            await apiRequest(
              API_ENDPOINTS.updateBusiness,
              {
                method:
                  'PUT',

                body:
                  JSON.stringify({
                    id:
                      business.id ||
                      getStoredBusinessId(),

                    legal_name:
                      business.legalName.trim(),

                    display_name:
                      business.legalName.trim(),

                    industry:
                      business.type.trim(),

                    business_type:
                      business.type.trim(),

                    gstin,

                    email:
                      business.email.trim(),

                    phone:
                      business.phone.trim(),

                    city:
                      business.city.trim(),

                    state:
                      business.state.trim(),

                    address:
                      business.address.trim(),
                  }),
              },
            )

          const normalized =
            normalizeBusiness(
              response,
            )

          setBusiness(
            normalized,
          )

          setOriginalBusiness(
            normalized,
          )

          setEditingBusiness(
            false,
          )

          feedback(
            'Business information updated successfully.',
          )
        } catch (
          error
        ) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : 'Failed to update business information.',
          )
        } finally {
          setSaving(false)
        }
      },
      [
        apiRequest,
        business,
        feedback,
      ],
    )

  /* ========================================================================
     PASSWORD
  ======================================================================== */

  const updatePassword =
    useCallback(
      async () => {
        if (
          !passwords.current
        ) {
          setErrorMessage(
            'Enter your current password.',
          )
          return
        }

        if (
          passwords.next.length <
          8
        ) {
          setErrorMessage(
            'New password must be at least 8 characters.',
          )
          return
        }

        if (
          passwords.next !==
          passwords.confirm
        ) {
          setErrorMessage(
            'Passwords do not match.',
          )
          return
        }

        try {
          setSaving(true)
          setErrorMessage('')

          await apiRequest(
            API_ENDPOINTS.changePassword,
            {
              method:
                'POST',
              body:
                JSON.stringify({
                  current_password:
                    passwords.current,

                  new_password:
                    passwords.next,

                  confirm_password:
                    passwords.confirm,
                }),
            },
          )

          setPasswordModal(
            false,
          )

          setPasswords({
            current: '',
            next: '',
            confirm: '',
          })

          setShowPassword(
            false,
          )

          feedback(
            'Password updated successfully.',
          )
        } catch (
          error
        ) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : 'Failed to change password.',
          )
        } finally {
          setSaving(false)
        }
      },
      [
        apiRequest,
        feedback,
        passwords,
      ],
    )

  /* ========================================================================
     PREFERENCES
  ======================================================================== */

  const savePreferences =
    useCallback(
      async () => {
        try {
          setSaving(true)
          setErrorMessage('')

          await apiRequest(
            API_ENDPOINTS.preferences,
            {
              method:
                'PUT',

              body:
                JSON.stringify({
                  currency:
                    preferences.currency,

                  timezone:
                    preferences.timezone,

                  date_format:
                    preferences.dateFormat,

                  landing_page:
                    preferences.landingPage,

                  compact_mode:
                    preferences.compactMode,
                }),
            },
          )

          feedback(
            'Workspace preferences saved successfully.',
          )
        } catch (
          error
        ) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : 'Failed to save workspace preferences.',
          )
        } finally {
          setSaving(false)
        }
      },
      [
        apiRequest,
        feedback,
        preferences,
      ],
    )

  /* ========================================================================
     NOTIFICATIONS
  ======================================================================== */

  const saveNotifications =
    useCallback(
      async () => {
        try {
          setSaving(true)
          setErrorMessage('')

          await apiRequest(
            API_ENDPOINTS.notifications,
            {
              method:
                'PUT',

              body:
                JSON.stringify(
                  notifications,
                ),
            },
          )

          feedback(
            'Notification preferences saved successfully.',
          )
        } catch (
          error
        ) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : 'Failed to save notification preferences.',
          )
        } finally {
          setSaving(false)
        }
      },
      [
        apiRequest,
        feedback,
        notifications,
      ],
    )

  /* ========================================================================
     AI SETTINGS
  ======================================================================== */

  const saveAISettings =
    useCallback(
      async () => {
        try {
          setSaving(true)
          setErrorMessage('')

          await apiRequest(
            API_ENDPOINTS.aiSettings,
            {
              method:
                'PUT',

              body:
                JSON.stringify({
                  enabled:
                    ai.enabled,

                  assistant_enabled:
                    ai.assistantEnabled,

                  insights_enabled:
                    ai.insightsEnabled,

                  risk_monitoring:
                    ai.riskMonitoring,

                  cash_flow_forecasting:
                    ai.cashFlowForecasting,

                  payment_delay_prediction:
                    ai.paymentDelayPrediction,

                  anomaly_detection:
                    ai.anomalyDetection,

                  ai_notifications:
                    ai.aiNotifications,

                  learning_mode:
                    ai.learningMode,

                  insight_frequency:
                    ai.insightFrequency,

                  permission:
                    ai.permission,
                }),
            },
          )

          feedback(
            'AI settings saved successfully.',
          )
        } catch (
          error
        ) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : 'Failed to save AI settings.',
          )
        } finally {
          setSaving(false)
        }
      },
      [
        ai,
        apiRequest,
        feedback,
      ],
    )

  /* ========================================================================
     SESSION SIGN OUT
  ======================================================================== */

  const signOutSession =
    useCallback(
      async (
        sessionId: string,
      ) => {
        if (
          !sessionId
        ) {
          return
        }

        try {
          await apiRequest(
            `${API_ENDPOINTS.sessions}/${encodeURIComponent(
              sessionId,
            )}`,
            {
              method:
                'DELETE',
            },
          )

          setSessions(
            (
              current,
            ) =>
              current.filter(
                (
                  session,
                ) =>
                  session.id !==
                  sessionId,
              ),
          )

          feedback(
            'Session signed out.',
          )
        } catch (
          error
        ) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : 'Failed to sign out session.',
          )
        }
      },
      [
        apiRequest,
        feedback,
      ],
    )

  /* ========================================================================
     TEAM INVITE
  ======================================================================== */

  const inviteMember =
    useCallback(
      async () => {
        const name =
          newMember.name.trim()

        const email =
          newMember.email
            .trim()
            .toLowerCase()

        if (
          !name
        ) {
          setErrorMessage(
            'Enter the team member name.',
          )
          return
        }

        if (
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
            email,
          )
        ) {
          setErrorMessage(
            'Enter a valid team member email.',
          )
          return
        }

        try {
          setSaving(true)
          setErrorMessage('')

          const response =
            await apiRequest(
              API_ENDPOINTS.team,
              {
                method:
                  'POST',

                body:
                  JSON.stringify({
                    name,

                    full_name:
                      name,

                    email,

                    role:
                      newMember.role,
                  }),
              },
            )

          const payload =
            unwrapPayload<
              unknown
            >(response)

          if (
            isRecord(
              payload,
            )
          ) {
            const member: TeamMember =
              {
                id:
                  safeString(
                    payload.id ||
                      payload.user_id ||
                      payload.userId,
                    `member-${Date.now()}`,
                  ),

                name:
                  safeString(
                    payload.name ||
                      payload.full_name ||
                      payload.fullName,
                    name,
                  ),

                email:
                  safeString(
                    payload.email,
                    email,
                  ),

                role:
                  normalizeRole(
                    payload.role ||
                      newMember.role,
                  ),

                status:
                  normalizeStatus(
                    payload.status ??
                      'Pending',
                  ),
              }

            setTeam(
              (
                current,
              ) => [
                ...current,
                member,
              ],
            )
          } else {
            await loadUserPanel()
          }

          setNewMember({
            name: '',
            email: '',
            role: 'Viewer',
          })

          setTeamModal(
            false,
          )

          feedback(
            'Team invitation sent successfully.',
          )
        } catch (
          error
        ) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : 'Unable to send team invitation.',
          )
        } finally {
          setSaving(false)
        }
      },
      [
        apiRequest,
        feedback,
        loadUserPanel,
        newMember,
      ],
    )

  /* ========================================================================
     REFRESH
  ======================================================================== */

  const refresh =
    useCallback(
      async () => {
        try {
          setRefreshing(true)
          setErrorMessage('')

          await loadUserPanel()

          feedback(
            'Account data refreshed.',
          )
        } catch (
          error
        ) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : 'Unable to refresh account data.',
          )
        } finally {
          setRefreshing(false)
        }
      },
      [
        feedback,
        loadUserPanel,
      ],
    )

  /* ========================================================================
     LOGOUT
  ======================================================================== */

  const logout =
    useCallback(
      async () => {
        try {
          setSaving(true)

          /*
           * Backend logout clears the HttpOnly authentication cookies.
           * We still clear local auth storage because the app may also
           * have a bearer token there.
           */
          try {
            await apiRequest(
              API_ENDPOINTS.logout,
              {
                method:
                  'POST',
              },
            )
          } catch (
            error
          ) {
            console.warn(
              '[UserPanel] Backend logout request failed. Clearing local auth anyway.',
              error,
            )
          }
        } finally {
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

            window.location.href =
              '/login'
          }

          setSaving(false)
        }
      },
      [apiRequest],
    )

  /* ========================================================================
     EXPORT
  ======================================================================== */

  const exportUserData =
    useCallback(
      async (
        format:
          | 'json'
          | 'csv',
      ) => {
        try {
          const localData = {
            user,
            business,
            preferences,
            notifications,
            ai,
            team,
            sessions,
            activity,
          }

          /*
           * The backend export endpoint is intentionally attempted first.
           * This keeps the UI compatible with a future/full server-side
           * export implementation.
           */
          try {
            const response =
              await apiRequest(
                `${API_ENDPOINTS.exportData}?format=${encodeURIComponent(
                  format,
                )}`,
                {
                  method:
                    'GET',
                },
              )

            /*
             * If backend returns JSON, download it.
             * If it returns a blob-like non-JSON response,
             * the browser fallback below is used.
             */
            if (
              format ===
                'json' &&
              response !==
                undefined
            ) {
              const content =
                JSON.stringify(
                  unwrapPayload(
                    response,
                  ),
                  null,
                  2,
                )

              const blob =
                new Blob(
                  [content],
                  {
                    type:
                      'application/json',
                  },
                )

              const url =
                window.URL.createObjectURL(
                  blob,
                )

              const anchor =
                document.createElement(
                  'a',
                )

              anchor.href =
                url

              anchor.download =
                'cashguard-user-data.json'

              document.body.appendChild(
                anchor,
              )

              anchor.click()

              anchor.remove()

              window.URL.revokeObjectURL(
                url,
              )

              setExportModal(
                false,
              )

              feedback(
                'Data export downloaded.',
              )

              return
            }
          } catch (error) {
            console.warn(
              '[UserPanel] Server export unavailable. Using local account-data export.',
              error,
            )
          }

          const csvEscape =
            (
              value: unknown,
            ): string => {
              const stringValue =
                String(
                  value ??
                    '',
                )

              return `"${stringValue.replace(
                /"/g,
                '""',
              )}"`
            }

          const content =
            format ===
            'json'
              ? JSON.stringify(
                  localData,
                  null,
                  2,
                )
              : [
                  'Section,Value',
                  `User,${csvEscape(
                    user.fullName,
                  )}`,
                  `Email,${csvEscape(
                    user.email,
                  )}`,
                  `Mobile,${csvEscape(
                    user.mobile,
                  )}`,
                  `Role,${csvEscape(
                    user.role,
                  )}`,
                  `Business,${csvEscape(
                    business.legalName,
                  )}`,
                  `GSTIN,${csvEscape(
                    business.gstin,
                  )}`,
                  `AI Enabled,${csvEscape(
                    ai.enabled,
                  )}`,
                ].join(
                  '\n',
                )

          const blob =
            new Blob(
              [content],
              {
                type:
                  format ===
                  'json'
                    ? 'application/json'
                    : 'text/csv;charset=utf-8',
              },
            )

          const url =
            window.URL.createObjectURL(
              blob,
            )

          const anchor =
            document.createElement(
              'a',
            )

          anchor.href =
            url

          anchor.download =
            `cashguard-user-data.${format}`

          document.body.appendChild(
            anchor,
          )

          anchor.click()

          anchor.remove()

          window.URL.revokeObjectURL(
            url,
          )

          setExportModal(
            false,
          )

          feedback(
            'Data export downloaded.',
          )
        } catch (
          error
        ) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : 'Failed to export account data.',
          )
        }
      },
      [
        activity,
        ai,
        apiRequest,
        business,
        feedback,
        notifications,
        preferences,
        sessions,
        team,
        user,
      ],
    )

  /* ========================================================================
     DERIVED DATA
  ======================================================================== */

  const connectedAccounts =
    useMemo(
      () =>
        services.filter(
          (
            service,
          ) =>
            service.status ===
            'Connected',
        ).length,
      [services],
    )

  const activeSessions =
    useMemo(
      () =>
        sessions.filter(
          (
            session,
          ) =>
            session.current,
        ),
      [sessions],
    )

  const filteredTeam =
    useMemo(
      () => {
        const search =
          teamSearch
            .trim()
            .toLowerCase()

        if (!search) {
          return team
        }

        return team.filter(
          (
            member,
          ) =>
            member.name
              .toLowerCase()
              .includes(search) ||
            member.email
              .toLowerCase()
              .includes(search) ||
            member.role
              .toLowerCase()
              .includes(search),
        )
      },
      [
        team,
        teamSearch,
      ],
    )

  const filteredServices =
    useMemo(
      () => {
        const search =
          serviceSearch
            .trim()
            .toLowerCase()

        if (!search) {
          return services
        }

        return services.filter(
          (
            service,
          ) =>
            service.name
              .toLowerCase()
              .includes(search) ||
            service.description
              .toLowerCase()
              .includes(search),
        )
      },
      [
        serviceSearch,
        services,
      ],
    )

  const permissions =
    useMemo<
      Permission[]
    >(
      () => {
        const role =
          user.role
            .toLowerCase()
            .trim()

        if (
          role ===
            'administrator' ||
          role === 'admin'
        ) {
          return [
            {
              label:
                'Dashboard',
              access:
                'Full Access',
            },
            {
              label:
                'Customers',
              access:
                'Full Access',
            },
            {
              label:
                'Invoices',
              access:
                'Full Access',
            },
            {
              label:
                'Payments',
              access:
                'Full Access',
            },
            {
              label:
                'Banking',
              access:
                'Full Access',
            },
            {
              label:
                'Analytics',
              access:
                'Full Access',
            },
            {
              label:
                'AI Insights',
              access:
                'Full Access',
            },
            {
              label:
                'Settings',
              access:
                'Full Access',
            },
          ]
        }

        if (
          role ===
            'finance manager' ||
          role ===
            'finance_manager'
        ) {
          return [
            {
              label:
                'Dashboard',
              access:
                'Full Access',
            },
            {
              label:
                'Customers',
              access:
                'Full Access',
            },
            {
              label:
                'Invoices',
              access:
                'Full Access',
            },
            {
              label:
                'Payments',
              access:
                'Full Access',
            },
            {
              label:
                'Banking',
              access:
                'View Only',
            },
            {
              label:
                'Analytics',
              access:
                'View Only',
            },
            {
              label:
                'AI Insights',
              access:
                'View Only',
            },
            {
              label:
                'Settings',
              access:
                'Restricted',
            },
          ]
        }

        return [
          {
            label:
              'Dashboard',
            access:
              'View Only',
          },
          {
            label:
              'Customers',
            access:
              'View Only',
          },
          {
            label:
              'Invoices',
            access:
              'View Only',
          },
          {
            label:
              'Payments',
            access:
              'View Only',
          },
          {
            label:
              'Banking',
            access:
              'View Only',
          },
          {
            label:
              'Analytics',
            access:
              'View Only',
          },
          {
            label:
              'AI Insights',
            access:
              'Restricted',
          },
          {
            label:
              'Settings',
            access:
              'Restricted',
          },
        ]
      },
      [user.role],
    )

  const passwordStrength =
    useMemo(
      () => {
        const value =
          passwords.next

        if (
          value.length >= 12 &&
          /[A-Z]/.test(
            value,
          ) &&
          /[a-z]/.test(
            value,
          ) &&
          /\d/.test(
            value,
          ) &&
          /[^A-Za-z0-9]/.test(
            value,
          )
        ) {
          return 'Strong'
        }

        if (
          value.length >= 8
        ) {
          return 'Medium'
        }

        return 'Weak'
      },
      [passwords.next],
    )

  /* ========================================================================
     RENDER
  ======================================================================== */

  return (
    <>
      <main className="min-h-screen bg-slate-50 px-4 py-5 text-slate-900 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">

          {/* ================================================================
             HEADER
          ================================================================ */}

          <header className="mb-6 flex flex-col justify-between gap-4 border-b border-slate-200 pb-5 md:flex-row md:items-end">

            <div>

              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-sky-600">
                User Control Centre
              </p>

              <h1 className="mt-2 text-2xl font-bold tracking-tight">
                My Profile &amp; Control
              </h1>

              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
                Manage your account, business workspace, security, team access, services and CashGuard AI controls.
              </p>

            </div>

            <div className="flex flex-wrap gap-2">

              <button
                type="button"
                onClick={() =>
                  void refresh()
                }
                disabled={
                  loading ||
                  refreshing
                }
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-sky-300 disabled:opacity-60"
              >
                <RefreshCw
                  size={15}
                  className={
                    refreshing
                      ? 'animate-spin'
                      : ''
                  }
                />

                Refresh
              </button>

              <button
                type="button"
                onClick={() =>
                  setEditingProfile(
                    true,
                  )
                }
                className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
              >
                <UserRound
                  size={15}
                />

                Edit Profile
              </button>

            </div>

          </header>

          {/* ================================================================
             STATUS
          ================================================================ */}

          {loading && (
            <div className="mb-5 rounded-xl border border-sky-100 bg-white p-4 text-sm text-slate-600">
              Loading your account control centre...
            </div>
          )}

          {savedMessage && (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
              <Check size={15} />
              {savedMessage}
            </div>
          )}

          {errorMessage && (
            <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              <span>
                {errorMessage}
              </span>

              <button
                type="button"
                onClick={() =>
                  setErrorMessage(
                    '',
                  )
                }
                aria-label="Dismiss error"
                className="shrink-0"
              >
                <X size={15} />
              </button>
            </div>
          )}

          {/* ================================================================
             PROFILE HERO
          ================================================================ */}

          <section className="rounded-2xl border border-sky-100 bg-gradient-to-br from-white to-sky-50 p-5 shadow-[0_8px_25px_rgba(15,23,42,0.04)]">

            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">

              <div className="flex items-center gap-4">

                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-sky-600 text-xl font-bold text-white">
                  {initials(
                    user.fullName,
                  )}
                </div>

                <div className="min-w-0">

                  <div className="flex flex-wrap items-center gap-2">

                    <h2 className="max-w-full break-words text-xl font-bold">
                      {user.fullName ||
                        'User'}
                    </h2>

                    <Status
                      value={
                        user.status
                      }
                    />

                    <Status
                      value={
                        user.role
                      }
                    />

                  </div>

                  <p className="mt-1 break-words text-sm text-slate-600">
                    {user.email ||
                      'No email available'}

                    {user.mobile
                      ? ` · ${user.mobile}`
                      : ''}
                  </p>

                  <p className="mt-1 break-words text-xs text-slate-500">
                    {business.legalName ||
                      'No business assigned'}
                  </p>

                </div>

              </div>

              <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm lg:text-right">

                <div>

                  <p className="text-[10px] uppercase tracking-wide text-slate-400">
                    Member since
                  </p>

                  <p className="font-semibold">
                    {
                      user.memberSince
                    }
                  </p>

                </div>

                <div>

                  <p className="text-[10px] uppercase tracking-wide text-slate-400">
                    AI
                  </p>

                  <p className="font-semibold text-emerald-600">
                    {ai.enabled
                      ? 'Enabled'
                      : 'Disabled'}
                  </p>

                </div>

              </div>

            </div>

          </section>

          {/* ================================================================
             SUMMARY
          ================================================================ */}

          <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-5">

            {[
              [
                'Account',
                user.status ||
                  'Pending',
              ],
              [
                'Role',
                user.role ||
                  'Viewer',
              ],
              [
                'Connected',
                String(
                  connectedAccounts,
                ),
              ],
              [
                'Sessions',
                String(
                  sessions.length,
                ),
              ],
              [
                'AI',
                ai.enabled
                  ? 'Active'
                  : 'Off',
              ],
            ].map(
              ([label, value]) => (
                <div
                  key={label}
                  className="rounded-xl border border-slate-200 bg-white p-4"
                >
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                    {label}
                  </p>

                  <p className="mt-2 break-words text-sm font-bold">
                    {value}
                  </p>
                </div>
              ),
            )}

          </div>

          {/* ================================================================
             PROFILE + BUSINESS
          ================================================================ */}

          <div className="mt-5 grid gap-5 lg:grid-cols-2">

            {/* --------------------------------------------------------------
               PERSONAL
            -------------------------------------------------------------- */}

            <Section
              eyebrow="Personal details"
              title="Personal information"
              action={
                !editingProfile && (
                  <button
                    type="button"
                    onClick={() =>
                      setEditingProfile(
                        true,
                      )
                    }
                    className="text-xs font-bold text-sky-700"
                  >
                    Edit
                  </button>
                )
              }
            >

              {editingProfile ? (

                <div className="grid gap-3 sm:grid-cols-2">

                  <Field
                    label="Full Name"
                    value={
                      user.fullName
                    }
                    onChange={(
                      value,
                    ) =>
                      setUser(
                        (
                          current,
                        ) => ({
                          ...current,
                          fullName:
                            value,
                        }),
                      )
                    }
                  />

                  <Field
                    label="Business Email"
                    value={
                      user.email
                    }
                    onChange={(
                      value,
                    ) =>
                      setUser(
                        (
                          current,
                        ) => ({
                          ...current,
                          email:
                            value,
                        }),
                      )
                    }
                    type="email"
                  />

                  <Field
                    label="Mobile"
                    value={
                      user.mobile
                    }
                    onChange={(
                      value,
                    ) =>
                      setUser(
                        (
                          current,
                        ) => ({
                          ...current,
                          mobile:
                            value,
                        }),
                      )
                    }
                  />

                  <Field
                    label="Job Title"
                    value={
                      user.jobTitle
                    }
                    onChange={(
                      value,
                    ) =>
                      setUser(
                        (
                          current,
                        ) => ({
                          ...current,
                          jobTitle:
                            value,
                        }),
                      )
                    }
                  />

                  <Field
                    label="City"
                    value={
                      user.city
                    }
                    onChange={(
                      value,
                    ) =>
                      setUser(
                        (
                          current,
                        ) => ({
                          ...current,
                          city: value,
                        }),
                      )
                    }
                  />

                  <Field
                    label="State"
                    value={
                      user.state
                    }
                    onChange={(
                      value,
                    ) =>
                      setUser(
                        (
                          current,
                        ) => ({
                          ...current,
                          state:
                            value,
                        }),
                      )
                    }
                  />

                  <div className="flex gap-2 pt-2 sm:col-span-2">

                    <button
                      type="button"
                      onClick={
                        saveProfile
                      }
                      disabled={
                        saving
                      }
                      className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-60"
                    >
                      <Save
                        size={14}
                      />

                      {saving
                        ? 'Saving...'
                        : 'Save'}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setUser(
                          originalUser,
                        )

                        setEditingProfile(
                          false,
                        )

                        setErrorMessage(
                          '',
                        )
                      }}
                      className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold"
                    >
                      Cancel
                    </button>

                  </div>

                </div>

              ) : (

                <div className="grid gap-4 sm:grid-cols-2">

                  {[
                    [
                      'Full Name',
                      user.fullName ||
                        '—',
                    ],
                    [
                      'Email',
                      user.email ||
                        '—',
                    ],
                    [
                      'Mobile',
                      user.mobile ||
                        '—',
                    ],
                    [
                      'Job Title',
                      user.jobTitle ||
                        '—',
                    ],
                    [
                      'City',
                      user.city ||
                        '—',
                    ],
                    [
                      'State',
                      user.state ||
                        '—',
                    ],
                  ].map(
                    ([
                      label,
                      value,
                    ]) => (
                      <div
                        key={label}
                        className="min-w-0"
                      >
                        <p className="text-[10px] uppercase tracking-wide text-slate-400">
                          {label}
                        </p>

                        <p className="mt-1 break-words text-sm font-semibold">
                          {value}
                        </p>
                      </div>
                    ),
                  )}

                </div>

              )}

            </Section>

            {/* --------------------------------------------------------------
               BUSINESS
            -------------------------------------------------------------- */}

            <Section
              eyebrow="Business workspace"
              title="Business information"
              action={
                !editingBusiness && (
                  <button
                    type="button"
                    onClick={() =>
                      setEditingBusiness(
                        true,
                      )
                    }
                    className="text-xs font-bold text-sky-700"
                  >
                    Edit
                  </button>
                )
              }
            >

              {editingBusiness ? (

                <div className="grid gap-3 sm:grid-cols-2">

                  <Field
                    label="Legal Business Name"
                    value={
                      business.legalName
                    }
                    onChange={(
                      value,
                    ) =>
                      setBusiness(
                        (
                          current,
                        ) => ({
                          ...current,
                          legalName:
                            value,
                        }),
                      )
                    }
                  />

                  <Field
                    label="GSTIN"
                    value={
                      business.gstin
                    }
                    onChange={(
                      value,
                    ) =>
                      setBusiness(
                        (
                          current,
                        ) => ({
                          ...current,
                          gstin:
                            value
                              .toUpperCase()
                              .slice(
                                0,
                                15,
                              ),
                        }),
                      )
                    }
                  />

                  <Field
                    label="Business Email"
                    value={
                      business.email
                    }
                    onChange={(
                      value,
                    ) =>
                      setBusiness(
                        (
                          current,
                        ) => ({
                          ...current,
                          email:
                            value,
                        }),
                      )
                    }
                    type="email"
                  />

                  <Field
                    label="Phone"
                    value={
                      business.phone
                    }
                    onChange={(
                      value,
                    ) =>
                      setBusiness(
                        (
                          current,
                        ) => ({
                          ...current,
                          phone:
                            value,
                        }),
                      )
                    }
                  />

                  <label className="text-xs font-semibold text-slate-600">
                    Business Type

                    <select
                      className={
                        inputClass
                      }
                      value={
                        business.type
                      }
                      onChange={(
                        event,
                      ) =>
                        setBusiness(
                          (
                            current,
                          ) => ({
                            ...current,
                            type:
                              event
                                .target
                                .value,
                          }),
                        )
                      }
                    >

                      <option value="">
                        Select business type
                      </option>

                      {[
                        'Retail',
                        'Wholesale',
                        'Manufacturing',
                        'Services',
                        'Trading',
                        'Other',
                      ].map(
                        (
                          item,
                        ) => (
                          <option
                            key={
                              item
                            }
                            value={
                              item
                            }
                          >
                            {
                              item
                            }
                          </option>
                        ),
                      )}

                    </select>

                  </label>

                  <Field
                    label="City"
                    value={
                      business.city
                    }
                    onChange={(
                      value,
                    ) =>
                      setBusiness(
                        (
                          current,
                        ) => ({
                          ...current,
                          city:
                            value,
                        }),
                      )
                    }
                  />

                  <Field
                    label="State"
                    value={
                      business.state
                    }
                    onChange={(
                      value,
                    ) =>
                      setBusiness(
                        (
                          current,
                        ) => ({
                          ...current,
                          state:
                            value,
                        }),
                      )
                    }
                  />

                  <div className="sm:col-span-2">

                    <Field
                      label="Address"
                      value={
                        business.address
                      }
                      onChange={(
                        value,
                      ) =>
                        setBusiness(
                          (
                            current,
                          ) => ({
                            ...current,
                            address:
                              value,
                          }),
                        )
                      }
                    />

                  </div>

                  <div className="flex gap-2 pt-2 sm:col-span-2">

                    <button
                      type="button"
                      onClick={
                        saveBusiness
                      }
                      disabled={
                        saving
                      }
                      className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-60"
                    >
                      <Save
                        size={14}
                      />

                      {saving
                        ? 'Saving...'
                        : 'Save'}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setBusiness(
                          originalBusiness,
                        )

                        setEditingBusiness(
                          false,
                        )

                        setErrorMessage(
                          '',
                        )
                      }}
                      className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold"
                    >
                      Cancel
                    </button>

                  </div>

                </div>

              ) : (

                <>

                  <div className="mb-4 flex items-center justify-between rounded-lg bg-slate-50 p-3">

                    <div>

                      <p className="text-xs font-bold">
                        Verification
                      </p>

                      <p className="mt-1 text-[11px] text-slate-500">
                        Business verification status.
                      </p>

                    </div>

                    <Status
                      value={
                        business.verification
                      }
                    />

                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">

                    {[
                      [
                        'Legal Name',
                        business.legalName,
                      ],
                      [
                        'Type',
                        business.type,
                      ],
                      [
                        'GSTIN',
                        business.gstin,
                      ],
                      [
                        'Email',
                        business.email,
                      ],
                      [
                        'Phone',
                        business.phone,
                      ],
                      [
                        'Location',
                        [
                          business.city,
                          business.state,
                        ]
                          .filter(
                            Boolean,
                          )
                          .join(
                            ', ',
                          ),
                      ],
                      [
                        'Address',
                        business.address,
                      ],
                    ].map(
                      ([
                        label,
                        value,
                      ]) => (
                        <div
                          key={label}
                          className={
                            label ===
                            'Address'
                              ? 'sm:col-span-2'
                              : ''
                          }
                        >
                          <p className="text-[10px] uppercase tracking-wide text-slate-400">
                            {label}
                          </p>

                          <p className="mt-1 break-words text-sm font-semibold">
                            {value ||
                              '—'}
                          </p>
                        </div>
                      ),
                    )}

                  </div>

                </>

              )}

            </Section>

          </div>

          {/* ================================================================
             AI CONTROL CENTRE
          ================================================================ */}

          <div className="mt-5">

            <section className="overflow-hidden rounded-2xl border border-sky-200 bg-white shadow-[0_12px_35px_rgba(14,165,233,0.08)]">

              <div className="border-b border-slate-200 bg-gradient-to-r from-sky-50 to-white p-5">

                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">

                  <div className="flex items-center gap-3">

                    <div className="rounded-xl bg-sky-600 p-3 text-white">
                      <Sparkles
                        size={20}
                      />
                    </div>

                    <div>

                      <p className="text-[10px] font-bold uppercase tracking-widest text-sky-600">
                        Intelligence
                      </p>

                      <h2 className="text-lg font-bold">
                        AI Control Centre
                      </h2>

                      <p className="mt-1 text-xs text-slate-500">
                        Control how CashGuard AI assists your business.
                      </p>

                    </div>

                  </div>

                  <div className="flex items-center gap-3">

                    <Status
                      value={
                        ai.enabled
                          ? 'Enabled'
                          : 'Disabled'
                      }
                    />

                    <Toggle
                      checked={
                        ai.enabled
                      }
                      onChange={(
                        value,
                      ) =>
                        setAi(
                          (
                            current,
                          ) => ({
                            ...current,
                            enabled:
                              value,
                            assistantEnabled:
                              value
                                ? current.assistantEnabled
                                : false,
                          }),
                        )
                      }
                    />

                    <button
                      type="button"
                      onClick={() =>
                        setExpandedAI(
                          (
                            current,
                          ) =>
                            !current,
                        )
                      }
                      className="rounded-lg border border-slate-200 p-2"
                      aria-label="Toggle AI section"
                    >
                      {expandedAI ? (
                        <ChevronUp
                          size={16}
                        />
                      ) : (
                        <ChevronDown
                          size={16}
                        />
                      )}
                    </button>

                  </div>

                </div>

              </div>

              {expandedAI && (
                <div className="p-5">

                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">

                    {[
                      {
                        key:
                          'assistantEnabled',
                        title:
                          'AI Assistant',
                        description:
                          'Enable business conversations with AI.',
                        icon: Bot,
                      },
                      {
                        key:
                          'insightsEnabled',
                        title:
                          'AI Insights',
                        description:
                          'Generate business intelligence insights.',
                        icon:
                          Sparkles,
                      },
                      {
                        key:
                          'riskMonitoring',
                        title:
                          'Risk Monitoring',
                        description:
                          'Monitor financial and payment risk.',
                        icon:
                          ShieldCheck,
                      },
                      {
                        key:
                          'cashFlowForecasting',
                        title:
                          'Cash Flow Forecasting',
                        description:
                          'Predict future cash-flow conditions.',
                        icon: Zap,
                      },
                      {
                        key:
                          'paymentDelayPrediction',
                        title:
                          'Payment Delay',
                        description:
                          'Predict invoice payment delays.',
                        icon:
                          FileText,
                      },
                      {
                        key:
                          'anomalyDetection',
                        title:
                          'Anomaly Detection',
                        description:
                          'Detect unusual financial activity.',
                        icon:
                          Database,
                      },
                      {
                        key:
                          'aiNotifications',
                        title:
                          'AI Notifications',
                        description:
                          'Receive important AI recommendations.',
                        icon:
                          Bell,
                      },
                      {
                        key:
                          'learningMode',
                        title:
                          'Learning Mode',
                        description:
                          'Allow AI to adapt to workspace patterns.',
                        icon: Bot,
                      },
                    ].map(
                      (item) => {
                        const Icon =
                          item.icon

                        const setting =
                          ai[
                            item.key as keyof AISettings
                          ]

                        const enabled =
                          typeof setting ===
                            'boolean'
                            ? setting
                            : false

                        return (
                          <div
                            key={
                              item.key
                            }
                            className="rounded-xl border border-slate-200 p-4"
                          >

                            <div className="flex items-start justify-between gap-3">

                              <div className="rounded-lg bg-sky-50 p-2 text-sky-700">
                                <Icon
                                  size={17}
                                />
                              </div>

                              <Toggle
                                checked={
                                  ai.enabled &&
                                  enabled
                                }
                                disabled={
                                  !ai.enabled
                                }
                                onChange={(
                                  value,
                                ) =>
                                  setAi(
                                    (
                                      current,
                                    ) =>
                                      ({
                                        ...current,
                                        [item.key]:
                                          value,
                                      }) as AISettings,
                                  )
                                }
                              />

                            </div>

                            <p className="mt-3 text-sm font-bold">
                              {
                                item.title
                              }
                            </p>

                            <p className="mt-1 text-[11px] leading-5 text-slate-500">
                              {
                                item.description
                              }
                            </p>

                          </div>
                        )
                      },
                    )}

                  </div>

                  <div className="mt-5 grid gap-4 lg:grid-cols-3">

                    <label className="text-xs font-semibold text-slate-600">

                      AI Permission

                      <select
                        className={
                          inputClass
                        }
                        value={
                          ai.permission
                        }
                        disabled={
                          !ai.enabled
                        }
                        onChange={(
                          event,
                        ) =>
                          setAi(
                            (
                              current,
                            ) => ({
                              ...current,
                              permission:
                                event
                                  .target
                                  .value as AISettings['permission'],
                            }),
                          )
                        }
                      >

                        <option>
                          Full AI Access
                        </option>

                        <option>
                          Insights Only
                        </option>

                        <option>
                          Restricted
                        </option>

                      </select>

                    </label>

                    <label className="text-xs font-semibold text-slate-600">

                      Insight Frequency

                      <select
                        className={
                          inputClass
                        }
                        value={
                          ai.insightFrequency
                        }
                        disabled={
                          !ai.enabled
                        }
                        onChange={(
                          event,
                        ) =>
                          setAi(
                            (
                              current,
                            ) => ({
                              ...current,
                              insightFrequency:
                                event
                                  .target
                                  .value as AISettings['insightFrequency'],
                            }),
                          )
                        }
                      >

                        <option>
                          Real-time
                        </option>

                        <option>
                          Daily
                        </option>

                        <option>
                          Weekly
                        </option>

                      </select>

                    </label>

                    <div className="rounded-xl border border-slate-200 p-3">

                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                        AI status
                      </p>

                      <p className="mt-1 break-words text-sm font-bold">
                        {ai.enabled
                          ? 'Ready for business intelligence'
                          : 'AI controls disabled'}
                      </p>

                      <p className="mt-1 text-[11px] text-slate-500">
                        {
                          ai.permission
                        }
                      </p>

                    </div>

                  </div>

                  <div className="mt-5 flex justify-end">

                    <button
                      type="button"
                      onClick={
                        saveAISettings
                      }
                      disabled={
                        saving
                      }
                      className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-60"
                    >
                      <Save
                        size={14}
                      />

                      Save AI Controls
                    </button>

                  </div>

                </div>
              )}

            </section>

          </div>

          {/* ================================================================
             ROLE + TEAM
          ================================================================ */}

          <div className="mt-5 grid gap-5 lg:grid-cols-2">

            <Section
              eyebrow="Access control"
              title="Role & permissions"
            >

              <div className="mb-4 flex items-center gap-3 rounded-xl bg-slate-50 p-3">

                <div className="rounded-lg bg-sky-100 p-2 text-sky-700">
                  <ShieldCheck
                    size={17}
                  />
                </div>

                <div>

                  <p className="text-xs text-slate-500">
                    Current role
                  </p>

                  <p className="text-sm font-bold">
                    {user.role}
                  </p>

                </div>

              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">

                {permissions.map(
                  (
                    permission,
                  ) => (
                    <div
                      key={
                        permission.label
                      }
                      className="flex items-center justify-between gap-3 border-b border-slate-100 py-2"
                    >

                      <span className="text-xs text-slate-600">
                        {
                          permission.label
                        }
                      </span>

                      <Status
                        value={
                          permission.access
                        }
                      />

                    </div>
                  ),
                )}

              </div>

            </Section>

            <Section
              eyebrow="Team"
              title="Team & users"
              action={
                <button
                  type="button"
                  onClick={() =>
                    setTeamModal(
                      true,
                    )
                  }
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-sky-700"
                >
                  <UserPlus
                    size={14}
                  />
                  Invite
                </button>
              }
            >

              <div className="mb-3 flex items-center gap-2 rounded-lg border border-slate-200 px-3">

                <Search
                  size={15}
                  className="text-slate-400"
                />

                <input
                  className="h-9 w-full bg-transparent text-xs outline-none"
                  placeholder="Search team members..."
                  value={
                    teamSearch
                  }
                  onChange={(
                    event,
                  ) =>
                    setTeamSearch(
                      event.target
                        .value,
                    )
                  }
                />

              </div>

              {filteredTeam.length ? (

                <div className="space-y-2">

                  {filteredTeam.map(
                    (
                      member,
                    ) => (
                      <div
                        key={
                          member.id
                        }
                        className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 p-3"
                      >

                        <div className="flex min-w-0 items-center gap-3">

                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold">
                            {initials(
                              member.name,
                            )}
                          </div>

                          <div className="min-w-0">

                            <p className="truncate text-xs font-bold">
                              {
                                member.name
                              }
                            </p>

                            <p className="truncate text-[11px] text-slate-500">
                              {
                                member.email
                              }
                            </p>

                          </div>

                        </div>

                        <div className="flex shrink-0 items-center gap-2">

                          <Status
                            value={
                              member.role
                            }
                          />

                          <Status
                            value={
                              member.status
                            }
                          />

                        </div>

                      </div>
                    ),
                  )}

                </div>

              ) : (

                <div className="rounded-xl border border-dashed border-slate-200 p-5 text-center">

                  <Users
                    className="mx-auto text-slate-300"
                    size={24}
                  />

                  <p className="mt-2 text-xs font-semibold text-slate-600">
                    No team members available
                  </p>

                  <button
                    type="button"
                    onClick={() =>
                      setTeamModal(
                        true,
                      )
                    }
                    className="mt-2 text-xs font-bold text-sky-700"
                  >
                    Add first member
                  </button>

                </div>

              )}

            </Section>

          </div>

          {/* ================================================================
             SECURITY + SESSIONS
          ================================================================ */}

          <div className="mt-5 grid gap-5 lg:grid-cols-2">

            <Section
              eyebrow="Protection"
              title="Security centre"
              action={
                <button
                  type="button"
                  onClick={() =>
                    setExpandedSecurity(
                      (
                        current,
                      ) =>
                        !current,
                    )
                  }
                  className="rounded-lg border border-slate-200 p-2"
                  aria-label="Toggle security section"
                >
                  {expandedSecurity ? (
                    <ChevronUp
                      size={15}
                    />
                  ) : (
                    <ChevronDown
                      size={15}
                    />
                  )}
                </button>
              }
            >

              {expandedSecurity && (
                <div className="space-y-3">

                  <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3">

                    <div className="flex min-w-0 items-center gap-3">

                      <div className="rounded-lg bg-slate-100 p-2">
                        <LockKeyhole
                          size={15}
                        />
                      </div>

                      <div>

                        <p className="text-xs font-bold">
                          Password
                        </p>

                        <p className="text-[11px] text-slate-500">
                          Change your account password.
                        </p>

                      </div>

                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setPasswordModal(
                          true,
                        )
                      }
                      className="shrink-0 text-xs font-bold text-sky-700"
                    >
                      Change
                    </button>

                  </div>

                  <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3">

                    <div className="flex min-w-0 items-center gap-3">

                      <div className="rounded-lg bg-slate-100 p-2">
                        <ShieldCheck
                          size={15}
                        />
                      </div>

                      <div>

                        <p className="text-xs font-bold">
                          Two-factor authentication
                        </p>

                        <p className="text-[11px] text-slate-500">
                          Add another layer of account protection.
                        </p>

                      </div>

                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setTwoFactorModal(
                          true,
                        )
                      }
                      className="shrink-0 text-xs font-bold text-sky-700"
                    >
                      Setup
                    </button>

                  </div>

                  <div className="rounded-xl bg-slate-50 p-3">

                    <p className="text-xs font-bold">
                      Security status
                    </p>

                    <p className="mt-1 text-[11px] text-slate-500">
                      Account is currently{' '}
                      {user.status.toLowerCase()}.
                    </p>

                  </div>

                </div>
              )}

            </Section>

            <Section
              eyebrow="Access history"
              title="Sessions & devices"
            >

              {sessions.length ? (

                <div className="space-y-3">

                  {sessions.map(
                    (
                      session,
                    ) => (
                      <div
                        key={
                          session.id
                        }
                        className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 p-3"
                      >

                        <div className="flex min-w-0 items-center gap-3">

                          <div className="rounded-lg bg-sky-50 p-2 text-sky-700">
                            <MonitorSmartphone
                              size={16}
                            />
                          </div>

                          <div className="min-w-0">

                            <p className="truncate text-xs font-bold">
                              {
                                session.device
                              }
                            </p>

                            <p className="truncate text-[11px] text-slate-500">
                              {
                                session.browser
                              }{' '}
                              ·{' '}
                              {
                                session.location
                              }
                            </p>

                            <p className="text-[10px] text-slate-400">
                              {
                                session.lastActive
                              }
                            </p>

                          </div>

                        </div>

                        {session.current ? (

                          <Status value="Active" />

                        ) : (

                          <button
                            type="button"
                            onClick={() =>
                              void signOutSession(
                                session.id,
                              )
                            }
                            className="shrink-0 text-xs font-bold text-slate-500 hover:text-rose-600"
                          >
                            Sign out
                          </button>

                        )}

                      </div>
                    ),
                  )}

                </div>

              ) : (

                <p className="text-sm text-slate-500">
                  No active session data available.
                </p>

              )}

              <p className="mt-4 text-[11px] text-slate-400">
                Current sessions:{' '}
                {activeSessions.length}
              </p>

            </Section>

          </div>

          {/* ================================================================
             SERVICES
          ================================================================ */}

          <div className="mt-5">

            <Section
              eyebrow="Integrations"
              title="Connected services"
              action={
                <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-2">

                  <Search
                    size={14}
                    className="text-slate-400"
                  />

                  <input
                    className="h-8 w-32 bg-transparent text-[11px] outline-none sm:w-44"
                    placeholder="Search services"
                    value={
                      serviceSearch
                    }
                    onChange={(
                      event,
                    ) =>
                      setServiceSearch(
                        event.target
                          .value,
                      )
                    }
                  />

                </div>
              }
            >

              <div className="grid gap-3 md:grid-cols-2">

                {filteredServices.map(
                  (
                    service,
                  ) => (
                    <div
                      key={
                        service.id
                      }
                      className="rounded-xl border border-slate-200 p-4"
                    >

                      <div className="flex items-start justify-between gap-3">

                        <div className="flex min-w-0 items-center gap-3">

                          <div className="rounded-lg bg-slate-100 p-2 text-slate-600">
                            <Link2
                              size={16}
                            />
                          </div>

                          <div className="min-w-0">

                            <p className="text-sm font-bold">
                              {
                                service.name
                              }
                            </p>

                            <p className="mt-1 break-words text-[11px] text-slate-500">
                              {
                                service.description
                              }
                            </p>

                          </div>

                        </div>

                        <Status
                          value={
                            service.status
                          }
                        />

                      </div>

                      <div className="mt-4 flex items-center justify-between gap-3">

                        <p className="text-[10px] text-slate-400">
                          {
                            service.synced
                          }
                        </p>

                        <button
                          type="button"
                          onClick={() =>
                            feedback(
                              `${service.name} configuration is ready.`,
                            )
                          }
                          className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-bold text-slate-700"
                        >
                          Configure
                        </button>

                      </div>

                    </div>
                  ),
                )}

              </div>

            </Section>

          </div>

          {/* ================================================================
             NOTIFICATIONS + WORKSPACE
          ================================================================ */}

          <div className="mt-5 grid gap-5 lg:grid-cols-2">

            <Section
              eyebrow="Notifications"
              title="Notification preferences"
            >

              <div className="space-y-1">

                {(
                  [
                    [
                      'payments',
                      'Payment alerts',
                    ],
                    [
                      'invoices',
                      'Invoice alerts',
                    ],
                    [
                      'cash',
                      'Cash-flow alerts',
                    ],
                    [
                      'risk',
                      'Risk alerts',
                    ],
                    [
                      'ai',
                      'AI insights',
                    ],
                    [
                      'system',
                      'System notifications',
                    ],
                  ] as const
                ).map(
                  ([
                    key,
                    label,
                  ]) => (
                    <div
                      key={
                        key
                      }
                      className="flex items-center justify-between gap-3 border-b border-slate-100 py-3"
                    >

                      <span className="text-xs font-semibold">
                        {label}
                      </span>

                      <Toggle
                        checked={
                          notifications[
                            key
                          ]
                        }
                        onChange={(
                          value,
                        ) =>
                          setNotifications(
                            (
                              current,
                            ) => ({
                              ...current,
                              [key]:
                                value,
                            }),
                          )
                        }
                      />

                    </div>
                  ),
                )}

              </div>

              <button
                type="button"
                onClick={
                  saveNotifications
                }
                disabled={
                  saving
                }
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-sky-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-60"
              >
                <Save size={14} />
                Save Notifications
              </button>

            </Section>

            <Section
              eyebrow="Workspace"
              title="Workspace preferences"
            >

              <div className="grid gap-3 sm:grid-cols-2">

                <label className="text-xs font-semibold text-slate-600">

                  Currency

                  <select
                    className={
                      inputClass
                    }
                    value={
                      preferences.currency
                    }
                    onChange={(
                      event,
                    ) =>
                      setPreferences(
                        (
                          current,
                        ) => ({
                          ...current,
                          currency:
                            event
                              .target
                              .value,
                        }),
                      )
                    }
                  >

                    <option>
                      INR ₹
                    </option>

                    <option>
                      USD $
                    </option>

                    <option>
                      EUR €
                    </option>

                    <option>
                      GBP £
                    </option>

                  </select>

                </label>

                <label className="text-xs font-semibold text-slate-600">

                  Timezone

                  <select
                    className={
                      inputClass
                    }
                    value={
                      preferences.timezone
                    }
                    onChange={(
                      event,
                    ) =>
                      setPreferences(
                        (
                          current,
                        ) => ({
                          ...current,
                          timezone:
                            event
                              .target
                              .value,
                        }),
                      )
                    }
                  >

                    <option>
                      Asia/Kolkata
                    </option>

                    <option>
                      UTC
                    </option>

                    <option>
                      Asia/Dubai
                    </option>

                    <option>
                      Europe/London
                    </option>

                  </select>

                </label>

                <label className="text-xs font-semibold text-slate-600">

                  Date format

                  <select
                    className={
                      inputClass
                    }
                    value={
                      preferences.dateFormat
                    }
                    onChange={(
                      event,
                    ) =>
                      setPreferences(
                        (
                          current,
                        ) => ({
                          ...current,
                          dateFormat:
                            event
                              .target
                              .value,
                        }),
                      )
                    }
                  >

                    <option>
                      DD/MM/YYYY
                    </option>

                    <option>
                      MM/DD/YYYY
                    </option>

                    <option>
                      YYYY-MM-DD
                    </option>

                  </select>

                </label>

                <label className="text-xs font-semibold text-slate-600">

                  Landing page

                  <select
                    className={
                      inputClass
                    }
                    value={
                      preferences.landingPage
                    }
                    onChange={(
                      event,
                    ) =>
                      setPreferences(
                        (
                          current,
                        ) => ({
                          ...current,
                          landingPage:
                            event
                              .target
                              .value,
                        }),
                      )
                    }
                  >

                    <option>
                      Dashboard
                    </option>

                    <option>
                      Cash Flow
                    </option>

                    <option>
                      Analytics
                    </option>

                    <option>
                      AI Insights
                    </option>

                  </select>

                </label>

              </div>

              <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3">

                <div>

                  <p className="text-xs font-bold">
                    Compact workspace
                  </p>

                  <p className="mt-1 text-[11px] text-slate-500">
                    Reduce spacing across the application.
                  </p>

                </div>

                <Toggle
                  checked={
                    preferences.compactMode
                  }
                  onChange={(
                    value,
                  ) =>
                    setPreferences(
                      (
                        current,
                      ) => ({
                        ...current,
                        compactMode:
                          value,
                      }),
                    )
                  }
                />

              </div>

              <button
                type="button"
                onClick={
                  savePreferences
                }
                disabled={
                  saving
                }
                className="mt-4 inline-flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-bold text-sky-700 disabled:opacity-60"
              >
                <Save
                  size={14}
                />
                Save Workspace
              </button>

            </Section>

          </div>

          {/* ================================================================
             ACTIVITY + EXPORT
          ================================================================ */}

          <div className="mt-5 grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">

            <Section
              eyebrow="Audit trail"
              title="Recent activity"
            >

              {activity.length ? (

                <div className="space-y-4">

                  {activity.map(
                    (
                      item,
                    ) => (
                      <div
                        key={
                          item.id
                        }
                        className="flex items-start gap-3"
                      >

                        <span
                          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.tone}`}
                        />

                        <div className="min-w-0">

                          <p className="break-words text-xs font-semibold">
                            {
                              item.label
                            }
                          </p>

                          <p className="mt-0.5 text-[11px] text-slate-400">
                            {
                              item.date
                            }
                          </p>

                        </div>

                      </div>
                    ),
                  )}

                </div>

              ) : (

                <div className="rounded-xl border border-dashed border-slate-200 p-5 text-center">

                  <FileText
                    size={22}
                    className="mx-auto text-slate-300"
                  />

                  <p className="mt-2 text-sm font-semibold text-slate-600">
                    No activity available
                  </p>

                  <p className="mt-1 text-[11px] text-slate-400">
                    Activity history will appear here when the backend activity service is connected.
                  </p>

                </div>

              )}

            </Section>

            <Section
              eyebrow="Data"
              title="Export & account"
            >

              <div className="space-y-2">

                <button
                  type="button"
                  onClick={() =>
                    setExportModal(
                      true,
                    )
                  }
                  className="flex w-full items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-left text-xs font-bold text-slate-700 hover:border-sky-200"
                >
                  <Download
                    size={15}
                  />

                  Export my data
                </button>

                <Link
                  href="/help"
                  className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700"
                >
                  <CircleHelp
                    size={15}
                  />

                  Help Centre
                </Link>

                <button
                  type="button"
                  onClick={() =>
                    void logout()
                  }
                  disabled={
                    saving
                  }
                  className="flex w-full items-center gap-2 rounded-lg border border-rose-100 px-3 py-2 text-left text-xs font-bold text-rose-600 hover:bg-rose-50 disabled:opacity-60"
                >
                  <LogOut
                    size={15}
                  />

                  {saving
                    ? 'Logging out...'
                    : 'Log out'}
                </button>

              </div>

            </Section>

          </div>

          {/* ================================================================
             FOOTER
          ================================================================ */}

          <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4">

            <div className="flex flex-col gap-3 text-[11px] text-slate-500 sm:flex-row sm:items-center sm:justify-between">

              <div className="flex items-center gap-2">

                <Settings2
                  size={14}
                />

                <span>
                  CashGuard-AI User Control Centre
                </span>

              </div>

              <div className="flex flex-wrap gap-4">

                <span>
                  <Users
                    className="mr-1 inline"
                    size={12}
                  />

                  {team.length}
                  {' '}
                  team
                </span>

                <span>
                  <Wifi
                    className="mr-1 inline"
                    size={12}
                  />

                  {connectedAccounts}
                  {' '}
                  connected
                </span>

                <span>
                  <Sparkles
                    className="mr-1 inline"
                    size={12}
                  />

                  AI{' '}
                  {ai.enabled
                    ? 'enabled'
                    : 'disabled'}
                </span>

              </div>

            </div>

          </div>

        </div>
      </main>

      {/* ====================================================================
          PASSWORD MODAL
      ==================================================================== */}

      {passwordModal && (
        <Modal
          eyebrow="Security"
          title="Change password"
          onClose={() =>
            setPasswordModal(
              false,
            )
          }
          footer={
            <>
              <button
                type="button"
                onClick={() =>
                  setPasswordModal(
                    false,
                  )
                }
                className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={
                  updatePassword
                }
                disabled={
                  saving
                }
                className="rounded-lg bg-sky-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-60"
              >
                Update Password
              </button>
            </>
          }
        >

          <div className="space-y-3">

            <Field
              label="Current Password"
              value={
                passwords.current
              }
              onChange={(
                value,
              ) =>
                setPasswords(
                  (
                    current,
                  ) => ({
                    ...current,
                    current:
                      value,
                  }),
                )
              }
              type={
                showPassword
                  ? 'text'
                  : 'password'
              }
            />

            <div className="relative">

              <Field
                label="New Password"
                value={
                  passwords.next
                }
                onChange={(
                  value,
                ) =>
                  setPasswords(
                    (
                      current,
                    ) => ({
                      ...current,
                      next: value,
                    }),
                  )
                }
                type={
                  showPassword
                    ? 'text'
                    : 'password'
                }
              />

              <button
                type="button"
                onClick={() =>
                  setShowPassword(
                    (
                      value,
                    ) =>
                      !value,
                  )
                }
                className="absolute right-3 top-7 text-slate-400"
                aria-label="Toggle password visibility"
              >
                {showPassword ? (
                  <EyeOff
                    size={16}
                  />
                ) : (
                  <Eye
                    size={16}
                  />
                )}
              </button>

            </div>

            <Field
              label="Confirm Password"
              value={
                passwords.confirm
              }
              onChange={(
                value,
              ) =>
                setPasswords(
                  (
                    current,
                  ) => ({
                    ...current,
                    confirm:
                      value,
                  }),
                )
              }
              type={
                showPassword
                  ? 'text'
                  : 'password'
              }
            />

            <div className="rounded-lg bg-slate-50 p-3 text-xs">

              Password strength:{' '}

              <span
                className={`font-bold ${
                  passwordStrength ===
                  'Strong'
                    ? 'text-emerald-600'
                    : passwordStrength ===
                        'Medium'
                      ? 'text-amber-600'
                      : 'text-slate-500'
                }`}
              >
                {
                  passwordStrength
                }
              </span>

            </div>

          </div>

        </Modal>
      )}

      {/* ====================================================================
          2FA MODAL
      ==================================================================== */}

      {twoFactorModal && (
        <Modal
          eyebrow="Security"
          title="Two-factor authentication"
          onClose={() =>
            setTwoFactorModal(
              false,
            )
          }
          footer={
            <button
              type="button"
              onClick={() => {
                setTwoFactorModal(
                  false,
                )

                feedback(
                  '2FA setup flow is ready for the backend verification step.',
                )
              }}
              className="rounded-lg bg-sky-600 px-3 py-2 text-xs font-bold text-white"
            >
              Continue Setup
            </button>
          }
        >

          <div className="rounded-xl bg-sky-50 p-4">

            <div className="flex items-center gap-3">

              <ShieldCheck
                size={22}
                className="text-sky-600"
              />

              <div>

                <p className="text-sm font-bold">
                  Protect your account
                </p>

                <p className="mt-1 text-[11px] leading-5 text-slate-600">
                  Two-factor authentication will require an additional verification step when signing in.
                </p>

              </div>

            </div>

          </div>

        </Modal>
      )}

      {/* ====================================================================
          TEAM MODAL
      ==================================================================== */}

      {teamModal && (
        <Modal
          eyebrow="Workspace"
          title="Invite team member"
          onClose={() =>
            setTeamModal(
              false,
            )
          }
          footer={
            <>
              <button
                type="button"
                onClick={() =>
                  setTeamModal(
                    false,
                  )
                }
                className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() =>
                  void inviteMember()
                }
                disabled={
                  saving
                }
                className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-60"
              >
                <Mail
                  size={14}
                />

                {saving
                  ? 'Sending...'
                  : 'Send Invite'}
              </button>
            </>
          }
        >

          <div className="space-y-3">

            <Field
              label="Name"
              value={
                newMember.name
              }
              onChange={(
                value,
              ) =>
                setNewMember(
                  (
                    current,
                  ) => ({
                    ...current,
                    name:
                      value,
                  }),
                )
              }
            />

            <Field
              label="Email"
              value={
                newMember.email
              }
              onChange={(
                value,
              ) =>
                setNewMember(
                  (
                    current,
                  ) => ({
                    ...current,
                    email:
                      value,
                  }),
                )
              }
              type="email"
            />

            <label className="text-xs font-semibold text-slate-600">

              Role

              <select
                className={
                  inputClass
                }
                value={
                  newMember.role
                }
                onChange={(
                  event,
                ) =>
                  setNewMember(
                    (
                      current,
                    ) => ({
                      ...current,
                      role:
                        event
                          .target
                          .value,
                    }),
                  )
                }
              >

                <option>
                  Viewer
                </option>

                <option>
                  Finance Manager
                </option>

                <option>
                  Administrator
                </option>

              </select>

            </label>

          </div>

        </Modal>
      )}

      {/* ====================================================================
          EXPORT MODAL
      ==================================================================== */}

      {exportModal && (
        <Modal
          eyebrow="Data"
          title="Export your data"
          onClose={() =>
            setExportModal(
              false,
            )
          }
        >

          <div className="grid gap-3 sm:grid-cols-2">

            <button
              type="button"
              onClick={() =>
                void exportUserData(
                  'json',
                )
              }
              className="rounded-xl border border-slate-200 p-4 text-left hover:border-sky-300"
            >

              <Database
                size={20}
                className="text-sky-600"
              />

              <p className="mt-3 text-sm font-bold">
                JSON export
              </p>

              <p className="mt-1 text-[11px] text-slate-500">
                Complete structured account data.
              </p>

            </button>

            <button
              type="button"
              onClick={() =>
                void exportUserData(
                  'csv',
                )
              }
              className="rounded-xl border border-slate-200 p-4 text-left hover:border-sky-300"
            >

              <FileText
                size={20}
                className="text-sky-600"
              />

              <p className="mt-3 text-sm font-bold">
                CSV export
              </p>

              <p className="mt-1 text-[11px] text-slate-500">
                Portable account summary for spreadsheets.
              </p>

            </button>

          </div>

        </Modal>
      )}
    </>
  )
}