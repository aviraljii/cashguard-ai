'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'

import {
  ArrowUpRight,
  CheckCircle2,
  Edit3,
  FileText,
  Filter,
  Mail,
  MoreHorizontal,
  Plus,
  Printer,
  Search,
  Send,
  Trash2,
  UserRound,
  Wallet,
  X,
  Download,
  Calculator,
  Sparkles,
} from 'lucide-react'

/* ==========================================================================
   TYPES
   ========================================================================== */

type Module =
  | 'invoices'
  | 'customers'
  | 'vendors'

type Status =
  | 'Draft'
  | 'Sent'
  | 'Due'
  | 'Overdue'
  | 'Paid'
  | 'Cancelled'

type Risk =
  | 'Low'
  | 'Medium'
  | 'High'

type RecordItem = {
  id: string
  name: string
  email: string
  phone: string
  address: string
  gstin: string
  status: 'Active' | 'Inactive'
  outstanding: number
  overdue: number
  risk: Risk
}

type InvoiceItem = {
  id?: string
  description: string
  quantity: number
  rate: number
  amount: number
}

type Invoice = {
  id: string
  backendId?: string
  customer: string
  customerId?: string
  customerEmail?: string
  customerPhone?: string
  customerAddress?: string
  customerGstin?: string
  businessName?: string
  businessAddress?: string
  businessGstin?: string
  businessState?: string
  placeOfSupply?: string

  description: string
  issue: string
  due: string

  amount: number
  taxableAmount?: number
  cgst?: number
  sgst?: number
  igst?: number
  gstRate?: number

  outstanding: number
  status: Status
  reference: string
  notes: string

  items?: InvoiceItem[]
}

type InvoiceFormItem = {
  description: string
  quantity: string
  rate: string
}

type InvoiceAiInsight = {
  title: string
  summary: string
  recommendation: string
  priority: string
  confidence?: string
  source: 'ai' | 'rule'
}

type PaymentDelayRisk = {
  available: boolean
  riskLevel: string
  probability: number | null
  explanation: string
}

type InvoiceFormValues = {
  customer: string
  customerId: string
  customerEmail: string
  customerPhone: string
  customerAddress: string
  customerGstin: string

  invoiceNumber: string
  invoiceDate: string
  dueDate: string
  reference: string

  businessName: string
  businessAddress: string
  businessGstin: string
  businessState: string
  placeOfSupply: string

  gstMode: 'CGST_SGST' | 'IGST'
  gstRate: string

  notes: string
  paymentTerms: string

  items: InvoiceFormItem[]
}

/* ==========================================================================
   CONSTANTS
   ========================================================================== */

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL ||
  'http://127.0.0.1:8000'
).replace(/\/+$/, '')

const DEFAULT_BUSINESS_ID =
  process.env.NEXT_PUBLIC_BUSINESS_ID?.trim() ||
  ''

const ML_API_BASE_URL = (
  process.env.NEXT_PUBLIC_ML_API_URL ||
  'http://127.0.0.1:8001'
).replace(/\/+$/, '')

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

const customersSeed: RecordItem[] = [
  {
    id: 'CUS-00128',
    name: 'Sharma Traders',
    email: 'accounts@sharmatraders.in',
    phone: '+91 98765 43210',
    address: 'Jaipur, Rajasthan',
    gstin: '08AABCS1234L1ZK',
    status: 'Active',
    outstanding: 175000,
    overdue: 75000,
    risk: 'Medium',
  },
  {
    id: 'CUS-00117',
    name: 'Rajasthan Hardware',
    email: 'finance@rajasthanhardware.in',
    phone: '+91 98290 11223',
    address: 'Jodhpur, Rajasthan',
    gstin: '08AABCR5678P1ZQ',
    status: 'Active',
    outstanding: 240000,
    overdue: 0,
    risk: 'Low',
  },
  {
    id: 'CUS-00094',
    name: 'Mehta Electricals',
    email: 'billing@mehtaelectricals.in',
    phone: '+91 98100 44556',
    address: 'New Delhi, Delhi',
    gstin: '07AABCM9012G1ZX',
    status: 'Active',
    outstanding: 130000,
    overdue: 130000,
    risk: 'High',
  },
  {
    id: 'CUS-00072',
    name: 'ABC Retail Solutions',
    email: 'payables@abcretail.in',
    phone: '+91 99887 66554',
    address: 'Ahmedabad, Gujarat',
    gstin: '24AABCA3456K1ZY',
    status: 'Inactive',
    outstanding: 0,
    overdue: 0,
    risk: 'Low',
  },
]

const vendorsSeed: RecordItem[] = [
  {
    id: 'VEN-00042',
    name: 'ABC Electrical Suppliers',
    email: 'sales@abcelectrical.in',
    phone: '+91 98760 22334',
    address: 'Pune, Maharashtra',
    gstin: '27AABCA9988M1ZT',
    status: 'Active',
    outstanding: 240000,
    overdue: 40000,
    risk: 'Medium',
  },
  {
    id: 'VEN-00031',
    name: 'Kumar Industrial Components',
    email: 'accounts@kumarindustrial.in',
    phone: '+91 98220 77889',
    address: 'Indore, Madhya Pradesh',
    gstin: '23AABCK1122D1ZP',
    status: 'Active',
    outstanding: 310000,
    overdue: 0,
    risk: 'Low',
  },
  {
    id: 'VEN-00018',
    name: 'Northstar Logistics',
    email: 'billing@northstarlogistics.in',
    phone: '+91 99100 11990',
    address: 'Gurugram, Haryana',
    gstin: '06AABCN7788R1ZV',
    status: 'Active',
    outstanding: 85000,
    overdue: 85000,
    risk: 'High',
  },
]

const invoicesSeed: Invoice[] = [
  {
    id: 'INV-2026-00482',
    customer: 'Sharma Traders',
    customerEmail: 'accounts@sharmatraders.in',
    customerPhone: '+91 98765 43210',
    customerAddress: 'Jaipur, Rajasthan',
    customerGstin: '08AABCS1234L1ZK',

    businessName: 'CashGuard-AI Business',
    businessAddress: 'Jaipur, Rajasthan',
    businessGstin: '',
    businessState: 'Rajasthan',
    placeOfSupply: 'Rajasthan',

    description: 'Office equipment supply',
    issue: '12 Aug 2026',
    due: '26 Aug 2026',

    amount: 240000,
    taxableAmount: 203389.83,
    cgst: 18305.08,
    sgst: 18305.09,
    igst: 0,
    gstRate: 18,

    outstanding: 175000,
    status: 'Due',
    reference: 'PO-8842',
    notes: 'Partial payment received.',

    items: [
      {
        description:
          'Office equipment supply',
        quantity: 1,
        rate: 203389.83,
        amount: 203389.83,
      },
    ],
  },

  {
    id: 'INV-2026-00476',
    customer: 'Rajasthan Hardware',
    customerEmail:
      'finance@rajasthanhardware.in',
    customerPhone:
      '+91 98290 11223',
    customerAddress:
      'Jodhpur, Rajasthan',
    customerGstin:
      '08AABCR5678P1ZQ',

    businessName: 'CashGuard-AI Business',
    businessAddress:
      'Jaipur, Rajasthan',
    businessGstin: '',
    businessState:
      'Rajasthan',
    placeOfSupply:
      'Rajasthan',

    description:
      'Electrical inventory batch',
    issue:
      '08 Aug 2026',
    due:
      '22 Aug 2026',

    amount:
      240000,
    taxableAmount:
      203389.83,
    cgst:
      18305.08,
    sgst:
      18305.09,
    igst:
      0,
    gstRate:
      18,

    outstanding:
      240000,
    status:
      'Sent',
    reference:
      'PO-8810',
    notes:
      'Payment expected this week.',
  },

  {
    id: 'INV-2026-00441',
    customer:
      'Mehta Electricals',
    customerEmail:
      'billing@mehtaelectricals.in',
    customerPhone:
      '+91 98100 44556',
    customerAddress:
      'New Delhi, Delhi',
    customerGstin:
      '07AABCM9012G1ZX',

    businessName:
      'CashGuard-AI Business',
    businessAddress:
      'Jaipur, Rajasthan',
    businessGstin:
      '',
    businessState:
      'Rajasthan',
    placeOfSupply:
      'Delhi',

    description:
      'Switchgear and fittings',
    issue:
      '18 Jul 2026',
    due:
      '02 Aug 2026',

    amount:
      180000,
    taxableAmount:
      152542.37,
    cgst:
      0,
    sgst:
      0,
    igst:
      27457.63,
    gstRate:
      18,

    outstanding:
      130000,
    status:
      'Overdue',
    reference:
      'PO-8641',
    notes:
      'Collection follow-up required.',
  },

  {
    id: 'INV-2026-00418',
    customer:
      'ABC Retail Solutions',
    customerEmail:
      'payables@abcretail.in',
    customerPhone:
      '+91 99887 66554',
    customerAddress:
      'Ahmedabad, Gujarat',
    customerGstin:
      '24AABCA3456K1ZY',

    businessName:
      'CashGuard-AI Business',
    businessAddress:
      'Jaipur, Rajasthan',
    businessGstin:
      '',
    businessState:
      'Rajasthan',
    placeOfSupply:
      'Gujarat',

    description:
      'Retail counter equipment',
    issue:
      '02 Jul 2026',
    due:
      '17 Jul 2026',

    amount:
      95000,
    taxableAmount:
      80508.47,
    cgst:
      0,
    sgst:
      0,
    igst:
      14491.53,
    gstRate:
      18,

    outstanding:
      0,
    status:
      'Paid',
    reference:
      'PO-8502',
    notes:
      'Paid in full.',
  },

  {
    id: 'INV-2026-00490',
    customer:
      'Sharma Traders',
    customerEmail:
      'accounts@sharmatraders.in',
    customerPhone:
      '+91 98765 43210',
    customerAddress:
      'Jaipur, Rajasthan',
    customerGstin:
      '08AABCS1234L1ZK',

    businessName:
      'CashGuard-AI Business',
    businessAddress:
      'Jaipur, Rajasthan',
    businessGstin:
      '',
    businessState:
      'Rajasthan',
    placeOfSupply:
      'Rajasthan',

    description:
      'Replacement parts',
    issue:
      '19 Aug 2026',
    due:
      '02 Sep 2026',

    amount:
      68000,
    taxableAmount:
      57627.12,
    cgst:
      5186.44,
    sgst:
      5186.44,
    igst:
      0,
    gstRate:
      18,

    outstanding:
      68000,
    status:
      'Draft',
    reference:
      'DRAFT-19',
    notes:
      'Ready for review.',
  },
]

/* ==========================================================================
   HELPERS
   ========================================================================== */

function money(
  value: number,
): string {
  return `₹${Math.abs(
    value,
  ).toLocaleString(
    'en-IN',
    {
      maximumFractionDigits: 2,
    },
  )}`
}

function numberValue(
  value: unknown,
): number {
  if (
    typeof value === 'number' &&
    Number.isFinite(value)
  ) {
    return value
  }

  if (
    typeof value === 'string'
  ) {
    const parsed =
      Number(
        value
          .replace(/₹/g, '')
          .replace(/,/g, '')
          .trim(),
      )

    if (
      Number.isFinite(parsed)
    ) {
      return parsed
    }
  }

  return 0
}

function textValue(
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

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  )
}

function unwrapApiData(
  value: unknown,
): unknown {
  if (
    isRecord(value) &&
    value.data !== undefined
  ) {
    return value.data
  }

  return value
}

