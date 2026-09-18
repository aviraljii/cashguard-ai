'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'

import {
  ArrowLeft,
  Download,
  FileText,
  Filter,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Share2,
  X,
} from 'lucide-react'

type ReceiptStatus =
  | 'Received'
  | 'Needs review'

type Receipt = {
  id: string
  paymentId: string
  customer: string
  invoice: string
  date: string
  amount: number
  method: string
  status: ReceiptStatus
  reference: string
  invoiceAmount?: number
  remainingBalance?: number
  currency?: string
}

type ApiRecord = Record<string, unknown>

type ShareNavigator = Navigator & {
  share?: (
    data: ShareData,
  ) => Promise<void>
}

// ============================================================
// CONFIG
// ============================================================

const DEFAULT_API_URL =
  'http://127.0.0.1:8000'

const money = (
  value: number,
): string =>
  `INR ${Number(
    value || 0,
  ).toLocaleString(
    'en-IN',
    {
      maximumFractionDigits: 2,
    },
  )}`

// ============================================================
// AMOUNT IN WORDS
// ============================================================

const amountInWords = (
  amount: number,
): string => {
  const value =
    Number(amount || 0)

  if (!Number.isFinite(value)) {
    return 'Zero Rupees only'
  }

  const integerPart =
    Math.floor(value)

  const decimalPart =
    Math.round(
      (value - integerPart) * 100,
    )

  const ones = [
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

  const twoDigits = (
    num: number,
  ): string => {
    if (num < 20) {
      return ones[num]
    }

    const ten =
      Math.floor(num / 10)

    const unit =
      num % 10

    return `${tens[ten]}${
      unit ? ` ${ones[unit]}` : ''
    }`
  }

  const threeDigits = (
    num: number,
  ): string => {
    if (num < 100) {
      return twoDigits(num)
    }

    const hundred =
      Math.floor(num / 100)

    const remainder =
      num % 100

    return `${ones[hundred]} Hundred${
      remainder
        ? ` ${twoDigits(remainder)}`
        : ''
    }`
  }

  const indianNumber = (
    num: number,
  ): string => {
    if (num === 0) {
      return 'Zero'
    }

    const crore =
      Math.floor(
        num / 10000000,
      )

    const lakh =
      Math.floor(
        (num % 10000000) / 100000,
      )

    const thousand =
      Math.floor(
        (num % 100000) / 1000,
      )

    const remainder =
      num % 1000

    const parts: string[] = []

    if (crore) {
      parts.push(
        `${indianNumber(crore)} Crore`,
      )
    }

    if (lakh) {
      parts.push(
        `${twoDigits(lakh)} Lakh`,
      )
    }

    if (thousand) {
      parts.push(
        `${twoDigits(thousand)} Thousand`,
      )
    }

    if (remainder) {
      parts.push(
        threeDigits(remainder),
      )
    }

    return parts.join(' ')
  }

  const rupees =
    indianNumber(integerPart)

  if (decimalPart > 0) {
    return `${rupees} Rupees and ${twoDigits(
      decimalPart,
    )} Paise only`
  }

  return `${rupees} Rupees only`
}

// ============================================================
// DATE
// ============================================================

const formatDate = (
  value: unknown,
): string => {
  if (!value) {
    return '-'
  }

  const date =
    new Date(String(value))

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return String(value)
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

// ============================================================
// API HELPERS
// ============================================================

const getApiBase = (): string => {
  const base =
    process.env
      .NEXT_PUBLIC_API_URL ||
    process.env
      .NEXT_PUBLIC_API_BASE_URL ||
    DEFAULT_API_URL

  return base.replace(
    /\/+$/,
    '',
  )
}

const getBusinessId = (): string => {
  if (
    typeof window !==
    'undefined'
  ) {
    const storageKeys = [
      'business_id',
      'businessId',
      'cashguard_business_id',
    ]

    for (
      const key of storageKeys
    ) {
      const value =
        window.localStorage.getItem(
          key,
        )

      if (value?.trim()) {
        return value.trim()
      }
    }

    for (
      const key of storageKeys
    ) {
      const value =
        window.sessionStorage.getItem(
          key,
        )

      if (value?.trim()) {
        return value.trim()
      }
    }
  }

  return (
    process.env
      .NEXT_PUBLIC_BUSINESS_ID ||
    ''
  ).trim()
}

const getAuthToken = (): string => {
  if (
    typeof window ===
    'undefined'
  ) {
    return ''
  }

  const tokenKeys = [
    'access_token',
    'accessToken',
    'token',
    'auth_token',
    'jwt_token',
    'jwt',
    'cashguard_access_token',
    'cashguard_token',
  ]

  const storages = [
    window.localStorage,
    window.sessionStorage,
  ]

  for (
    const storage of storages
  ) {
    for (
      const key of tokenKeys
    ) {
      const token =
        storage.getItem(key)

      if (token?.trim()) {
        return token
          .trim()
          .replace(
            /^Bearer\s+/i,
            '',
          )
      }
    }
  }

  return ''
}

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
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

  if (token) {
    headers.set(
      'Authorization',
      `Bearer ${token}`,
    )
  }

  const response =
    await fetch(
      `${getApiBase()}${path}`,
      {
        ...options,
        headers,
        credentials: 'include',
        cache: 'no-store',
      },
    )

  const raw =
    await response.text()

  let data: unknown =
    null

  if (raw.trim()) {
    try {
      data =
        JSON.parse(raw)
    } catch {
      data = raw
    }
  }

  if (!response.ok) {
    let message =
      `Request failed with status ${response.status}`

    if (
      typeof data ===
        'object' &&
      data !== null
    ) {
      const object =
        data as ApiRecord

      const detail =
        object.detail ??
        object.message ??
        object.error

      if (
        Array.isArray(detail)
      ) {
        message =
          detail
            .map(
              (item) => {
                if (
                  item &&
                  typeof item ===
                    'object'
                ) {
                  const record =
                    item as ApiRecord

                  return String(
                    record.msg ??
                      record.message ??
                      item,
                  )
                }

                return String(item)
              },
            )
            .join(', ')
      } else if (
        detail !==
          undefined &&
        detail !== null &&
        String(detail).trim()
      ) {
        message =
          String(detail)
      }
    } else if (
      typeof data === 'string' &&
      data.trim()
    ) {
      message =
        data.trim()
    }

    throw new Error(
      message,
    )
  }

  return data as T
}

// ============================================================
// API RESPONSE NORMALIZATION
// ============================================================

const getArrayFromApiResponse = (
  data: unknown,
): ApiRecord[] => {
  if (
    Array.isArray(data)
  ) {
    return data.filter(
      (
        item,
      ): item is ApiRecord =>
        typeof item ===
          'object' &&
        item !== null &&
        !Array.isArray(item),
    )
  }

  if (
    typeof data ===
      'object' &&
    data !== null
  ) {
    const object =
      data as ApiRecord

    const possibleKeys = [
      'items',
      'data',
      'payments',
      'results',
      'records',
      'transactions',
    ]

    for (
      const key of possibleKeys
    ) {
      const value =
        object[key]

      if (
        Array.isArray(value)
      ) {
        return value.filter(
          (
            item,
          ): item is ApiRecord =>
            typeof item ===
              'object' &&
            item !== null &&
            !Array.isArray(item),
        )
      }
    }
  }

  return []
}

const readString = (
  record: ApiRecord,
  keys: string[],
  fallback = '',
): string => {
  for (
    const key of keys
  ) {
    const value =
      record[key]

    if (
      value !==
        undefined &&
      value !== null &&
      String(value).trim() !==
        ''
    ) {
      return String(value)
    }
  }

  return fallback
}

const readNumber = (
  record: ApiRecord,
  keys: string[],
  fallback = 0,
): number => {
  for (
    const key of keys
  ) {
    const value =
      record[key]

    if (
      value !==
        undefined &&
      value !== null &&
      value !== ''
    ) {
      const number =
        Number(value)

      if (
        Number.isFinite(number)
      ) {
        return number
      }
    }
  }

  return fallback
}

// ============================================================
// VALUE NORMALIZATION
// ============================================================

const normalizeMethod = (
  value: string,
): string => {
  const method =
    value
      .trim()
      .toLowerCase()

  if (!method) {
    return 'Bank Transfer'
  }

  if (
    method.includes('upi')
  ) {
    return 'UPI'
  }

  if (
    method.includes('neft')
  ) {
    return 'NEFT'
  }

  if (
    method.includes('rtgs')
  ) {
    return 'RTGS'
  }

  if (
    method.includes('imps')
  ) {
    return 'IMPS'
  }

  if (
    method.includes('cash')
  ) {
    return 'Cash'
  }

  if (
    method.includes('card')
  ) {
    return 'Card'
  }

  if (
    method.includes(
      'cheque',
    ) ||
    method.includes(
      'check',
    )
  ) {
    return 'Cheque'
  }

  if (
    method.includes('bank')
  ) {
    return 'Bank Transfer'
  }

  return value
}

const normalizeStatus = (
  value: string,
): ReceiptStatus => {
  const status =
    value
      .trim()
      .toLowerCase()

  if (
    status.includes(
      'review',
    ) ||
    status.includes(
      'pending',
    ) ||
    status.includes(
      'failed',
    ) ||
    status.includes(
      'unknown',
    )
  ) {
    return 'Needs review'
  }

  return 'Received'
}

const normalizeReceipt = (
  record: ApiRecord,
  index: number,
): Receipt => {
  const paymentId =
    readString(
      record,
      [
        'payment_id',
        'paymentId',
        'id',
        'transaction_id',
        'transactionId',
        'reference_id',
      ],
      `PAY-${index + 1}`,
    )

  const reference =
    readString(
      record,
      [
        'reference',
        'reference_id',
        'referenceId',
        'transaction_reference',
        'transactionReference',
        'utr',
        'upi_reference',
      ],
      paymentId,
    )

  const customer =
    readString(
      record,
      [
        'customer_name',
        'customerName',
        'customer',
        'party_name',
        'partyName',
        'client_name',
        'clientName',
        'beneficiary_name',
        'beneficiaryName',
        'counterparty_name',
        'counterpartyName',
      ],
      'Customer',
    )

  const invoice =
    readString(
      record,
      [
        'invoice_number',
        'invoiceNumber',
        'invoice_no',
        'invoiceNo',
        'invoice_id',
        'invoiceId',
      ],
      '-',
    )

  const amount =
    readNumber(
      record,
      [
        'amount',
        'paid_amount',
        'paidAmount',
        'payment_amount',
        'paymentAmount',
        'received_amount',
        'receivedAmount',
        'transaction_amount',
        'transactionAmount',
        'credit',
      ],
    )

  const invoiceAmount =
    readNumber(
      record,
      [
        'invoice_amount',
        'invoiceAmount',
        'total_invoice_amount',
        'totalInvoiceAmount',
        'total_amount',
        'totalAmount',
      ],
      amount,
    )

  const remainingBalance =
    readNumber(
      record,
      [
        'remaining_balance',
        'remainingBalance',
        'balance_due',
        'balanceDue',
        'outstanding_amount',
        'outstandingAmount',
      ],
      Math.max(
        invoiceAmount -
          amount,
        0,
      ),
    )

  const date =
    readString(
      record,
      [
        'payment_date',
        'paymentDate',
        'date',
        'transaction_date',
        'transactionDate',
        'created_at',
        'createdAt',
        'paid_at',
        'paidAt',
      ],
      new Date().toISOString(),
    )

  const method =
    normalizeMethod(
      readString(
        record,
        [
          'payment_method',
          'paymentMethod',
          'method',
          'mode',
          'payment_mode',
          'paymentMode',
          'type',
        ],
        'Bank Transfer',
      ),
    )

  const status =
    normalizeStatus(
      readString(
        record,
        [
          'status',
          'payment_status',
          'paymentStatus',
          'transaction_status',
          'transactionStatus',
        ],
        'received',
      ),
    )

  const receiptId =
    readString(
      record,
      [
        'receipt_number',
        'receiptNumber',
        'receipt_id',
        'receiptId',
      ],
    ) ||
    `RCT-${new Date(
      date,
    ).getFullYear()}-${String(
      10000 + index,
    ).slice(-5)}`

  return {
    id: receiptId,
    paymentId,
    customer,
    invoice,
    date,
    amount,
    method,
    status,
    reference,
    invoiceAmount,
    remainingBalance,
    currency:
      readString(
        record,
        ['currency'],
        'INR',
      ),
  }
}

// ============================================================
// PAYMENT ENDPOINTS
// ============================================================

const buildPaymentEndpoints = (
  businessId: string,
): string[] => {
  const encoded =
    encodeURIComponent(
      businessId,
    )

  return [
    `/api/payments?business_id=${encoded}`,
    `/api/payment?business_id=${encoded}`,
    `/api/payment/payments?business_id=${encoded}`,
  ]
}

async function fetchPayments(): Promise<
  Receipt[]
> {
  const businessId =
    getBusinessId()

  if (!businessId) {
    throw new Error(
      'Business ID is not configured.',
    )
  }

  const endpoints =
    buildPaymentEndpoints(
      businessId,
    )

  let lastError:
    | Error
    | null = null

  for (
    const endpoint of endpoints
  ) {
    try {
      const data =
        await apiFetch<unknown>(
          endpoint,
          {
            method: 'GET',
          },
        )

      const records =
        getArrayFromApiResponse(
          data,
        )

      return records
        .map(
          normalizeReceipt,
        )
        .filter(
          (receipt) =>
            Number.isFinite(
              receipt.amount,
            ) &&
            receipt.amount >= 0,
        )
    } catch (error) {
      lastError =
        error instanceof Error
          ? error
          : new Error(
              'Unable to load payments.',
            )
    }
  }

  throw (
    lastError ||
    new Error(
      'Unable to load payment data.',
    )
  )
}

// ============================================================
// MAIN PAGE
// ============================================================

export default function PaymentReceiptsPage() {
  const [
    query,
    setQuery,
  ] = useState('')

  const [
    selected,
    setSelected,
  ] =
    useState<Receipt | null>(
      null,
    )

  const [
    receipts,
    setReceipts,
  ] = useState<Receipt[]>([])

  const [
    notice,
    setNotice,
  ] = useState('')

  const [
    loading,
    setLoading,
  ] = useState(true)

  const [
    error,
    setError,
  ] = useState('')

  const [
    refreshing,
    setRefreshing,
  ] = useState(false)

  const loadReceipts =
    useCallback(
      async () => {
        try {
          setError('')
          setRefreshing(true)

          const liveReceipts =
            await fetchPayments()

          setReceipts(
            liveReceipts,
          )

          if (
            liveReceipts.length ===
            0
          ) {
            setNotice(
              'No live payments were found for this business.',
            )
          } else {
            setNotice('')
          }
        } catch (err) {
          setError(
            err instanceof Error
              ? err.message
              : 'Unable to load payment receipts.',
          )

          setReceipts([])
        } finally {
          setLoading(false)
          setRefreshing(false)
        }
      },
      [],
    )

  useEffect(() => {
    void loadReceipts()
  }, [loadReceipts])

  const filtered =
    useMemo(() => {
      const normalizedQuery =
        query
          .trim()
          .toLowerCase()

      if (
        !normalizedQuery
      ) {
        return receipts
      }

      return receipts.filter(
        (receipt) =>
          [
            receipt.id,
            receipt.paymentId,
            receipt.customer,
            receipt.invoice,
            receipt.method,
            receipt.reference,
          ]
            .join(' ')
            .toLowerCase()
            .includes(
              normalizedQuery,
            ),
      )
    }, [query, receipts])

  const totalReceived =
    useMemo(
      () =>
        receipts.reduce(
          (
            sum,
            receipt,
          ) =>
            sum +
            Number(
              receipt.amount || 0,
            ),
          0,
        ),
      [receipts],
    )

  const needsReview =
    useMemo(
      () =>
        receipts.filter(
          (receipt) =>
            receipt.status ===
            'Needs review',
        ).length,
      [receipts],
    )

  const todayReceipts =
    useMemo(() => {
      const today =
        new Date()

      return receipts.filter(
        (receipt) => {
          const date =
            new Date(
              receipt.date,
            )

          return (
            date.getFullYear() ===
              today.getFullYear() &&
            date.getMonth() ===
              today.getMonth() &&
            date.getDate() ===
              today.getDate()
          )
        },
      )
    }, [receipts])

  if (selected) {
    return (
      <ReceiptDocument
        receipt={selected}
        onBack={() =>
          setSelected(null)
        }
        onNotice={setNotice}
      />
    )
  }

  return (
    <main className="receipts-workspace">
      <div className="receipts-heading">
        <div>
          <p className="auth-eyebrow">
            CASHGUARD-AI · RECEIPT OPERATIONS
          </p>

          <h1>
            Payment Receipts
          </h1>

          <p>
            Create, view, search and
            manage live payment
            receipts.
          </p>
        </div>

        <div
          style={{
            display: 'flex',
            gap: 10,
            flexWrap: 'wrap',
          }}
        >
          <button
            type="button"
            className="receipt-button secondary-button"
            onClick={() =>
              downloadCsv(receipts)
            }
            disabled={
              !receipts.length
            }
          >
            <Download size={14} />
            Export CSV
          </button>

          <button
            type="button"
            className="receipt-button secondary-button"
            onClick={() =>
              void loadReceipts()
            }
            disabled={refreshing}
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

          <button
            type="button"
            className="receipt-button primary-button"
            onClick={() =>
              setNotice(
                'Create the payment from the Payment module first. This receipt workspace automatically reads live payment records.',
              )
            }
          >
            <Plus size={14} />
            Create receipt
          </button>
        </div>
      </div>

      {notice && (
        <div className="receipt-notice">
          <span>
            {notice}
          </span>

          <button
            type="button"
            onClick={() =>
              setNotice('')
            }
            aria-label="Dismiss"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {error && (
        <div
          className="receipt-notice"
          style={{
            borderColor:
              '#ef4444',
          }}
        >
          <span>
            {error}
          </span>

          <button
            type="button"
            onClick={() =>
              setError('')
            }
            aria-label="Dismiss error"
          >
            <X size={14} />
          </button>
        </div>
      )}

      <div className="receipt-kpis">
        {[
          [
            'Total Receipts',
            String(
              receipts.length,
            ),
            'Live payment records',
          ],
          [
            "Today's Receipts",
            String(
              todayReceipts.length,
            ),
            'Current date',
          ],
          [
            'Total Received',
            money(
              totalReceived,
            ),
            'Across live payments',
          ],
          [
            'Needs Review',
            String(
              needsReview,
            ),
            'Requires attention',
          ],
        ].map(
          ([
            title,
            value,
            subtitle,
          ], index) => (
            <section
              className="receipt-kpi"
              key={title}
            >
              <span>
                {title}
              </span>

              <strong
                className={
                  index === 3
                    ? 'warn'
                    : undefined
                }
              >
                {loading
                  ? '...'
                  : value}
              </strong>

              <small>
                {subtitle}
              </small>
            </section>
          ),
        )}
      </div>

      <section className="receipt-toolbar">
        <div className="receipt-search">
          <Search size={16} />

          <input
            type="search"
            aria-label="Search receipts"
            placeholder="Search receipts, customers or invoice numbers"
            value={query}
            onChange={(event) =>
              setQuery(
                event.target.value,
              )
            }
          />
        </div>

        <button
          type="button"
          className="secondary-button"
          onClick={() =>
            setNotice(
              'Use the search box to filter live receipt records.',
            )
          }
        >
          <Filter size={14} />
          Filter
        </button>

        <button
          type="button"
          className="secondary-button"
          onClick={() =>
            setQuery('')
          }
        >
          Date range
        </button>
      </section>

      <section className="receipt-list">
        <div className="receipt-list-head">
          <div>
            <p className="auth-eyebrow">
              RECEIPT REGISTER
            </p>

            <h2>
              Received payments
            </h2>

            <span>
              {filtered.length}{' '}
              receipts in this
              workspace
            </span>
          </div>

          <button
            type="button"
            className="secondary-button"
            onClick={() =>
              downloadCsv(filtered)
            }
            disabled={
              !filtered.length
            }
          >
            <Download size={14} />
            Download CSV
          </button>
        </div>

        {loading ? (
          <div className="receipt-empty">
            <RefreshCw
              size={22}
              className="animate-spin"
            />

            <strong>
              Loading live payments
            </strong>

            <p>
              Fetching payment records
              from CashGuard-AI
              backend.
            </p>
          </div>
        ) : filtered.length ? (
          filtered.map(
            (receipt) => (
              <button
                type="button"
                className="receipt-row"
                key={`${receipt.id}-${receipt.paymentId}`}
                onClick={() =>
                  setSelected(
                    receipt,
                  )
                }
              >
                <span className="receipt-icon">
                  <FileText
                    size={17}
                  />
                </span>

                <span>
                  <strong>
                    {receipt.id}
                  </strong>

                  <small>
                    {receipt.customer}
                    {' · '}
                    {receipt.invoice}
                  </small>
                </span>

                <span>
                  {formatDate(
                    receipt.date,
                  )}
                </span>

                <span className="money receipt-amount">
                  {money(
                    receipt.amount,
                  )}
                </span>

                <span>
                  {receipt.method}
                </span>

                <b
                  className={
                    receipt.status ===
                    'Received'
                      ? 'received'
                      : 'review'
                  }
                >
                  {receipt.status}
                </b>

                <span className="receipt-arrow">
                  View
                </span>
              </button>
            ),
          )
        ) : (
          <div className="receipt-empty">
            <FileText size={22} />

            <strong>
              No receipts found
            </strong>

            <p>
              Try another search or
              create a live payment
              first.
            </p>
          </div>
        )}
      </section>

      <p className="receipt-footer">
        Receipt data is loaded from
        the CashGuard-AI payment
        backend.
      </p>
    </main>
  )
}

// ============================================================
// RECEIPT DOCUMENT
// ============================================================

function ReceiptDocument({
  receipt,
  onBack,
  onNotice,
}: {
  receipt: Receipt
  onBack: () => void
  onNotice: (
    message: string,
  ) => void
}) {
  const [
    downloading,
    setDownloading,
  ] = useState(false)

  const businessName =
    process.env
      .NEXT_PUBLIC_BUSINESS_NAME ||
    'CashGuard-AI Business'

  const businessAddress =
    process.env
      .NEXT_PUBLIC_BUSINESS_ADDRESS ||
    'India'

  const businessPhone =
    process.env
      .NEXT_PUBLIC_BUSINESS_PHONE ||
    ''

  const businessEmail =
    process.env
      .NEXT_PUBLIC_BUSINESS_EMAIL ||
    ''

  const businessGstin =
    process.env
      .NEXT_PUBLIC_BUSINESS_GSTIN ||
    ''

  const downloadPdf =
    async () => {
      if (downloading) {
        return
      }

      try {
        setDownloading(true)

        const {
          default: JsPDF,
        } = await import(
          'jspdf'
        )

        const doc =
          new JsPDF({
            orientation:
              'portrait',
            unit: 'mm',
            format: 'a4',
          })

        const pageWidth =
          doc.internal.pageSize.getWidth()

        const pageHeight =
          doc.internal.pageSize.getHeight()

        const left = 18
        const right =
          pageWidth - 18

        let y = 20

        // ------------------------------------------------------
        // BUSINESS HEADER
        // ------------------------------------------------------

        doc.setFont(
          'helvetica',
          'bold',
        )

        doc.setFontSize(18)

        doc.text(
          businessName,
          left,
          y,
        )

        doc.setFont(
          'helvetica',
          'normal',
        )

        doc.setFontSize(9)

        y += 6

        doc.text(
          businessAddress,
          left,
          y,
        )

        if (businessPhone) {
          y += 4

          doc.text(
            businessPhone,
            left,
            y,
          )
        }

        if (businessEmail) {
          y += 4

          doc.text(
            businessEmail,
            left,
            y,
          )
        }

        if (businessGstin) {
          y += 4

          doc.text(
            `GSTIN: ${businessGstin}`,
            left,
            y,
          )
        }

        // ------------------------------------------------------
        // RECEIPT TITLE
        // ------------------------------------------------------

        doc.setFont(
          'helvetica',
          'bold',
        )

        doc.setFontSize(17)

        doc.text(
          'PAYMENT RECEIPT',
          right,
          24,
          {
            align: 'right',
          },
        )

        doc.setFont(
          'helvetica',
          'normal',
        )

        doc.setFontSize(9)

        doc.text(
          receipt.id,
          right,
          30,
          {
            align: 'right',
          },
        )

        doc.text(
          `Issued: ${formatDate(
            receipt.date,
          )}`,
          right,
          35,
          {
            align: 'right',
          },
        )

        // ------------------------------------------------------
        // DIVIDER
        // ------------------------------------------------------

        y = Math.max(
          y + 14,
          48,
        )

        doc.setDrawColor(
          180,
          180,
          180,
        )

        doc.line(
          left,
          y,
          right,
          y,
        )

        y += 11

        // ------------------------------------------------------
        // CUSTOMER + PAYMENT INFORMATION
        // ------------------------------------------------------

        doc.setFont(
          'helvetica',
          'bold',
        )

        doc.setFontSize(9)

        doc.text(
          'CUSTOMER',
          left,
          y,
        )

        doc.text(
          'PAYMENT INFORMATION',
          110,
          y,
        )

        y += 6

        doc.setFont(
          'helvetica',
          'normal',
        )

        doc.setFontSize(10)

        doc.text(
          receipt.customer,
          left,
          y,
        )

        doc.text(
          `Payment ID: ${receipt.paymentId}`,
          110,
          y,
        )

        y += 5

        doc.setFontSize(9)

        doc.text(
          `Invoice: ${receipt.invoice}`,
          left,
          y,
        )

        doc.text(
          `Reference: ${receipt.reference}`,
          110,
          y,
        )

        y += 5

        doc.text(
          `Payment date: ${formatDate(
            receipt.date,
          )}`,
          left,
          y,
        )

        doc.text(
          `Method: ${receipt.method}`,
          110,
          y,
        )

        y += 14

        // ------------------------------------------------------
        // AMOUNT
        // ------------------------------------------------------

        doc.setFont(
          'helvetica',
          'bold',
        )

        doc.setFontSize(10)

        doc.text(
          'AMOUNT RECEIVED',
          left,
          y,
        )

        y += 9

        doc.setFontSize(20)

        doc.text(
          money(
            receipt.amount,
          ),
          left,
          y,
        )

        y += 6

        doc.setFont(
          'helvetica',
          'normal',
        )

        doc.setFontSize(9)

        const words =
          amountInWords(
            receipt.amount,
          )

        const wrappedWords =
          doc.splitTextToSize(
            words,
            right - left,
          )

        doc.text(
          wrappedWords,
          left,
          y,
        )

        y +=
          wrappedWords.length *
            4.5 +
          13

        doc.line(
          left,
          y,
          right,
          y,
        )

        y += 10

        // ------------------------------------------------------
        // SUMMARY
        // ------------------------------------------------------

        const invoiceAmount =
          Number(
            receipt.invoiceAmount ??
              receipt.amount,
          )

        const remainingBalance =
          Math.max(
            Number(
              receipt.remainingBalance ??
                invoiceAmount -
                  receipt.amount,
            ),
            0,
          )

        const summaryRows = [
          [
            'Invoice amount',
            money(
              invoiceAmount,
            ),
          ],
          [
            'Amount received',
            money(
              receipt.amount,
            ),
          ],
          [
            'Remaining balance',
            money(
              remainingBalance,
            ),
          ],
        ]

        doc.setFontSize(10)

        for (
          const [
            label,
            value,
          ] of summaryRows
        ) {
          doc.setFont(
            'helvetica',
            'normal',
          )

          doc.text(
            label,
            left,
            y,
          )

          doc.setFont(
            'helvetica',
            'bold',
          )

          doc.text(
            value,
            right,
            y,
            {
              align: 'right',
            },
          )

          y += 7
        }

        y += 8

        // ------------------------------------------------------
        // NOTES
        // ------------------------------------------------------

        doc.setFont(
          'helvetica',
          'bold',
        )

        doc.text(
          'NOTES & TERMS',
          left,
          y,
        )

        y += 6

        doc.setFont(
          'helvetica',
          'normal',
        )

        doc.setFontSize(9)

        const notes =
          'Payment received successfully against the invoice and payment reference shown in this receipt. Please retain this document for your accounting and business records.'

        const wrappedNotes =
          doc.splitTextToSize(
            notes,
            right - left,
          )

        doc.text(
          wrappedNotes,
          left,
          y,
        )

        y +=
          wrappedNotes.length *
            4.5 +
          16

        // ------------------------------------------------------
        // SUCCESS BOX
        // ------------------------------------------------------

        doc.setDrawColor(
          210,
          210,
          210,
        )

        doc.rect(
          left,
          y,
          right - left,
          24,
        )

        doc.setFont(
          'helvetica',
          'bold',
        )

        doc.setFontSize(10)

        doc.text(
          'PAYMENT RECEIVED SUCCESSFULLY',
          left + 6,
          y + 9,
        )

        doc.setFont(
          'helvetica',
          'normal',
        )

        doc.setFontSize(8)

        doc.text(
          'Generated from CashGuard-AI financial operations.',
          left + 6,
          y + 15,
        )

        doc.text(
          `Receipt: ${receipt.id}`,
          left + 6,
          y + 20,
        )

        // ------------------------------------------------------
        // FOOTER
        // ------------------------------------------------------

        doc.text(
          'Page 1 of 1',
          right,
          pageHeight - 10,
          {
            align: 'right',
          },
        )

        const filename =
          `${
            receipt.id ||
            'payment-receipt'
          }.pdf`.replace(
            /[^a-zA-Z0-9._-]/g,
            '_',
          )

        doc.save(
          filename,
        )

        onNotice(
          'Payment receipt PDF downloaded successfully.',
        )
      } catch (err) {
        onNotice(
          err instanceof Error
            ? `PDF generation failed: ${err.message}`
            : 'PDF generation failed.',
        )
      } finally {
        setDownloading(false)
      }
    }

  const shareReceipt =
    async () => {
      const shareText =
        `${receipt.id} · ${receipt.customer} · ${money(
          receipt.amount,
        )} · ${receipt.invoice}`

      try {
        const nav =
          navigator as ShareNavigator

        if (
          typeof nav.share ===
          'function'
        ) {
          await nav.share({
            title:
              'CashGuard-AI Payment Receipt',
            text: shareText,
          })

          onNotice(
            'Receipt shared successfully.',
          )

          return
        }

        if (
          navigator.clipboard
        ) {
          await navigator.clipboard.writeText(
            shareText,
          )

          onNotice(
            'Receipt details copied to clipboard.',
          )

          return
        }

        onNotice(
          'Sharing is not supported by this browser.',
        )
      } catch {
        onNotice(
          'Receipt sharing was cancelled.',
        )
      }
    }

  return (
    <main className="receipt-viewer">
      <div className="receipt-viewer-bar">
        <button
          type="button"
          className="receipt-link"
          onClick={onBack}
        >
          <ArrowLeft size={15} />
          Back to receipts
        </button>

        <div
          style={{
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          <button
            type="button"
            className="secondary-button"
            onClick={() =>
              window.print()
            }
          >
            <Printer size={14} />
            Print
          </button>

          <button
            type="button"
            className="secondary-button"
            onClick={() =>
              void downloadPdf()
            }
            disabled={downloading}
          >
            {downloading ? (
              <RefreshCw
                size={14}
                className="animate-spin"
              />
            ) : (
              <Download
                size={14}
              />
            )}

            {downloading
              ? 'Preparing PDF...'
              : 'Download PDF'}
          </button>

          <button
            type="button"
            className="primary-button"
            onClick={() =>
              void shareReceipt()
            }
          >
            <Share2 size={14} />
            Share
          </button>
        </div>
      </div>

      <article className="receipt-document">
        <header className="receipt-document-header">
          <div>
            <div className="receipt-brand">
              ◆ {businessName}
            </div>

            <p
              style={{
                marginTop: 8,
              }}
            >
              {businessAddress}
            </p>

            {businessPhone && (
              <p
                style={{
                  marginTop: 4,
                }}
              >
                {businessPhone}
              </p>
            )}

            {businessEmail && (
              <p
                style={{
                  marginTop: 4,
                }}
              >
                {businessEmail}
              </p>
            )}

            {businessGstin && (
              <p
                style={{
                  marginTop: 4,
                }}
              >
                GSTIN: {businessGstin}
              </p>
            )}
          </div>

          <div className="receipt-title">
            <p>
              PAYMENT RECEIPT
            </p>

            <strong>
              {receipt.id}
            </strong>

            <small>
              Issued{' '}
              {formatDate(
                receipt.date,
              )}
            </small>
          </div>
        </header>

        <div className="receipt-rule" />

        <section className="receipt-business">
          <div>
            <p className="receipt-label">
              CUSTOMER
            </p>

            <h2>
              {receipt.customer}
            </h2>

            <p>
              Invoice:{' '}
              {receipt.invoice}
              <br />
              Reference:{' '}
              {receipt.reference}
              <br />
              Payment ID:{' '}
              {receipt.paymentId}
            </p>
          </div>

          <div>
            <p className="receipt-label">
              PAYMENT DETAILS
            </p>

            <h2>
              {receipt.method}
            </h2>

            <p>
              Date:{' '}
              {formatDate(
                receipt.date,
              )}
              <br />
              Status:{' '}
              {receipt.status}
              <br />
              Currency:{' '}
              {receipt.currency ||
                'INR'}
            </p>
          </div>
        </section>

        <section className="receipt-info-grid">
          <div>
            <span>
              Receipt number
            </span>

            <strong>
              {receipt.id}
            </strong>
          </div>

          <div>
            <span>
              Invoice number
            </span>

            <strong>
              {receipt.invoice}
            </strong>
          </div>

          <div>
            <span>
              Payment method
            </span>

            <strong>
              {receipt.method}
            </strong>
          </div>

          <div>
            <span>
              Reference ID
            </span>

            <strong>
              {receipt.reference}
            </strong>
          </div>
        </section>

        <section className="receipt-total">
          <span>
            Amount received
          </span>

          <strong>
            {money(
              receipt.amount,
            )}
          </strong>

          <small>
            {amountInWords(
              receipt.amount,
            )}
          </small>
        </section>

        <section className="receipt-summary">
          <div>
            <span>
              Total invoice amount
            </span>

            <strong>
              {money(
                Number(
                  receipt.invoiceAmount ??
                    receipt.amount,
                ),
              )}
            </strong>
          </div>

          <div>
            <span>
              Amount received
            </span>

            <strong>
              {money(
                receipt.amount,
              )}
            </strong>
          </div>

          <div>
            <span>
              Remaining balance
            </span>

            <strong>
              {money(
                Math.max(
                  Number(
                    receipt.remainingBalance ??
                      Number(
                        receipt.invoiceAmount ??
                          receipt.amount,
                      ) -
                        receipt.amount,
                  ),
                  0,
                ),
              )}
            </strong>
          </div>
        </section>

        <section className="receipt-terms">
          <h3>
            Notes and terms
          </h3>

          <p>
            Payment received
            successfully against the
            invoice and payment
            reference shown above.
            Please retain this receipt
            for your accounting and
            business records.
          </p>
        </section>

        <footer>
          <strong>
            Payment received
            successfully
          </strong>

          <span>
            Generated from
            CashGuard-AI financial
            operations.
          </span>
        </footer>
      </article>
    </main>
  )
}

// ============================================================
// CSV EXPORT
// ============================================================

function downloadCsv(
  receipts: Receipt[],
): void {
  if (!receipts.length) {
    return
  }

  const rows: Array<
    Array<string | number>
  > = [
    [
      'Receipt ID',
      'Payment ID',
      'Customer',
      'Invoice',
      'Date',
      'Amount',
      'Method',
      'Status',
      'Reference',
      'Remaining Balance',
    ],

    ...receipts.map(
      (receipt) => [
        receipt.id,
        receipt.paymentId,
        receipt.customer,
        receipt.invoice,
        formatDate(
          receipt.date,
        ),
        receipt.amount,
        receipt.method,
        receipt.status,
        receipt.reference,
        receipt.remainingBalance ??
          0,
      ],
    ),
  ]

  const csv =
    rows
      .map(
        (row) =>
          row
            .map(
              (cell) =>
                `"${String(
                  cell ?? '',
                ).replace(
                  /"/g,
                  '""',
                )}"`,
            )
            .join(','),
      )
      .join('\n')

  const blob =
    new Blob(
      [csv],
      {
        type:
          'text/csv;charset=utf-8;',
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

  anchor.href = url

  anchor.download =
    `cashguard-payment-receipts-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`

  document.body.appendChild(
    anchor,
  )

  anchor.click()

  anchor.remove()

  URL.revokeObjectURL(
    url,
  )
}