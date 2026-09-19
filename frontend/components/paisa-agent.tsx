'use client'

import type { FormEvent } from 'react'
import {
  useEffect,
  useRef,
  useState,
} from 'react'
import { useSearchParams } from 'next/navigation'
import {
  Bot,
  Loader2,
  Send,
  Sparkles,
  RefreshCw,
} from 'lucide-react'

/* ============================================================
   TYPES
   ============================================================ */

type PaisaReply = {
  success?: boolean
  agent?: string
  response?: string
  model?: string
  intent?: string
  sources?: string[]
  conversation_id?: string | null
  business_id?: string | null
  needs_confirmation?: boolean
  generated_at?: string
}

type PaisaErrorResponse = {
  detail?: string
  message?: string
}

type Message = {
  role: 'user' | 'assistant'
  text: string
  sources?: string[]
  intent?: string
  needsConfirmation?: boolean
}

/* ============================================================
   API CONFIG
   ============================================================ */

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:8000'
).replace(/\/+$/, '')

const ENV_BUSINESS_ID =
  process.env.NEXT_PUBLIC_BUSINESS_ID?.trim() || ''

/* ============================================================
   AUTH STORAGE KEYS
   ============================================================ */

const TOKEN_KEYS = [
  'cashguard_access_token',
  'access_token',
  'accessToken',
  'token',
  'auth_token',
  'jwt_token',
  'jwt',
  'cashguard_token',
]

const AUTH_OBJECT_KEYS = [
  'auth',
  'session',
  'authData',
  'auth_data',
  'currentUser',
  'current_user',
]

const BUSINESS_ID_KEYS = [
  'business_id',
  'businessId',
  'cashguard_business_id',
  'cashguard_businessId',
]

/* ============================================================
   LIMITS
   ============================================================ */

const MAX_MESSAGE_LENGTH = 2000
const MAX_CONTEXT_MESSAGES = 6
const MAX_CONTEXT_MESSAGE_LENGTH = 1000

/* ============================================================
   SUGGESTIONS
   ============================================================ */

const SUGGESTED_QUESTIONS = [
  'How is my cash position today?',
  'Which invoices are overdue?',
  'Agale 7 din ka cash flow batao',
]

/* ============================================================
   INITIAL MESSAGE
   ============================================================ */

const INITIAL_MESSAGE: Message = {
  role: 'assistant',
  text:
    'Namaste — I’m Paisa. Ask me about your verified cash position, receivables, payments, risks, forecast, or anything about using CashGuard.',
}

/* ============================================================
   TOKEN NORMALIZATION
   ============================================================ */

function cleanToken(
  value: unknown,
): string | null {
  if (
    typeof value !==
    'string'
  ) {
    return null
  }

  const token =
    value
      .trim()
      .replace(
        /^Bearer\s+/i,
        '',
      )
      .trim()

  return token || null
}

/* ============================================================
   TOKEN EXTRACTION
   ============================================================ */

function extractToken(
  value: unknown,
): string | null {
  if (!value) {
    return null
  }

  /*
   * Direct string token.
   */
  if (
    typeof value ===
    'string'
  ) {
    const direct =
      cleanToken(value)

    if (direct) {
      return direct
    }

    /*
     * Some applications store
     * auth state as JSON.
     */
    try {
      return extractToken(
        JSON.parse(value),
      )
    } catch {
      return null
    }
  }

  if (
    typeof value !==
      'object' ||
    value === null
  ) {
    return null
  }

  const object =
    value as Record<
      string,
      unknown
    >

  /*
   * Direct token fields.
   */
  const directKeys = [
    'access_token',
    'accessToken',
    'token',
    'jwt',
    'jwt_token',
    'cashguard_access_token',
  ]

  for (
    const key of
    directKeys
  ) {
    const token =
      cleanToken(
        object[key],
      )

    if (token) {
      return token
    }
  }

  /*
   * Nested auth/session fields.
   */
  const nestedKeys = [
    'data',
    'auth',
    'session',
    'tokens',
    'user',
  ]

  for (
    const key of
    nestedKeys
  ) {
    const token =
      extractToken(
        object[key],
      )

    if (token) {
      return token
    }
  }

  return null
}

