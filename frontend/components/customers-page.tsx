"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  AlertCircle,
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Edit3,
  Filter,
  Mail,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";

/* ============================================================================
 * TYPES
 * ========================================================================== */

export type CustomerRisk =
  | "LOW"
  | "MEDIUM"
  | "HIGH"
  | "CRITICAL"
  | "UNKNOWN";

export type PaymentBehavior =
  | "ON TIME"
  | "USUALLY ON TIME"
  | "SOMETIMES LATE"
  | "FREQUENTLY LATE"
  | "UNKNOWN";

export type CustomerStatus =
  | "ACTIVE"
  | "INACTIVE"
  | "BLOCKED"
  | "UNKNOWN";

export interface Customer {
  id: string;

  businessId?: string | null;
  customerCode?: string | null;

  name: string;
  company: string;
  email: string;
  phone: string;
  gstin: string;
  city: string;
  state: string;
  type: string;

  status: CustomerStatus;

  creditLimit: number;

  outstanding: number;
  overdue: number;
  paid: number;
  revenue: number;

  totalInvoices: number;

  risk: CustomerRisk;
  behavior: PaymentBehavior;

  latestPayment: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface CustomerInvoice {
  id: string;
  invoiceNumber: string;
  customerId: string;

  invoiceDate: string | null;
  dueDate: string | null;

  amount: number;
  paid: number;
  outstanding: number;

  status: string;
}

export interface CustomerPayment {
  id: string;

  customerId: string | null;
  invoiceId: string | null;

  date: string | null;
  amount: number;

  method: string;
  reference: string;
  status: string;
}

export interface CustomerActivity {
  id: string;
  title: string;
  description: string;
  date: string | null;
  type: "payment" | "invoice" | "status";
}

export interface CustomerIntelligence {
  title: string;
  summary: string;
  recommendation: string;
  priority: string;
  confidence?: string;
  raw?: unknown;
}

/* ============================================================================
 * API CONFIGURATION
 * ========================================================================== */

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL ||
  "http://127.0.0.1:8000"
).replace(/\/+$/, "");

/*
 * Backend validation confirms:
 *   /api/customers -> max limit = 100
 */
const CUSTOMER_PAGE_LIMIT = 100;

const TOKEN_KEYS = [
  "access_token",
  "accessToken",
  "cashguard_token",
  "token",
  "auth_token",
  "jwt",
];

/* ============================================================================
 * GENERIC HELPERS
 * ========================================================================== */

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function text(
  value: unknown,
): string {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value).trim();
  }

  return "";
}

function toNumber(
  value: unknown,
): number | null {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return value;
  }

  const cleaned = String(value)
    .replace(/[₹,\s]/g, "")
    .trim();

  if (!cleaned) {
    return null;
  }

  const parsed = Number(cleaned);

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

function cleanToken(
  value: unknown,
): string {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .replace(/^Bearer\s+/i, "")
    .trim();
}

function getAuthToken(): string {
  if (typeof window === "undefined") {
    return "";
  }

  const storages = [
    window.localStorage,
    window.sessionStorage,
  ];

  for (const storage of storages) {
    for (const key of TOKEN_KEYS) {
      try {
        const token = cleanToken(
          storage.getItem(key),
        );

        if (token) {
          return token;
        }
      } catch {
        // Ignore storage access errors.
      }
    }
  }

  return "";
}

function money(
  value: number | null | undefined,
): string {
  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(Number(value))
  ) {
    return "—";
  }

  return new Intl.NumberFormat(
    "en-IN",
    {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    },
  ).format(Number(value));
}

function formatDate(
  value: string | null | undefined,
): string {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (
    Number.isNaN(date.getTime())
  ) {
    return value;
  }

  return new Intl.DateTimeFormat(
    "en-IN",
    {
      dateStyle: "medium",
      timeZone: "Asia/Kolkata",
    },
  ).format(date);
}

function initials(
  name: string,
): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length >= 2) {
    return (
      `${parts[0][0]}${parts[parts.length - 1][0]}`
    ).toUpperCase();
  }

  return (
    parts[0]?.slice(0, 2) ||
    "CU"
  ).toUpperCase();
}

/* ============================================================================
 * API REQUEST
 * ========================================================================== */

async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(
    options.headers || {},
  );

  headers.set(
    "Accept",
    "application/json",
  );

  if (
    options.body &&
    !headers.has("Content-Type")
  ) {
    headers.set(
      "Content-Type",
      "application/json",
    );
  }

  const token = getAuthToken();

  if (token) {
    headers.set(
      "Authorization",
      `Bearer ${token}`,
    );
  }

  let response: Response;

  try {
    response = await fetch(
      `${API_BASE_URL}${path}`,
      {
        ...options,
        headers,
        credentials: "include",
        cache: "no-store",
      },
    );
  } catch {
    throw new Error(
      `Unable to connect to CashGuard-AI backend at ${API_BASE_URL}.`,
    );
  }

  const contentType =
    response.headers.get(
      "content-type",
    ) || "";

  let body: unknown = null;

  if (
    contentType.includes(
      "application/json",
    )
  ) {
    body = await response.json();
  } else {
    body = await response.text();
  }

  if (!response.ok) {
    let message =
      `API request failed (${response.status})`;

    if (isRecord(body)) {
      message =
        text(body.detail) ||
        text(body.message) ||
        text(body.error) ||
        message;
    } else if (
      typeof body === "string" &&
      body.trim()
    ) {
      message = body;
    }

    throw new Error(message);
  }

  return body as T;
}

/* ============================================================================
 * RESPONSE ROW EXTRACTION
 * ========================================================================== */

function extractRows(
  payload: unknown,
  keys: string[],
): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter(
      isRecord,
    ) as Record<
      string,
      unknown
    >[];
  }

  if (!isRecord(payload)) {
    return [];
  }

  const candidates = [
    payload.data,
    ...keys.map(
      (key) => payload[key],
    ),
    payload.items,
    payload.results,
    payload.records,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.filter(
        isRecord,
      ) as Record<
        string,
        unknown
      >[];
    }

    if (isRecord(candidate)) {
      if (
        Array.isArray(candidate.items)
      ) {
        return candidate.items.filter(
          isRecord,
        ) as Record<
          string,
          unknown
        >[];
      }

      if (
        Array.isArray(candidate.records)
      ) {
        return candidate.records.filter(
          isRecord,
        ) as Record<
          string,
          unknown
        >[];
      }
    }
  }

  return [];
}

/* ============================================================================
 * PAGINATED CUSTOMER LOADER
 * ========================================================================== */

async function fetchAllCustomers(): Promise<
  Record<string, unknown>[]
