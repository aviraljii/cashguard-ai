'use client'

import {
  type FormEvent,
  useMemo,
  useState,
} from 'react'

import Link from 'next/link'
import { useRouter } from 'next/navigation'

import {
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
  Sparkles,
} from 'lucide-react'

// ============================================================
// API CONFIG
// ============================================================

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:8000'
).replace(/\/+$/, '')

const CONFIGURED_BUSINESS_ID =
  process.env.NEXT_PUBLIC_BUSINESS_ID?.trim() || ''

// ============================================================
// TYPES
// ============================================================

export type User = {
  id: string | number
  email: string
  name?: string
  fullName?: string
  full_name?: string
  businessId?: string
  business_id?: string
  role?: string
  is_active?: boolean
}

export type Business = {
  id: string
  name: string
  type?: string
  gstin?: string
}

export type AuthResponse = {
  access_token?: string
  accessToken?: string

  refresh_token?: string
  refreshToken?: string

  token_type?: string

  expires_in?: number
  expiresIn?: number

  user?: User
  business?: Business

  message?: string
  detail?: unknown
}

export type LoginRequest = {
  email: string
  password: string
}

export type RegisterRequest = {
  name: string
  email: string
  password: string
}

type AuthState =
  | 'idle'
  | 'submitting'
  | 'success'
  | 'error'

// ============================================================
// PAGE COPY
// ============================================================

const copy = {
  '/login': [
    'Welcome back',
    'Sign in to your CashGuard-AI workspace.',
  ],
  '/register': [
    'Create your account',
    'Set up your business finance control centre.',
  ],
  '/forgot-password': [
    'Reset your password',
    'We will send secure instructions to your business email.',
  ],
  '/reset-password': [
    'Create a new password',
    'Use a strong password to keep your business account secure.',
  ],
} as const

// ============================================================
// STORAGE KEYS
// ============================================================

const ACCESS_TOKEN_KEYS = [
  'access_token',
  'accessToken',
  'token',
  'auth_token',
  'jwt_token',
  'jwt',
  'cashguard_access_token',
  'cashguard_token',
]

const REFRESH_TOKEN_KEYS = [
  'refresh_token',
  'refreshToken',
]

const USER_KEYS = [
  'cashguard-user',
  'cashguard_user',
  'currentUser',
  'current_user',
]

const BUSINESS_KEYS = [
  'business_id',
  'businessId',
  'cashguard_business_id',
]

// ============================================================
// PASSWORD INPUT
// ============================================================

function PasswordInput({
  label,
  value,
  onChange,
  show,
  setShow,
  name,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  show: boolean
  setShow: (value: boolean) => void
  name: string
}) {
  return (
    <label className="auth-module-label">
      {label}

      <span className="auth-module-password">
        <input
          name={name}
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(event) =>
            onChange(event.target.value)
          }
          minLength={8}
          maxLength={72}
          required
          autoComplete={
            name === 'password'
              ? 'current-password'
              : 'new-password'
          }
        />

        <button
          type="button"
          aria-label={
            show
              ? `Hide ${label.toLowerCase()}`
              : `Show ${label.toLowerCase()}`
          }
          onClick={() => setShow(!show)}
        >
          {show ? (
            <EyeOff size={16} />
          ) : (
            <Eye size={16} />
          )}
        </button>
      </span>
    </label>
  )
}

// ============================================================
// PASSWORD STRENGTH
// ============================================================

function Strength({
  value,
}: {
  value: string
}) {
  const score = useMemo(
    () =>
      [
        value.length >= 8,
        /[A-Z]/.test(value),
        /\d/.test(value),
        /[^A-Za-z0-9]/.test(value),
      ].filter(Boolean).length,
    [value],
  )

  const label =
    score <= 1
      ? 'Weak'
      : score <= 2
        ? 'Medium'
        : 'Strong'

  const blocks =
    score <= 1
      ? 1
      : score <= 2
        ? 2
        : 3

  return (
    <div
      className="auth-strength"
      aria-live="polite"
    >
      <div>
        {[0, 1, 2].map((index) => (
          <i
            key={index}
            className={
              index < blocks
                ? label.toLowerCase()
                : ''
            }
          />
        ))}
      </div>

      <span>
        Password strength: {label}
      </span>
    </div>
  )
}

// ============================================================
// MARKETING
// ============================================================