/* ============================================================
   STORAGE READER
   ============================================================ */

function storedValue(
  keys: string[],
): string {
  if (
    typeof window ===
    'undefined'
  ) {
    return ''
  }

  const storages: Storage[] = [
    window.localStorage,
    window.sessionStorage,
  ]

  for (
    const storage of
    storages
  ) {
    for (
      const key of
      keys
    ) {
      try {
        const value =
          storage.getItem(key)

        if (!value) {
          continue
        }

        const token =
          extractToken(value)

        if (token) {
          return token
        }
      } catch {
        /*
         * Ignore a single
         * storage failure.
         */
      }
    }
  }

  return ''
}

/* ============================================================
   AUTH TOKEN
   ============================================================ */

function getToken(): string {
  /*
   * First look for normal token keys.
   */
  const directToken =
    storedValue(
      TOKEN_KEYS,
    )

  if (directToken) {
    return directToken
  }

  /*
   * Then look inside serialized
   * authentication/session objects.
   */
  const nestedToken =
    storedValue(
      AUTH_OBJECT_KEYS,
    )

  return nestedToken
}

/* ============================================================
   BUSINESS ID
   ============================================================ */

function getBusinessId(): string {
  return (
    storedValue(
      BUSINESS_ID_KEYS,
    ) ||
    ENV_BUSINESS_ID
  )
}

/* ============================================================
   CLIENT AUTH CLEANUP
   ============================================================ */

function clearStoredTokens(): void {
  if (
    typeof window ===
    'undefined'
  ) {
    return
  }

  const storages: Storage[] = [
    window.localStorage,
    window.sessionStorage,
  ]

  const keysToRemove = [
    ...TOKEN_KEYS,
    ...AUTH_OBJECT_KEYS,
    'auth_logged_in',
    'auth_expires_in',
  ]

  for (
    const storage of
    storages
  ) {
    for (
      const key of
      keysToRemove
    ) {
      try {
        storage.removeItem(
          key,
        )
      } catch {
        /*
         * Ignore storage
         * cleanup errors.
         */
      }
    }
  }

  try {
    /*
     * Notify other CashGuard
     * components that the auth
     * state has changed.
     */
    window.dispatchEvent(
      new Event(
        'auth-changed',
      ),
    )

    window.dispatchEvent(
      new CustomEvent(
        'cashguard-auth-required',
      ),
    )
  } catch {
    /*
     * Ignore event errors.
     */
  }
}

/* ============================================================
   AUTHENTICATED PAISA FETCH
   ============================================================ */

/**
 * Authenticated Paisa API request.
 *
 * Authentication strategy:
 *
 * 1. Bearer JWT + HttpOnly cookie
 * 2. Cookie-only retry if Bearer returns 401
 * 3. Clear stale browser auth if both fail
 *
 * The backend remains responsible for:
 * - JWT validation
 * - user lookup
 * - active-user validation
 * - business authorization
 */