> {
  const allRows: Record<
    string,
    unknown
  >[] = [];

  let offset = 0;

  const MAX_PAGES = 1000;

  for (
    let pageIndex = 0;
    pageIndex < MAX_PAGES;
    pageIndex += 1
  ) {
    const payload =
      await apiRequest<unknown>(
        `/api/customers?limit=${CUSTOMER_PAGE_LIMIT}&offset=${offset}`,
      );

    const rows =
      extractRows(
        payload,
        ["customers"],
      );

    if (!rows.length) {
      break;
    }

    allRows.push(...rows);

    if (
      rows.length <
      CUSTOMER_PAGE_LIMIT
    ) {
      break;
    }

    offset += rows.length;
  }

  return allRows;
}

/* ============================================================================
 * NORMALIZATION
 * ========================================================================== */

function normalizeRisk(
  value: unknown,
): CustomerRisk {
  const normalized =
    text(value)
      .toLowerCase()
      .replace(/[\s-]+/g, "_");

  if (
    normalized.includes("critical")
  ) {
    return "CRITICAL";
  }

  if (
    normalized.includes("high")
  ) {
    return "HIGH";
  }

  if (
    normalized.includes("medium") ||
    normalized.includes("moderate")
  ) {
    return "MEDIUM";
  }

  if (
    normalized.includes("low") ||
    normalized.includes("reliable") ||
    normalized.includes("good")
  ) {
    return "LOW";
  }

  return "UNKNOWN";
}

function normalizeStatus(
  value: unknown,
): CustomerStatus {
  const normalized =
    text(value).toLowerCase();

  if (
    ["active", "enabled", "open"].includes(
      normalized,
    )
  ) {
    return "ACTIVE";
  }

  if (
    ["inactive", "disabled", "closed"].includes(
      normalized,
    )
  ) {
    return "INACTIVE";
  }

  if (
    ["blocked", "suspended"].includes(
      normalized,
    )
  ) {
    return "BLOCKED";
  }

  return "UNKNOWN";
}

function normalizeBehavior(
  value: unknown,
): PaymentBehavior {
  const normalized =
    text(value)
      .toLowerCase()
      .replace(/[\s-]+/g, "_");

  if (
    normalized.includes("frequent") ||
    normalized.includes("often_late")
  ) {
    return "FREQUENTLY LATE";
  }

  if (
    normalized.includes("occasion") ||
    normalized.includes("sometimes_late")
  ) {
    return "SOMETIMES LATE";
  }

  if (
    normalized.includes("usually") ||
    normalized.includes("mostly")
  ) {
    return "USUALLY ON TIME";
  }

  if (
    normalized.includes("on_time") ||
    normalized.includes("ontime") ||
    normalized === "paid_on_time"
  ) {
    return "ON TIME";
  }

  return "UNKNOWN";
}

function normalizeCustomer(
  raw: Record<string, unknown>,
  index: number,
): Customer {
  return {
    id:
      text(
        raw.id ??
          raw.customer_id ??
          raw.customerId,
      ) ||
      `customer-${index + 1}`,

    businessId:
      text(
        raw.business_id ??
          raw.businessId,
      ) || null,

    customerCode:
      text(
        raw.customer_code ??
          raw.customerCode,
      ) || null,

    name:
      text(
        raw.name ??
          raw.customer_name ??
          raw.customerName ??
          raw.company_name,
      ) ||
      `Customer ${index + 1}`,

    company:
      text(
        raw.company ??
          raw.company_name ??
          raw.business_name,
      ) || "",

    email:
      text(raw.email) || "",

    phone:
      text(
        raw.phone ??
          raw.mobile ??
          raw.contact,
      ) || "",

    gstin:
      text(
        raw.gstin ??
          raw.gst_number ??
          raw.gstNumber,
      ) || "",

    city:
      text(raw.city) || "",

    state:
      text(raw.state) || "",

    type:
      text(
        raw.type ??
          raw.customer_type ??
          raw.customerType,
      ) || "Business",

    status:
      normalizeStatus(
        raw.status,
      ),

    creditLimit:
      toNumber(
        raw.credit_limit ??
          raw.creditLimit,
      ) ?? 0,

    outstanding:
      toNumber(
        raw.outstanding ??
          raw.outstanding_amount ??
          raw.outstandingBalance ??
          raw.balance,
      ) ?? 0,

    overdue:
      toNumber(
        raw.overdue ??
          raw.overdue_amount ??
          raw.overdueBalance,
      ) ?? 0,

    paid:
      toNumber(
        raw.paid ??
          raw.amount_paid ??
          raw.total_paid ??
          raw.collected,
      ) ?? 0,

    revenue:
      toNumber(
        raw.revenue ??
          raw.total_revenue ??
          raw.totalRevenue,
      ) ?? 0,

    totalInvoices:
      toNumber(
        raw.total_invoices ??
          raw.invoice_count ??
          raw.invoiceCount,
      ) ?? 0,

    risk:
      normalizeRisk(
        raw.risk ??
          raw.risk_level ??
          raw.riskLevel ??
          raw.risk_segment,
      ),

    behavior:
      normalizeBehavior(
        raw.payment_behavior ??
          raw.paymentBehavior ??
          raw.payment_status,
      ),

    latestPayment:
      text(
        raw.last_payment_date ??
          raw.lastPaymentDate ??
          raw.last_payment,
      ) || null,

    createdAt:
      text(
        raw.created_at ??
          raw.createdAt,
      ) || null,

    updatedAt:
      text(
        raw.updated_at ??
          raw.updatedAt,
      ) || null,
  };
}

/* ============================================================================
 * AI RESPONSE
 * ========================================================================== */

function parseAIInsight(
  payload: unknown,
): CustomerIntelligence {
  const root =
    isRecord(payload)
      ? payload
      : {};

  let candidate: Record<
    string,
    unknown
  > = root;

  const possibleNested = [
    root.insight,
    root.data,
    root.result,
    root.response,
    root.message,
    root.content,
  ];

  for (const item of possibleNested) {
    if (isRecord(item)) {
      candidate = item;
      break;
    }
  }

  let title =
    text(candidate.title);

  let summary =
    text(
      candidate.summary ??
        candidate.explanation,
    );

  let recommendation =
    text(
      candidate.recommendation ??
        candidate.action ??
        candidate.suggested_action,
    );

  let priority =
    text(
      candidate.priority ??
        candidate.risk_level ??
        candidate.riskLevel,
    );

  let confidence =
    text(
      candidate.confidence ??
        candidate.confidence_note,
    );

  const rawText =
    text(candidate.content) ||
    text(candidate.response) ||
    text(candidate.message);

  if (
    !summary &&
    rawText
  ) {
    try {
      const parsed =
        JSON.parse(rawText);

      if (isRecord(parsed)) {
        title =
          text(parsed.title) ||
          title;

        summary =
          text(
            parsed.summary ??
              parsed.explanation,
          ) ||
          summary;

        recommendation =
          text(
            parsed.recommendation ??
              parsed.action ??
              parsed.suggested_action,
          ) ||
          recommendation;

        priority =
          text(
            parsed.priority ??
              parsed.risk_level ??
              parsed.riskLevel,
          ) ||
          priority;

        confidence =
          text(
            parsed.confidence ??
              parsed.confidence_note,
          ) ||
          confidence;
      }
    } catch {
      summary = rawText;
    }
  }

  if (!summary) {
    throw new Error(
      "AI response did not contain a usable customer insight.",
    );
  }

  return {
    title:
      title ||
      "Customer Intelligence",

    summary,

    recommendation:
      recommendation ||
      "Review the customer's current financial position and receivables exposure.",

    priority:
      priority ||
      "REVIEW",

    confidence:
      confidence || undefined,

    raw: payload,
  };
}