function Marketing() {
  return (
    <section className="auth-module-marketing">
      <Link
        href="/login"
        className="auth-module-brand"
      >
        <span className="auth-module-mark">
          ⌁
        </span>

        <span>
          cashguard
          <span>-ai</span>
        </span>
      </Link>

      <div className="auth-module-pitch">
        <span className="auth-module-badge">
          <Sparkles size={14} />
          Built for Indian MSMEs
        </span>

        <h1>
          Know your cash.
          <br />
          <b>Predict your risk.</b>
          <br />
          Pay smarter.
        </h1>

        <p>
          One clear view for collections,
          payments, working capital and the
          decisions that keep your business
          moving.
        </p>

        <div className="auth-module-signal">
          <LockKeyhole size={16} />

          <span>
            <strong>
              Secure business access
            </strong>

            <small>
              JWT authenticated session with
              your FastAPI backend.
            </small>
          </span>
        </div>
      </div>

      <small className="auth-module-footer">
        © 2026 CashGuard-AI · Financial
        operations, made clear.
      </small>
    </section>
  )
}

// ============================================================
// ERROR PARSER
// ============================================================

async function parseApiError(
  response: Response,
): Promise<string> {
  try {
    const body =
      (await response.json()) as {
        detail?: unknown
        message?: string
      }

    if (
      typeof body?.detail === 'string'
    ) {
      return body.detail
    }

    if (
      Array.isArray(body?.detail)
    ) {
      return body.detail
        .map((item) => {
          if (
            typeof item === 'object' &&
            item !== null &&
            'msg' in item
          ) {
            const msg =
              (item as {
                msg?: unknown
              }).msg

            return typeof msg === 'string'
              ? msg
              : 'Validation error'
          }

          return 'Validation error'
        })
        .join(', ')
    }

    if (
      typeof body?.message ===
      'string'
    ) {
      return body.message
    }
  } catch {
    // Ignore non-JSON error responses.
  }

  return `Request failed with status ${response.status}.`
}

// ============================================================
// TOKEN HELPERS
// ============================================================

function cleanToken(
  value: unknown,
): string | null {
  if (
    typeof value !== 'string'
  ) {
    return null
  }

  const cleaned = value
    .trim()
    .replace(
      /^Bearer\s+/i,
      '',
    )
    .trim()

  return cleaned || null
}

function getAccessToken(
  response: AuthResponse,
): string | null {
  return cleanToken(
    response.access_token ||
      response.accessToken,
  )
}

function getRefreshToken(
  response: AuthResponse,
): string | null {
  return cleanToken(
    response.refresh_token ||
      response.refreshToken,
  )
}

// ============================================================
// NORMALIZE USER
// ============================================================

function normalizeUser(
  user: User | undefined,
): User | null {
  if (!user) {
    return null
  }

  const businessId =
    String(
      user.businessId ||
        user.business_id ||
        '',
    ).trim()

  return {
    ...user,

    name:
      user.name ||
      user.fullName ||
      user.full_name ||
      '',

    fullName:
      user.fullName ||
      user.full_name ||
      user.name ||
      '',

    businessId:
      businessId || undefined,

    business_id:
      businessId || undefined,
  }
}

// ============================================================
// STORAGE HELPERS
// ============================================================

function removeKeys(
  storage: Storage,
  keys: string[],
): void {
  for (const key of keys) {
    try {
      storage.removeItem(key)
    } catch {
      // Ignore storage errors.
    }
  }
}

function clearAuthStorage(): void {
  if (
    typeof window ===
    'undefined'
  ) {
    return
  }

  const storages = [
    window.localStorage,
    window.sessionStorage,
  ]

  for (const storage of storages) {
    removeKeys(
      storage,
      [
        ...ACCESS_TOKEN_KEYS,
        ...REFRESH_TOKEN_KEYS,
        ...USER_KEYS,
        ...BUSINESS_KEYS,
        'cashguard-auth',
        'cashguard-authenticated',
        'cashguard-business',
      ],
    )
  }
}

// ============================================================
// STORE SESSION
// ============================================================