async function paisaFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const token =
    getToken()

  const headers =
    new Headers(
      init.headers,
    )

  /* ----------------------------------------------------------
     ACCEPT
     ---------------------------------------------------------- */

  if (
    !headers.has(
      'Accept',
    )
  ) {
    headers.set(
      'Accept',
      'application/json',
    )
  }

  /* ----------------------------------------------------------
     CONTENT TYPE
     ---------------------------------------------------------- */

  if (
    init.body &&
    !(init.body instanceof FormData) &&
    !headers.has(
      'Content-Type',
    )
  ) {
    headers.set(
      'Content-Type',
      'application/json',
    )
  }

  /* ----------------------------------------------------------
     BEARER TOKEN
     ---------------------------------------------------------- */

  if (token) {
    headers.set(
      'Authorization',
      `Bearer ${token}`,
    )
  }

  /* ----------------------------------------------------------
     REQUEST CONFIG
     ---------------------------------------------------------- */

  const requestInit:
    RequestInit = {
      ...init,
      headers,
      credentials:
        init.credentials ||
        'include',
      cache:
        init.cache ||
        'no-store',
    }

  /* ----------------------------------------------------------
     FIRST REQUEST
     ---------------------------------------------------------- */

  const firstResponse =
    await fetch(
      input,
      requestInit,
    )

  /*
   * Anything except 401 is returned
   * to the calling function.
   */
  if (
    firstResponse.status !==
    401
  ) {
    return firstResponse
  }

  /*
   * If there is no stored token,
   * the browser was already making
   * a cookie-only request.
   */
  if (!token) {
    clearStoredTokens()
    return firstResponse
  }

  /* ----------------------------------------------------------
     COOKIE-ONLY RETRY
     ---------------------------------------------------------- */

  const cookieOnlyHeaders =
    new Headers(
      headers,
    )

  cookieOnlyHeaders.delete(
    'Authorization',
  )

  const retryResponse =
    await fetch(
      input,
      {
        ...init,
        headers:
          cookieOnlyHeaders,
        credentials:
          'include',
        cache:
          init.cache ||
          'no-store',
      },
    )

  /*
   * Cookie authentication worked.
   */
  if (
    retryResponse.status !==
    401
  ) {
    return retryResponse
  }

  /*
   * Both authentication
   * mechanisms failed.
   */
  clearStoredTokens()

  return retryResponse
}

/* ============================================================
   CONVERSATION CONTEXT
   ============================================================ */

function buildRecentContext(
  messages: Message[],
  previousIntent: string,
) {
  const recentMessages =
    messages
      .slice(
        -MAX_CONTEXT_MESSAGES,
      )
      .map(
        (item) => ({
          role:
            item.role,
          text:
            item.text.slice(
              0,
              MAX_CONTEXT_MESSAGE_LENGTH,
            ),
        }),
      )

  return {
    ...(previousIntent
      ? {
          previous_intent:
            previousIntent,
        }
      : {}),

    ...(recentMessages.length
      ? {
          recent_messages:
            recentMessages,
        }
      : {}),
  }
}

/* ============================================================
   RESPONSE PARSER
   ============================================================ */

async function parseResponseBody(
  response: Response,
): Promise<
  PaisaReply &
  PaisaErrorResponse
> {
  try {
    return (
      (await response.json()) as
        | (
            PaisaReply &
            PaisaErrorResponse
          )
    )
  } catch {
    if (
      response.status ===
      401
    ) {
      throw new Error(
        'Your session has expired. Please login again.',
      )
    }

    throw new Error(
      `Paisa returned an invalid response (${response.status}).`,
    )
  }
}

/* ============================================================
   RESPONSE ERROR MESSAGES
   ============================================================ */

function getResponseErrorMessage(
  response: Response,
  body:
    PaisaErrorResponse,
): string {
  if (
    body.detail
  ) {
    return body.detail
  }

  if (
    body.message
  ) {
    return body.message
  }

  if (
    response.status ===
    401
  ) {
    return (
      'Your session has expired. Please login again.'
    )
  }

  if (
    response.status ===
    403
  ) {
    return (
      'You are not authorized to access this business.'
    )
  }

  if (
    response.status ===
    404
  ) {
    return (
      'The requested Paisa resource was not found.'
    )
  }

  if (
    response.status ===
    409
  ) {
    return (
      'Paisa could not connect to the selected business.'
    )
  }

  if (
    response.status >=
    500
  ) {
    return (
      'Paisa is temporarily unavailable. No financial data was changed.'
    )
  }

  return (
    `Paisa request failed with status ${response.status}.`
  )
}

/* ============================================================
   PAISA AGENT
   ============================================================ */