/* ============================================================================
 * CUSTOMER AI REQUEST
 * ========================================================================== */

function buildCustomerAIPayload(
  customer: Customer,
): {
  intelligence: Record<
    string,
    unknown
  >;
  prompt: string;
  system_prompt: string;
} {
  const intelligence = {
    business_id:
      customer.businessId ?? null,

    customer: {
      id: customer.id,

      customer_code:
        customer.customerCode ??
        null,

      name:
        customer.name,

      company:
        customer.company,

      email:
        customer.email,

      phone:
        customer.phone,

      gstin:
        customer.gstin,

      city:
        customer.city,

      state:
        customer.state,

      type:
        customer.type,

      status:
        customer.status,

      credit_limit:
        customer.creditLimit,

      risk:
        customer.risk,

      payment_behavior:
        customer.behavior,

      created_at:
        customer.createdAt ??
        null,

      updated_at:
        customer.updatedAt ??
        null,
    },

    financials: {
      revenue:
        customer.revenue,

      paid:
        customer.paid,

      outstanding:
        customer.outstanding,

      overdue:
        customer.overdue,

      total_invoices:
        customer.totalInvoices,

      latest_payment:
        customer.latestPayment,
    },

    invoices: [],

    payments: [],

    source:
      "live_cashguard_customer_page",
  };

  const system_prompt = `
You are CashGuard AI, a financial intelligence assistant for Indian MSMEs.

Analyze ONLY the customer information supplied in the user prompt.

IMPORTANT RULES:
- Never invent financial values.
- Never invent transactions.
- Never invent invoice numbers.
- Never invent payment dates.
- Never invent customer behavior not present in the supplied data.
- Never invent GST details.
- Never invent future events.
- Never claim database facts that are not supplied.
- Use the supplied numerical values exactly.
- If information is missing, explicitly say that the information is not available.
- Keep the recommendation practical and business-focused.
- Return ONLY valid JSON.

Return exactly:

{
  "title": "string",
  "summary": "string",
  "recommendation": "string",
  "priority": "LOW|MEDIUM|HIGH|CRITICAL|POSITIVE|REVIEW",
  "confidence": "string"
}
`.trim();

  const prompt = `
Generate customer financial intelligence from this live CashGuard customer data.

LIVE CUSTOMER DATA:
${JSON.stringify(
  intelligence,
  null,
  2,
)}

Focus on:
1. Current receivables exposure
2. Overdue exposure
3. Payment behavior
4. Revenue/customer value
5. Credit exposure
6. Practical collection or relationship recommendation

Do not invent information.

Return only JSON matching the required schema.
`.trim();

  return {
    intelligence,
    prompt,
    system_prompt,
  };
}

/* ============================================================================
 * PAGE
 * ========================================================================== */