function storeAuthSession(
  authResponse: AuthResponse,
  rememberDevice: boolean,
): void {
  if (
    typeof window ===
    'undefined'
  ) {
    return
  }

  const accessToken =
    getAccessToken(authResponse)

  if (!accessToken) {
    throw new Error(
      'Login succeeded but the backend did not return access_token.',
    )
  }

  /*
   * Remove old client-side JWT copies first.
   *
   * HttpOnly cookie cannot be accessed by JavaScript,
   * which is intentional.
   */
  clearAuthStorage()

  const storage =
    rememberDevice
      ? window.localStorage
      : window.sessionStorage

  // ----------------------------------------------------------
  // Access token compatibility
  // ----------------------------------------------------------

  storage.setItem(
    'access_token',
    accessToken,
  )

  storage.setItem(
    'accessToken',
    accessToken,
  )

  storage.setItem(
    'token',
    accessToken,
  )

  storage.setItem(
    'auth_token',
    accessToken,
  )

  storage.setItem(
    'jwt_token',
    accessToken,
  )

  storage.setItem(
    'cashguard_access_token',
    accessToken,
  )

  storage.setItem(
    'cashguard_token',
    accessToken,
  )

  // ----------------------------------------------------------
  // Refresh token when provided
  // ----------------------------------------------------------

  const refreshToken =
    getRefreshToken(authResponse)

  if (refreshToken) {
    storage.setItem(
      'refresh_token',
      refreshToken,
    )

    storage.setItem(
      'refreshToken',
      refreshToken,
    )
  }

  // ----------------------------------------------------------
  // Authentication markers
  // ----------------------------------------------------------

  storage.setItem(
    'cashguard-auth',
    'authenticated',
  )

  storage.setItem(
    'cashguard-authenticated',
    'true',
  )

  // ----------------------------------------------------------
  // User
  // ----------------------------------------------------------

  const normalizedUser =
    normalizeUser(
      authResponse.user,
    )

  if (normalizedUser) {
    storage.setItem(
      'cashguard-user',
      JSON.stringify(
        normalizedUser,
      ),
    )

    const userBusinessId =
      normalizedUser.businessId ||
      normalizedUser.business_id

    if (
      userBusinessId
    ) {
      storage.setItem(
        'business_id',
        userBusinessId,
      )

      storage.setItem(
        'businessId',
        userBusinessId,
      )
    }
  }

  // ----------------------------------------------------------
  // Business
  // ----------------------------------------------------------

  if (
    authResponse.business
  ) {
    storage.setItem(
      'cashguard-business',
      JSON.stringify(
        authResponse.business,
      ),
    )

    const businessId =
      authResponse.business.id?.trim()

    if (businessId) {
      storage.setItem(
        'business_id',
        businessId,
      )

      storage.setItem(
        'businessId',
        businessId,
      )
    }
  }

  // ----------------------------------------------------------
  // Configured business fallback
  // ----------------------------------------------------------

  if (
    CONFIGURED_BUSINESS_ID
  ) {
    const existingBusinessId =
      storage.getItem(
        'business_id',
      )

    if (!existingBusinessId) {
      storage.setItem(
        'business_id',
        CONFIGURED_BUSINESS_ID,
      )

      storage.setItem(
        'businessId',
        CONFIGURED_BUSINESS_ID,
      )
    }
  }

  // ----------------------------------------------------------
  // Notify application
  // ----------------------------------------------------------

  window.dispatchEvent(
    new Event('auth-changed'),
  )

  window.dispatchEvent(
    new StorageEvent(
      'storage',
      {
        key: 'access_token',
        newValue: accessToken,
        storageArea: storage,
      },
    ),
  )
}

// ============================================================
// FETCH CURRENT USER
// ============================================================

async function fetchCurrentUser(
  accessToken: string,
): Promise<User | null> {
  try {
    const headers =
      new Headers()

    headers.set(
      'Accept',
      'application/json',
    )

    headers.set(
      'Authorization',
      `Bearer ${accessToken}`,
    )

    const response =
      await fetch(
        `${API_BASE_URL}/api/auth/me`,
        {
          method: 'GET',
          headers,
          credentials: 'include',
          cache: 'no-store',
        },
      )

    if (!response.ok) {
      return null
    }

    const user =
      (await response.json()) as User

    return normalizeUser(
      user,
    )
  } catch {
    return null
  }
}

// ============================================================
// PING AUTH AFTER LOGIN
// ============================================================