function cleanToken(
  value: unknown,
): string | null {
  if (
    typeof value !== 'string'
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

function getAuthToken(): string | null {
  if (
    typeof window ===
    'undefined'
  ) {
    return null
  }

  const storages = [
    window.localStorage,
    window.sessionStorage,
  ]

  for (
    const storage of storages
  ) {
    for (
      const key of AUTH_KEYS
    ) {
      try {
        const token =
          cleanToken(
            storage.getItem(
              key,
            ),
          )

        if (token) {
          return token
        }
      } catch {
        // Ignore storage errors.
      }
    }
  }

  return null
}

function getInvoiceApiId(invoice: Invoice): string | null {
  const backendId = textValue(invoice.backendId).trim()

  if (backendId) {
    return backendId
  }

  // A local/seed invoice can have only the human-readable invoice number.
  // Do not send that value to backend endpoints which expect the database ID.
  return null
}

function getBusinessId(): string {
  if (
    typeof window ===
    'undefined'
  ) {
    return (
      DEFAULT_BUSINESS_ID ||
      ''
    )
  }

  const keys = [
    'business_id',
    'businessId',
    'cashguard_business_id',
  ]

  for (
    const storage of [
      window.localStorage,
      window.sessionStorage,
    ]
  ) {
    for (
      const key of keys
    ) {
      try {
        const value =
          storage.getItem(
            key,
          )?.trim()

        if (value) {
          return value
        }
      } catch {
        // Ignore.
      }
    }
  }

  return (
    DEFAULT_BUSINESS_ID ||
    ''
  )
}

async function apiRequest(
  endpoint: string,
  options: RequestInit = {},
): Promise<unknown> {
  const headers =
    new Headers(
      options.headers || {},
    )

  headers.set(
    'Accept',
    'application/json',
  )

  if (
    options.body &&
    !headers.has(
      'Content-Type',
    )
  ) {
    headers.set(
      'Content-Type',
      'application/json',
    )
  }

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

  let data: unknown =
    null

  if (
    contentType.includes(
      'application/json',
    )
  ) {
    data =
      await response.json()
  } else {
    data =
      await response.text()
  }

  if (
    !response.ok
  ) {
    const message =
      isRecord(data) &&
      typeof data.detail ===
        'string'
        ? data.detail
        : `API request failed (${response.status})`

    throw new Error(
      message,
    )
  }

  return data
}

async function mlRequest(
  endpoint: string,
  options: RequestInit = {},
): Promise<unknown> {
  const headers = new Headers(options.headers || {})
  headers.set('Accept', 'application/json')

  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(
    `${ML_API_BASE_URL}${endpoint}`,
    {
      ...options,
      method: options.method || 'GET',
      headers,
      cache: 'no-store',
    },
  )

  const contentType = response.headers.get('content-type') || ''
  let data: unknown = null

  if (contentType.includes('application/json')) {
    data = await response.json()
  } else {
    data = await response.text()
  }

  if (!response.ok) {
    let detail = `ML API request failed (${response.status})`

    if (isRecord(data)) {
      if (typeof data.detail === 'string') {
        detail = data.detail
      } else if (Array.isArray(data.detail)) {
        const validationMessages = data.detail
          .map((item) => {
            if (!isRecord(item)) {
              return String(item)
            }

            const location = Array.isArray(item.loc)
              ? item.loc.join('.')
              : ''
            const message =
              typeof item.msg === 'string'
                ? item.msg
                : 'Validation error'

            return location
              ? `${location}: ${message}`
              : message
          })
          .filter(Boolean)

        if (validationMessages.length) {
          detail = validationMessages.join('; ')
        }
      }
    }

    throw new Error(detail)
  }

  return data
}

async function requestPaymentDelayRisk(
  invoice: Invoice,
): Promise<PaymentDelayRisk> {
  const invoiceApiId = getInvoiceApiId(invoice)

  // Seed-only invoices are not persisted in the backend, so there is no
  // database ID that the ML service can safely use. Return a deterministic
  // rule result instead of sending an invalid request that would produce 422.
  if (!invoiceApiId) {
    const outstanding = Math.max(0, invoice.outstanding)
    const daysOverdue = invoice.status === 'Overdue' ? 1 : 0
    const riskLevel =
      invoice.status === 'Overdue' || outstanding >= invoice.amount * 0.75
        ? 'High'
        : outstanding > 0
          ? 'Medium'
          : 'Low'

    return {
      available: false,
      riskLevel,
      probability: riskLevel === 'High' ? 80 : riskLevel === 'Medium' ? 50 : 10,
      explanation: daysOverdue
        ? 'Rule-based risk used because this invoice is not linked to a backend record.'
        : 'Rule-based risk used because this invoice is not linked to a backend record.',
    }
  }

  try {
    const raw = await mlRequest(
      '/predict/payment-delay',
      {
        method: 'POST',
        body: JSON.stringify({
          invoice_id: invoiceApiId,
        }),
      },
    )

    const root = isRecord(raw) ? raw : {}
    const nested = isRecord(root.prediction)
      ? root.prediction
      : isRecord(root.data)
        ? root.data
        : root

    const probability =
      numberValue(
        nested.probability ??
          nested.risk_probability ??
          nested.late_payment_probability ??
          nested.probability_of_delay,
      ) || null

    const riskLevel = textValue(
      nested.risk_level ??
        nested.riskLevel ??
        nested.risk ??
        nested.label,
      probability !== null
        ? probability >= 0.75
          ? 'High'
          : probability >= 0.4
            ? 'Medium'
            : 'Low'
        : 'Review',
    )

    return {
      available: true,
      riskLevel,
      probability:
        probability !== null && probability <= 1
          ? probability * 100
          : probability,
      explanation: textValue(
        nested.explanation ??
          nested.message ??
          nested.reason,
        'Payment-delay risk generated by the existing trained model.',
      ),
    }
  } catch (error) {
    return {
      available: false,
      riskLevel: 'Unavailable',
      probability: null,
      explanation:
        error instanceof Error
          ? error.message
          : 'Payment-delay model is unavailable.',
    }
  }
}

async function requestInvoiceAiInsight(
  invoice: Invoice,
  risk: PaymentDelayRisk,
): Promise<InvoiceAiInsight> {
  const fallbackPriority =
    invoice.status === 'Overdue' ||
    risk.riskLevel === 'High'
      ? 'HIGH'
      : risk.riskLevel === 'Medium'
        ? 'MEDIUM'
        : 'LOW'

  const fallbackInsight = (): InvoiceAiInsight => ({
    title: 'CashGuard Invoice Monitor',
    summary:
      invoice.status === 'Overdue'
        ? 'This invoice is overdue and should be prioritised for collection.'
        : invoice.outstanding > 0
          ? 'This invoice still has an outstanding balance and should remain on the collection watchlist.'
          : 'This invoice has no outstanding balance.',
    recommendation:
      invoice.status === 'Overdue'
        ? 'Contact the customer, confirm payment commitment and record the next follow-up date.'
        : invoice.outstanding > 0
          ? 'Monitor the due date and prepare a follow-up before the expected payment window.'
          : 'No collection action is required right now.',
    priority: fallbackPriority,
    source: 'rule',
  })

  try {
    const invoiceId = getInvoiceApiId(invoice)

    if (!invoiceId) {
      return fallbackInsight()
    }

    const raw = await apiRequest(
      `/api/invoices/${encodeURIComponent(invoiceId)}/intelligence`,
      { method: 'GET' },
    )

    const root = isRecord(raw) ? raw : {}
    let candidate: Record<string, unknown> = root

    const nestedValues = [
      root.intelligence,
      root.data,
      root.result,
      root.response,
    ]

    for (const value of nestedValues) {
      if (isRecord(value)) {
        candidate = value
        break
      }
    }

    const text = (value: unknown): string => {
      if (typeof value === 'string') return value.trim()
      if (typeof value === 'number' || typeof value === 'boolean') return String(value)
      return ''
    }

    let title = text(candidate.title)
    let summary = text(candidate.summary ?? candidate.explanation)
    let recommendation = text(candidate.recommendation ?? candidate.action)
    let priority = text(candidate.priority ?? candidate.risk_level ?? candidate.riskLevel)
    let confidence = text(candidate.confidence)

    if (isRecord(candidate.insight)) {
      const insight = candidate.insight
      title ||= text(insight.title)
      summary ||= text(insight.summary ?? insight.explanation)
      recommendation ||= text(insight.recommendation ?? insight.action)
      priority ||= text(insight.priority ?? insight.risk_level ?? insight.riskLevel)
      confidence ||= text(insight.confidence)
    }

    const rawText =
      text(candidate.content) ||
      text(candidate.response) ||
      text(candidate.message)

    if (!summary && rawText) {
      try {
        const parsed = JSON.parse(rawText) as unknown
        if (isRecord(parsed)) {
          title ||= text(parsed.title)
          summary ||= text(parsed.summary ?? parsed.explanation)
          recommendation ||= text(parsed.recommendation ?? parsed.action)
          priority ||= text(parsed.priority ?? parsed.risk_level ?? parsed.riskLevel)
          confidence ||= text(parsed.confidence)
        }
      } catch {
        summary = rawText
      }
    }

    if (!summary) {
      return fallbackInsight()
    }

    return {
      title: title || 'Invoice Collection Intelligence',
      summary,
      recommendation:
        recommendation ||
        (invoice.outstanding > 0
          ? 'Review the collection plan and follow up before the due date.'
          : 'Invoice is fully settled; continue normal monitoring.'),
      priority: priority || fallbackPriority,
      confidence: confidence || undefined,
      source: 'ai',
    }
  } catch (error) {
    console.warn(
      '[Invoices] Invoice intelligence unavailable; using rule-based insight.',
      error,
    )
    return fallbackInsight()
  }
}

function todayISO(): string {
  const now =
    new Date()

  const offset =
    now.getTimezoneOffset()

  const local =
    new Date(
      now.getTime() -
        offset * 60000,
    )

  return local
    .toISOString()
    .slice(0, 10)
}

function addDays(
  isoDate: string,
  days: number,
): string {
  const date =
    new Date(
      `${isoDate}T00:00:00`,
    )

  date.setDate(
    date.getDate() +
      days,
  )

  return date
    .toISOString()
    .slice(0, 10)
}

function displayDate(
  isoOrDate: string,
): string {
  const date =
    new Date(
      isoOrDate.includes(
        'T',
      )
        ? isoOrDate
        : `${isoOrDate}T00:00:00`,
    )

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return isoOrDate
  }

  return date.toLocaleDateString(
    'en-IN',
    {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    },
  )
}

/* ==========================================================================
   AMOUNT TO WORDS
   ========================================================================== */

function twoDigitWords(
  number: number,
): string {
  const words = [
    '',
    'One',
    'Two',
    'Three',
    'Four',
    'Five',
    'Six',
    'Seven',
    'Eight',
    'Nine',
    'Ten',
    'Eleven',
    'Twelve',
    'Thirteen',
    'Fourteen',
    'Fifteen',
    'Sixteen',
    'Seventeen',
    'Eighteen',
    'Nineteen',
  ]

  const tens = [
    '',
    '',
    'Twenty',
    'Thirty',
    'Forty',
    'Fifty',
    'Sixty',
    'Seventy',
    'Eighty',
    'Ninety',
  ]

  if (
    number < 20
  ) {
    return words[number]
  }

  const ten =
    Math.floor(
      number / 10,
    )

  const one =
    number % 10

  return `${tens[ten]}${
    one
      ? ` ${words[one]}`
      : ''
  }`
}

function numberToWords(
  value: number,
): string {
  const rounded =
    Math.round(value)

  if (
    rounded === 0
  ) {
    return 'Zero'
  }

  let number =
    rounded

  const parts: string[] =
    []

  const crore =
    Math.floor(
      number / 10000000,
    )

  number %=
    10000000

  if (crore) {
    parts.push(
      `${numberToWords(
        crore,
      )} Crore`,
    )
  }

  const lakh =
    Math.floor(
      number / 100000,
    )

  number %=
    100000

  if (lakh) {
    parts.push(
      `${numberToWords(
        lakh,
      )} Lakh`,
    )
  }

  const thousand =
    Math.floor(
      number / 1000,
    )

  number %=
    1000

  if (thousand) {
    parts.push(
      `${numberToWords(
        thousand,
      )} Thousand`,
    )
  }

  const hundred =
    Math.floor(
      number / 100,
    )

  number %=
    100

  if (hundred) {
    parts.push(
      `${twoDigitWords(
        hundred,
      )} Hundred`,
    )
  }

  if (number) {
    parts.push(
      twoDigitWords(
        number,
      ),
    )
  }

  return parts.join(' ')
}

function amountInWords(
  value: number,
): string {
  const rupees =
    Math.floor(value)

  const paise =
    Math.round(
      (value -
        rupees) *
        100,
    )

  let result =
    `Indian Rupees ${numberToWords(
      rupees,
    )}`

  if (paise > 0) {
    result +=
      ` and ${numberToWords(
        paise,
      )} Paise`
  }

  return `${result} Only`
}

/* ==========================================================================
   INVOICE CALCULATION
   ========================================================================== */

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function calculateInvoiceTotals(
  items: InvoiceItem[],
  gstRate: number,
  gstMode: 'CGST_SGST' | 'IGST',
) {
  const taxableAmount = roundMoney(
    items.reduce(
      (total, item) => total + roundMoney(item.amount),
      0,
    ),
  )

  const gstAmount = roundMoney(
    taxableAmount * (gstRate / 100),
  )

  if (gstMode === 'CGST_SGST') {
    const cgst = roundMoney(gstAmount / 2)
    const sgst = roundMoney(gstAmount - cgst)
    const grandTotal = roundMoney(
      taxableAmount + cgst + sgst,
    )

    return {
      taxableAmount,
      cgst,
      sgst,
      igst: 0,
      gstAmount: roundMoney(cgst + sgst),
      grandTotal,
    }
  }

  return {
    taxableAmount,
    cgst: 0,
    sgst: 0,
    igst: gstAmount,
    gstAmount,
    grandTotal: roundMoney(
      taxableAmount + gstAmount,
    ),
  }
}

function normalizeInvoice(
  raw: unknown,
  fallback?: Invoice,
): Invoice | null {
  if (
    !isRecord(raw)
  ) {
    return fallback || null
  }

  const source =
    isRecord(raw.invoice)
      ? raw.invoice
      : raw

  const customer =
    textValue(
      source.customer_name,
      textValue(
        source.customer,
        fallback?.customer ||
          'Customer',
      ),
    )

  const total =
    numberValue(
      source.total_amount ??
        source.total ??
        source.amount ??
        fallback?.amount,
    )

  const outstanding =
    numberValue(
      source.outstanding ??
        source.balance_due ??
        source.balance ??
        fallback?.outstanding ??
        total,
    )

  const invoiceDate =
    textValue(
      source.invoice_date ??
        source.issue_date ??
        source.issue ??
        fallback?.issue,
      fallback?.issue ||
        '',
    )

  const dueDate =
    textValue(
      source.due_date ??
        source.due ??
        fallback?.due,
      fallback?.due ||
        '',
    )

  const taxAmount =
    numberValue(
      source.tax_amount,
    )

  const taxable =
    numberValue(
      source.subtotal ??
        source.taxable_amount,
    )

  return {
    id:
      textValue(
        source.invoice_number ??
          source.number ??
          source.id,
        fallback?.id ||
          'INV-DRAFT',
      ),

    backendId:
      textValue(
        source.id ??
          fallback?.backendId,
      ),

    customer,

    customerId:
      textValue(
        source.customer_id ??
          source.customerId ??
          fallback?.customerId,
      ),

    customerEmail:
      textValue(
        source.customer_email ??
          source.email ??
          fallback?.customerEmail,
      ),

    customerPhone:
      textValue(
        source.customer_phone ??
          source.phone ??
          fallback?.customerPhone,
      ),

    customerAddress:
      textValue(
        source.customer_address ??
          source.address ??
          fallback?.customerAddress,
      ),

    customerGstin:
      textValue(
        source.customer_gstin ??
          source.gstin ??
          fallback?.customerGstin,
      ),

    businessName:
      textValue(
        source.business_name ??
          fallback?.businessName,
        'CashGuard-AI Business',
      ),

    businessAddress:
      textValue(
        source.business_address ??
          fallback?.businessAddress,
        'India',
      ),

    businessGstin:
      textValue(
        source.business_gstin ??
          fallback?.businessGstin,
      ),

    businessState:
      textValue(
        source.business_state ??
          fallback?.businessState,
      ),

    placeOfSupply:
      textValue(
        source.place_of_supply ??
          fallback?.placeOfSupply,
      ),

    description:
      textValue(
        source.description ??
          fallback?.description,
        'Products / Services',
      ),

    issue:
      displayDate(
        invoiceDate,
      ),

    due:
      displayDate(
        dueDate,
      ),

    amount:
      total,

    taxableAmount:
      taxable ||
      fallback?.taxableAmount ||
      total,

    cgst:
      numberValue(
        source.cgst ??
          fallback?.cgst,
      ),

    sgst:
      numberValue(
        source.sgst ??
          fallback?.sgst,
      ),

    igst:
      numberValue(
        source.igst ??
          fallback?.igst,
      ),

    gstRate:
      numberValue(
        source.gst_rate ??
          source.gstRate ??
          fallback?.gstRate ??
          18,
      ),

    outstanding,

    status:
      (
        textValue(
          source.status,
          fallback?.status ||
            'Draft',
        ) as Status
      ),

    reference:
      textValue(
        source.reference ??
          source.reference_number ??
          fallback?.reference,
      ),

    notes:
      textValue(
        source.notes ??
          fallback?.notes,
      ),

    items:
      Array.isArray(
        source.items,
      )
        ? source.items
            .filter(
              isRecord,
            )
            .map(
              (
                item,
              ) => ({
                description:
                  textValue(
                    item.description ??
                      item.name,
                    'Item',
                  ),
                quantity:
                  numberValue(
                    item.quantity,
                  ) ||
                  1,
                rate:
                  numberValue(
                    item.rate ??
                      item.unit_price ??
                      item.price,
                  ),
                amount:
                  numberValue(
                    item.amount ??
                      item.total,
                  ),
              }),
            )
        : fallback?.items,
  }
}

/* ==========================================================================
   SEED HELPERS
   ========================================================================== */

function buildSeedInvoiceFromForm(
  values: InvoiceFormValues,
): Invoice {
  const items: InvoiceItem[] =
    values.items
      .map(
        (
          item,
        ) => {
          const quantity =
            numberValue(
              item.quantity,
            ) || 0

          const rate =
            numberValue(
              item.rate,
            ) || 0

          return {
            description:
              item.description ||
              'Product / Service',
            quantity,
            rate,
            amount:
              quantity *
              rate,
          }
        },
      )
      .filter(
        (
          item,
        ) =>
          item.quantity >
            0 &&
          item.rate >=
            0,
      )

  const totals =
    calculateInvoiceTotals(
      items,
      numberValue(
        values.gstRate,
      ) || 18,
      values.gstMode,
    )

  return {
    id:
      values.invoiceNumber ||
      `INV-${new Date()
        .getFullYear()}-${Date.now()
        .toString()
        .slice(-5)}`,

    customer:
      values.customer,

    customerEmail:
      values.customerEmail,

    customerPhone:
      values.customerPhone,

    customerAddress:
      values.customerAddress,

    customerGstin:
      values.customerGstin,

    businessName:
      values.businessName ||
      'CashGuard-AI Business',

    businessAddress:
      values.businessAddress ||
      'India',

    businessGstin:
      values.businessGstin,

    businessState:
      values.businessState,

    placeOfSupply:
      values.placeOfSupply,

    description:
      items[0]?.description ||
      'Products / Services',

    issue:
      displayDate(
        values.invoiceDate,
      ),

    due:
      displayDate(
        values.dueDate,
      ),

    amount:
      totals.grandTotal,

    taxableAmount:
      totals.taxableAmount,

    cgst:
      totals.cgst,

    sgst:
      totals.sgst,

    igst:
      totals.igst,

    gstRate:
      numberValue(
        values.gstRate,
      ) || 18,

    outstanding:
      totals.grandTotal,

    status:
      'Draft',

    reference:
      values.reference,

    notes:
      values.notes,

    items:
      items.length
        ? items
        : [
            {
              description:
                'Products / Services',
              quantity: 1,
              rate:
                totals.taxableAmount,
              amount:
                totals.taxableAmount,
            },
          ],
  }
}

/* ==========================================================================
   BADGE
   ========================================================================== */

function Badge({
  children,
  tone = 'blue',
}: {
  children: ReactNode
  tone?: string
}) {
  return (
    <span
      className={`badge ${tone.toLowerCase()}`}
    >
      {children}
    </span>
  )
}

/* ==========================================================================
   HEADER
   ========================================================================== */

function Header({
  module,
  action,
  onAction,
}: {
  module: Module
  action: string
  onAction: () => void
}) {
  const copy = {
    invoices: [
      'INVOICES',
      'Invoices',
      'Create, manage, track, and monitor customer invoices and payment status.',
    ],
    customers: [
      'CUSTOMERS',
      'Customers',
      'Manage customer relationships, outstanding balances, invoices, and payment activity.',
    ],
    vendors: [
      'VENDORS',
      'Vendors',
      'Manage suppliers, outstanding payables, purchase activity, and vendor relationships.',
    ],
  }[module]

  return (
    <div className="dashboard-heading">

      <div>

        <p className="auth-eyebrow">
          {copy[0]} · LIVE WORKSPACE
        </p>

        <h2>
          {copy[1]}
        </h2>

        <p>
          {copy[2]}
        </p>

      </div>

      <button
        className="auth-button compact"
        type="button"
        onClick={
          onAction
        }
      >
        <Plus
          size={15}
        />

        {action}
      </button>

    </div>
  )
}

/* ==========================================================================
   KPI
   ========================================================================== */

function Kpis({
  module,
  invoices,
  data,
}: {
  module: Module
  invoices: Invoice[]
  data: RecordItem[]
}) {
  const invoiceMode =
    module ===
    'invoices'

  const total =
    invoiceMode
      ? invoices.length
      : data.length

  const active =
    invoiceMode
      ? invoices.filter(
          (invoice) =>
            invoice.status !==
            'Cancelled',
        ).length
      : data.filter(
          (item) =>
            item.status ===
            'Active',
        ).length

  const outstanding =
    invoiceMode
      ? invoices.reduce(
          (
            sum,
            item,
          ) =>
            sum +
            numberValue(
              item.outstanding,
            ),
          0,
        )
      : data.reduce(
          (
            sum,
            item,
          ) =>
            sum +
            numberValue(
              item.outstanding,
            ),
          0,
        )

  const overdue =
    invoiceMode
      ? invoices
          .filter(
            (item) =>
              item.status ===
              'Overdue',
          )
          .reduce(
            (
              sum,
              item,
            ) =>
              sum +
              numberValue(
                item.outstanding,
              ),
            0,
          )
      : data.reduce(
          (
            sum,
            item,
          ) =>
            sum +
            numberValue(
              item.overdue,
            ),
          0,
        )

  const paid =
    invoices
      .filter(
        (item) =>
          item.status ===
          'Paid',
      )
      .reduce(
        (
          sum,
          item,
        ) =>
          sum +
          numberValue(
            item.amount,
          ),
        0,
      )

  const items =
    invoiceMode
      ? [
          [
            'Total invoices',
            `${total}`,
            'Live records',
          ],
          [
            'Outstanding',
            money(
              outstanding,
            ),
            'Open balance',
          ],
          [
            'Paid',
            money(paid),
            'Collected',
          ],
          [
            'Overdue',
            money(overdue),
            'Needs follow-up',
          ],
          [
            'Draft',
            `${invoices.filter(
              (x) =>
                x.status ===
                'Draft',
            ).length}`,
            'Awaiting review',
          ],
          [
            'Active',
            `${active}`,
            'Open lifecycle',
          ],
        ]
      : module ===
          'customers'
        ? [
            [
              'Total customers',
              `${total}`,
              'All relationships',
            ],
            [
              'Active customers',
              `${active}`,
              'Currently trading',
            ],
            [
              'Outstanding receivables',
              money(outstanding),
              'Across open invoices',
            ],
            [
              'Overdue receivables',
              money(overdue),
              'Needs follow-up',
            ],
            [
              'Average payment time',
              '24 days',
              'Last 90 days',
            ],
          ]
        : [
            [
              'Total vendors',
              `${total}`,
              'All relationships',
            ],
            [
              'Active vendors',
              `${active}`,
              'Currently trading',
            ],
            [
              'Outstanding payables',
              money(outstanding),
              'Across open bills',
            ],
            [
              'Overdue payables',
              money(overdue),
              'Needs follow-up',
            ],
            [
              'Due this week',
              money(
                550000,
              ),
              'Scheduled obligations',
            ],
          ]

  return (
    <div className="dashboard-kpis">

      {items.map(
        (
          [
            label,
            value,
            sub,
          ],
          index,
        ) => (
          <section
            className="foundation-card kpi-card"
            key={
              label
            }
          >

            <div className="kpi-head">

              <span className="kpi-label">
                {label}
              </span>

              <span
                className={`kpi-status ${
                  index ===
                  3
                    ? 'red'
                    : index ===
                        2
                      ? 'amber'
                      : 'blue'
                }`}
              />

            </div>

            <strong className="money">
              {value}
            </strong>

            <p>
              {sub}
            </p>

            <small
              className={
                index ===
                3
                  ? 'danger-text'
                  : index ===
                      2
                    ? 'warning-text'
                    : 'positive-text'
              }
            >
              {index ===
              3
                ? 'Action required'
                : index ===
                    2
                  ? 'Monitor closely'
                  : 'Updated live'}
            </small>

          </section>
        ),
      )}

    </div>
  )
}

/* ==========================================================================
   DEFAULT FORM
   ========================================================================== */

function createDefaultForm(
  invoices: Invoice[],
): InvoiceFormValues {
  const today =
    todayISO()

  const nextNumber =
    invoices.length +
    491

  return {
    customer: '',
    customerId: '',
    customerEmail: '',
    customerPhone: '',
    customerAddress: '',
    customerGstin: '',

    invoiceNumber:
      `INV-${new Date().getFullYear()}-${String(
        nextNumber,
      ).padStart(
        5,
        '0',
      )}`,

    invoiceDate:
      today,

    dueDate:
      addDays(
        today,
        14,
      ),

    reference: '',

    businessName:
      'CashGuard-AI Business',

    businessAddress:
      'Jaipur, Rajasthan',

    businessGstin: '',

    businessState:
      'Rajasthan',

    placeOfSupply:
      'Rajasthan',

    gstMode:
      'CGST_SGST',

    gstRate:
      '18',

    notes: '',
    paymentTerms:
      'Payment due within 14 days.',

    items: [
      {
        description: '',
        quantity:
          '1',
        rate:
          '',
      },
    ],
  }
}

/* ==========================================================================
   MAIN PAGE
   ========================================================================== */

export default function ReceivablesPayablesPage({
  module,
}: {
  module: Module
}) {
  const invoiceMode =
    module ===
    'invoices'

  const title =
    module ===
    'invoices'
      ? 'invoice'
      : module ===
          'customers'
        ? 'customer'
        : 'vendor'

  const [
    invoices,
    setInvoices,
  ] =
    useState<Invoice[]>(
      invoicesSeed,
    )

  const [
    records,
    setRecords,
  ] =
    useState<RecordItem[]>(
      module ===
        'customers'
        ? customersSeed
        : vendorsSeed,
    )

  const [
    query,
    setQuery,
  ] =
    useState('')

  const [
    tab,
    setTab,
  ] =
    useState('All')

  const [
    statusFilter,
    setStatusFilter,
  ] =
    useState('All')

  const [
    riskFilter,
    setRiskFilter,
  ] =
    useState('All')

  const [
    selected,
    setSelected,
  ] =
    useState<
      Invoice | RecordItem | null
    >(null)

  const [
    modal,
    setModal,
  ] =
    useState<
      | 'create'
      | 'confirm'
      | 'add'
      | null
    >(null)

  const [
    notice,
    setNotice,
  ] =
    useState('')

  const [
    apiLoading,
    setApiLoading,
  ] =
    useState(false)

  const [
    saving,
    setSaving,
  ] =
    useState(false)

  const [
    form,
    setForm,
  ] =
    useState<InvoiceFormValues>(
      createDefaultForm(
        invoices,
      ),
    )

  const [
    aiLoading,
    setAiLoading,
  ] = useState(false)

  const [
    aiInsight,
    setAiInsight,
  ] = useState<InvoiceAiInsight | null>(null)

  const [
    paymentRisk,
    setPaymentRisk,
  ] = useState<PaymentDelayRisk | null>(null)

  /* ------------------------------------------------------------------------
     LIVE INVOICE LOAD
     ------------------------------------------------------------------------ */

  const loadInvoices =
    useCallback(
      async () => {
        if (
          !invoiceMode
        ) {
          return
        }

        setApiLoading(
          true,
        )

        try {
          const response =
            await apiRequest(
              '/api/invoices?limit=500&offset=0',
            )

          const raw =
            unwrapApiData(
              response,
            )

          let rows: unknown[] =
            []

          if (
            Array.isArray(
              raw,
            )
          ) {
            rows =
              raw
          } else if (
            isRecord(raw)
          ) {
            const candidates =
              [
                raw.data,
                raw.items,
                raw.rows,
                raw.results,
                raw.invoices,
              ]

            for (
              const candidate of candidates
            ) {
              if (
                Array.isArray(
                  candidate,
                )
              ) {
                rows =
                  candidate

                break
              }
            }
          }

          const normalized =
            rows
              .map(
                (
                  row,
                  index,
                ) =>
                  normalizeInvoice(
                    row,
                    invoicesSeed[
                      index %
                        invoicesSeed.length
                    ],
                  ),
              )
              .filter(
                (
                  row,
                ): row is Invoice =>
                  row !==
                  null,
              )

          if (
            normalized.length
          ) {
            setInvoices(
              normalized,
            )
          }
        } catch (
          error
        ) {
          console.warn(
            '[Invoices] Backend invoice list unavailable; keeping existing invoice data.',
            error,
          )
        } finally {
          setApiLoading(
            false,
          )
        }
      },
      [
        invoiceMode,
      ],
    )

  useEffect(() => {
    void loadInvoices()
  }, [
    loadInvoices,
  ])

  useEffect(() => {
    if (!invoiceMode || !selected || !('status' in selected)) {
      setAiInsight(null)
      setPaymentRisk(null)
      setAiLoading(false)
      return
    }

    const invoice = selected as Invoice
    let cancelled = false

    setAiLoading(true)
    setAiInsight(null)
    setPaymentRisk(null)

    void (async () => {
      const risk = await requestPaymentDelayRisk(invoice)
      if (cancelled) return

      setPaymentRisk(risk)
      const insight = await requestInvoiceAiInsight(invoice, risk)
      if (cancelled) return

      setAiInsight(insight)
      setAiLoading(false)
    })()

    return () => {
      cancelled = true
    }
  }, [invoiceMode, selected])

  /* ------------------------------------------------------------------------
     FILTERS
     ------------------------------------------------------------------------ */

  const filteredInvoices =
    useMemo(
      () =>
        invoices.filter(
          (
            invoice,
          ) => {
            const matchesTab =
              tab ===
                'All' ||
              invoice.status ===
                tab

            const text =
              `${invoice.id} ${invoice.customer} ${invoice.reference} ${invoice.amount} ${invoice.customerGstin || ''}`.toLowerCase()

            return (
              matchesTab &&
              text.includes(
                query
                  .toLowerCase()
                  .trim(),
              )
            )
          },
        ),
      [
        invoices,
        query,
        tab,
      ],
    )

  const filteredRecords =
    useMemo(
      () =>
        records.filter(
          (
            record,
          ) =>
            (
              statusFilter ===
                'All' ||
              record.status ===
                statusFilter
            ) &&
            (
              riskFilter ===
                'All' ||
              record.risk ===
                riskFilter
            ) &&
            `${record.id} ${record.name} ${record.email} ${record.phone} ${record.gstin}`
              .toLowerCase()
              .includes(
                query
                  .toLowerCase()
                  .trim(),
              ),
        ),
      [
        records,
        query,
        statusFilter,
        riskFilter,
      ],
    )

  /* ------------------------------------------------------------------------
     CLOSE
     ------------------------------------------------------------------------ */

  const close = () => {
    setSelected(
      null,
    )
    setModal(
      null,
    )
  }

  /* ------------------------------------------------------------------------
     FORM
     ------------------------------------------------------------------------ */

  const updateForm =
    <
      K extends keyof InvoiceFormValues,
    >(
      key: K,
      value: InvoiceFormValues[K],
    ) => {
      setForm(
        (
          current,
        ) => ({
          ...current,
          [key]:
            value,
        }),
      )
    }

  const updateItem =
    (
      index: number,
      key: keyof InvoiceFormItem,
      value: string,
    ) => {
      setForm(
        (
          current,
        ) => ({
          ...current,
          items:
            current.items.map(
              (
                item,
                itemIndex,
              ) =>
                itemIndex ===
                index
                  ? {
                      ...item,
                      [key]:
                        value,
                    }
                  : item,
            ),
        }),
      )
    }

  const addItem = () => {
    setForm(
      (
        current,
      ) => ({
        ...current,
        items: [
          ...current.items,
          {
            description:
              '',
            quantity:
              '1',
            rate:
              '',
          },
        ],
      }),
    )
  }

  const removeItem = (
    index: number,
  ) => {
    setForm(
      (
        current,
      ) => ({
        ...current,
        items:
          current.items.length >
          1
            ? current.items.filter(
                (
                  _,
                  itemIndex,
                ) =>
                  itemIndex !==
                  index,
              )
            : current.items,
      }),
    )
  }

  const formItems: InvoiceItem[] =
    form.items.map(
      (
        item,
      ) => ({
        description:
          item.description ||
          'Product / Service',

        quantity:
          numberValue(
            item.quantity,
          ) || 0,

        rate:
          numberValue(
            item.rate,
          ) || 0,

        amount:
          (
            numberValue(
              item.quantity,
            ) || 0
          ) *
          (
            numberValue(
              item.rate,
            ) || 0
          ),
      }),
    )

  const formTotals =
    calculateInvoiceTotals(
      formItems,
      numberValue(
        form.gstRate,
      ) || 18,
      form.gstMode,
    )

  /* ------------------------------------------------------------------------
     CREATE INVOICE
     ------------------------------------------------------------------------ */

  const saveInvoice =
    async (
      event: FormEvent<HTMLFormElement>,
    ) => {
      event.preventDefault()

      if (
        !form.customer.trim()
      ) {
        setNotice(
          'Customer name is required.',
        )

        return
      }

      if (
        !form.customerId.trim()
      ) {
        setNotice(
          'Customer ID is required for live invoice creation.',
        )

        return
      }

      if (
        !form.items.some(
          (
            item,
          ) =>
            numberValue(
              item.quantity,
            ) >
              0 &&
            numberValue(
              item.rate,
            ) >=
              0,
        )
      ) {
        setNotice(
          'Add at least one valid invoice item.',
        )

        return
      }

      const localInvoice =
        buildSeedInvoiceFromForm(
          form,
        )

      setSaving(
        true,
      )

      let saved =
        false

      try {
        const businessId =
          getBusinessId()

        const payload =
          {
            business_id:
              businessId,

            customer_id:
              form.customerId.trim(),

            subtotal:
              formTotals.taxableAmount,

            gst_rate:
              numberValue(
                form.gstRate,
              ) || 18,

            gst_type:
              form.gstMode,

            invoice_date:
              form.invoiceDate,

            due_date:
              form.dueDate,

            description:
              formItems[0]?.description ||
              'Products / Services',

            reference:
              form.reference || '',

            notes:
              [
                form.notes,
                form.paymentTerms,
              ]
                .filter(Boolean)
                .join(' '),

            status:
              'draft',
          }


        const response =
          await apiRequest(
            '/api/invoices',
            {
              method:
                'POST',
              body:
                JSON.stringify(
                  payload,
                ),
            },
          )

        const normalized =
          normalizeInvoice(
            response,
            localInvoice,
          )

        const savedInvoice =
          normalized ||
          localInvoice

        setInvoices(
          (
            current,
          ) => [
            savedInvoice,
            ...current.filter(
              (invoice) =>
                invoice.id !==
                savedInvoice.id,
            ),
          ],
        )

        setSelected(
          savedInvoice,
        )

        saved = true
      } catch (
        error
      ) {
        console.error(
          '[Invoices] Live invoice creation failed.',
          error,
        )

        setNotice(
          error instanceof Error
            ? error.message
            : 'Failed to create invoice on the backend.',
        )

        return
      } finally {
        setSaving(
          false,
        )
      }

      if (saved) {
        setModal(null)
        setNotice(
          'Invoice created successfully and saved to the backend.',
        )
      }
    }

  /* ------------------------------------------------------------------------
     MARK PAID
     ------------------------------------------------------------------------ */

  const markPaid =
    async (
      invoice: Invoice,
    ) => {
      const invoiceApiId = getInvoiceApiId(invoice)

      if (!invoiceApiId) {
        setNotice(
          'This invoice is not linked to a backend record yet. Refresh the invoice list after the backend record is available.',
        )
        return
      }

      try {
        await apiRequest(
          `/api/invoices/${encodeURIComponent(invoiceApiId)}/pay`,
          {
            method: 'POST',
          },
        )

        let refreshed: Invoice

        try {
          const liveResponse = await apiRequest(
            `/api/invoices/${encodeURIComponent(invoiceApiId)}`,
            { method: 'GET' },
          )

          refreshed =
            normalizeInvoice(liveResponse, {
              ...invoice,
              backendId: invoiceApiId,
              status: 'Paid',
              outstanding: 0,
            }) || {
              ...invoice,
              backendId: invoiceApiId,
              status: 'Paid' as Status,
              outstanding: 0,
            }
        } catch {
          // Some deployments expose the payment action without a GET-by-ID
          // endpoint. The successful POST is still enough to update the UI.
          refreshed = {
            ...invoice,
            backendId: invoiceApiId,
            status: 'Paid' as Status,
            outstanding: 0,
          }
        }

        setInvoices(
          (current) =>
            current.map((item) =>
              item.id === invoice.id
                ? refreshed
                : item,
            ),
        )

        setSelected(refreshed)
        setModal(null)
        setNotice('Invoice marked as paid successfully.')
      } catch (error) {
        console.error('[Invoices] Mark-paid request failed.', error)

        setNotice(
          error instanceof Error
            ? error.message
            : 'Failed to mark invoice as paid.',
        )
      }
    }

  /* ==========================================================================
     RESET
     ========================================================================== */

  const resetFilters =
    () => {
      setQuery('')
      setTab(
        'All',
      )
      setStatusFilter(
        'All',
      )
      setRiskFilter(
        'All',
      )
    }

  /* ==========================================================================
     INVOICE DOCUMENT GENERATION
     ========================================================================== */

  const getInvoiceDocument =
    (
      invoice: Invoice,
    ): string => {
      const items =
        invoice.items &&
        invoice.items.length
          ? invoice.items
          : [
              {
                description:
                  invoice.description ||
                  'Products / Services',
                quantity:
                  1,
                rate:
                  invoice.taxableAmount ||
                  invoice.amount,
                amount:
                  invoice.taxableAmount ||
                  invoice.amount,
              },
            ]

      const itemTaxable = roundMoney(
        items.reduce(
          (sum, item) =>
            sum +
            roundMoney(
              numberValue(item.amount) ||
                numberValue(item.rate) *
                  numberValue(item.quantity),
            ),
          0,
        ),
      )

      const gstRate =
        numberValue(invoice.gstRate) || 18

      const inferredMode =
        numberValue(invoice.igst) > 0
          ? 'IGST'
          : 'CGST_SGST'

      const calculated =
        calculateInvoiceTotals(
          items,
          gstRate,
          inferredMode,
        )

      const taxable =
        itemTaxable > 0
          ? calculated.taxableAmount
          : roundMoney(
              numberValue(invoice.taxableAmount) ||
                numberValue(invoice.amount),
            )

      const cgst =
        itemTaxable > 0
          ? calculated.cgst
          : roundMoney(numberValue(invoice.cgst))

      const sgst =
        itemTaxable > 0
          ? calculated.sgst
          : roundMoney(numberValue(invoice.sgst))

      const igst =
        itemTaxable > 0
          ? calculated.igst
          : roundMoney(numberValue(invoice.igst))

      const taxTotal =
        roundMoney(cgst + sgst + igst)

      const calculatedTotal =
        roundMoney(taxable + taxTotal)

      const total =
        itemTaxable > 0
          ? calculatedTotal
          : roundMoney(
              numberValue(invoice.amount) ||
                calculatedTotal,
            )

      const businessName =
        invoice.businessName ||
        'CashGuard-AI Business'

      const businessAddress =
        invoice.businessAddress ||
        'India'

      const customerAddress =
        invoice.customerAddress ||
        'India'

      const rows =
        items
          .map(
            (
              item,
              index,
            ) => `
              <tr>
                <td class="center">
                  ${index + 1}
                </td>

                <td>
                  <strong>
                    ${escapeHtml(
                      item.description,
                    )}
                  </strong>
                </td>

                <td class="center">
                  ${item.quantity}
                </td>

                <td class="right">
                  ${money(
                    item.rate,
                  )}
                </td>

                <td class="right">
                  ${money(
                    item.amount,
                  )}
                </td>
              </tr>
            `,
          )
          .join('')

      return `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(
    invoice.id,
  )} - Tax Invoice</title>

  <style>
    * {
      box-sizing: border-box;
    }

    html,
    body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #111827;
      font-family:
        Arial,
        Helvetica,
        sans-serif;
    }

    body {
      min-width: 210mm;
    }

    .invoice-page {
      width: 210mm;
      min-height: 297mm;
      margin: 0 auto;
      padding: 14mm;
      background: #ffffff;
    }

    .top-line {
      height: 4px;
      margin-bottom: 16px;
      background: #0ea5e9;
    }

    .header {
      display: grid;
      grid-template-columns:
        1fr
        1fr;
      gap: 24px;
      margin-bottom: 20px;
    }

    .brand h1 {
      margin: 0 0 5px;
      color: #0f172a;
      font-size: 24px;
      letter-spacing: -0.03em;
    }

    .brand p {
      margin: 3px 0;
      color: #475569;
      font-size: 10px;
      line-height: 1.5;
    }

    .invoice-title {
      text-align: right;
    }

    .invoice-title h2 {
      margin: 0;
      color: #0284c7;
      font-size: 20px;
      letter-spacing: 0.04em;
    }

    .invoice-title p {
      margin: 5px 0;
      color: #475569;
      font-size: 10px;
    }

    .meta-grid {
      display: grid;
      grid-template-columns:
        1fr
        1fr;
      gap: 8px;
      margin-bottom: 16px;
    }

    .box {
      border: 1px solid #dbe4ee;
      padding: 11px;
      border-radius: 4px;
    }

    .box-title {
      margin-bottom: 6px;
      color: #64748b;
      font-size: 8px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .box strong {
      display: block;
      margin-bottom: 4px;
      color: #0f172a;
      font-size: 11px;
    }

    .box span {
      display: block;
      color: #475569;
      font-size: 9px;
      line-height: 1.5;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 10px;
    }

    th {
      padding: 8px;
      border: 1px solid #cbd5e1;
      background: #f8fafc;
      color: #475569;
      font-size: 8px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }

    td {
      padding: 9px 8px;
      border: 1px solid #e2e8f0;
      color: #334155;
      font-size: 9px;
      vertical-align: top;
    }

    td strong {
      color: #0f172a;
      font-size: 9px;
    }

    .center {
      text-align: center;
    }

    .right {
      text-align: right;
    }

    .summary-layout {
      display: grid;
      grid-template-columns:
        1fr
        265px;
      gap: 20px;
      margin-top: 18px;
    }

    .words {
      border: 1px solid #e2e8f0;
      padding: 11px;
    }

    .words-label {
      margin-bottom: 6px;
      color: #64748b;
      font-size: 8px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    .words-value {
      color: #334155;
      font-size: 10px;
      line-height: 1.5;
    }

    .totals {
      width: 100%;
    }

    .total-row {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      padding: 6px 0;
      color: #475569;
      font-size: 9px;
    }

    .total-row.grand {
      margin-top: 4px;
      padding-top: 9px;
      border-top: 2px solid #0f172a;
      color: #0f172a;
      font-size: 12px;
      font-weight: 800;
    }

    .notes {
      margin-top: 20px;
      border-top: 1px solid #e2e8f0;
      padding-top: 12px;
    }

    .notes h4 {
      margin: 0 0 6px;
      color: #334155;
      font-size: 9px;
      text-transform: uppercase;
    }

    .notes p {
      margin: 3px 0;
      color: #64748b;
      font-size: 9px;
      line-height: 1.55;
    }

    .footer {
      display: grid;
      grid-template-columns:
        1fr
        1fr;
      gap: 40px;
      margin-top: 32px;
    }

    .signature {
      border-top: 1px solid #94a3b8;
      padding-top: 7px;
      color: #475569;
      font-size: 8px;
    }

    .thank-you {
      padding: 11px;
      border-radius: 4px;
      background: #f0f9ff;
      color: #0369a1;
      font-size: 8px;
      line-height: 1.5;
    }

    @media print {
      @page {
        size: A4;
        margin: 0;
      }

      body {
        min-width: auto;
      }

      .invoice-page {
        width: 210mm;
        min-height: 297mm;
        margin: 0;
        padding: 14mm;
      }
    }
  </style>
</head>

<body>
  <div class="invoice-page">

    <div class="top-line"></div>

    <section class="header">

      <div class="brand">
        <h1>
          ${escapeHtml(
            businessName,
          )}
        </h1>

        <p>
          ${escapeHtml(
            businessAddress,
          )}
        </p>

        ${
          invoice.businessGstin
            ? `
              <p>
                <strong>GSTIN:</strong>
                ${escapeHtml(
                  invoice.businessGstin,
                )}
              </p>
            `
            : ''
        }

        ${
          invoice.businessState
            ? `
              <p>
                <strong>State:</strong>
                ${escapeHtml(
                  invoice.businessState,
                )}
              </p>
            `
            : ''
        }
      </div>

      <div class="invoice-title">
        <h2>
          TAX INVOICE
        </h2>

        <p>
          Original for Recipient
        </p>

        <p>
          Invoice No:
          <strong>
            ${escapeHtml(
              invoice.id,
            )}
          </strong>
        </p>
      </div>

    </section>

    <section class="meta-grid">

      <div class="box">

        <div class="box-title">
          Bill To
        </div>

        <strong>
          ${escapeHtml(
            invoice.customer,
          )}
        </strong>

        ${
          invoice.customerAddress
            ? `
              <span>
                ${escapeHtml(
                  invoice.customerAddress,
                )}
              </span>
            `
            : ''
        }

        ${
          invoice.customerEmail
            ? `
              <span>
                ${escapeHtml(
                  invoice.customerEmail,
                )}
              </span>
            `
            : ''
        }

        ${
          invoice.customerPhone
            ? `
              <span>
                ${escapeHtml(
                  invoice.customerPhone,
                )}
              </span>
            `
            : ''
        }

        ${
          invoice.customerGstin
            ? `
              <span>
                <strong>GSTIN:</strong>
                ${escapeHtml(
                  invoice.customerGstin,
                )}
              </span>
            `
            : ''
        }

      </div>

      <div class="box">

        <div class="box-title">
          Invoice Details
        </div>

        <span>
          <strong>
            Invoice Date:
          </strong>
          ${escapeHtml(
            invoice.issue,
          )}
        </span>

        <span>
          <strong>
            Due Date:
          </strong>
          ${escapeHtml(
            invoice.due,
          )}
        </span>

        ${
          invoice.reference
            ? `
              <span>
                <strong>
                  Reference:
                </strong>
                ${escapeHtml(
                  invoice.reference,
                )}
              </span>
            `
            : ''
        }

        ${
          invoice.placeOfSupply
            ? `
              <span>
                <strong>
                  Place of Supply:
                </strong>
                ${escapeHtml(
                  invoice.placeOfSupply,
                )}
              </span>
            `
            : ''
        }

      </div>

    </section>

    <table>

      <thead>
        <tr>
          <th style="width: 8%">
            #
          </th>

          <th>
            Description
          </th>

          <th style="width: 12%">
            Qty
          </th>

          <th style="width: 18%">
            Rate
          </th>

          <th style="width: 20%">
            Amount
          </th>
        </tr>
      </thead>

      <tbody>
        ${rows}
      </tbody>

    </table>

    <section class="summary-layout">

      <div class="words">

        <div class="words-label">
          Amount in Words
        </div>

        <div class="words-value">
          ${escapeHtml(
            amountInWords(
              total,
            ),
          )}
        </div>

      </div>

      <div class="totals">

        <div class="total-row">
          <span>
            Taxable Amount
          </span>

          <strong>
            ${money(
              taxable,
            )}
          </strong>
        </div>

        ${
          cgst > 0
            ? `
              <div class="total-row">
                <span>
                  CGST
                </span>
                <strong>
                  ${money(
                    cgst,
                  )}
                </strong>
              </div>
            `
            : ''
        }

        ${
          sgst > 0
            ? `
              <div class="total-row">
                <span>
                  SGST
                </span>
                <strong>
                  ${money(
                    sgst,
                  )}
                </strong>
              </div>
            `
            : ''
        }

        ${
          igst > 0
            ? `
              <div class="total-row">
                <span>
                  IGST
                </span>
                <strong>
                  ${money(
                    igst,
                  )}
                </strong>
              </div>
            `
            : ''
        }

        <div class="total-row">
          <span>
            Total Tax
          </span>

          <strong>
            ${money(
              taxTotal,
            )}
          </strong>
        </div>

        <div class="total-row grand">
          <span>
            Grand Total
          </span>

          <strong>
            ${money(
              total,
            )}
          </strong>
        </div>

      </div>

    </section>

    <section class="notes">

      <h4>
        Terms & Notes
      </h4>

      ${
        invoice.notes
          ? `
            <p>
              ${escapeHtml(
                invoice.notes,
              )}
            </p>
          `
          : ''
      }

      <p>
        Payment status:
        ${escapeHtml(
          invoice.status,
        )}
      </p>

    </section>

    <section class="footer">

      <div class="thank-you">
        Thank you for your business.
        This invoice has been generated
        through CashGuard-AI.
      </div>

      <div class="signature">
        Authorized Signatory
      </div>

    </section>

  </div>
</body>
</html>
`
    }

  /* ------------------------------------------------------------------------
     DOWNLOAD
     ------------------------------------------------------------------------ */

  const downloadInvoice =
    (
      invoice: Invoice,
    ) => {
      const html =
        getInvoiceDocument(
          invoice,
        )

      const blob =
        new Blob(
          [html],
          {
            type:
              'text/html;charset=utf-8',
          },
        )

      const url =
        URL.createObjectURL(
          blob,
        )

      const anchor =
        document.createElement(
          'a',
        )

      anchor.href =
        url

      anchor.download =
        `${invoice.id}.html`

      document.body.appendChild(
        anchor,
      )

      anchor.click()

      anchor.remove()

      URL.revokeObjectURL(
        url,
      )

      setNotice(
        'Professional invoice document downloaded.',
      )
    }

  /* ------------------------------------------------------------------------
     PRINT
     ------------------------------------------------------------------------ */

  const printInvoice =
    (
      invoice: Invoice,
    ) => {
      const printWindow =
        window.open(
          '',
          '_blank',
          'width=900,height=1100',
        )

      if (
        !printWindow
      ) {
        setNotice(
          'Please allow pop-ups to print the invoice.',
        )

        return
      }

      const html =
        getInvoiceDocument(
          invoice,
        )

      printWindow.document.open()

      printWindow.document.write(
        html,
      )

      printWindow.document.close()

      printWindow.focus()

      window.setTimeout(
        () => {
          printWindow.print()
        },
        450,
      )
    }

  /* ==========================================================================
     RENDER
     ========================================================================== */

  return (
    <>
      <main
        className={`foundation-content operations-page ${module}-page invoice-module-page`}
      >

        <Header
          module={module}
          action={
            invoiceMode
              ? 'Create invoice'
              : `Add ${title}`
          }
          onAction={() => {
            if (
              invoiceMode
            ) {
              setForm(
                createDefaultForm(
                  invoices,
                ),
              )

              setModal(
                'create',
              )
            } else {
              setModal(
                'add',
              )
            }
          }}
        />

        <Kpis
          module={module}
          invoices={
            invoices
          }
          data={
            records
          }
        />

        {notice && (
          <div className="operations-success">

            <CheckCircle2
              size={16}
            />

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
              <X
                size={15}
              />
            </button>

          </div>
        )}

        <section className="foundation-card operations-toolbar">

          <div className="search-control">

            <Search
              size={16}
            />

            <input
              aria-label={`Search ${title}s`}
              placeholder={
                invoiceMode
                  ? 'Search invoices by number, customer, reference or GSTIN'
                  : `Search ${title}s by name, ID, email or GSTIN`
              }
              value={
                query
              }
              onChange={(
                event,
              ) =>
                setQuery(
                  event
                    .target
                    .value,
                )
              }
            />

          </div>

          {invoiceMode ? (

            <div className="filter-tabs">

              {[
                'All',
                'Draft',
                'Sent',
                'Due',
                'Overdue',
                'Paid',
                'Cancelled',
              ].map(
                (
                  item,
                ) => (
                  <button
                    type="button"
                    className={
                      tab ===
                      item
                        ? 'active'
                        : ''
                    }
                    onClick={() =>
                      setTab(
                        item,
                      )
                    }
                    key={
                      item
                    }
                  >
                    {item}
                  </button>
                ),
              )}

            </div>

          ) : (

            <>
              <select
                aria-label="Filter status"
                value={
                  statusFilter
                }
                onChange={(
                  event,
                ) =>
                  setStatusFilter(
                    event
                      .target
                      .value,
                  )
                }
              >
                <option value="All">
                  All statuses
                </option>

                <option value="Active">
                  Active
                </option>

                <option value="Inactive">
                  Inactive
                </option>
              </select>

              <select
                aria-label="Filter risk"
                value={
                  riskFilter
                }
                onChange={(
                  event,
                ) =>
                  setRiskFilter(
                    event
                      .target
                      .value,
                  )
                }
              >
                <option value="All">
                  All risk levels
                </option>

                <option value="Low">
                  Low risk
                </option>

                <option value="Medium">
                  Medium risk
                </option>

                <option value="High">
                  High risk
                </option>
              </select>
            </>
          )}

          <button
            type="button"
            className="secondary-button"
            onClick={
              resetFilters
            }
          >
            <Filter
              size={14}
            />

            Reset filters
          </button>

        </section>

        {/* ==================================================================
           TABLE
           ================================================================== */}

        <section className="foundation-card operations-table-card">

          <div className="panel-heading">

            <div>

              <h3>
                {invoiceMode
                  ? 'Invoice register'
                  : `${
                      module ===
                      'customers'
                        ? 'Customer'
                        : 'Vendor'
                    } directory`}
              </h3>

              <p>
                {invoiceMode
                  ? `${filteredInvoices.length} records matching your view`
                  : `${filteredRecords.length} relationships in your workspace`}
              </p>

            </div>

            {invoiceMode &&
              apiLoading && (
                <span className="live-fetching">
                  Syncing...
                </span>
              )}

            <button
              type="button"
              className="icon-button"
              aria-label="More options"
            >
              <MoreHorizontal
                size={17}
              />
            </button>

          </div>

          {invoiceMode ? (

            <div className="responsive-record-grid invoice-record-grid">

              {filteredInvoices.map(
                (
                  row,
                ) => (
                  <button
                    type="button"
                    className="record-card invoice-record-card"
                    onClick={() =>
                      setSelected(
                        row,
                      )
                    }
                    key={
                      row.id
                    }
                  >

                    <div>

                      <strong>
                        {row.id}
                      </strong>

                      <span>
                        {row.description}
                      </span>

                    </div>

                    <div>

                      <strong>
                        {row.customer}
                      </strong>

                      <span>
                        {row.issue} · Due{' '}
                        {row.due}
                      </span>

                    </div>

                    <div>

                      <span>
                        Amount
                      </span>

                      <strong>
                        {money(
                          row.amount,
                        )}
                      </strong>

                    </div>

                    <div>

                      <span>
                        Outstanding
                      </span>

                      <strong>
                        {money(
                          row.outstanding,
                        )}
                      </strong>

                    </div>

                    <Badge
                      tone={
                        row.status ===
                        'Overdue'
                          ? 'red'
                          : row.status ===
                              'Paid'
                            ? 'green'
                            : row.status ===
                                'Draft'
                              ? 'amber'
                              : 'blue'
                      }
                    >
                      {row.status}
                    </Badge>

                    <ArrowUpRight
                      size={15}
                    />

                  </button>
                ),
              )}

            </div>

          ) : (

            <div className="responsive-record-grid">

              {filteredRecords.map(
                (
                  row,
                ) => (
                  <button
                    type="button"
                    className="record-card"
                    onClick={() =>
                      setSelected(
                        row,
                      )
                    }
                    key={
                      row.id
                    }
                  >

                    <div className="record-leading">

                      <span className="avatar blue-avatar">
                        {row.name[0]}
                      </span>

                      <span>

                        <strong>
                          {row.name}
                        </strong>

                        <small>
                          {row.id}
                        </small>

                      </span>

                    </div>

                    <div>

                      <span>
                        Contact
                      </span>

                      <strong>
                        {row.email}
                      </strong>

                      <small>
                        {row.phone}
                      </small>

                    </div>

                    <div>

                      <span>
                        Outstanding
                      </span>

                      <strong>
                        {money(
                          row.outstanding,
                        )}
                      </strong>

                      <small>
                        Overdue{' '}
                        {money(
                          row.overdue,
                        )}
                      </small>

                    </div>

                    <Badge
                      tone={
                        row.risk ===
                        'High'
                          ? 'red'
                          : row.risk ===
                              'Medium'
                            ? 'amber'
                            : 'green'
                      }
                    >
                      {row.risk} risk
                    </Badge>

                    <Badge
                      tone={
                        row.status ===
                        'Active'
                          ? 'green'
                          : 'amber'
                      }
                    >
                      {row.status}
                    </Badge>

                    <ArrowUpRight
                      size={15}
                    />

                  </button>
                ),
              )}

            </div>
          )}

          {(
            invoiceMode
              ? filteredInvoices.length ===
                0
              : filteredRecords.length ===
                0
          ) && (
            <div className="operations-state">

              No {title}s found.

              <button
                type="button"
                onClick={
                  resetFilters
                }
              >
                Reset filters
              </button>

            </div>
          )}

        </section>

        {/* ==================================================================
           DETAILS DRAWER
           ================================================================== */}

        {selected && (
          <aside className="details-drawer">

            <button
              type="button"
              className="drawer-close"
              aria-label="Close details"
              onClick={
                close
              }
            >
              <X
                size={18}
              />
            </button>

            {invoiceMode ? (

              <InvoiceDetails
                invoice={
                  selected as Invoice
                }
                onPaid={() =>
                  void markPaid(
                    selected as Invoice,
                  )
                }
                onDownload={() =>
                  downloadInvoice(
                    selected as Invoice,
                  )
                }
                onPrint={() =>
                  printInvoice(
                    selected as Invoice,
                  )
                }
                aiLoading={aiLoading}
                aiInsight={aiInsight}
                paymentRisk={paymentRisk}
              />

            ) : (

              <RecordDetails
                record={
                  selected as RecordItem
                }
                module={
                  module
                }
                onDeactivate={() =>
                  setModal(
                    'confirm',
                  )
                }
              />

            )}

          </aside>
        )}

        {/* ==================================================================
           CONFIRM
           ================================================================== */}

        {modal ===
          'confirm' && (
          <div className="modal-backdrop">

            <div className="modal-card">

              <h3>
                {invoiceMode
                  ? 'Mark invoice as paid?'
                  : `Deactivate ${title}?`}
              </h3>

              <p>
                {invoiceMode
                  ? 'The invoice will move to Paid and its outstanding amount will become zero.'
                  : 'This updates the current workspace relationship status.'}
              </p>

              <div className="modal-actions">

                <button
                  type="button"
                  className="secondary-button"
                  onClick={
                    close
                  }
                >
                  Cancel
                </button>

                <button
                  type="button"
                  className="auth-button compact"
                  onClick={() => {

                    if (
                      invoiceMode
                    ) {
                      if (
                        selected
                      ) {
                        void markPaid(
                          selected as Invoice,
                        )
                      }
                    } else {
                      const record =
                        selected as
                          | RecordItem
                          | null

                      if (
                        record
                      ) {
                        setRecords(
                          (
                            items,
                          ) =>
                            items.map(
                              (
                                item,
                              ) =>
                                item.id ===
                                record.id
                                  ? {
                                      ...item,
                                      status:
                                        'Inactive',
                                    }
                                  : item,
                            ),
                        )

                        setNotice(
                          `${title[0].toUpperCase()}${title.slice(
                            1,
                          )} deactivated.`,
                        )

                        close()
                      }
                    }

                  }}
                >
                  Confirm
                </button>

              </div>

            </div>

          </div>
        )}

        {/* ==================================================================
           CREATE / ADD MODAL
           ================================================================== */}

        {(
          modal ===
            'create' ||
          modal ===
            'add'
        ) && (
          <div className="modal-backdrop invoice-create-backdrop">

            <div className="modal-card wide invoice-form-modal">

              <button
                type="button"
                className="drawer-close"
                onClick={
                  close
                }
                aria-label="Close form"
              >
                <X
                  size={18}
                />
              </button>

              <p className="auth-eyebrow">
                {invoiceMode
                  ? 'CREATE PROFESSIONAL GST INVOICE'
                  : `ADD ${title.toUpperCase()}`}
              </p>

              <h3>
                {invoiceMode
                  ? 'Generate new invoice'
                  : `Add ${title}`}
              </h3>

              {invoiceMode ? (

                <form
                  onSubmit={
                    saveInvoice
                  }
                  className="invoice-form"
                >

                  {/* ------------------------------------------------------
                     BUSINESS / CUSTOMER
                     ------------------------------------------------------ */}

                  <div className="invoice-form-grid">

                    <div className="form-section">

                      <div className="form-section-title">
                        Seller details
                      </div>

                      <label>
                        Business name

                        <input
                          value={
                            form.businessName
                          }
                          onChange={(
                            event,
                          ) =>
                            updateForm(
                              'businessName',
                              event
                                .target
                                .value,
                            )
                          }
                          placeholder="Your business name"
                        />
                      </label>

                      <label>
                        Business address

                        <input
                          value={
                            form.businessAddress
                          }
                          onChange={(
                            event,
                          ) =>
                            updateForm(
                              'businessAddress',
                              event
                                .target
                                .value,
                            )
                          }
                          placeholder="Jaipur, Rajasthan"
                        />
                      </label>

                      <div className="field-row">

                        <label>
                          Business GSTIN

                          <input
                            value={
                              form.businessGstin
                            }
                            onChange={(
                              event,
                            ) =>
                              updateForm(
                                'businessGstin',
                                event
                                  .target
                                  .value
                                  .toUpperCase(),
                              )
                            }
                            placeholder="22AAAAA0000A1Z5"
                          />
                        </label>

                        <label>
                          State

                          <input
                            value={
                              form.businessState
                            }
                            onChange={(
                              event,
                            ) =>
                              updateForm(
                                'businessState',
                                event
                                  .target
                                  .value,
                              )
                            }
                            placeholder="Rajasthan"
                          />
                        </label>

                      </div>

                    </div>

                    <div className="form-section">

                      <div className="form-section-title">
                        Bill to customer
                      </div>

                      <label>
                        Customer ID *

                        <input
                          required
                          value={
                            form.customerId
                          }
                          onChange={(
                            event,
                          ) =>
                            updateForm(
                              'customerId',
                              event.target.value.trim(),
                            )
                          }
                          placeholder="Paste customer UUID from MySQL"
                        />
                      </label>

                      <label>
                        Customer name *

                        <input
                          required
                          value={
                            form.customer
                          }
                          onChange={(
                            event,
                          ) =>
                            updateForm(
                              'customer',
                              event
                                .target
                                .value,
                            )
                          }
                          placeholder="Sharma Traders"
                        />
                      </label>

                      <label>
                        Address

                        <input
                          value={
                            form.customerAddress
                          }
                          onChange={(
                            event,
                          ) =>
                            updateForm(
                              'customerAddress',
                              event
                                .target
                                .value,
                            )
                          }
                          placeholder="Jaipur, Rajasthan"
                        />
                      </label>

                      <div className="field-row">

                        <label>
                          Email

                          <input
                            type="email"
                            value={
                              form.customerEmail
                            }
                            onChange={(
                              event,
                            ) =>
                              updateForm(
                                'customerEmail',
                                event
                                  .target
                                  .value,
                              )
                            }
                            placeholder="accounts@customer.in"
                          />
                        </label>

                        <label>
                          GSTIN

                          <input
                            value={
                              form.customerGstin
                            }
                            onChange={(
                              event,
                            ) =>
                              updateForm(
                                'customerGstin',
                                event
                                  .target
                                  .value
                                  .toUpperCase(),
                              )
                            }
                            placeholder="08AAAAA0000A1Z5"
                          />
                        </label>

                      </div>

                    </div>

                  </div>

                  {/* ------------------------------------------------------
                     INVOICE META
                     ------------------------------------------------------ */}

                  <div className="form-section">

                    <div className="form-section-title">
                      Invoice details
                    </div>

                    <div className="invoice-meta-grid">

                      <label>
                        Invoice number *

                        <input
                          required
                          value={
                            form.invoiceNumber
                          }
                          onChange={(
                            event,
                          ) =>
                            updateForm(
                              'invoiceNumber',
                              event
                                .target
                                .value,
                            )
                          }
                        />
                      </label>

                      <label>
                        Invoice date

                        <input
                          type="date"
                          value={
                            form.invoiceDate
                          }
                          onChange={(
                            event,
                          ) =>
                            updateForm(
                              'invoiceDate',
                              event
                                .target
                                .value,
                            )
                          }
                        />
                      </label>

                      <label>
                        Due date

                        <input
                          type="date"
                          value={
                            form.dueDate
                          }
                          onChange={(
                            event,
                          ) =>
                            updateForm(
                              'dueDate',
                              event
                                .target
                                .value,
                            )
                          }
                        />
                      </label>

                      <label>
                        Reference / PO

                        <input
                          value={
                            form.reference
                          }
                          onChange={(
                            event,
                          ) =>
                            updateForm(
                              'reference',
                              event
                                .target
                                .value,
                            )
                          }
                          placeholder="PO-8842"
                        />
                      </label>

                      <label>
                        Place of supply

                        <input
                          value={
                            form.placeOfSupply
                          }
                          onChange={(
                            event,
                          ) =>
                            updateForm(
                              'placeOfSupply',
                              event
                                .target
                                .value,
                            )
                          }
                          placeholder="Rajasthan"
                        />
                      </label>

                      <label>
                        GST mode

                        <select
                          value={
                            form.gstMode
                          }
                          onChange={(
                            event,
                          ) =>
                            updateForm(
                              'gstMode',
                              event
                                .target
                                .value as InvoiceFormValues['gstMode'],
                            )
                          }
                        >
                          <option value="CGST_SGST">
                            CGST + SGST
                          </option>

                          <option value="IGST">
                            IGST
                          </option>
                        </select>
                      </label>

                      <label>
                        GST rate %

                        <select
                          value={
                            form.gstRate
                          }
                          onChange={(
                            event,
                          ) =>
                            updateForm(
                              'gstRate',
                              event
                                .target
                                .value,
                            )
                          }
                        >
                          <option value="0">
                            0%
                          </option>

                          <option value="5">
                            5%
                          </option>

                          <option value="12">
                            12%
                          </option>

                          <option value="18">
                            18%
                          </option>

                          <option value="28">
                            28%
                          </option>
                        </select>
                      </label>

                    </div>

                  </div>

                  {/* ------------------------------------------------------
                     ITEMS
                     ------------------------------------------------------ */}

                  <div className="form-section">

                    <div className="items-head">

                      <div className="form-section-title">
                        Items / services
                      </div>

                      <button
                        type="button"
                        className="secondary-button compact-btn"
                        onClick={
                          addItem
                        }
                      >
                        <Plus
                          size={13}
                        />
                        Add item
                      </button>

                    </div>

                    <div className="invoice-items">

                      <div className="invoice-item-header">

                        <span>
                          Description
                        </span>

                        <span>
                          Qty
                        </span>

                        <span>
                          Rate
                        </span>

                        <span>
                          Amount
                        </span>

                        <span />

                      </div>

                      {form.items.map(
                        (
                          item,
                          index,
                        ) => {
                          const qty =
                            numberValue(
                              item.quantity,
                            )

                          const rate =
                            numberValue(
                              item.rate,
                            )

                          return (
                            <div
                              className="invoice-item-row"
                              key={
                                `item-${index}`
                              }
                            >

                              <input
                                value={
                                  item.description
                                }
                                onChange={(
                                  event,
                                ) =>
                                  updateItem(
                                    index,
                                    'description',
                                    event
                                      .target
                                      .value,
                                  )
                                }
                                placeholder="Product / Service"
                              />

                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={
                                  item.quantity
                                }
                                onChange={(
                                  event,
                                ) =>
                                  updateItem(
                                    index,
                                    'quantity',
                                    event
                                      .target
                                      .value,
                                  )
                                }
                              />

                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={
                                  item.rate
                                }
                                onChange={(
                                  event,
                                ) =>
                                  updateItem(
                                    index,
                                    'rate',
                                    event
                                      .target
                                      .value,
                                  )
                                }
                                placeholder="0"
                              />

                              <strong>
                                {money(
                                  qty *
                                    rate,
                                )}
                              </strong>

                              <button
                                type="button"
                                className="mini-icon-btn"
                                onClick={() =>
                                  removeItem(
                                    index,
                                  )
                                }
                                aria-label="Remove item"
                              >
                                <Trash2
                                  size={
                                    13
                                  }
                                />
                              </button>

                            </div>
                          )
                        },
                      )}

                    </div>

                  </div>

                  {/* ------------------------------------------------------
                     TOTALS
                     ------------------------------------------------------ */}

                  <div className="invoice-form-footer-grid">

                    <div className="form-section">

                      <label>
                        Notes

                        <textarea
                          rows={
                            4
                          }
                          value={
                            form.notes
                          }
                          onChange={(
                            event,
                          ) =>
                            updateForm(
                              'notes',
                              event
                                .target
                                .value,
                            )
                          }
                          placeholder="Add collection notes, payment details or customer instructions."
                        />
                      </label>

                      <label>
                        Payment terms

                        <input
                          value={
                            form.paymentTerms
                          }
                          onChange={(
                            event,
                          ) =>
                            updateForm(
                              'paymentTerms',
                              event
                                .target
                                .value,
                            )
                          }
                          placeholder="Payment due within 14 days"
                        />
                      </label>

                    </div>

                    <div className="invoice-live-total">

                      <div>
                        <span>
                          Taxable amount
                        </span>

                        <strong>
                          {money(
                            formTotals.taxableAmount,
                          )}
                        </strong>
                      </div>

                      <div>
                        <span>
                          GST
                        </span>

                        <strong>
                          {money(
                            formTotals.gstAmount,
                          )}
                        </strong>
                      </div>

                      <div>
                        <span>
                          CGST
                        </span>

                        <strong>
                          {money(
                            formTotals.cgst,
                          )}
                        </strong>
                      </div>

                      <div>
                        <span>
                          SGST
                        </span>

                        <strong>
                          {money(
                            formTotals.sgst,
                          )}
                        </strong>
                      </div>

                      <div>
                        <span>
                          IGST
                        </span>

                        <strong>
                          {money(
                            formTotals.igst,
                          )}
                        </strong>
                      </div>

                      <div className="grand-total-row">
                        <span>
                          Grand total
                        </span>

                        <strong>
                          {money(
                            formTotals.grandTotal,
                          )}
                        </strong>
                      </div>

                      <p className="amount-word-preview">
                        {amountInWords(
                          formTotals.grandTotal,
                        )}
                      </p>

                    </div>

                  </div>

                  <div className="modal-actions invoice-modal-actions">

                    <button
                      type="button"
                      className="secondary-button"
                      onClick={
                        close
                      }
                    >
                      Cancel
                    </button>

                    <button
                      type="submit"
                      className="auth-button compact"
                      disabled={
                        saving
                      }
                    >
                      <FileText
                        size={14}
                      />

                      {saving
                        ? 'Saving...'
                        : 'Save & Generate Invoice'}
                    </button>

                  </div>

                </form>

              ) : (

                <form
                  onSubmit={(
                    event,
                  ) => {
                    event.preventDefault()

                    const fields =
                      event.currentTarget.elements

                    const primary =
                      (
                        fields[0] as HTMLInputElement
                      ).value.trim()

                    const email =
                      (
                        fields[1] as HTMLInputElement
                      ).value.trim() ||
                      'accounts@business.in'

                    setRecords(
                      (
                        items,
                      ) => [
                        {
                          id: `${
                            module ===
                            'customers'
                              ? 'CUS'
                              : 'VEN'
                          }-${String(
                            items.length +
                              129,
                          ).padStart(
                            5,
                            '0',
                          )}`,

                          name:
                            primary,

                          email,

                          phone:
                            '+91 00000 00000',

                          address:
                            'India',

                          gstin:
                            'Pending',

                          status:
                            'Active',

                          outstanding:
                            0,

                          overdue:
                            0,

                          risk:
                            'Low',
                        },
                        ...items,
                      ],
                    )

                    setNotice(
                      `${
                        title[0].toUpperCase() +
                        title.slice(
                          1,
                        )
                      } created successfully.`,
                    )

                    close()
                  }}
                  className="stack-form"
                >

                  <label>
                    {`${title[0].toUpperCase()}${title.slice(
                      1,
                    )} name`}

                    <input
                      required
                      placeholder={
                        title ===
                        'customer'
                          ? 'Mehta Electricals'
                          : 'Kumar Industrial Components'
                      }
                    />
                  </label>

                  <label>
                    Email

                    <input
                      type="email"
                      placeholder="accounts@business.in"
                    />
                  </label>

                  <label>
                    Phone

                    <input
                      placeholder="+91 98765 43210"
                    />
                  </label>

                  <label>
                    {title ===
                    'customer'
                      ? 'GSTIN'
                      : 'GSTIN'}

                    <input
                      placeholder="22AABCA1234L1ZX"
                    />
                  </label>

                  <label>
                    Notes

                    <textarea
                      rows={
                        3
                      }
                      placeholder="Add context for your finance team"
                    />
                  </label>

                  <div className="modal-actions">

                    <button
                      type="button"
                      className="secondary-button"
                      onClick={
                        close
                      }
                    >
                      Cancel
                    </button>

                    <button
                      type="submit"
                      className="auth-button compact"
                    >
                      Save{' '}
                      {title}
                    </button>

                  </div>

                </form>

              )}

            </div>

          </div>
        )}

      </main>

      {/* ======================================================================
         COMPLETE CSS
         ====================================================================== */}

      <style jsx global>{`

        .invoice-module-page {
          width: 100%;
          max-width: 1440px;
          margin: 0 auto;
          padding: 34px 32px 60px;
        }

        .invoice-module-page,
        .invoice-module-page * {
          box-sizing: border-box;
        }

        .invoice-module-page button,
        .invoice-module-page input,
        .invoice-module-page select,
        .invoice-module-page textarea {
          font: inherit;
        }

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

        /* KPI */

        .dashboard-kpis {
          display: grid;
          grid-template-columns:
            repeat(
              6,
              minmax(0, 1fr)
            );
          gap: 11px;
        }

        .kpi-card {
          min-width: 0;
          min-height: 122px;
          padding: 16px;
          border: 1px solid #e2e8f0;
          border-radius: 11px;
          background: #fff;
        }

        .kpi-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }

        .kpi-label {
          color: #64748b;
          font-size: 10px;
          font-weight: 750;
        }

        .kpi-status {
          width: 7px;
          height: 7px;
          flex: 0 0 auto;
          border-radius: 50%;
          background: #38bdf8;
        }

        .kpi-status.blue {
          background: #38bdf8;
        }

        .kpi-status.amber {
          background: #f59e0b;
        }

        .kpi-status.red {
          background: #ef4444;
        }

        .kpi-card .money {
          display: block;
          margin: 14px 0 7px;
          color: #0f172a;
          font-size: clamp(
            18px,
            1.8vw,
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

        .kpi-card small {
          display: block;
          margin-top: 9px;
          color: #64748b;
          font-size: 9px;
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

        /* SUCCESS */

        .operations-success {
          display: flex;
          align-items: center;
          gap: 9px;
          margin: 14px 0;
          padding: 10px 12px;
          border: 1px solid #bbf7d0;
          border-radius: 8px;
          background: #f0fdf4;
          color: #166534;
          font-size: 11px;
        }

        .operations-success span {
          min-width: 0;
          flex: 1;
        }

        .operations-success button {
          border: 0;
          background: transparent;
          color: inherit;
          cursor: pointer;
        }

        /* TOOLBAR */

        .operations-toolbar {
          display: flex;
          align-items: center;
          gap: 9px;
          margin-top: 14px;
          padding: 12px;
          overflow: hidden;
        }

        .search-control {
          min-width: 240px;
          flex: 1;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 0 10px;
          border: 1px solid #dbe4ee;
          border-radius: 8px;
          background: #fff;
        }

        .search-control svg {
          color: #94a3b8;
          flex: 0 0 auto;
        }

        .search-control input {
          width: 100%;
          min-width: 0;
          border: 0;
          outline: 0;
          padding: 10px 0;
          background: transparent;
          color: #334155;
          font-size: 11px;
        }

        .filter-tabs {
          display: flex;
          align-items: center;
          gap: 3px;
          max-width: 620px;
          overflow-x: auto;
        }

        .filter-tabs button {
          flex: 0 0 auto;
          border: 0;
          border-radius: 6px;
          padding: 8px 10px;
          background: transparent;
          color: #64748b;
          font-size: 9px;
          font-weight: 700;
          cursor: pointer;
        }

        .filter-tabs button.active {
          background: #e0f2fe;
          color: #0284c7;
        }

        .operations-toolbar select {
          height: 36px;
          padding: 0 30px 0 10px;
          border: 1px solid #dbe4ee;
          border-radius: 8px;
          background: #fff;
          color: #475569;
          font-size: 10px;
          outline: 0;
        }

        /* TABLE */

        .operations-table-card {
          margin-top: 14px;
          padding: 20px;
          overflow: hidden;
        }

        .panel-heading {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 14px;
        }

        .panel-heading > div {
          min-width: 0;
        }

        .panel-heading h3 {
          margin: 0;
          color: #0f172a;
          font-size: 15px;
          line-height: 1.25;
        }

        .panel-heading p {
          margin: 5px 0 0;
          color: #94a3b8;
          font-size: 10px;
          line-height: 1.45;
        }

        .live-fetching {
          margin-left: auto;
          color: #0284c7;
          font-size: 9px;
          font-weight: 750;
        }

        .responsive-record-grid {
          display: grid;
          margin-top: 16px;
        }

        .record-card {
          width: 100%;
          display: grid;
          grid-template-columns:
            minmax(160px, 1.5fr)
            minmax(150px, 1.2fr)
            minmax(100px, 0.8fr)
            auto
            auto;
          align-items: center;
          gap: 15px;
          padding: 14px 0;
          border: 0;
          border-bottom: 1px solid #f1f5f9;
          background: transparent;
          color: #334155;
          text-align: left;
          cursor: pointer;
        }

        .invoice-record-card {
          grid-template-columns:
            minmax(150px, 1.25fr)
            minmax(160px, 1.2fr)
            minmax(100px, 0.7fr)
            minmax(110px, 0.8fr)
            auto
            18px;
        }

        .record-card:hover {
          background: #fbfdff;
        }

        .record-card > div {
          min-width: 0;
        }

        .record-card strong {
          display: block;
          color: #334155;
          font-size: 11px;
          line-height: 1.3;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .record-card span {
          display: block;
          margin-top: 3px;
          color: #64748b;
          font-size: 9px;
          line-height: 1.35;
        }

        .record-card small {
          display: block;
          margin-top: 3px;
          color: #94a3b8;
          font-size: 8px;
          line-height: 1.3;
        }

        .record-card > svg {
          color: #94a3b8;
          justify-self: end;
        }

        .record-leading {
          display: flex !important;
          align-items: center;
          gap: 9px;
        }

        .avatar {
          width: 31px;
          height: 31px;
          display: grid;
          place-items: center;
          flex: 0 0 auto;
          border-radius: 8px;
          font-size: 11px;
          font-weight: 800;
        }

        .blue-avatar {
          background: #e0f2fe;
          color: #0284c7;
        }

        /* BADGE */

        .badge {
          width: max-content;
          display: inline-flex !important;
          align-items: center;
          border-radius: 20px;
          padding: 4px 7px;
          margin: 0;
          font-size: 8px !important;
          font-weight: 800;
          white-space: nowrap;
        }

        .badge.blue {
          background: #e0f2fe;
          color: #0369a1;
        }

        .badge.green {
          background: #dcfce7;
          color: #15803d;
        }

        .badge.amber {
          background: #fef3c7;
          color: #b45309;
        }

        .badge.red {
          background: #fee2e2;
          color: #dc2626;
        }

        .operations-state {
          padding: 24px;
          color: #64748b;
          font-size: 11px;
          text-align: center;
        }

        .operations-state button {
          margin-left: 5px;
          border: 0;
          background: transparent;
          color: #0284c7;
          cursor: pointer;
        }

        /* INVOICE AI / ML */

        .invoice-ai-panel {
          margin-top: 18px;
          padding: 14px;
          border: 1px solid #bae6fd;
          border-radius: 10px;
          background: linear-gradient(180deg, #f8fdff 0%, #f0f9ff 100%);
          overflow: hidden;
        }

        .invoice-ai-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          padding-bottom: 11px;
          border-bottom: 1px solid #dbeafe;
        }

        .invoice-ai-header > div {
          min-width: 0;
        }

        .invoice-ai-header .auth-eyebrow {
          margin: 0 0 4px;
        }

        .invoice-ai-header h3 {
          margin: 0;
          color: #0f172a;
          font-size: 14px;
          line-height: 1.3;
          letter-spacing: -0.02em;
        }

        .invoice-ai-header > svg {
          flex: 0 0 auto;
          margin-top: 2px;
          color: #0284c7;
        }

        .invoice-ai-loading {
          display: flex;
          align-items: center;
          gap: 8px;
          min-height: 54px;
          padding: 12px 2px 2px;
          color: #64748b;
          font-size: 10px;
          line-height: 1.5;
        }

        .invoice-ai-risk-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          margin-top: 12px;
          padding: 10px 11px;
          border: 1px solid #e0f2fe;
          border-radius: 8px;
          background: #ffffff;
        }

        .invoice-ai-risk-row > span {
          min-width: 0;
          color: #64748b;
          font-size: 10px;
          line-height: 1.4;
        }

        .invoice-ai-risk-row > strong {
          flex: 0 0 auto;
          margin: 0;
          color: #334155;
          font-size: 11px;
          line-height: 1.3;
          text-align: right;
          white-space: nowrap;
        }

        .invoice-ai-content {
          display: grid;
          gap: 8px;
          margin-top: 10px;
          padding: 11px;
          border: 1px solid #dbeafe;
          border-radius: 8px;
          background: #ffffff;
        }

        .invoice-ai-priority {
          width: max-content;
          max-width: 100%;
          display: inline-flex;
          align-items: center;
          padding: 4px 7px;
          border-radius: 999px;
          background: #e0f2fe;
          color: #0369a1;
          font-size: 8px;
          font-weight: 800;
          letter-spacing: 0.06em;
          line-height: 1.2;
          text-transform: uppercase;
          overflow-wrap: anywhere;
        }

        .invoice-ai-content > strong {
          display: block;
          margin: 0;
          color: #0f172a;
          font-size: 12px;
          line-height: 1.4;
          overflow-wrap: anywhere;
        }

        .invoice-ai-content > p {
          margin: 0;
          color: #64748b;
          font-size: 10px;
          line-height: 1.55;
          overflow-wrap: anywhere;
        }

        .invoice-ai-content > div {
          display: grid;
          gap: 4px;
          margin-top: 1px;
          padding-top: 9px;
          border-top: 1px solid #f1f5f9;
        }

        .invoice-ai-content > div > small {
          color: #94a3b8;
          font-size: 8px;
          font-weight: 800;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }

        .invoice-ai-content > div > span {
          color: #475569;
          font-size: 10px;
          line-height: 1.55;
          overflow-wrap: anywhere;
        }

        /* BUTTON GROUP */

        .drawer-actions {
          display: flex;
          align-items: stretch;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 18px;
        }

        .drawer-actions .secondary-button,
        .drawer-actions .auth-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          min-height: 38px;
          white-space: nowrap;
        }

        /* DRAWER */

        .details-drawer {
          position: fixed;
          top: 0;
          right: 0;
          z-index: 1000;
          width: min(
            470px,
            94vw
          );
          height: 100vh;
          overflow-y: auto;
          padding: 28px 24px 34px;
          border-left: 1px solid #e2e8f0;
          background: #fff;
          box-shadow:
            -18px 0 48px
            rgba(
              15,
              23,
              42,
              0.10
            );
        }

        .drawer-close {
          width: 32px;
          height: 32px;
          display: grid;
          place-items: center;
          margin-left: auto;
          margin-bottom: 16px;
          border: 1px solid #dbe4ee;
          border-radius: 8px;
          background: #fff;
          color: #64748b;
          cursor: pointer;
        }

        .drawer-close:hover {
          border-color: #bae6fd;
          color: #0284c7;
        }

        .details-drawer h2 {
          margin: 0 0 7px;
          color: #0f172a;
          font-size: 24px;
          letter-spacing: -0.04em;
        }

        .details-drawer > p {
          margin: 0 0 4px;
          color: #64748b;
          font-size: 11px;
          line-height: 1.5;
          overflow-wrap: anywhere;
        }

        .detail-summary {
          display: grid;
          grid-template-columns:
            repeat(
              2,
              minmax(0, 1fr)
            );
          gap: 9px;
          margin-top: 18px;
        }

        .detail-summary > span {
          min-width: 0;
          padding: 10px;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          color: #94a3b8;
          font-size: 9px;
        }

        .detail-summary strong {
          display: block;
          margin-top: 5px;
          color: #334155;
          font-size: 11px;
          overflow-wrap: anywhere;
        }

        .drawer-section {
          margin-top: 18px;
          padding-top: 16px;
          border-top: 1px solid #e2e8f0;
        }

        .drawer-section h3 {
          margin: 0 0 9px;
          color: #0f172a;
          font-size: 12px;
        }

        .drawer-section p {
          margin: 5px 0;
          color: #64748b;
          font-size: 10px;
          line-height: 1.5;
        }

        .line-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 11px 0;
          border-bottom: 1px solid #f1f5f9;
          color: #64748b;
          font-size: 10px;
        }

        .line-item:last-child {
          border-bottom: 0;
        }

        .line-item strong {
          color: #334155;
          white-space: nowrap;
        }

        .drawer-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 18px;
        }

        .drawer-actions button {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }

        /* MODAL */

        .modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 1100;
          display: grid;
          place-items: center;
          padding: 20px;
          background:
            rgba(
              15,
              23,
              42,
              0.42
            );
        }

        .modal-card {
          position: relative;
          width: min(
            470px,
            100%
          );
          max-height: 92vh;
          overflow-y: auto;
          padding: 24px;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          background: #fff;
          box-shadow:
            0 30px 70px
            rgba(
              15,
              23,
              42,
              0.20
            );
        }

        .modal-card.wide {
          width: min(
            1040px,
            100%
          );
        }

        .modal-card h3 {
          margin: 0 0 6px;
          color: #0f172a;
          font-size: 18px;
        }

        .modal-card > p {
          margin: 0 0 17px;
          color: #64748b;
          font-size: 10px;
          line-height: 1.5;
        }

        .modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          margin-top: 16px;
        }

        .stack-form {
          display: grid;
          gap: 12px;
        }

        .stack-form label,
        .invoice-form label {
          display: grid;
          gap: 5px;
          color: #475569;
          font-size: 9px;
          font-weight: 700;
        }

        .stack-form input,
        .stack-form textarea,
        .invoice-form input,
        .invoice-form textarea,
        .invoice-form select {
          width: 100%;
          border: 1px solid #dbe4ee;
          border-radius: 7px;
          outline: 0;
          padding: 9px 10px;
          background: #fff;
          color: #334155;
          font-size: 10px;
        }

        .stack-form input:focus,
        .stack-form textarea:focus,
        .invoice-form input:focus,
        .invoice-form textarea:focus,
        .invoice-form select:focus {
          border-color: #7dd3fc;
          box-shadow:
            0 0 0 3px
            rgba(
              14,
              165,
              233,
              0.08
            );
        }

        /* INVOICE FORM */

        .invoice-create-backdrop {
          align-items: center;
        }

        .invoice-form-modal {
          padding: 26px;
        }

        .invoice-form {
          display: grid;
          gap: 16px;
        }

        .invoice-form-grid {
          display: grid;
          grid-template-columns:
            repeat(
              2,
              minmax(0, 1fr)
            );
          gap: 13px;
        }

        .form-section {
          min-width: 0;
          padding: 14px;
          border: 1px solid #e2e8f0;
          border-radius: 9px;
          background: #fcfdff;
        }

        .form-section-title {
          margin-bottom: 12px;
          color: #0f172a;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }

        .field-row {
          display: grid;
          grid-template-columns:
            1fr 1fr;
          gap: 9px;
        }

        .invoice-meta-grid {
          display: grid;
          grid-template-columns:
            repeat(
              4,
              minmax(0, 1fr)
            );
          gap: 10px;
        }

        .items-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }

        .items-head .form-section-title {
          margin-bottom: 0;
        }

        .compact-btn {
          padding: 7px 9px !important;
          font-size: 9px !important;
        }

        .invoice-items {
          margin-top: 10px;
          overflow-x: auto;
        }

        .invoice-item-header,
        .invoice-item-row {
          display: grid;
          grid-template-columns:
            minmax(200px, 2fr)
            80px
            110px
            125px
            32px;
          align-items: center;
          gap: 8px;
          min-width: 610px;
        }

        .invoice-item-header {
          padding: 8px 0;
          border-bottom: 1px solid #dbe4ee;
          color: #94a3b8;
          font-size: 8px;
          font-weight: 800;
          text-transform: uppercase;
        }

        .invoice-item-row {
          padding: 8px 0;
          border-bottom: 1px solid #f1f5f9;
        }

        .invoice-item-row input {
          min-width: 0;
          padding: 8px 9px;
        }

        .invoice-item-row strong {
          color: #334155;
          font-size: 10px;
          text-align: right;
        }

        .mini-icon-btn {
          width: 28px;
          height: 28px;
          display: grid;
          place-items: center;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          background: #fff;
          color: #dc2626;
          cursor: pointer;
        }

        .invoice-form-footer-grid {
          display: grid;
          grid-template-columns:
            minmax(0, 1fr)
            320px;
          gap: 13px;
        }

        .invoice-live-total {
          padding: 14px;
          border: 1px solid #bae6fd;
          border-radius: 9px;
          background: #f8fdff;
        }

        .invoice-live-total > div {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 6px 0;
          color: #64748b;
          font-size: 10px;
        }

        .invoice-live-total > div strong {
          color: #334155;
          font-size: 11px;
        }

        .invoice-live-total .grand-total-row {
          margin-top: 5px;
          padding-top: 11px;
          border-top: 1px solid #bae6fd;
          color: #0f172a;
          font-size: 12px;
          font-weight: 800;
        }

        .invoice-live-total .grand-total-row strong {
          color: #0284c7;
          font-size: 16px;
        }

        .amount-word-preview {
          margin: 10px 0 0;
          color: #64748b;
          font-size: 8px;
          line-height: 1.5;
        }

        .invoice-modal-actions {
          border-top: 1px solid #e2e8f0;
          padding-top: 4px;
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

          .invoice-meta-grid {
            grid-template-columns:
              repeat(
                2,
                minmax(0, 1fr)
              );
          }
        }

        @media (max-width: 1050px) {
          .operations-toolbar {
            flex-wrap: wrap;
          }

          .search-control {
            flex: 1 1 100%;
          }

          .invoice-form-grid,
          .invoice-form-footer-grid {
            grid-template-columns:
              1fr;
          }

          .responsive-record-grid {
            overflow-x: auto;
          }

          .record-card,
          .invoice-record-card {
            min-width: 780px;
          }
        }

        @media (max-width: 800px) {
          .invoice-ai-risk-row {
            align-items: flex-start;
            flex-direction: column;
          }

          .invoice-ai-risk-row > strong {
            text-align: left;
          }

          .invoice-module-page {
            padding:
              28px 20px 48px;
          }

          .dashboard-heading {
            align-items: flex-start;
            flex-direction: column;
          }

          .dashboard-heading
            > button {
            width: 100%;
          }

          .dashboard-kpis {
            grid-template-columns:
              repeat(
                2,
                minmax(0, 1fr)
              );
          }

          .invoice-form-grid {
            grid-template-columns:
              1fr;
          }

          .field-row {
            grid-template-columns:
              1fr;
          }
        }

        @media (max-width: 650px) {
          .invoice-module-page {
            padding:
              22px 16px 40px;
          }

          .dashboard-heading h2 {
            font-size: 30px;
          }

          .dashboard-kpis {
            grid-template-columns:
              1fr 1fr;
          }

          .operations-table-card {
            padding: 16px;
          }

          .operations-toolbar {
            padding: 10px;
          }

          .filter-tabs {
            width: 100%;
          }

          .invoice-meta-grid {
            grid-template-columns:
              1fr;
          }

          .details-drawer {
            width: 100%;
            border-left: 0;
          }

          .detail-summary {
            grid-template-columns:
              1fr;
          }

          .modal-backdrop {
            padding: 10px;
          }

          .modal-card,
          .modal-card.wide {
            width: 100%;
            max-height: 94vh;
            padding: 17px;
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
        }

      `}</style>
    </>
  )
}

/* ==========================================================================
   INVOICE DETAILS
   ========================================================================== */

function InvoiceDetails({
  invoice,
  onPaid,
  onDownload,
  onPrint,
  aiLoading,
  aiInsight,
  paymentRisk,
}: {
  invoice: Invoice
  onPaid: () => void
  onDownload: () => void
  onPrint: () => void
  aiLoading: boolean
  aiInsight: InvoiceAiInsight | null
  paymentRisk: PaymentDelayRisk | null
}) {
  return (
    <>
      <p className="auth-eyebrow">
        INVOICE DETAILS
      </p>

      <h2>
        {invoice.id}
      </h2>

      <p>
        {invoice.description}
      </p>

      <div className="detail-summary">

        <span>
          Customer

          <strong>
            {invoice.customer}
          </strong>
          {invoice.customerId ? (
            <small className="detail-muted">{invoice.customerId}</small>
          ) : null}
        </span>

        <span>
          Status

          <strong>
            <Badge
              tone={
                invoice.status ===
                'Overdue'
                  ? 'red'
                  : invoice.status ===
                      'Paid'
                    ? 'green'
                    : invoice.status ===
                        'Draft'
                      ? 'amber'
                      : 'blue'
              }
            >
              {invoice.status}
            </Badge>
          </strong>
        </span>

        <span>
          Invoice date

          <strong>
            {invoice.issue}
          </strong>
        </span>

        <span>
          Due date

          <strong>
            {invoice.due}
          </strong>
        </span>

        <span>
          Total

          <strong>
            {money(
              invoice.amount,
            )}
          </strong>
        </span>

        <span>
          Outstanding

          <strong>
            {money(
              invoice.outstanding,
            )}
          </strong>
        </span>

      </div>

      <div className="drawer-section">

        <h3>
          Invoice summary
        </h3>

        <p>
          Reference:{' '}
          {invoice.reference ||
            '—'}
        </p>

        <p>
          Notes:{' '}
          {invoice.notes ||
            'No notes'}
        </p>

        <div className="line-item">
          <span>
            Taxable amount
          </span>

          <strong>
            {money(
              invoice.taxableAmount ||
                invoice.amount,
            )}
          </strong>
        </div>

        <div className="line-item">
          <span>
            GST
          </span>

          <strong>
            {money(
              (
                invoice.cgst ||
                0
              ) +
                (
                  invoice.sgst ||
                  0
                ) +
                (
                  invoice.igst ||
                  0
                ),
            )}
          </strong>
        </div>

        <div className="line-item">
          <span>
            Grand total
          </span>

          <strong>
            {money(
              invoice.amount,
            )}
          </strong>
        </div>

      </div>

      <section className="invoice-ai-panel">
        <div className="invoice-ai-header">
          <div>
            <p className="auth-eyebrow">CASHGUARD AI</p>
            <h3>Invoice intelligence</h3>
          </div>
          <Sparkles size={17} />
        </div>

        {aiLoading ? (
          <div className="invoice-ai-loading">
            <Sparkles size={15} className="animate-spin" />
            Analysing payment behaviour and invoice risk...
          </div>
        ) : (
          <>
            {paymentRisk && (
              <div className="invoice-ai-risk-row">
                <span>Payment-delay risk</span>
                <strong
                  className={
                    paymentRisk.riskLevel.toLowerCase().includes('high')
                      ? 'danger-text'
                      : paymentRisk.riskLevel.toLowerCase().includes('medium')
                        ? 'warning-text'
                        : 'positive-text'
                  }
                >
                  {paymentRisk.riskLevel}
                  {paymentRisk.probability !== null
                    ? ` · ${paymentRisk.probability.toFixed(1)}%`
                    : ''}
                </strong>
              </div>
            )}

            {aiInsight && (
              <div className="invoice-ai-content">
                <span className="invoice-ai-priority">
                  {aiInsight.priority} · {aiInsight.source === 'ai' ? 'AI' : 'Monitor'}
                </span>
                <strong>{aiInsight.title}</strong>
                <p>{aiInsight.summary}</p>
                <div>
                  <small>Recommendation</small>
                  <span>{aiInsight.recommendation}</span>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      <div className="drawer-actions">

        <button
          type="button"
          className="secondary-button"
          onClick={
            onDownload
          }
        >
          <Download
            size={14}
          />

          Download Invoice
        </button>

        <button
          type="button"
          className="secondary-button"
          onClick={
            onPrint
          }
        >
          <Printer
            size={14}
          />

          Print Invoice
        </button>

        {invoice.status !==
          'Paid' && (
          <button
            type="button"
            className="auth-button compact"
            onClick={
              onPaid
            }
          >
            <CheckCircle2
              size={14}
            />

            Mark as paid
          </button>
        )}

      </div>
    </>
  )
}

/* ==========================================================================
   CUSTOMER / VENDOR DETAILS
   ========================================================================== */

function RecordDetails({
  record,
  module,
  onDeactivate,
}: {
  record: RecordItem
  module: Module
  onDeactivate: () => void
}) {
  return (
    <>
      <p className="auth-eyebrow">
        {module ===
        'customers'
          ? 'CUSTOMER DETAILS'
          : 'VENDOR DETAILS'}
      </p>

      <h2>
        {record.name}
      </h2>

      <p>
        {record.id} ·{' '}
        {record.status}{' '}
        relationship
      </p>

      <div className="detail-summary">

        <span>
          Email

          <strong>
            {record.email}
          </strong>
        </span>

        <span>
          Phone

          <strong>
            {record.phone}
          </strong>
        </span>

        <span>
          Address

          <strong>
            {record.address}
          </strong>
        </span>

        <span>
          GSTIN

          <strong>
            {record.gstin}
          </strong>
        </span>

        <span>
          Outstanding

          <strong>
            {money(
              record.outstanding,
            )}
          </strong>
        </span>

        <span>
          Overdue

          <strong>
            {money(
              record.overdue,
            )}
          </strong>
        </span>

      </div>

      <div className="drawer-section">

        <h3>
          {module ===
          'customers'
            ? 'Recent invoices and payments'
            : 'Recent purchases and payments'}
        </h3>

        <div className="line-item">

          <span>
            {module ===
            'customers'
              ? 'INV-2026-00482 · Office equipment supply'
              : 'PUR-2026-00118 · Electrical inventory'}
          </span>

          <strong>
            {money(
              record.outstanding,
            )}
          </strong>

        </div>

        <div className="line-item">

          <span>
            Last payment · 12 Aug 2026
          </span>

          <strong>
            ₹85,000
          </strong>

        </div>

      </div>

      <div className="drawer-actions">

        <button
          type="button"
          className="secondary-button"
        >
          <Edit3
            size={14}
          />

          Edit
        </button>

        <button
          type="button"
          className="secondary-button"
          onClick={
            onDeactivate
          }
        >
          <Trash2
            size={14}
          />

          Deactivate
        </button>

        <button
          type="button"
          className="auth-button compact"
        >
          <Mail
            size={14}
          />

          Contact
        </button>

      </div>
    </>
  )
}

/* ==========================================================================
   HTML ESCAPE
   ========================================================================== */

function escapeHtml(
  value: string,
): string {
  return value
    .replace(
      /&/g,
      '&amp;',
    )
    .replace(
      /</g,
      '&lt;',
    )
    .replace(
      />/g,
      '&gt;',
    )
    .replace(
      /"/g,
      '&quot;',
    )
    .replace(
      /'/g,
      '&#039;',
    )
}

/* ==========================================================================
   EXPORTS
   ========================================================================== */

export {
  invoicesSeed,
  customersSeed,
  vendorsSeed,
}