export default function PaisaAgent() {
  const searchParams =
    useSearchParams()

  const [
    messages,
    setMessages,
  ] =
    useState<Message[]>([
      INITIAL_MESSAGE,
    ])

  const [
    draft,
    setDraft,
  ] =
    useState('')

  const [
    loading,
    setLoading,
  ] =
    useState(false)

  const [
    previousIntent,
    setPreviousIntent,
  ] =
    useState('')

  const [
    conversationId,
    setConversationId,
  ] =
    useState('')

  const [
    businessId,
    setBusinessId,
  ] =
    useState('')

  const [
    errorMessage,
    setErrorMessage,
  ] =
    useState('')

  const endRef =
    useRef<
      HTMLDivElement
    >(null)

  /* ==========================================================
     INITIAL BUSINESS ID
     ========================================================== */

  useEffect(() => {
    const resolvedBusinessId =
      getBusinessId()

    setBusinessId(
      resolvedBusinessId,
    )
  }, [])

  /* ==========================================================
     AUTH STATE LISTENER
     ========================================================== */

  useEffect(() => {
    const handleAuthChanged =
      () => {
        const resolvedBusinessId =
          getBusinessId()

        setBusinessId(
          resolvedBusinessId,
        )
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
  }, [])

  /* ==========================================================
     AUTO SCROLL
     ========================================================== */

  useEffect(() => {
    endRef.current?.scrollIntoView(
      {
        behavior: 'smooth',
        block: 'end',
      },
    )
  }, [
    messages,
    loading,
  ])

  /* ==========================================================
     URL PROMPT
     ========================================================== */

  useEffect(() => {
    const prompt =
      searchParams
        .get('prompt')
        ?.trim()

    if (prompt) {
      setDraft(
        prompt.slice(
          0,
          MAX_MESSAGE_LENGTH,
        ),
      )
    }
  }, [
    searchParams,
  ])

  /* ==========================================================
     RESET CONVERSATION
     ========================================================== */

  function resetConversation() {
    setConversationId(
      '',
    )

    setPreviousIntent(
      '',
    )

    setErrorMessage(
      '',
    )

    setMessages([
      {
        ...INITIAL_MESSAGE,
      },
    ])
  }

  /* ==========================================================
     SUBMIT MESSAGE
     ========================================================== */

  async function submit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault()

    if (
      loading
    ) {
      return
    }

    const message =
      draft.trim()

    if (!message) {
      return
    }

    /*
     * Resolve business ID from state
     * first and storage/env second.
     */
    const resolvedBusinessId =
      businessId ||
      getBusinessId()

    /*
     * Resolve token before adding
     * the user message.
     */
    const token =
      getToken()

    /*
     * Give a clear client-side error
     * rather than sending an obviously
     * unauthenticated request.
     */
    if (!token) {
      setErrorMessage(
        'Your CashGuard session is missing. Please login again before using Paisa.',
      )

      return
    }

    /*
     * A business ID is required for
     * live business intelligence.
     */
    if (
      !resolvedBusinessId
    ) {
      setErrorMessage(
        'Business ID is missing for the current CashGuard session.',
      )

      return
    }

    const userMessage: Message = {
      role: 'user',
      text: message,
    }

    const nextMessages =
      [
        ...messages,
        userMessage,
      ]

    setDraft(
      '',
    )

    setErrorMessage(
      '',
    )

    setMessages(
      nextMessages,
    )

    setLoading(
      true,
    )

    try {
      /* ------------------------------------------------------
         BUILD LIVE CONVERSATION CONTEXT
         ------------------------------------------------------ */

      const context =
        buildRecentContext(
          nextMessages,
          previousIntent,
        )

      /* ------------------------------------------------------
         REQUEST PAYLOAD
         ------------------------------------------------------ */

      const payload:
        Record<
          string,
          unknown
        > = {
        message:
          message.slice(
            0,
            MAX_MESSAGE_LENGTH,
          ),

        context,

        /*
         * Paisa requests a 7-day
         * forecast horizon by default.
         */
        horizon_days: 7,
      }

      if (
        resolvedBusinessId
      ) {
        payload.business_id =
          resolvedBusinessId
      }

      if (
        conversationId
      ) {
        payload.conversation_id =
          conversationId
      }

      /* ------------------------------------------------------
         API REQUEST
         ------------------------------------------------------ */

      const response =
        await paisaFetch(
          `${API_BASE_URL}/api/ai/paisa/chat`,
          {
            method:
              'POST',

            credentials:
              'include',

            headers: {
              'Content-Type':
                'application/json',

              Accept:
                'application/json',
            },

            body:
              JSON.stringify(
                payload,
              ),

            cache:
              'no-store',
          },
        )

      /* ------------------------------------------------------
         PARSE RESPONSE
         ------------------------------------------------------ */

      const body =
        await parseResponseBody(
          response,
        )

      /* ------------------------------------------------------
         ERROR HANDLING
         ------------------------------------------------------ */

      if (
        !response.ok
      ) {
        throw new Error(
          getResponseErrorMessage(
            response,
            body,
          ),
        )
      }

      /* ------------------------------------------------------
         CONVERSATION
         ------------------------------------------------------ */

      if (
        body.conversation_id
      ) {
        setConversationId(
          body.conversation_id,
        )
      }

      /* ------------------------------------------------------
         BUSINESS
         ------------------------------------------------------ */

      if (
        body.business_id
      ) {
        setBusinessId(
          body.business_id,
        )
      }

      /* ------------------------------------------------------
         INTENT
         ------------------------------------------------------ */

      setPreviousIntent(
        body.intent ||
          '',
      )

      /* ------------------------------------------------------
         ASSISTANT RESPONSE
         ------------------------------------------------------ */

      const assistantText =
        body.response?.trim() ||
        'I could not generate a response from the available CashGuard data.'

      const assistantMessage:
        Message = {
        role:
          'assistant',

        text:
          assistantText,

        sources:
          Array.isArray(
            body.sources,
          )
            ? body.sources
            : [],

        intent:
          body.intent ||
          '',

        needsConfirmation:
          Boolean(
            body.needs_confirmation,
          ),
      }

      setMessages(
        (
          current,
        ) => [
          ...current,
          assistantMessage,
        ],
      )
    } catch (
      error
    ) {
      const messageText =
        error instanceof Error
          ? error.message
          : 'Paisa is temporarily unavailable. No financial data was changed.'

      setErrorMessage(
        messageText,
      )

      setMessages(
        (
          current,
        ) => [
          ...current,
          {
            role:
              'assistant',

            text:
              messageText,
          },
        ],
      )
    } finally {
      setLoading(
        false,
      )
    }
  }

  /* ==========================================================
     UI
     ========================================================== */

  return (
    <main className="foundation-content mx-auto max-w-4xl">
      <section className="foundation-card overflow-hidden p-0">

        {/* ==================================================
            HEADER
            ================================================== */}

        <div className="border-b border-border bg-muted/30 p-6">
          <div className="flex items-start justify-between gap-4">

            <div className="flex min-w-0 items-center gap-3">

              <div className="card-icon sky shrink-0">
                <Bot size={22} />
              </div>

              <div className="min-w-0">

                <p className="auth-eyebrow">
                  CASHGUARD-AI AGENT
                </p>

                <h2 className="mt-1">
                  Paisa
                </h2>

                <p className="mt-1 text-sm text-muted-foreground">
                  Live-data business answers,
                  app guidance, financial
                  education, and general
                  conversation — without
                  guessing or executing
                  financial actions.
                </p>

              </div>

            </div>

            <button
              type="button"
              onClick={
                resetConversation
              }
              disabled={
                loading
              }
              className="secondary-button shrink-0"
              title="Start a new Paisa conversation"
            >
              <RefreshCw
                size={14}
              />

              New chat
            </button>

          </div>

          {/* ================================================
              CONNECTION STATUS
              ================================================ */}

          {(
            businessId ||
            conversationId
          ) && (
            <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">

              {businessId && (
                <span className="rounded-full border border-border bg-background px-3 py-1">
                  Business connected
                </span>
              )}

              {conversationId && (
                <span className="rounded-full border border-border bg-background px-3 py-1">
                  Live conversation
                </span>
              )}

            </div>
          )}

        </div>

        {/* ==================================================
            ERROR
            ================================================== */}

        {errorMessage && (
          <div className="mx-4 mt-4 rounded-lg border border-border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
            {errorMessage}
          </div>
        )}

        {/* ==================================================
            CHAT
            ================================================== */}

        <div
          className="min-h-[390px] space-y-4 p-5"
          aria-live="polite"
        >

          {messages.map(
            (
              item,
              index,
            ) => (
              <div
                key={`${item.role}-${index}`}
                className={`max-w-[88%] whitespace-pre-line rounded-xl px-4 py-3 text-sm leading-6 ${
                  item.role ===
                  'user'
                    ? 'ml-auto bg-primary text-primary-foreground'
                    : 'bg-muted text-foreground'
                }`}
              >

                {item.text}

                {/* ==========================================
                    FINANCIAL ACTION SAFETY
                    ========================================== */}

                {item.needsConfirmation && (
                  <p className="mt-3 border-t border-border/60 pt-2 text-xs font-medium text-muted-foreground">
                    Confirmation is required
                    before any financial action.
                  </p>
                )}

                {/* ==========================================
                    SOURCES
                    ========================================== */}

                {item.sources &&
                  item.sources.length >
                    0 && (
                    <p className="mt-3 border-t border-border/60 pt-2 text-xs text-muted-foreground">
                      Sources:{' '}
                      {item.sources.join(
                        ' · ',
                      )}
                    </p>
                  )}

                {/* ==========================================
                    INTENT
                    ========================================== */}

                {item.intent && (
                  <p className="mt-2 text-[10px] opacity-60">
                    Intent:{' '}
                    {item.intent}
                  </p>
                )}

              </div>
            ),
          )}

          {/* =================================================
              LOADING
              ================================================= */}

          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">

              <Loader2
                className="animate-spin"
                size={16}
              />

              Checking Paisa and CashGuard context…

            </div>
          )}

          <div
            ref={endRef}
          />

        </div>

        {/* ==================================================
            INPUT
            ================================================== */}

        <form
          onSubmit={
            submit
          }
          className="flex gap-2 border-t border-border p-4"
        >

          <input
            value={
              draft
            }

            onChange={(
              event,
            ) =>
              setDraft(
                event.target.value.slice(
                  0,
                  MAX_MESSAGE_LENGTH,
                ),
              )
            }

            className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none"

            placeholder="e.g. Agale 7 din mein cash shortage ka risk hai?"

            maxLength={
              MAX_MESSAGE_LENGTH
            }

            aria-label="Ask Paisa"

            disabled={
              loading
            }
          />

          <button
            type="submit"
            className="auth-button compact"
            disabled={
              loading ||
              !draft.trim()
            }
          >

            {loading ? (
              <>
                <Loader2
                  size={16}
                  className="animate-spin"
                />

                Checking…
              </>
            ) : (
              <>
                <Send
                  size={16}
                />

                Ask Paisa
              </>
            )}

          </button>

        </form>

      </section>

      {/* ====================================================
          SUGGESTED QUESTIONS
          ==================================================== */}

      <div className="mt-4 flex flex-wrap gap-2 text-sm">

        {SUGGESTED_QUESTIONS.map(
          (
            question,
          ) => (
            <button
              key={
                question
              }
              type="button"
              className="secondary-button"
              onClick={() =>
                setDraft(
                  question,
                )
              }
              disabled={
                loading
              }
            >

              <Sparkles
                size={14}
              />

              {question}

            </button>
          ),
        )}

      </div>

    </main>
  )
}