async function verifyAuthenticatedSession(
  accessToken: string,
): Promise<void> {
  const currentUser =
    await fetchCurrentUser(
      accessToken,
    )

  if (
    !currentUser
  ) {
    throw new Error(
      'Login token was issued, but the authenticated session could not be verified.',
    )
  }

  if (
    typeof window ===
    'undefined'
  ) {
    return
  }

  const localUser =
    window.localStorage.getItem(
      'cashguard-user',
    )

  const sessionUser =
    window.sessionStorage.getItem(
      'cashguard-user',
    )

  const activeStorage =
    localUser
      ? window.localStorage
      : window.sessionStorage

  activeStorage.setItem(
    'cashguard-user',
    JSON.stringify(
      currentUser,
    ),
  )

  const businessId =
    currentUser.businessId ||
    currentUser.business_id

  if (
    businessId
  ) {
    activeStorage.setItem(
      'business_id',
      businessId,
    )

    activeStorage.setItem(
      'businessId',
      businessId,
    )
  }
}

// ============================================================
// AUTH MODULE
// ============================================================

export default function AuthModule({
  path,
}: {
  path: keyof typeof copy
}) {
  const router =
    useRouter()

  const [
    state,
    setState,
  ] =
    useState<AuthState>('idle')

  const [
    error,
    setError,
  ] =
    useState('')

  const [
    showPassword,
    setShowPassword,
  ] =
    useState(false)

  const [
    showConfirm,
    setShowConfirm,
  ] =
    useState(false)

  const [
    password,
    setPassword,
  ] =
    useState('')

  const [
    confirm,
    setConfirm,
  ] =
    useState('')

  const isRegister =
    path === '/register'

  const isForgot =
    path === '/forgot-password'

  const isReset =
    path === '/reset-password'

  // ==========================================================
  // SUBMIT
  // ==========================================================

  const submit = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault()

    setError('')
    setState('submitting')

    const data =
      new FormData(
        event.currentTarget,
      )

    const email =
      String(
        data.get('email') || '',
      )
        .trim()
        .toLowerCase()

    const rememberDevice =
      data.get(
        'rememberDevice',
      ) === 'on'

    try {
      // ======================================================
      // LOGIN
      // ======================================================

      if (
        path === '/login'
      ) {
        if (
          !email ||
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
            email,
          )
        ) {
          setState('error')

          setError(
            'Enter a valid business email.',
          )

          return
        }

        if (
          password.length < 8
        ) {
          setState('error')

          setError(
            'Password must be at least 8 characters.',
          )

          return
        }

        const payload:
          LoginRequest = {
            email,
            password,
          }

        const response =
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

              body: JSON.stringify(
                payload,
              ),

              /*
               * Critical:
               * receive/store FastAPI HttpOnly cookie.
               */
              credentials: 'include',

              cache: 'no-store',
            },
          )

        if (!response.ok) {
          setState('error')

          throw new Error(
            await parseApiError(
              response,
            ),
          )
        }

        const authResponse =
          (await response.json()) as AuthResponse

        const accessToken =
          getAccessToken(
            authResponse,
          )

        if (!accessToken) {
          setState('error')

          throw new Error(
            'Backend login succeeded but no access_token was returned.',
          )
        }

        // ----------------------------------------------------
        // Store JWT for existing frontend API clients.
        // ----------------------------------------------------

        storeAuthSession(
          authResponse,
          rememberDevice,
        )

        // ----------------------------------------------------
        // Verify the token immediately.
        // ----------------------------------------------------

        await verifyAuthenticatedSession(
          accessToken,
        )

        // ----------------------------------------------------
        // Fire event once more after /me verification.
        // This ensures Banking / Payments reload with token.
        // ----------------------------------------------------

        window.dispatchEvent(
          new Event(
            'auth-changed',
          ),
        )

        setState('success')

        // ----------------------------------------------------
        // Redirect
        // ----------------------------------------------------

        const target =
          new URLSearchParams(
            window.location.search,
          ).get('next') ||
          '/dashboard'

        router.replace(
          target,
        )

        router.refresh()

        return
      }

      // ======================================================
      // REGISTER
      // ======================================================

      if (
        isRegister
      ) {
        const fullName =
          String(
            data.get(
              'fullName',
            ) || '',
          ).trim()

        if (
          fullName.length < 2
        ) {
          setState('error')

          setError(
            'Enter your full name.',
          )

          return
        }

        if (
          !email ||
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
            email,
          )
        ) {
          setState('error')

          setError(
            'Enter a valid business email.',
          )

          return
        }

        if (
          password.length < 8
        ) {
          setState('error')

          setError(
            'Password must be at least 8 characters.',
          )

          return
        }

        if (
          password !== confirm
        ) {
          setState('error')

          setError(
            'Passwords do not match.',
          )

          return
        }

        /*
         * IMPORTANT:
         *
         * Your current FastAPI backend UserRegister is:
         *
         *   name
         *   email
         *   password
         *
         * So we send exactly those fields.
         *
         * businessName/mobile/businessType/state/city/gstin
         * are intentionally not sent to prevent schema mismatch.
         */
        const registerPayload:
          RegisterRequest = {
            name: fullName,
            email,
            password,
          }

        const response =
          await fetch(
            `${API_BASE_URL}/api/auth/register`,
            {
              method: 'POST',

              headers: {
                'Content-Type':
                  'application/json',
                Accept:
                  'application/json',
              },

              body: JSON.stringify(
                registerPayload,
              ),

              credentials: 'include',

              cache: 'no-store',
            },
          )

        if (!response.ok) {
          setState('error')

          throw new Error(
            await parseApiError(
              response,
            ),
          )
        }

        setState('success')

        return
      }

      // ======================================================
      // FORGOT PASSWORD
      // ======================================================

      if (
        isForgot
      ) {
        if (
          !email ||
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
            email,
          )
        ) {
          setState('error')

          setError(
            'Enter a valid business email.',
          )

          return
        }

        /*
         * Your current backend does not expose a forgot-password
         * endpoint in auth.py, so this remains UI-only for now.
         */
        setState('success')

        return
      }

      // ======================================================
      // RESET PASSWORD
      // ======================================================

      if (
        isReset
      ) {
        if (
          password.length < 8
        ) {
          setState('error')

          setError(
            'Password must be at least 8 characters.',
          )

          return
        }

        if (
          password !== confirm
        ) {
          setState('error')

          setError(
            'Passwords do not match.',
          )

          return
        }

        /*
         * Current backend has no reset-token endpoint.
         * Keep UI behaviour safe until that API is implemented.
         */
        setState('success')

        return
      }

      setState('success')
    } catch (err) {
      setState('error')

      setError(
        err instanceof Error
          ? err.message
          : 'Unable to complete authentication.',
      )
    }
  }

  const title =
    copy[path][0]

  const subtitle =
    copy[path][1]

  // ==========================================================
  // RENDER
  // ==========================================================

  return (
    <main className="auth-module-page">
      <Marketing />

      <section className="auth-module-form-wrap">
        <div className="auth-module-mobile-brand">
          <Link
            href="/login"
            className="auth-module-brand"
          >
            <span className="auth-module-mark">
              ⌁
            </span>

            <span>
              cashguard
              <span>-ai</span>
            </span>
          </Link>
        </div>

        <div className="auth-module-card">
          <div className="auth-module-heading">
            <span className="auth-module-eyebrow">
              {isRegister
                ? 'GET STARTED'
                : 'SECURE BUSINESS ACCESS'}
            </span>

            <h2>
              {title}
            </h2>

            <p>
              {subtitle}
            </p>
          </div>

          {state ===
          'success' ? (
            <div className="auth-module-success">
              <span>
                <Check size={22} />
              </span>

              <h3>
                {isForgot
                  ? 'Check your inbox'
                  : isReset
                    ? 'Password updated'
                    : isRegister
                      ? 'Account created'
                      : 'Signed in successfully'}
              </h3>

              <p>
                {isForgot
                  ? "If an account exists for this email, you'll receive reset instructions shortly."
                  : isReset
                    ? 'Your password has been updated. You can sign in now.'
                    : isRegister
                      ? 'Your account has been created. You can sign in using your business credentials.'
                      : 'Your secure session has been established.'}
              </p>

              <Link
                className="auth-module-button"
                href="/login"
              >
                {isForgot ||
                isReset ||
                isRegister
                  ? 'Back to login'
                  : 'Continue'}

                <ArrowRight
                  size={15}
                />
              </Link>
            </div>
          ) : (
            <form
              className="auth-module-form"
              onSubmit={submit}
              noValidate
            >
              {isRegister && (
                <>
                  <label className="auth-module-label">
                    Full name

                    <input
                      name="fullName"
                      placeholder="Aviral Kaushik"
                      required
                      minLength={2}
                      maxLength={100}
                      autoComplete="name"
                    />
                  </label>

                  <label className="auth-module-label">
                    Business name

                    <input
                      name="businessName"
                      placeholder="Your business name"
                      required
                    />
                  </label>

                  <div className="auth-module-two">
                    <label className="auth-module-label">
                      Mobile number

                      <input
                        name="mobile"
                        inputMode="tel"
                        placeholder="+91 98765 43210"
                        required
                      />
                    </label>

                    <label className="auth-module-label">
                      Business type

                      <select
                        name="businessType"
                        defaultValue=""
                        required
                      >
                        <option
                          value=""
                          disabled
                        >
                          Select type
                        </option>

                        {[
                          'Retail',
                          'Wholesale',
                          'Manufacturing',
                          'Services',
                          'Trading',
                          'Other',
                        ].map(
                          (item) => (
                            <option
                              key={item}
                              value={item}
                            >
                              {item}
                            </option>
                          ),
                        )}
                      </select>
                    </label>
                  </div>

                  <div className="auth-module-two">
                    <label className="auth-module-label">
                      State

                      <input
                        name="state"
                        placeholder="Rajasthan"
                        required
                      />
                    </label>

                    <label className="auth-module-label">
                      City

                      <input
                        name="city"
                        placeholder="Jaipur"
                        required
                      />
                    </label>
                  </div>

                  <label className="auth-module-label">
                    GSTIN

                    <span className="auth-module-hint">
                      Optional · format-ready
                    </span>

                    <input
                      name="gstin"
                      placeholder="08AABCU9603R1ZM"
                      pattern="[0-9A-Z]{15}"
                    />
                  </label>
                </>
              )}

              {!isReset && (
                <label className="auth-module-label">
                  Business email

                  <input
                    name="email"
                    type="email"
                    placeholder="you@company.in"
                    required
                    autoComplete="email"
                  />
                </label>
              )}

              {!isForgot && (
                <>
                  <PasswordInput
                    label={
                      isReset
                        ? 'New password'
                        : 'Password'
                    }
                    name="password"
                    value={password}
                    onChange={
                      setPassword
                    }
                    show={
                      showPassword
                    }
                    setShow={
                      setShowPassword
                    }
                  />

                  {(isRegister ||
                    isReset) && (
                    <>
                      <PasswordInput
                        label="Confirm password"
                        name="confirm"
                        value={confirm}
                        onChange={
                          setConfirm
                        }
                        show={
                          showConfirm
                        }
                        setShow={
                          setShowConfirm
                        }
                      />

                      <Strength
                        value={password}
                      />
                    </>
                  )}
                </>
              )}

              {error && (
                <p
                  className="auth-module-error"
                  role="alert"
                >
                  {error}
                </p>
              )}

              {path ===
                '/login' && (
                <div className="auth-module-options">
                  <label>
                    <input
                      type="checkbox"
                      name="rememberDevice"
                    />

                    Remember this device
                  </label>

                  <Link href="/forgot-password">
                    Forgot password?
                  </Link>
                </div>
              )}

              <button
                className="auth-module-button"
                type="submit"
                disabled={
                  state ===
                  'submitting'
                }
              >
                {state ===
                  'submitting' && (
                  <Loader2
                    size={15}
                    className="auth-module-spin"
                  />
                )}

                {state ===
                'submitting'
                  ? isRegister
                    ? 'Creating account...'
                    : isForgot
                      ? 'Sending reset link...'
                      : isReset
                        ? 'Updating password...'
                        : 'Signing in...'
                  : isRegister
                    ? 'Create Account'
                    : isForgot
                      ? 'Send Reset Link'
                      : isReset
                        ? 'Update Password'
                        : 'Sign in'}

                {state !==
                  'submitting' && (
                  <ArrowRight
                    size={15}
                  />
                )}
              </button>

              {path ===
                '/login' ? (
                <p className="auth-module-switch">
                  New to CashGuard-AI?{' '}
                  <Link href="/register">
                    Create an account
                  </Link>
                </p>
              ) : path ===
                '/register' ? (
                <p className="auth-module-switch">
                  Already have an account?{' '}
                  <Link href="/login">
                    Sign in
                  </Link>
                </p>
              ) : (
                <p className="auth-module-switch">
                  <Link href="/login">
                    Back to Login
                  </Link>
                </p>
              )}
            </form>
          )}
        </div>
      </section>
    </main>
  )
}