export default function CustomersPage() {
  const [customers, setCustomers] =
    useState<Customer[]>([]);

  const [invoices] =
    useState<CustomerInvoice[]>([]);

  const [payments] =
    useState<CustomerPayment[]>([]);

  const [query, setQuery] =
    useState("");

  const [status, setStatus] =
    useState("All");

  const [risk, setRisk] =
    useState("All");

  const [sort, setSort] =
    useState("name");

  const [selected, setSelected] =
    useState<Customer | null>(null);

  const [formOpen, setFormOpen] =
    useState(false);

  const [editing, setEditing] =
    useState<Customer | null>(null);

  const [notice, setNotice] =
    useState("");

  const [error, setError] =
    useState("");

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [saving, setSaving] =
    useState(false);

  const [exportOpen, setExportOpen] =
    useState(false);

  const [page, setPage] =
    useState(1);

  const [aiLoading, setAiLoading] =
    useState(false);

  const [aiError, setAiError] =
    useState("");

  const [
    aiInsight,
    setAiInsight,
  ] =
    useState<CustomerIntelligence | null>(
      null,
    );

  const PAGE_SIZE = 10;

  /* ==========================================================================
   * LOAD CUSTOMER DATA
   * ======================================================================== */

  const loadData = useCallback(
    async (
      showRefresh = false,
    ) => {
      if (showRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError("");
      setAiError("");

      try {
        const customerRows =
          await fetchAllCustomers();

        const normalizedCustomers =
          customerRows.map(
            normalizeCustomer,
          );

        setCustomers(
          normalizedCustomers,
        );

        setPage(1);

        setSelected(
          (currentSelected) => {
            if (!currentSelected) {
              return null;
            }

            const refreshed =
              normalizedCustomers.find(
                (customer) =>
                  customer.id ===
                  currentSelected.id,
              );

            return refreshed || null;
          },
        );

        if (showRefresh) {
          setNotice(
            "Customer records refreshed from live backend data.",
          );
        }
      } catch (caught) {
        console.error(
          "[Customers] customer load failed:",
          caught,
        );

        setError(
          caught instanceof Error
            ? caught.message
            : "Unable to load live customer data.",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [],
  );

  useEffect(() => {
    void loadData();
  }, [loadData]);

  /* ==========================================================================
   * FILTERING
   * ======================================================================== */

  const filtered = useMemo(() => {
    const normalizedQuery =
      query.trim().toLowerCase();

    const rows =
      customers.filter(
        (customer) => {
          const searchable = [
            customer.name,
            customer.company,
            customer.email,
            customer.phone,
            customer.gstin,
            customer.city,
            customer.state,
            customer.customerCode ||
              "",
            customer.id,
          ]
            .join(" ")
            .toLowerCase();

          if (
            normalizedQuery &&
            !searchable.includes(
              normalizedQuery,
            )
          ) {
            return false;
          }

          if (
            status !== "All" &&
            customer.status !==
              status
          ) {
            return false;
          }

          if (
            risk !== "All" &&
            customer.risk !== risk
          ) {
            return false;
          }

          return true;
        },
      );

    rows.sort((a, b) => {
      if (
        sort === "outstanding"
      ) {
        return (
          b.outstanding -
          a.outstanding
        );
      }

      if (
        sort === "overdue"
      ) {
        return (
          b.overdue -
          a.overdue
        );
      }

      if (
        sort === "latest"
      ) {
        const aTime =
          a.latestPayment
            ? new Date(
                a.latestPayment,
              ).getTime()
            : 0;

        const bTime =
          b.latestPayment
            ? new Date(
                b.latestPayment,
              ).getTime()
            : 0;

        return bTime - aTime;
      }

      return a.name.localeCompare(
        b.name,
      );
    });

    return rows;
  }, [
    customers,
    query,
    status,
    risk,
    sort,
  ]);

  const totalPages =
    Math.max(
      1,
      Math.ceil(
        filtered.length /
          PAGE_SIZE,
      ),
    );

  const safePage =
    Math.min(
      page,
      totalPages,
    );

  const paginated =
    filtered.slice(
      (safePage - 1) *
        PAGE_SIZE,
      safePage *
        PAGE_SIZE,
    );

  useEffect(() => {
    if (page !== safePage) {
      setPage(safePage);
    }
  }, [
    page,
    safePage,
  ]);

  /* ==========================================================================
   * GLOBAL METRICS
   * ======================================================================== */

  const metrics = useMemo(() => {
    return {
      total:
        customers.length,

      active:
        customers.filter(
          (customer) =>
            customer.status ===
            "ACTIVE",
        ).length,

      outstanding:
        customers.reduce(
          (sum, customer) =>
            sum +
            customer.outstanding,
          0,
        ),

      overdue:
        customers.reduce(
          (sum, customer) =>
            sum +
            customer.overdue,
          0,
        ),

      paid:
        customers.reduce(
          (sum, customer) =>
            sum +
            customer.paid,
          0,
        ),

      highRisk:
        customers.filter(
          (customer) =>
            customer.risk ===
              "HIGH" ||
            customer.risk ===
              "CRITICAL",
        ).length,
    };
  }, [customers]);

  /* ==========================================================================
   * CUSTOMER DETAIL DATA
   * ======================================================================== */

  const selectedInvoices =
    useMemo(() => {
      if (!selected) {
        return [];
      }

      return invoices
        .filter(
          (invoice) =>
            invoice.customerId ===
            selected.id,
        )
        .sort((a, b) => {
          const aTime =
            a.invoiceDate
              ? new Date(
                  a.invoiceDate,
                ).getTime()
              : 0;

          const bTime =
            b.invoiceDate
              ? new Date(
                  b.invoiceDate,
                ).getTime()
              : 0;

          return bTime - aTime;
        });
    }, [invoices, selected]);

  const selectedPayments =
    useMemo(() => {
      if (!selected) {
        return [];
      }

      return payments
        .filter(
          (payment) =>
            payment.customerId ===
              selected.id ||
            selectedInvoices.some(
              (invoice) =>
                invoice.id ===
                payment.invoiceId,
            ),
        )
        .sort((a, b) => {
          const aTime =
            a.date
              ? new Date(
                  a.date,
                ).getTime()
              : 0;

          const bTime =
            b.date
              ? new Date(
                  b.date,
                ).getTime()
              : 0;

          return bTime - aTime;
        });
    }, [
      payments,
      selected,
      selectedInvoices,
    ]);

  const selectedActivities =
    useMemo(() => {
      if (!selected) {
        return [];
      }

      const invoiceActivities =
        selectedInvoices.map(
          (invoice) => ({
            id:
              `invoice-${invoice.id}`,

            title:
              invoice.outstanding >
              0
                ? "Invoice outstanding"
                : "Invoice paid",

            description:
              `${invoice.invoiceNumber} · ${money(
                invoice.amount,
              )} invoice value.`,

            date:
              invoice.invoiceDate,

            type:
              "invoice" as const,
          }),
        );

      const paymentActivities =
        selectedPayments.map(
          (payment) => ({
            id:
              `payment-${payment.id}`,

            title:
              "Payment received",

            description:
              `${money(
                payment.amount,
              )} via ${payment.method}${
                payment.reference
                  ? ` · ${payment.reference}`
                  : ""
              }.`, 
            
            date:
              payment.date,

            type:
              "payment" as const,
          }),
        );

      return [
        ...paymentActivities,
        ...invoiceActivities,
      ]
        .sort((a, b) => {
          const aTime =
            a.date
              ? new Date(
                  a.date,
                ).getTime()
              : 0;

          const bTime =
            b.date
              ? new Date(
                  b.date,
                ).getTime()
              : 0;

          return bTime - aTime;
        })
        .slice(0, 8);
    }, [
      selected,
      selectedInvoices,
      selectedPayments,
    ]);

  /* ==========================================================================
   * AI CUSTOMER INTELLIGENCE
   * ======================================================================== */

  const generateCustomerAI =
    useCallback(
      async (
        customer: Customer,
      ) => {
        setAiLoading(true);
        setAiError("");
        setAiInsight(null);

        try {
          /*
           * IMPORTANT:
           * The old code called:
           *
           *   /ai/insight/customer
           *
           * That endpoint is not currently exposed by the backend.
           *
           * We now use the existing authenticated-compatible AI chat
           * endpoint:
           *
           *   /api/ai/chat
           *
           * The prompt is strictly grounded in the live customer data.
           */

          const {
            intelligence,
            prompt,
            system_prompt,
          } =
            buildCustomerAIPayload(
              customer,
            );

          const response =
            await apiRequest<unknown>(
              "/api/ai/chat",
              {
                method:
                  "POST",

                body:
                  JSON.stringify({
                    prompt,
                    system_prompt,

                    /*
                     * Keep the raw live business context available
                     * to any middleware/logging layer without
                     * sending mock values.
                     */
                    context:
                      intelligence,
                  }),
              },
            );

          const insight =
            parseAIInsight(
              response,
            );

          setAiInsight(
            insight,
          );

          setNotice(
            "Customer AI intelligence generated from live customer data.",
          );
        } catch (caught) {
          console.error(
            "[Customers] AI insight failed:",
            caught,
          );

          setAiError(
            caught instanceof Error
              ? caught.message
              : "Unable to generate customer intelligence.",
          );
        } finally {
          setAiLoading(false);
        }
      },
      [],
    );

  /* ==========================================================================
   * CREATE CUSTOMER
   * ======================================================================== */

  const saveCustomer =
    useCallback(
      async (
        payload: {
          name: string;
          company: string;
          email: string;
          phone: string;
          gstin: string;
          city: string;
          state: string;
          type: string;
        },
      ) => {
        setSaving(true);
        setError("");

        try {
          await apiRequest(
            "/api/customers",
            {
              method: "POST",

              body:
                JSON.stringify({
                  name:
                    payload.name.trim(),

                  company:
                    payload.company.trim() ||
                    undefined,

                  email:
                    payload.email.trim() ||
                    undefined,

                  phone:
                    payload.phone.trim() ||
                    undefined,

                  gstin:
                    payload.gstin.trim() ||
                    undefined,

                  city:
                    payload.city.trim() ||
                    undefined,

                  state:
                    payload.state.trim() ||
                    undefined,

                  type:
                    payload.type.trim() ||
                    undefined,
                }),
            },
          );

          setNotice(
            "Customer created successfully.",
          );

          setFormOpen(false);
          setEditing(null);

          await loadData(true);
        } catch (caught) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Unable to create customer.",
          );
        } finally {
          setSaving(false);
        }
      },
      [loadData],
    );

  /* ==========================================================================
   * EXPORT
   * ======================================================================== */

  const exportCsv =
    useCallback(() => {
      if (!filtered.length) {
        return;
      }

      const headers = [
        "Customer",
        "Customer Code",
        "Company",
        "Email",
        "Phone",
        "GSTIN",
        "City",
        "State",
        "Status",
        "Risk",
        "Payment Behavior",
        "Revenue",
        "Paid",
        "Outstanding",
        "Overdue",
        "Credit Limit",
        "Total Invoices",
        "Latest Payment",
      ];

      const rows =
        filtered.map(
          (customer) =>
            [
              customer.name,
              customer.customerCode ??
                "",
              customer.company,
              customer.email,
              customer.phone,
              customer.gstin,
              customer.city,
              customer.state,
              customer.status,
              customer.risk,
              customer.behavior,
              customer.revenue,
              customer.paid,
              customer.outstanding,
              customer.overdue,
              customer.creditLimit,
              customer.totalInvoices,
              customer.latestPayment ??
                "",
            ]
              .map(
                (value) =>
                  `"${String(
                    value,
                  ).replaceAll(
                    '"',
                    '""',
                  )}"`,
              )
              .join(","),
        );

      const csv = [
        headers.join(","),
        ...rows,
      ].join("\n");

      const blob =
        new Blob([csv], {
          type:
            "text/csv;charset=utf-8;",
        });

      const url =
        URL.createObjectURL(blob);

      const anchor =
        document.createElement(
          "a",
        );

      anchor.href = url;

      anchor.download =
        "cashguard-customers.csv";

      document.body.appendChild(
        anchor,
      );

      anchor.click();
      anchor.remove();

      URL.revokeObjectURL(url);

      setExportOpen(false);

      setNotice(
        "Customer CSV exported.",
      );
    }, [filtered]);

  /* ==========================================================================
   * RESET
   * ======================================================================== */

  const resetFilters =
    useCallback(() => {
      setQuery("");
      setStatus("All");
      setRisk("All");
      setSort("name");
      setPage(1);
    }, []);

  /* ==========================================================================
   * OVERLAYS
   * ======================================================================== */

  const closeOverlays =
    useCallback(() => {
      setSelected(null);
      setFormOpen(false);
      setEditing(null);
      setAiInsight(null);
      setAiError("");
    }, []);

  /* ==========================================================================
   * UI
   * ======================================================================== */

  return (
    <main className="foundation-content customers-module">
      <div className="dashboard-heading">
        <div>
          <p className="auth-eyebrow">
            CUSTOMER INTELLIGENCE · LIVE
          </p>

          <h2>
            Customers
          </h2>

          <p>
            Monitor real customer
            relationships, receivables,
            payment behavior, financial
            exposure and AI-powered
            customer intelligence.
          </p>
        </div>

        <div className="customer-heading-actions">
          <button
            className="auth-button compact"
            type="button"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus size={15} />
            Add Customer
          </button>

          <button
            className="secondary-button"
            type="button"
            onClick={() =>
              setExportOpen(true)
            }
            disabled={!filtered.length}
          >
            <Download size={15} />
            Export
          </button>

          <button
            className="secondary-button"
            type="button"
            onClick={() =>
              void loadData(true)
            }
            disabled={
              loading ||
              refreshing
            }
          >
            <RefreshCw
              size={15}
              className={
                refreshing
                  ? "spin"
                  : ""
              }
            />

            {refreshing
              ? "Refreshing..."
              : "Refresh"}
          </button>
        </div>
      </div>

      {error ? (
        <div className="operations-error">
          <AlertCircle size={15} />

          <span>{error}</span>

          <button
            type="button"
            onClick={() =>
              setError("")
            }
            aria-label="Dismiss error"
          >
            <X size={14} />
          </button>
        </div>
      ) : null}

      {notice ? (
        <div className="operations-success">
          <Check size={15} />

          <span>{notice}</span>

          <button
            type="button"
            onClick={() =>
              setNotice("")
            }
            aria-label="Dismiss notification"
          >
            <X size={14} />
          </button>
        </div>
      ) : null}

      {/* KPI */}
      <div className="dashboard-kpis">
        <Kpi
          label="Total Customers"
          value={String(
            metrics.total,
          )}
          detail="Live customer records"
        />

        <Kpi
          label="Active Customers"
          value={String(
            metrics.active,
          )}
          detail="Current accounts"
          tone="green"
        />

        <Kpi
          label="Receivables"
          value={money(
            metrics.outstanding,
          )}
          detail="Open customer balances"
          tone="amber"
        />

        <Kpi
          label="Overdue"
          value={money(
            metrics.overdue,
          )}
          detail="Requires collection action"
          tone="red"
        />
      </div>

      {/* FILTER / TABLE */}
      <section className="foundation-card customer-list-card">
        <div className="customer-toolbar">
          <div className="search-control">
            <Search size={15} />

            <input
              aria-label="Search customers"
              placeholder="Search name, company, email, phone or GSTIN"
              value={query}
              onChange={(event) => {
                setQuery(
                  event.target.value,
                );
                setPage(1);
              }}
            />
          </div>

          <select
            aria-label="Filter status"
            value={status}
            onChange={(event) => {
              setStatus(
                event.target.value,
              );
              setPage(1);
            }}
          >
            <option value="All">
              All Status
            </option>

            <option value="ACTIVE">
              Active
            </option>

            <option value="INACTIVE">
              Inactive
            </option>

            <option value="BLOCKED">
              Blocked
            </option>

            <option value="UNKNOWN">
              Unknown
            </option>
          </select>

          <select
            aria-label="Filter risk"
            value={risk}
            onChange={(event) => {
              setRisk(
                event.target.value,
              );
              setPage(1);
            }}
          >
            <option value="All">
              All Risk
            </option>

            <option value="LOW">
              Low
            </option>

            <option value="MEDIUM">
              Medium
            </option>

            <option value="HIGH">
              High
            </option>

            <option value="CRITICAL">
              Critical
            </option>

            <option value="UNKNOWN">
              Unknown
            </option>
          </select>

          <select
            aria-label="Sort customers"
            value={sort}
            onChange={(event) =>
              setSort(
                event.target.value,
              )
            }
          >
            <option value="name">
              Customer Name
            </option>

            <option value="outstanding">
              Outstanding
            </option>

            <option value="overdue">
              Overdue
            </option>

            <option value="latest">
              Latest Payment
            </option>
          </select>

          <button
            className="secondary-button"
            type="button"
            onClick={resetFilters}
          >
            <Filter size={14} />
            Reset
          </button>
        </div>

        <div className="customer-table-head">
          <span>
            Customer
          </span>

          <span>
            Contact
          </span>

          <span>
            Outstanding
          </span>

          <span>
            Overdue
          </span>

          <span>
            Paid
          </span>

          <span>
            Risk
          </span>

          <span>
            Behavior
          </span>

          <span>
            Status
          </span>

          <span />
        </div>

        {loading ? (
          <>
            <CustomerSkeleton />
            <CustomerSkeleton />
            <CustomerSkeleton />
            <CustomerSkeleton />
          </>
        ) : paginated.length ? (
          paginated.map(
            (customer) => (
              <button
                type="button"
                className="customer-row"
                key={customer.id}
                onClick={() => {
                  setSelected(customer);
                  setAiInsight(null);
                  setAiError("");
                }}
              >
                <span className="customer-person">
                  <i>
                    {initials(
                      customer.name,
                    )}
                  </i>

                  <b>
                    {customer.name}

                    <small>
                      {customer.company ||
                        customer.customerCode ||
                        customer.id}
                    </small>
                  </b>
                </span>

                <span className="customer-contact">
                  <small>
                    {customer.email ||
                      "No email"}
                  </small>

                  <small>
                    {customer.phone ||
                      "No phone"}
                  </small>
                </span>

                <strong className="money">
                  {money(
                    customer.outstanding,
                  )}
                </strong>

                <strong
                  className={`money ${
                    customer.overdue >
                    0
                      ? "danger-text"
                      : ""
                  }`}
                >
                  {money(
                    customer.overdue,
                  )}
                </strong>

                <strong className="money">
                  {money(
                    customer.paid,
                  )}
                </strong>

                <Badge
                  value={
                    customer.risk
                  }
                />

                <Badge
                  value={
                    customer.behavior
                  }
                />

                <Badge
                  value={
                    customer.status
                  }
                />

                <span className="text-action">
                  View
                  <ArrowUpRight size={13} />
                </span>
              </button>
            ),
          )
        ) : (
          <div className="customer-empty">
            <UserRound size={22} />

            <h3>
              {customers.length
                ? "No customers match your filters"
                : "No customers available"}
            </h3>

            <p>
              {customers.length
                ? "Try another search or reset the filters."
                : "Customer records will appear here when they are returned by the live backend."}
            </p>

            <button
              className="secondary-button"
              type="button"
              onClick={
                resetFilters
              }
            >
              Reset Filters
            </button>
          </div>
        )}

        <div className="customer-pagination">
          <span>
            Showing{" "}
            {filtered.length
              ? (safePage - 1) *
                  PAGE_SIZE +
                1
              : 0}
            –
            {Math.min(
              safePage *
                PAGE_SIZE,
              filtered.length,
            )}{" "}
            of{" "}
            {filtered.length}{" "}
            customers
          </span>

          <div>
            <button
              type="button"
              aria-label="Previous page"
              disabled={
                safePage <= 1
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
              <ChevronLeft
                size={15}
              />
            </button>

            <b>
              {safePage}
            </b>

            <button
              type="button"
              aria-label="Next page"
              disabled={
                safePage >=
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
              <ChevronRight
                size={15}
              />
            </button>
          </div>
        </div>
      </section>

      {/* LOWER SIGNAL CARDS */}
      <div className="customer-support-grid">
        <section className="foundation-card">
          <p className="auth-eyebrow">
            COLLECTION SIGNAL
          </p>

          <h3>
            Monitor real receivable
            exposure
          </h3>

          <p>
            {metrics.overdue > 0
              ? `${money(
                  metrics.overdue,
                )} is currently overdue across the loaded customer portfolio.`
              : "No overdue customer balance is currently present in the live customer data."}
          </p>

          <button
            type="button"
            className="text-action"
            onClick={() =>
              setRisk("HIGH")
            }
          >
            View high-risk customers
            <ArrowUpRight size={13} />
          </button>
        </section>

        <section className="foundation-card">
          <div className="ai-label">
            <Sparkles size={14} />
            LIVE CUSTOMER AI
          </div>

          <h3>
            AI analyses the real
            customer context
          </h3>

          <p>
            Open any customer and
            generate intelligence using
            that customer's actual
            profile and financial
            exposure.
          </p>
        </section>
      </div>

      {/* DETAIL */}
      {selected ? (
        <Detail
          customer={selected}
          invoices={selectedInvoices}
          payments={selectedPayments}
          activities={
            selectedActivities
          }
          aiInsight={aiInsight}
          aiLoading={aiLoading}
          aiError={aiError}
          onAi={() =>
            void generateCustomerAI(
              selected,
            )
          }
          onClose={
            closeOverlays
          }
          onEdit={() => {
            setEditing(selected);
            setSelected(null);
            setFormOpen(true);
            setAiInsight(null);
            setAiError("");
          }}
        />
      ) : null}

      {/* FORM */}
      {formOpen ? (
        <CustomerForm
          customer={editing}
          saving={saving}
          onClose={
            closeOverlays
          }
          onSave={
            saveCustomer
          }
        />
      ) : null}

      {/* EXPORT */}
      {exportOpen ? (
        <div
          className="customer-modal-backdrop"
          onClick={() =>
            setExportOpen(false)
          }
        >
          <section
            className="customer-modal"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <button
              className="icon-action"
              type="button"
              aria-label="Close export dialog"
              onClick={() =>
                setExportOpen(false)
              }
            >
              <X size={18} />
            </button>

            <p className="auth-eyebrow">
              EXPORT CUSTOMERS
            </p>

            <h3>
              Export live customer
              data
            </h3>

            <p>
              CSV is generated directly
              from the currently loaded
              backend customer data.
            </p>

            <div className="export-options">
              <button
                type="button"
                className="secondary-button"
                onClick={
                  exportCsv
                }
              >
                <Download size={14} />
                Export CSV
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

/* ============================================================================
 * KPI
 * ========================================================================== */

function Kpi({
  label,
  value,
  detail,
  tone = "blue",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: string;
}) {
  return (
    <section className="foundation-card kpi-card">
      <div>
        <span className="kpi-label">
          {label}
        </span>

        <i
          className={`kpi-status ${tone}`}
        />
      </div>

      <strong className="money">
        {value}
      </strong>

      <p>{detail}</p>
    </section>
  );
}

/* ============================================================================
 * BADGE
 * ========================================================================== */

function Badge({
  value,
}: {
  value: string;
}) {
  return (
    <span
      className={`customer-badge ${value
        .toLowerCase()
        .replaceAll(" ", "-")}`}
    >
      {value}
    </span>
  );
}

/* ============================================================================
 * SKELETON
 * ========================================================================== */

function CustomerSkeleton() {
  return (
    <div className="customer-skeleton">
      <div />
      <div />
      <div />
      <div />
      <div />
      <div />
      <div />
      <div />
    </div>
  );
}

/* ============================================================================
 * CUSTOMER DETAIL
 * ========================================================================== */

function Detail({
  customer,
  invoices,
  payments,
  activities,
  aiInsight,
  aiLoading,
  aiError,
  onAi,
  onClose,
  onEdit,
}: {
  customer: Customer;
  invoices: CustomerInvoice[];
  payments: CustomerPayment[];
  activities: CustomerActivity[];
  aiInsight:
    | CustomerIntelligence
    | null;
  aiLoading: boolean;
  aiError: string;
  onAi: () => void;
  onClose: () => void;
  onEdit: () => void;
}) {
  const lifetimeRevenue =
    customer.revenue ||
    customer.paid +
      customer.outstanding;

  const creditAvailable =
    Math.max(
      0,
      customer.creditLimit -
        customer.outstanding,
    );

  return (
    <div
      className="customer-drawer-backdrop"
      onClick={onClose}
    >
      <aside
        className="customer-drawer"
        onClick={(event) =>
          event.stopPropagation()
        }
      >
        <header>
          <div>
            <p className="auth-eyebrow">
              CUSTOMER PROFILE ·{" "}
              {customer.id}
            </p>

            <h3>
              {customer.name}
            </h3>

            <p>
              {customer.company ||
                customer.customerCode ||
                "Customer account"}
            </p>
          </div>

          <button
            className="icon-action"
            type="button"
            aria-label="Close customer details"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>

        <div className="customer-detail-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={onEdit}
          >
            <Edit3 size={14} />
            Edit
          </button>

          {customer.email ? (
            <a
              className="secondary-button"
              href={`mailto:${customer.email}`}
            >
              <Mail size={14} />
              Contact
            </a>
          ) : null}

          {customer.phone ? (
            <a
              className="secondary-button"
              href={`tel:${customer.phone}`}
            >
              <Phone size={14} />
              Call
            </a>
          ) : null}
        </div>

        <section className="detail-profile">
          <span>
            {initials(
              customer.name,
            )}
          </span>

          <div>
            <b>
              {customer.email ||
                "No email available"}
            </b>

            <small>
              {customer.phone ||
                "No phone available"}
            </small>

            <small>
              {customer.gstin ||
                "GSTIN not available"}
              {" · "}
              {[
                customer.city,
                customer.state,
              ]
                .filter(Boolean)
                .join(", ") ||
                "Location not available"}
            </small>
          </div>
        </section>

        <div className="detail-kpis">
          <Kpi
            label="Revenue"
            value={money(
              lifetimeRevenue,
            )}
            detail="Live customer value"
          />

          <Kpi
            label="Outstanding"
            value={money(
              customer.outstanding,
            )}
            detail="Customer balance"
            tone="amber"
          />

          <Kpi
            label="Overdue"
            value={money(
              customer.overdue,
            )}
            detail="Collection priority"
            tone="red"
          />

          <Kpi
            label="Credit available"
            value={money(
              creditAvailable,
            )}
            detail={`Limit ${money(
              customer.creditLimit,
            )}`}
            tone="green"
          />
        </div>

        {/* CUSTOMER INTELLIGENCE */}
        <section className="detail-section">
          <div className="detail-section-head">
            <div>
              <p className="auth-eyebrow">
                LIVE RISK INTELLIGENCE
              </p>

              <h4>
                {customer.risk} risk
              </h4>
            </div>

            <Badge
              value={
                customer.behavior
              }
            />
          </div>

          <div className="customer-risk-grid">
            <div>
              <span>
                Risk
              </span>

              <strong>
                {customer.risk}
              </strong>
            </div>

            <div>
              <span>
                Payment behavior
              </span>

              <strong>
                {customer.behavior}
              </strong>
            </div>

            <div>
              <span>
                Invoices
              </span>

              <strong>
                {customer.totalInvoices}
              </strong>
            </div>

            <div>
              <span>
                Last payment
              </span>

              <strong>
                {formatDate(
                  customer.latestPayment,
                )}
              </strong>
            </div>
          </div>

          <button
            className="auth-button compact"
            type="button"
            disabled={aiLoading}
            onClick={onAi}
            style={{
              marginTop: 14,
            }}
          >
            <Sparkles
              size={14}
              className={
                aiLoading
                  ? "spin"
                  : ""
              }
            />

            {aiLoading
              ? "Analysing..."
              : "Analyse with AI"}
          </button>

          {aiError ? (
            <div className="form-error">
              {aiError}
            </div>
          ) : null}

          {aiInsight ? (
            <div className="customer-ai-result">
              <div className="ai-label">
                <Sparkles size={14} />
                LIVE AI INSIGHT
              </div>

              <h4>
                {aiInsight.title}
              </h4>

              <div className="ai-priority">
                {aiInsight.priority}
              </div>

              <p>
                {aiInsight.summary}
              </p>

              <div className="ai-recommendation">
                <span>
                  Recommended action
                </span>

                <strong>
                  {
                    aiInsight.recommendation
                  }
                </strong>
              </div>

              {aiInsight.confidence ? (
                <small>
                  Confidence:{" "}
                  <strong>
                    {
                      aiInsight.confidence
                    }
                  </strong>
                </small>
              ) : null}
            </div>
          ) : null}
        </section>

        {/* INVOICES */}
        <section className="detail-section">
          <div className="detail-section-head">
            <div>
              <p className="auth-eyebrow">
                LIVE INVOICE HISTORY
              </p>

              <h4>
                {invoices.length} invoice
                {invoices.length ===
                1
                  ? ""
                  : "s"}
              </h4>
            </div>
          </div>

          {invoices.length ? (
            invoices.map(
              (invoice) => (
                <div
                  className="history-row"
                  key={invoice.id}
                >
                  <span>
                    <b>
                      {invoice.invoiceNumber}
                    </b>

                    <small>
                      {formatDate(
                        invoice.invoiceDate,
                      )}
                      {" · "}
                      Due{" "}
                      {formatDate(
                        invoice.dueDate,
                      )}
                    </small>
                  </span>

                  <strong>
                    {money(
                      invoice.outstanding,
                    )}
                  </strong>

                  <Badge
                    value={
                      invoice.status
                    }
                  />
                </div>
              ),
            )
          ) : (
            <p className="detail-muted">
              Invoice records will be
              connected in the next
              customer-data step.
            </p>
          )}
        </section>

        {/* PAYMENTS */}
        <section className="detail-section">
          <div className="detail-section-head">
            <div>
              <p className="auth-eyebrow">
                LIVE PAYMENT HISTORY
              </p>

              <h4>
                {payments.length} payment
                {payments.length ===
                1
                  ? ""
                  : "s"}
              </h4>
            </div>
          </div>

          {payments.length ? (
            payments.map(
              (payment) => (
                <div
                  className="history-row"
                  key={payment.id}
                >
                  <span>
                    <b>
                      {payment.id}
                    </b>

                    <small>
                      {formatDate(
                        payment.date,
                      )}
                      {" · "}
                      {payment.method}
                      {payment.reference
                        ? ` · ${payment.reference}`
                        : ""}
                    </small>
                  </span>

                  <strong>
                    {money(
                      payment.amount,
                    )}
                  </strong>

                  <Badge
                    value={
                      payment.status
                    }
                  />
                </div>
              ),
            )
          ) : (
            <p className="detail-muted">
              Payment records will be
              connected in the next
              customer-data step.
            </p>
          )}
        </section>

        {/* ACTIVITY */}
        <section className="detail-section">
          <div className="detail-section-head">
            <div>
              <p className="auth-eyebrow">
                LIVE ACTIVITY
              </p>

              <h4>
                Recent customer
                activity
              </h4>
            </div>
          </div>

          {activities.length ? (
            activities.map(
              (activity) => (
                <div
                  className="timeline-row"
                  key={activity.id}
                >
                  <i />

                  <span>
                    <b>
                      {
                        activity.title
                      }
                    </b>

                    <small>
                      {
                        activity.description
                      }
                    </small>

                    <small>
                      {formatDate(
                        activity.date,
                      )}
                    </small>
                  </span>
                </div>
              ),
            )
          ) : (
            <p className="detail-muted">
              No invoice/payment activity
              is loaded yet. Those live
              records will be added next.
            </p>
          )}
        </section>
      </aside>
    </div>
  );
}

/* ============================================================================
 * CUSTOMER FORM
 * ========================================================================== */

function CustomerForm({
  customer,
  saving,
  onClose,
  onSave,
}: {
  customer: Customer | null;
  saving: boolean;
  onClose: () => void;
  onSave: (
    payload: {
      name: string;
      company: string;
      email: string;
      phone: string;
      gstin: string;
      city: string;
      state: string;
      type: string;
    },
  ) => Promise<void>;
}) {
  const [name, setName] =
    useState(
      customer?.name ?? "",
    );

  const [company, setCompany] =
    useState(
      customer?.company ?? "",
    );

  const [email, setEmail] =
    useState(
      customer?.email ?? "",
    );

  const [phone, setPhone] =
    useState(
      customer?.phone ?? "",
    );

  const [gstin, setGstin] =
    useState(
      customer?.gstin ?? "",
    );

  const [city, setCity] =
    useState(
      customer?.city ?? "",
    );

  const [state, setState] =
    useState(
      customer?.state ?? "",
    );

  const [type, setType] =
    useState(
      customer?.type ||
        "Business",
    );

  const [formError, setFormError] =
    useState("");

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setFormError("");

    if (!name.trim()) {
      setFormError(
        "Customer name is required.",
      );
      return;
    }

    if (
      !email.trim() &&
      !phone.trim()
    ) {
      setFormError(
        "Please provide an email or phone number.",
      );
      return;
    }

    if (customer) {
      setFormError(
        "Editing an existing customer requires the backend update contract. The create flow remains connected to POST /api/customers.",
      );
      return;
    }

    await onSave({
      name,
      company,
      email,
      phone,
      gstin,
      city,
      state,
      type,
    });
  }

  return (
    <div
      className="customer-modal-backdrop"
      onClick={onClose}
    >
      <form
        className="customer-modal customer-form"
        onSubmit={handleSubmit}
        onClick={(event) =>
          event.stopPropagation()
        }
      >
        <button
          type="button"
          className="icon-action"
          aria-label="Close customer form"
          onClick={onClose}
        >
          <X size={18} />
        </button>

        <p className="auth-eyebrow">
          CUSTOMER ONBOARDING
        </p>

        <h3>
          Add customer
        </h3>

        <p>
          This form saves directly to
          the live customer API.
        </p>

        <label>
          Full Name
          <input
            value={name}
            onChange={(event) =>
              setName(
                event.target.value,
              )
            }
            required
          />
        </label>

        <label>
          Company
          <input
            value={company}
            onChange={(event) =>
              setCompany(
                event.target.value,
              )
            }
          />
        </label>

        <label>
          Business Email
          <input
            type="email"
            value={email}
            onChange={(event) =>
              setEmail(
                event.target.value,
              )
            }
          />
        </label>

        <label>
          Phone Number
          <input
            value={phone}
            onChange={(event) =>
              setPhone(
                event.target.value,
              )
            }
          />
        </label>

        <label>
          GSTIN
          <input
            value={gstin}
            onChange={(event) =>
              setGstin(
                event.target.value,
              )
            }
          />
        </label>

        <div className="customer-form-grid">
          <label>
            City
            <input
              value={city}
              onChange={(event) =>
                setCity(
                  event.target.value,
                )
              }
            />
          </label>

          <label>
            State
            <input
              value={state}
              onChange={(event) =>
                setState(
                  event.target.value,
                )
              }
            />
          </label>
        </div>

        <label>
          Customer Type
          <select
            value={type}
            onChange={(event) =>
              setType(
                event.target.value,
              )
            }
          >
            <option value="Business">
              Business
            </option>

            <option value="Retail">
              Retail
            </option>

            <option value="Individual">
              Individual
            </option>
          </select>
        </label>

        {formError ? (
          <p className="form-error">
            {formError}
          </p>
        ) : null}

        <div className="form-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={onClose}
          >
            Cancel
          </button>

          <button
            type="submit"
            className="auth-button compact"
            disabled={saving}
          >
            {saving ? (
              <>
                <RefreshCw
                  size={14}
                  className="spin"
                />
                Saving...
              </>
            ) : (
              <>
                <Plus size={14} />
                Create Customer
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}