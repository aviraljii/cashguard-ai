"use client";

import {
  AlertCircle,
  Building2,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Download,
  Eye,
  Filter,
  Mail,
  MoreHorizontal,
  Phone,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UserRound,
  Users,
  X,
} from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

type RiskLevel = "low" | "medium" | "high" | "unknown";

type CustomerStatus = "active" | "inactive" | "unknown";

type PaymentBehavior =
  | "on_time"
  | "occasionally_late"
  | "frequently_late"
  | "unknown";

type Customer = {
  id: string;
  businessId?: string;
  customerCode?: string;

  name: string;
  company?: string;
  email?: string;
  phone?: string;
  city?: string;
  state?: string;
  gstin?: string;

  creditLimit?: number | null;
  paymentTermsDays?: number | null;

  revenue?: number | null;
  outstanding?: number | null;
  overdue?: number | null;
  paid?: number | null;

  totalInvoices?: number | null;
  lastPaymentDate?: string | null;

  status: CustomerStatus;
  risk: RiskLevel;
  paymentBehavior: PaymentBehavior;

  createdAt?: string | null;
  updatedAt?: string | null;
};

type CustomerPayload = {
  name: string;
  company?: string;
  email?: string;
  phone?: string;
  city?: string;
  state?: string;
  gstin?: string;
};

type InvoiceRecord = {
  id?: string | number;
  customer_id?: string | number | null;
  customerId?: string | number | null;

  total_amount?: number | string | null;
  amount_paid?: number | string | null;

  due_date?: string | null;
  status?: string | null;

  invoice_number?: string | null;

  created_at?: string | null;
  updated_at?: string | null;
};

type AIInsight = {
  title: string;
  summary: string;
  recommendation: string;
  priority?: string;
  confidence?: string;
  raw?: unknown;
};

const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.trim() ||
  "http://127.0.0.1:8000";

/*
 * Backend limits:
 * /api/customers -> max 100
 * /api/invoices  -> max 500
 */
const CUSTOMER_PAGE_LIMIT = 100;
const INVOICE_PAGE_LIMIT = 500;

/*
 * Safety guards.
 *
 * These prevent an accidental infinite pagination loop
 * if the backend keeps returning full pages unexpectedly.
 */
const MAX_CUSTOMER_PAGES = 100;
const MAX_INVOICE_PAGES = 100;

function cleanApiUrl(): string {
  return API_URL.replace(/\/+$/, "");
}

function getStoredToken(): string {
  if (typeof window === "undefined") {
    return "";
  }

  const keys = [
    "access_token",
    "accessToken",
    "cashguard_token",
    "token",
    "auth_token",
    "jwt",
  ];

  const storages = [
    window.localStorage,
    window.sessionStorage,
  ];

  for (const storage of storages) {
    for (const key of keys) {
      const value = storage.getItem(key)?.trim();

      if (value) {
        return value.replace(/^Bearer\s+/i, "");
      }
    }
  }

  return "";
}

async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers || {});

  headers.set("Accept", "application/json");

  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const token = getStoredToken();

  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(
    `${cleanApiUrl()}${path}`,
    {
      ...options,
      headers,
      credentials: "include",
      cache: "no-store",
    },
  );

  const contentType =
    response.headers.get("content-type") || "";

  let data: unknown = null;

  if (contentType.includes("application/json")) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  if (!response.ok) {
    let message = `API request failed (${response.status})`;

    if (
      typeof data === "object" &&
      data !== null
    ) {
      const root =
        data as Record<string, unknown>;

      if (typeof root.detail === "string") {
        message = root.detail;
      } else if (typeof root.message === "string") {
        message = root.message;
      } else if (typeof root.error === "string") {
        message = root.error;
      } else if (Array.isArray(root.detail)) {
        const validationMessages = root.detail
          .map((item) => {
            if (
              item &&
              typeof item === "object"
            ) {
              const object =
                item as Record<string, unknown>;

              return (
                text(object.msg) ||
                text(object.message)
              );
            }

            return text(item);
          })
          .filter(Boolean);

        if (validationMessages.length) {
          message =
            validationMessages.join(" • ");
        }
      }
    } else if (
      typeof data === "string" &&
      data.trim()
    ) {
      message = data;
    }

    throw new Error(message);
  }

  return data as T;
}

function money(value?: number | null): string {
  if (
    value === null ||
    value === undefined ||
    Number.isNaN(Number(value))
  ) {
    return "—";
  }

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value));
}

function formatNumber(value?: number | null): string {
  if (
    value === null ||
    value === undefined ||
    Number.isNaN(Number(value))
  ) {
    return "—";
  }

  return new Intl.NumberFormat("en-IN").format(Number(value));
}

function toNumber(value: unknown): number | null {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function text(value: unknown): string {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value).trim();
  }

  return "";
}

function normalizeRisk(value: unknown): RiskLevel {
  const normalized = String(value ?? "")
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

  if (
    normalized.includes("high") ||
    normalized.includes("critical")
  ) {
    return "high";
  }

  if (
    normalized.includes("medium") ||
    normalized.includes("moderate")
  ) {
    return "medium";
  }

  if (
    normalized.includes("low") ||
    normalized.includes("reliable") ||
    normalized.includes("good")
  ) {
    return "low";
  }

  return "unknown";
}

function normalizeStatus(
  value: unknown,
): CustomerStatus {
  const normalized = String(value ?? "").toLowerCase();

  if (
    ["active", "enabled", "open"].includes(
      normalized,
    )
  ) {
    return "active";
  }

  if (
    ["inactive", "disabled", "closed"].includes(
      normalized,
    )
  ) {
    return "inactive";
  }

  return "unknown";
}

function normalizeBehavior(
  value: unknown,
): PaymentBehavior {
  const normalized = String(value ?? "")
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

  if (
    normalized.includes("frequent") ||
    normalized.includes("often_late")
  ) {
    return "frequently_late";
  }

  if (
    normalized.includes("occasion") ||
    normalized.includes("sometimes_late")
  ) {
    return "occasionally_late";
  }

  if (
    normalized.includes("on_time") ||
    normalized.includes("ontime") ||
    normalized === "paid_on_time"
  ) {
    return "on_time";
  }

  return "unknown";
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
      ) || `customer-${index + 1}`,

    businessId:
      text(
        raw.business_id ??
          raw.businessId,
      ) || undefined,

    customerCode:
      text(
        raw.customer_code ??
          raw.customerCode,
      ) || undefined,

    name:
      text(
        raw.name ??
          raw.customer_name ??
          raw.customerName ??
          raw.company_name,
      ) || `Customer ${index + 1}`,

    company:
      text(
        raw.company ??
          raw.company_name ??
          raw.business_name,
      ) || undefined,

    email:
      text(raw.email) || undefined,

    phone:
      text(
        raw.phone ??
          raw.mobile ??
          raw.contact,
      ) || undefined,

    city:
      text(raw.city) || undefined,

    state:
      text(raw.state) || undefined,

    gstin:
      text(
        raw.gstin ??
          raw.gst_number ??
          raw.gstNumber,
      ) || undefined,

    creditLimit: toNumber(
      raw.credit_limit ??
        raw.creditLimit,
    ),

    paymentTermsDays: toNumber(
      raw.payment_terms_days ??
        raw.paymentTermsDays,
    ),

    revenue: toNumber(
      raw.revenue ??
        raw.total_revenue ??
        raw.totalRevenue,
    ),

    outstanding: toNumber(
      raw.outstanding ??
        raw.outstanding_amount ??
        raw.outstandingBalance ??
        raw.balance,
    ),

    overdue: toNumber(
      raw.overdue ??
        raw.overdue_amount ??
        raw.overdueBalance,
    ),

    paid: toNumber(
      raw.paid ??
        raw.amount_paid ??
        raw.total_paid ??
        raw.collected,
    ),

    totalInvoices: toNumber(
      raw.total_invoices ??
        raw.invoice_count ??
        raw.invoiceCount,
    ),

    lastPaymentDate:
      text(
        raw.last_payment_date ??
          raw.lastPaymentDate ??
          raw.last_payment,
      ) || null,

    status: normalizeStatus(
      raw.status,
    ),

    risk: normalizeRisk(
      raw.risk ??
        raw.risk_level ??
        raw.riskLevel ??
        raw.risk_segment,
    ),

    paymentBehavior: normalizeBehavior(
      raw.payment_behavior ??
        raw.paymentBehavior ??
        raw.payment_status,
    ),

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

function extractRows(
  payload: unknown,
): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload as Record<string, unknown>[];
  }

  if (
    payload &&
    typeof payload === "object"
  ) {
    const root =
      payload as Record<string, unknown>;

    const candidates = [
      root.data,
      root.customers,
      root.items,
      root.results,
      root.records,
    ];

    for (const candidate of candidates) {
      if (Array.isArray(candidate)) {
        return candidate as Record<
          string,
          unknown
        >[];
      }

      if (
        candidate &&
        typeof candidate === "object"
      ) {
        const object =
          candidate as Record<string, unknown>;

        if (Array.isArray(object.items)) {
          return object.items as Record<
            string,
            unknown
          >[];
        }
      }
    }
  }

  return [];
}

function extractInvoiceRows(
  payload: unknown,
): InvoiceRecord[] {
  if (Array.isArray(payload)) {
    return payload as InvoiceRecord[];
  }

  if (
    payload &&
    typeof payload === "object"
  ) {
    const root =
      payload as Record<string, unknown>;

    const candidates = [
      root.data,
      root.invoices,
      root.items,
      root.results,
      root.records,
    ];

    for (const candidate of candidates) {
      if (Array.isArray(candidate)) {
        return candidate as InvoiceRecord[];
      }

      if (
        candidate &&
        typeof candidate === "object"
      ) {
        const object =
          candidate as Record<string, unknown>;

        if (Array.isArray(object.items)) {
          return object.items as InvoiceRecord[];
        }
      }
    }
  }

  return [];
}

/*
 * Fetch every customer page from the backend.
 *
 * Backend maximum:
 * /api/customers?limit=100
 */
async function fetchAllCustomers(): Promise<
  Record<string, unknown>[]
> {
  const allCustomers: Record<
    string,
    unknown
  >[] = [];

  for (
    let pageIndex = 0;
    pageIndex < MAX_CUSTOMER_PAGES;
    pageIndex += 1
  ) {
    const offset =
      pageIndex * CUSTOMER_PAGE_LIMIT;

    const payload =
      await apiRequest<unknown>(
        `/api/customers?limit=${CUSTOMER_PAGE_LIMIT}&offset=${offset}`,
        {
          method: "GET",
        },
      );

    const rows = extractRows(payload);

    if (!rows.length) {
      break;
    }

    allCustomers.push(...rows);

    /*
     * If the backend returned fewer rows than the
     * requested page size, this was the last page.
     */
    if (
      rows.length <
      CUSTOMER_PAGE_LIMIT
    ) {
      break;
    }
  }

  return allCustomers;
}

/*
 * Fetch every invoice page from the backend.
 *
 * Backend maximum:
 * /api/invoices?limit=500
 */
async function fetchAllInvoices(): Promise<
  InvoiceRecord[]
> {
  const allInvoices: InvoiceRecord[] = [];

  for (
    let pageIndex = 0;
    pageIndex < MAX_INVOICE_PAGES;
    pageIndex += 1
  ) {
    const offset =
      pageIndex * INVOICE_PAGE_LIMIT;

    const payload =
      await apiRequest<unknown>(
        `/api/invoices?limit=${INVOICE_PAGE_LIMIT}&offset=${offset}`,
        {
          method: "GET",
        },
      );

    const rows =
      extractInvoiceRows(payload);

    if (!rows.length) {
      break;
    }

    allInvoices.push(...rows);

    /*
     * If fewer than the requested page size
     * were returned, we have reached the end.
     */
    if (
      rows.length <
      INVOICE_PAGE_LIMIT
    ) {
      break;
    }
  }

  return allInvoices;
}

function daysFromToday(
  value?: string | null,
): number | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const today = new Date();

  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);

  return Math.round(
    (date.getTime() - today.getTime()) /
      86400000,
  );
}

type InvoiceAggregate = {
  revenue: number;
  paid: number;
  outstanding: number;
  overdue: number;
  totalInvoices: number;
  lastPaymentDate: string | null;
};

function aggregateInvoices(
  customers: Customer[],
  invoices: InvoiceRecord[],
): Customer[] {
  const grouped = new Map<
    string,
    InvoiceAggregate
  >();

  for (const invoice of invoices) {
    const customerId = text(
      invoice.customer_id ??
        invoice.customerId,
    );

    if (!customerId) {
      continue;
    }

    const total =
      toNumber(invoice.total_amount) ?? 0;

    const paid =
      toNumber(invoice.amount_paid) ?? 0;

    const outstanding = Math.max(
      0,
      total - paid,
    );

    const dueDays = daysFromToday(
      invoice.due_date,
    );

    const status = String(
      invoice.status ?? "",
    ).toLowerCase();

    const overdue =
      outstanding > 0 &&
      (
        status.includes("overdue") ||
        (dueDays !== null && dueDays < 0)
      )
        ? outstanding
        : 0;

    const current =
      grouped.get(customerId) || {
        revenue: 0,
        paid: 0,
        outstanding: 0,
        overdue: 0,
        totalInvoices: 0,
        lastPaymentDate: null,
      };

    current.revenue += total;
    current.paid += paid;
    current.outstanding += outstanding;
    current.overdue += overdue;
    current.totalInvoices += 1;

    if (
      paid > 0 &&
      invoice.updated_at
    ) {
      const currentTime =
        current.lastPaymentDate
          ? new Date(
              current.lastPaymentDate,
            ).getTime()
          : 0;

      const invoiceTime =
        new Date(
          invoice.updated_at,
        ).getTime();

      if (
        !current.lastPaymentDate ||
        invoiceTime > currentTime
      ) {
        current.lastPaymentDate =
          invoice.updated_at;
      }
    }

    grouped.set(customerId, current);
  }

  return customers.map((customer) => {
    const stats = grouped.get(customer.id);

    if (!stats) {
      return customer;
    }

    return {
      ...customer,
      revenue: stats.revenue,
      paid: stats.paid,
      outstanding: stats.outstanding,
      overdue: stats.overdue,
      totalInvoices:
        stats.totalInvoices,
      lastPaymentDate:
        stats.lastPaymentDate,
    };
  });
}

function riskLabel(
  risk: RiskLevel,
): string {
  if (risk === "high") {
    return "High";
  }

  if (risk === "medium") {
    return "Medium";
  }

  if (risk === "low") {
    return "Low";
  }

  return "Unknown";
}

function behaviorLabel(
  behavior: PaymentBehavior,
): string {
  if (behavior === "on_time") {
    return "On time";
  }

  if (
    behavior === "occasionally_late"
  ) {
    return "Occasionally late";
  }

  if (
    behavior === "frequently_late"
  ) {
    return "Frequently late";
  }

  return "Unknown";
}

function initials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  return (
    (parts[0]?.[0] ?? "C") +
    (parts[1]?.[0] ?? "")
  );
}

function normalizePriority(
  value: unknown,
): string {
  const normalized =
    text(value).toUpperCase();

  if (
    normalized === "HIGH" ||
    normalized === "MEDIUM" ||
    normalized === "LOW"
  ) {
    return normalized;
  }

  return normalized || "REVIEW";
}

function parseAIInsight(
  payload: unknown,
): AIInsight {
  const root =
    payload &&
    typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : {};

  let candidate =
    root.insight &&
    typeof root.insight === "object"
      ? (root.insight as Record<string, unknown>)
      : root;

  const nestedValues = [
    root.data,
    root.result,
    root.response,
    root.message,
    root.content,
  ];

  for (const value of nestedValues) {
    if (
      value &&
      typeof value === "object"
    ) {
      candidate =
        value as Record<string, unknown>;
      break;
    }
  }

  let title = text(candidate.title);

  let summary = text(
    candidate.summary ??
      candidate.explanation,
  );

  let recommendation = text(
    candidate.recommendation ??
      candidate.action,
  );

  let priority = text(
    candidate.priority ??
      candidate.risk_level ??
      candidate.riskLevel,
  );

  let confidence = text(
    candidate.confidence ??
      candidate.confidence_note,
  );

  const rawText =
    text(candidate.content) ||
    text(candidate.response) ||
    text(candidate.message);

  if (!summary && rawText) {
    try {
      const parsed =
        JSON.parse(rawText) as unknown;

      if (
        parsed &&
        typeof parsed === "object"
      ) {
        const object =
          parsed as Record<string, unknown>;

        title =
          text(object.title) ||
          title;

        summary =
          text(
            object.summary ??
              object.explanation,
          ) || summary;

        recommendation =
          text(
            object.recommendation ??
              object.action,
          ) || recommendation;

        priority =
          text(
            object.priority ??
              object.risk_level ??
              object.riskLevel,
          ) || priority;

        confidence =
          text(
            object.confidence ??
              object.confidence_note,
          ) || confidence;
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
      title || "Customer Intelligence",
    summary,
    recommendation:
      recommendation ||
      "Review the customer's current financial position and receivables exposure.",
    priority:
      normalizePriority(priority),
    confidence:
      confidence || undefined,
    raw: payload,
  };
}

export default function CustomersPage() {
  const [customers, setCustomers] =
    useState<Customer[]>([]);

  const [selected, setSelected] =
    useState<Customer | null>(null);

  const [query, setQuery] =
    useState("");

  const [statusFilter, setStatusFilter] =
    useState("all");

  const [riskFilter, setRiskFilter] =
    useState("all");

  const [behaviorFilter, setBehaviorFilter] =
    useState("all");

  const [sortBy, setSortBy] =
    useState("name");

  const [page, setPage] =
    useState(1);

  const [pageSize, setPageSize] =
    useState(10);

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [error, setError] =
    useState("");

  const [
    invoiceLoadWarning,
    setInvoiceLoadWarning,
  ] = useState("");

  const [addOpen, setAddOpen] =
    useState(false);

  const [saving, setSaving] =
    useState(false);

  const [saveError, setSaveError] =
    useState("");

  const [aiLoading, setAiLoading] =
    useState(false);

  const [aiError, setAiError] =
    useState("");

  const [aiInsight, setAiInsight] =
    useState<AIInsight | null>(null);

  const [form, setForm] =
    useState<CustomerPayload>({
      name: "",
      company: "",
      email: "",
      phone: "",
      city: "",
      state: "",
      gstin: "",
    });

  async function loadCustomers(
    showRefresh = false,
  ) {
    if (showRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError("");
    setInvoiceLoadWarning("");

    try {
      /*
       * Fetch the COMPLETE customer dataset.
       *
       * The backend only permits limit <= 100,
       * so fetchAllCustomers() automatically walks
       * through offset=0,100,200,...
       */
      const rawCustomers =
        await fetchAllCustomers();

      const normalizedCustomers =
        rawCustomers.map(
          (customer, index) =>
            normalizeCustomer(
              customer,
              index,
            ),
        );

      let enrichedCustomers =
        normalizedCustomers;

      /*
       * Customer page intentionally keeps invoice
       * enrichment. Invoice data is what provides:
       *
       * revenue
       * paid
       * outstanding
       * overdue
       * invoice count
       * last payment date
       */
      try {
        const invoiceRows =
          await fetchAllInvoices();

        enrichedCustomers =
          aggregateInvoices(
            normalizedCustomers,
            invoiceRows,
          );
      } catch (invoiceError) {
        console.warn(
          "[Customers] Invoice enrichment unavailable.",
          invoiceError,
        );

        setInvoiceLoadWarning(
          "Customer records loaded, but invoice-based financial totals could not be refreshed.",
        );
      }

      setCustomers(enrichedCustomers);
      setPage(1);
    } catch (err) {
      console.error(
        "[Customers] Failed to load customer data.",
        err,
      );

      setCustomers([]);

      setError(
        err instanceof Error
          ? err.message
          : "Unable to load customer data.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadCustomers();
  }, []);

  const metrics = useMemo(() => {
    const active =
      customers.filter(
        (customer) =>
          customer.status === "active",
      ).length;

    const outstanding =
      customers.reduce(
        (sum, customer) =>
          sum +
          (customer.outstanding ?? 0),
        0,
      );

    const overdue =
      customers.reduce(
        (sum, customer) =>
          sum +
          (customer.overdue ?? 0),
        0,
      );

    const highRisk =
      customers.filter(
        (customer) =>
          customer.risk === "high",
      ).length;

    const totalRevenue =
      customers.reduce(
        (sum, customer) =>
          sum +
          (customer.revenue ?? 0),
        0,
      );

    return {
      total: customers.length,
      active,
      outstanding,
      overdue,
      highRisk,
      totalRevenue,
    };
  }, [customers]);

  const filtered = useMemo(() => {
    const normalizedQuery =
      query.trim().toLowerCase();

    const rows =
      customers.filter((customer) => {
        const haystack = [
          customer.name,
          customer.company,
          customer.customerCode,
          customer.email,
          customer.phone,
          customer.city,
          customer.state,
          customer.gstin,
          customer.id,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        if (
          normalizedQuery &&
          !haystack.includes(
            normalizedQuery,
          )
        ) {
          return false;
        }

        if (
          statusFilter !== "all" &&
          customer.status !==
            statusFilter
        ) {
          return false;
        }

        if (
          riskFilter !== "all" &&
          customer.risk !==
            riskFilter
        ) {
          return false;
        }

        if (
          behaviorFilter !== "all" &&
          customer.paymentBehavior !==
            behaviorFilter
        ) {
          return false;
        }

        return true;
      });

    rows.sort((a, b) => {
      if (sortBy === "outstanding") {
        return (
          (b.outstanding ?? -1) -
          (a.outstanding ?? -1)
        );
      }

      if (sortBy === "overdue") {
        return (
          (b.overdue ?? -1) -
          (a.overdue ?? -1)
        );
      }

      if (sortBy === "revenue") {
        return (
          (b.revenue ?? -1) -
          (a.revenue ?? -1)
        );
      }

      return a.name.localeCompare(
        b.name,
      );
    });

    return rows;
  }, [
    customers,
    query,
    statusFilter,
    riskFilter,
    behaviorFilter,
    sortBy,
  ]);

  const totalPages = Math.max(
    1,
    Math.ceil(
      filtered.length / pageSize,
    ),
  );

  const safePage = Math.min(
    page,
    totalPages,
  );

  const paginated = filtered.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize,
  );

  useEffect(() => {
    if (page !== safePage) {
      setPage(safePage);
    }
  }, [page, safePage]);

  function clearFilters() {
    setQuery("");
    setStatusFilter("all");
    setRiskFilter("all");
    setBehaviorFilter("all");
    setSortBy("name");
    setPage(1);
  }

  function exportCsv() {
    if (!filtered.length) {
      return;
    }

    const headers = [
      "Customer",
      "Customer Code",
      "Company",
      "Email",
      "Phone",
      "City",
      "State",
      "GSTIN",
      "Credit Limit",
      "Payment Terms Days",
      "Revenue",
      "Outstanding",
      "Overdue",
      "Paid",
      "Total Invoices",
      "Risk",
      "Payment Behavior",
      "Status",
    ];

    const rows =
      filtered.map((customer) =>
        [
          customer.name,
          customer.customerCode ?? "",
          customer.company ?? "",
          customer.email ?? "",
          customer.phone ?? "",
          customer.city ?? "",
          customer.state ?? "",
          customer.gstin ?? "",
          customer.creditLimit ?? "",
          customer.paymentTermsDays ?? "",
          customer.revenue ?? "",
          customer.outstanding ?? "",
          customer.overdue ?? "",
          customer.paid ?? "",
          customer.totalInvoices ?? "",
          riskLabel(customer.risk),
          behaviorLabel(
            customer.paymentBehavior,
          ),
          customer.status,
        ]
          .map(
            (value) =>
              `"${String(value).replaceAll(
                '"',
                '""',
              )}"`,
          )
          .join(","),
      );

    const blob = new Blob(
      [
        [
          headers.join(","),
          ...rows,
        ].join("\n"),
      ],
      {
        type: "text/csv;charset=utf-8;",
      },
    );

    const url =
      URL.createObjectURL(blob);

    const anchor =
      document.createElement("a");

    anchor.href = url;
    anchor.download =
      "cashguard-customers.csv";

    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    URL.revokeObjectURL(url);
  }

  async function generateCustomerAIInsight(
    customer: Customer,
  ) {
    setAiLoading(true);
    setAiError("");
    setAiInsight(null);

    try {
      const intelligence = {
        business_id:
          customer.businessId ?? null,

        customer: {
          id: customer.id,
          customer_code:
            customer.customerCode ?? null,
          name: customer.name,
          company:
            customer.company ?? null,
          email:
            customer.email ?? null,
          phone:
            customer.phone ?? null,
          city:
            customer.city ?? null,
          state:
            customer.state ?? null,
          gstin:
            customer.gstin ?? null,
          credit_limit:
            customer.creditLimit ?? null,
          payment_terms_days:
            customer.paymentTermsDays ??
            null,
          status:
            customer.status,
          risk_segment:
            customer.risk,
          payment_behavior:
            customer.paymentBehavior,
          created_at:
            customer.createdAt ?? null,
          updated_at:
            customer.updatedAt ?? null,
        },

        financials: {
          revenue:
            customer.revenue ?? null,
          paid:
            customer.paid ?? null,
          outstanding:
            customer.outstanding ?? null,
          overdue:
            customer.overdue ?? null,
          total_invoices:
            customer.totalInvoices ?? null,
          last_payment_date:
            customer.lastPaymentDate ??
            null,
        },

        source:
          "live_cashguard_customer_page",
      };

      const response =
        await apiRequest<unknown>(
          "/ai/insight/customer",
          {
            method: "POST",
            body: JSON.stringify({
              intelligence,
            }),
          },
        );

      const insight =
        parseAIInsight(response);

      setAiInsight(insight);
    } catch (err) {
      console.error(
        "[Customers] AI insight failed.",
        err,
      );

      setAiError(
        err instanceof Error
          ? err.message
          : "Unable to generate customer AI insight.",
      );
    } finally {
      setAiLoading(false);
    }
  }

  async function submitCustomer(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!form.name.trim()) {
      setSaveError(
        "Customer name is required.",
      );
      return;
    }

    setSaving(true);
    setSaveError("");

    try {
      await apiRequest(
        "/api/customers",
        {
          method: "POST",
          body: JSON.stringify({
            name: form.name.trim(),
            company:
              form.company?.trim() ||
              undefined,
            email:
              form.email?.trim() ||
              undefined,
            phone:
              form.phone?.trim() ||
              undefined,
            city:
              form.city?.trim() ||
              undefined,
            state:
              form.state?.trim() ||
              undefined,
            gstin:
              form.gstin?.trim() ||
              undefined,
          }),
        },
      );

      setAddOpen(false);

      setForm({
        name: "",
        company: "",
        email: "",
        phone: "",
        city: "",
        state: "",
        gstin: "",
      });

      await loadCustomers();
    } catch (err) {
      console.error(
        "[Customers] Failed to create customer.",
        err,
      );

      setSaveError(
        err instanceof Error
          ? err.message
          : "Unable to create the customer.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="customers-page w-full space-y-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-sky-600">
            Customer intelligence · Live
          </p>

          <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-950">
            Customers
          </h2>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            Monitor real customer
            relationships, receivables,
            payment exposure and
            AI-powered customer
            intelligence.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="secondary-button"
            onClick={() =>
              void loadCustomers(true)
            }
            disabled={refreshing}
          >
            <RefreshCw
              size={14}
              className={
                refreshing
                  ? "animate-spin"
                  : ""
              }
            />
            {refreshing
              ? "Refreshing..."
              : "Refresh"}
          </button>

          <button
            type="button"
            className="secondary-button"
            onClick={exportCsv}
            disabled={!filtered.length}
          >
            <Download size={14} />
            Export
          </button>

          <button
            type="button"
            className="primary-button"
            onClick={() =>
              setAddOpen(true)
            }
          >
            <Plus size={14} />
            Add customer
          </button>
        </div>
      </div>

      {invoiceLoadWarning ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
          {invoiceLoadWarning}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <MetricCard
          label="Total customers"
          value={formatNumber(
            metrics.total,
          )}
          icon={<Users size={15} />}
        />

        <MetricCard
          label="Active customers"
          value={formatNumber(
            metrics.active,
          )}
          icon={
            <ShieldCheck size={15} />
          }
        />

        <MetricCard
          label="Receivables"
          value={money(
            metrics.outstanding,
          )}
          icon={
            <CircleDollarSign
              size={15}
            />
          }
          warning={
            metrics.outstanding > 0
          }
        />

        <MetricCard
          label="Overdue"
          value={money(metrics.overdue)}
          icon={<Clock3 size={15} />}
          warning={metrics.overdue > 0}
        />

        <MetricCard
          label="High risk"
          value={formatNumber(
            metrics.highRisk,
          )}
          icon={
            <AlertCircle size={15} />
          }
          warning={metrics.highRisk > 0}
        />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-col gap-2 xl:flex-row xl:items-center">
          <div className="relative min-w-0 flex-1">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />

            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              placeholder="Search customer, company, email, phone or GSTIN"
              className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-xs text-slate-800 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(
                event.target.value,
              );
              setPage(1);
            }}
            className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700 outline-none"
          >
            <option value="all">
              All statuses
            </option>
            <option value="active">
              Active
            </option>
            <option value="inactive">
              Inactive
            </option>
          </select>

          <select
            value={riskFilter}
            onChange={(event) => {
              setRiskFilter(
                event.target.value,
              );
              setPage(1);
            }}
            className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700 outline-none"
          >
            <option value="all">
              All risks
            </option>
            <option value="high">
              High risk
            </option>
            <option value="medium">
              Medium risk
            </option>
            <option value="low">
              Low risk
            </option>
            <option value="unknown">
              Unknown
            </option>
          </select>

          <select
            value={behaviorFilter}
            onChange={(event) => {
              setBehaviorFilter(
                event.target.value,
              );
              setPage(1);
            }}
            className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700 outline-none"
          >
            <option value="all">
              All behavior
            </option>
            <option value="on_time">
              On time
            </option>
            <option value="occasionally_late">
              Occasionally late
            </option>
            <option value="frequently_late">
              Frequently late
            </option>
            <option value="unknown">
              Unknown
            </option>
          </select>

          <select
            value={sortBy}
            onChange={(event) =>
              setSortBy(
                event.target.value,
              )
            }
            className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700 outline-none"
          >
            <option value="name">
              Sort: Name
            </option>
            <option value="outstanding">
              Sort: Outstanding
            </option>
            <option value="overdue">
              Sort: Overdue
            </option>
            <option value="revenue">
              Sort: Revenue
            </option>
          </select>

          <button
            type="button"
            className="secondary-button"
            onClick={clearFilters}
          >
            <Filter size={14} />
            Reset
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-5">
          <div className="flex items-start gap-3">
            <AlertCircle
              className="mt-0.5 text-red-600"
              size={18}
            />

            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold text-red-900">
                Unable to load customer data
              </h3>

              <p className="mt-1 text-xs leading-5 text-red-700">
                {error}
              </p>

              <button
                type="button"
                onClick={() =>
                  void loadCustomers()
                }
                className="mt-3 inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700"
              >
                <RefreshCw size={13} />
                Retry
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-2 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Customer register
            </h3>

            <p className="mt-1 text-xs text-slate-500">
              {filtered.length
                ? `${formatNumber(
                    filtered.length,
                  )} customer records`
                : "No customer records"}{" "}
              matching current filters.
            </p>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <TrendingUp size={14} />
            {money(
              metrics.totalRevenue,
            )}{" "}
            tracked revenue
          </div>
        </div>

        {loading ? (
          <div className="divide-y divide-slate-100">
            {Array.from({ length: 7 }).map(
              (_, index) => (
                <div
                  key={index}
                  className="grid grid-cols-[1.4fr_1fr_0.8fr_0.8fr_0.8fr_auto] gap-4 px-5 py-4"
                >
                  {Array.from({
                    length: 6,
                  }).map(
                    (_, innerIndex) => (
                      <div
                        key={
                          innerIndex
                        }
                        className="h-4 animate-pulse rounded bg-slate-100"
                      />
                    ),
                  )}
                </div>
              ),
            )}
          </div>
        ) : paginated.length ? (
          <>
            <div className="hidden min-w-[900px] grid-cols-[1.4fr_1.1fr_0.85fr_0.85fr_0.8fr_0.8fr_auto] items-center gap-4 bg-slate-50 px-5 py-3 text-[9px] font-extrabold uppercase tracking-[0.1em] text-slate-400 lg:grid">
              <span>Customer</span>
              <span>Contact</span>
              <span>Revenue</span>
              <span>Outstanding</span>
              <span>Overdue</span>
              <span>Risk</span>
              <span />
            </div>

            <div className="divide-y divide-slate-100">
              {paginated.map(
                (customer) => (
                  <button
                    key={customer.id}
                    type="button"
                    onClick={() => {
                      setSelected(
                        customer,
                      );
                      setAiInsight(null);
                      setAiError("");
                    }}
                    className="grid w-full grid-cols-1 gap-4 px-5 py-4 text-left transition hover:bg-slate-50 lg:grid-cols-[1.4fr_1.1fr_0.85fr_0.85fr_0.8fr_0.8fr_auto] lg:items-center"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-sky-50 text-[11px] font-bold text-sky-700">
                        {initials(
                          customer.name,
                        )
                          .slice(0, 2)
                          .toUpperCase()}
                      </div>

                      <div className="min-w-0">
                        <strong className="block truncate text-xs font-semibold text-slate-900">
                          {customer.name}
                        </strong>

                        <span className="mt-1 block truncate text-[10px] text-slate-400">
                          {customer.company ||
                            customer.customerCode ||
                            customer.id}
                        </span>
                      </div>
                    </div>

                    <div className="grid gap-1 lg:block">
                      <span className="text-[10px] text-slate-400 lg:hidden">
                        Contact
                      </span>

                      <span className="block truncate text-[11px] text-slate-600">
                        {customer.email ||
                          customer.phone ||
                          "—"}
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-400 lg:hidden">
                        Revenue
                      </span>

                      <strong className="block text-xs font-semibold text-slate-800">
                        {money(
                          customer.revenue,
                        )}
                      </strong>
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-400 lg:hidden">
                        Outstanding
                      </span>

                      <strong className="block text-xs font-semibold text-slate-800">
                        {money(
                          customer.outstanding,
                        )}
                      </strong>
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-400 lg:hidden">
                        Overdue
                      </span>

                      <strong
                        className={`block text-xs font-semibold ${
                          customer.overdue &&
                          customer.overdue > 0
                            ? "text-amber-700"
                            : "text-slate-800"
                        }`}
                      >
                        {money(
                          customer.overdue,
                        )}
                      </strong>
                    </div>

                    <div className="flex items-center justify-between lg:block">
                      <RiskBadge
                        risk={
                          customer.risk
                        }
                      />

                      <span className="mt-2 hidden text-[10px] text-slate-400 lg:block">
                        {behaviorLabel(
                          customer.paymentBehavior,
                        )}
                      </span>
                    </div>

                    <MoreHorizontal
                      size={16}
                      className="hidden text-slate-400 lg:block"
                    />
                  </button>
                ),
              )}
            </div>
          </>
        ) : (
          <div className="px-6 py-16 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-sky-50 text-sky-600">
              <Users size={22} />
            </div>

            <h3 className="mt-4 text-sm font-semibold text-slate-900">
              {customers.length
                ? "No customers match your filters"
                : "No customers available"}
            </h3>

            <p className="mx-auto mt-2 max-w-md text-xs leading-5 text-slate-500">
              {customers.length
                ? "Reset the filters or try a broader search."
                : "No fake customer data is used. Records are loaded from the live API."}
            </p>

            <button
              type="button"
              onClick={clearFilters}
              className="secondary-button mx-auto mt-4"
            >
              Reset filters
            </button>
          </div>
        )}

        <div className="flex flex-col gap-3 border-t border-slate-200 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-[10px] text-slate-500">
            Showing{" "}
            {filtered.length
              ? (safePage - 1) *
                  pageSize +
                1
              : 0}
            –
            {Math.min(
              safePage * pageSize,
              filtered.length,
            )}{" "}
            of {filtered.length}
          </div>

          <div className="flex items-center gap-2">
            <select
              value={pageSize}
              onChange={(event) => {
                setPageSize(
                  Number(
                    event.target.value,
                  ),
                );
                setPage(1);
              }}
              className="h-8 rounded-md border border-slate-200 bg-white px-2 text-[10px] text-slate-600"
            >
              <option value={10}>
                10 / page
              </option>
              <option value={20}>
                20 / page
              </option>
              <option value={50}>
                50 / page
              </option>
            </select>

            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() =>
                setPage(
                  (current) =>
                    Math.max(
                      1,
                      current - 1,
                    ),
                )
              }
              className="grid h-8 w-8 place-items-center rounded-md border border-slate-200 bg-white text-slate-500 disabled:opacity-40"
            >
              <ChevronLeft size={14} />
            </button>

            <span className="min-w-16 text-center text-[10px] font-semibold text-slate-600">
              {safePage} / {totalPages}
            </span>

            <button
              type="button"
              disabled={
                safePage >= totalPages
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
              className="grid h-8 w-8 place-items-center rounded-md border border-slate-200 bg-white text-slate-500 disabled:opacity-40"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {selected ? (
        <div
          className="fixed inset-0 z-[70] flex justify-end bg-slate-950/35"
          onMouseDown={(event) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              setSelected(null);
            }
          }}
        >
          <aside className="h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-sky-600">
                  Live customer profile
                </p>

                <h3 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-slate-950">
                  {selected.name}
                </h3>

                <p className="mt-1 text-xs text-slate-500">
                  {selected.company ||
                    selected.customerCode ||
                    selected.id}
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setSelected(null)
                }
                className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <DetailStat
                label="Revenue"
                value={money(
                  selected.revenue,
                )}
              />

              <DetailStat
                label="Outstanding"
                value={money(
                  selected.outstanding,
                )}
              />

              <DetailStat
                label="Overdue"
                value={money(
                  selected.overdue,
                )}
              />

              <DetailStat
                label="Paid"
                value={money(
                  selected.paid,
                )}
              />

              <DetailStat
                label="Credit limit"
                value={money(
                  selected.creditLimit,
                )}
              />

              <DetailStat
                label="Invoices"
                value={formatNumber(
                  selected.totalInvoices,
                )}
              />
            </div>

            <div className="mt-6 rounded-xl border border-slate-200 p-4">
              <div className="flex items-center gap-2">
                <UserRound
                  size={15}
                  className="text-sky-600"
                />

                <h4 className="text-xs font-semibold text-slate-900">
                  Contact
                </h4>
              </div>

              <div className="mt-4 grid gap-3">
                <InfoRow
                  icon={<Mail size={14} />}
                  label="Email"
                  value={
                    selected.email ||
                    "—"
                  }
                />

                <InfoRow
                  icon={<Phone size={14} />}
                  label="Phone"
                  value={
                    selected.phone ||
                    "—"
                  }
                />

                <InfoRow
                  icon={
                    <Building2 size={14} />
                  }
                  label="Location"
                  value={
                    [
                      selected.city,
                      selected.state,
                    ]
                      .filter(Boolean)
                      .join(", ") || "—"
                  }
                />

                <InfoRow
                  icon={
                    <ShieldCheck size={14} />
                  }
                  label="GSTIN"
                  value={
                    selected.gstin ||
                    "—"
                  }
                />

                <InfoRow
                  icon={<Clock3 size={14} />}
                  label="Payment terms"
                  value={
                    selected.paymentTermsDays !==
                      null &&
                    selected.paymentTermsDays !==
                      undefined
                      ? `${selected.paymentTermsDays} days`
                      : "—"
                  }
                />
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-slate-200 p-4">
              <h4 className="text-xs font-semibold text-slate-900">
                Financial health
              </h4>

              <div className="mt-4 grid gap-3 text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">
                    Risk
                  </span>

                  <RiskBadge
                    risk={selected.risk}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-500">
                    Payment behavior
                  </span>

                  <span className="font-semibold text-slate-700">
                    {behaviorLabel(
                      selected.paymentBehavior,
                    )}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-500">
                    Status
                  </span>

                  <span className="font-semibold capitalize text-slate-700">
                    {selected.status}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-500">
                    Total invoices
                  </span>

                  <span className="font-semibold text-slate-700">
                    {formatNumber(
                      selected.totalInvoices,
                    )}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-500">
                    Last payment
                  </span>

                  <span className="font-semibold text-slate-700">
                    {selected.lastPaymentDate ||
                      "—"}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Sparkles
                      size={15}
                      className="text-sky-600"
                    />

                    <h4 className="text-xs font-semibold text-slate-900">
                      Customer AI Intelligence
                    </h4>
                  </div>

                  <p className="mt-1 text-[10px] leading-5 text-slate-500">
                    Analyse the real
                    customer data
                    currently loaded
                    from CashGuard-AI.
                  </p>
                </div>

                <button
                  type="button"
                  className="secondary-button"
                  disabled={aiLoading}
                  onClick={() =>
                    void generateCustomerAIInsight(
                      selected,
                    )
                  }
                >
                  <Sparkles
                    size={13}
                    className={
                      aiLoading
                        ? "animate-spin"
                        : ""
                    }
                  />

                  {aiLoading
                    ? "Analysing..."
                    : "Analyse"}
                </button>
              </div>

              {aiError ? (
                <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] leading-5 text-red-700">
                  {aiError}
                </div>
              ) : null}

              {aiInsight ? (
                <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="inline-flex rounded-full border border-sky-100 bg-sky-50 px-2 py-1 text-[9px] font-bold text-sky-700">
                        Live AI insight
                      </span>

                      <h5 className="mt-2 text-sm font-semibold text-slate-900">
                        {aiInsight.title}
                      </h5>
                    </div>

                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[9px] font-bold text-slate-600">
                      {aiInsight.priority}
                    </span>
                  </div>

                  <p className="mt-3 text-xs leading-5 text-slate-600">
                    {aiInsight.summary}
                  </p>

                  <div className="mt-4 rounded-lg bg-slate-50 p-3">
                    <span className="block text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                      Recommendation
                    </span>

                    <p className="mt-1 text-xs leading-5 text-slate-700">
                      {aiInsight.recommendation}
                    </p>
                  </div>

                  {aiInsight.confidence ? (
                    <p className="mt-3 text-[10px] text-slate-400">
                      Confidence:{" "}
                      <span className="font-semibold text-slate-600">
                        {aiInsight.confidence}
                      </span>
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="mt-6 grid gap-2 sm:grid-cols-2">
              <a
                href="/invoices"
                className="secondary-button justify-center"
              >
                <Eye size={14} />
                View invoices
              </a>

              <button
                type="button"
                onClick={() =>
                  setSelected(null)
                }
                className="primary-button justify-center"
              >
                Close
              </button>
            </div>
          </aside>
        </div>
      ) : null}

      {addOpen ? (
        <div
          className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/35 p-4"
          onMouseDown={(event) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              setAddOpen(false);
            }
          }}
        >
          <form
            onSubmit={submitCustomer}
            className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-sky-600">
                  Customer onboarding
                </p>

                <h3 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-slate-950">
                  Add customer
                </h3>
              </div>

              <button
                type="button"
                onClick={() =>
                  setAddOpen(false)
                }
                className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field
                label="Customer name *"
                className="sm:col-span-2"
              >
                <input
                  required
                  value={form.name}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      name: event.target.value,
                    })
                  }
                />
              </Field>

              <Field label="Company">
                <input
                  value={form.company ?? ""}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      company:
                        event.target.value,
                    })
                  }
                />
              </Field>

              <Field label="GSTIN">
                <input
                  value={form.gstin ?? ""}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      gstin: event.target.value,
                    })
                  }
                />
              </Field>

              <Field label="Email">
                <input
                  type="email"
                  value={form.email ?? ""}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      email: event.target.value,
                    })
                  }
                />
              </Field>

              <Field label="Phone">
                <input
                  value={form.phone ?? ""}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      phone:
                        event.target.value,
                    })
                  }
                />
              </Field>

              <Field label="City">
                <input
                  value={form.city ?? ""}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      city:
                        event.target.value,
                    })
                  }
                />
              </Field>

              <Field label="State">
                <input
                  value={form.state ?? ""}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      state:
                        event.target.value,
                    })
                  }
                />
              </Field>
            </div>

            {saveError ? (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {saveError}
              </div>
            ) : null}

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="secondary-button"
                onClick={() =>
                  setAddOpen(false)
                }
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={saving}
                className="primary-button disabled:opacity-60"
              >
                {saving
                  ? "Saving..."
                  : "Create customer"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}

function MetricCard({
  label,
  value,
  icon,
  warning = false,
}: {
  label: string;
  value: string;
  icon: ReactNode;
  warning?: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between text-[10px] font-semibold text-slate-500">
        <span>{label}</span>

        <span
          className={
            warning
              ? "text-amber-600"
              : "text-sky-600"
          }
        >
          {icon}
        </span>
      </div>

      <strong className="mt-4 block text-xl font-semibold tracking-[-0.04em] text-slate-950">
        {value}
      </strong>
    </div>
  );
}

function RiskBadge({
  risk,
}: {
  risk: RiskLevel;
}) {
  const classes =
    risk === "high"
      ? "bg-red-50 text-red-700 border-red-100"
      : risk === "medium"
        ? "bg-amber-50 text-amber-700 border-amber-100"
        : risk === "low"
          ? "bg-emerald-50 text-emerald-700 border-emerald-100"
          : "bg-slate-100 text-slate-600 border-slate-200";

  return (
    <span
      className={`inline-flex rounded-full border px-2 py-1 text-[9px] font-bold ${classes}`}
    >
      {riskLabel(risk)}
    </span>
  );
}

function DetailStat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <span className="block text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-400">
        {label}
      </span>

      <strong className="mt-2 block text-sm font-semibold text-slate-900">
        {value}
      </strong>
    </div>
  );
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 text-sky-600">
        {icon}
      </span>

      <div className="min-w-0">
        <span className="block text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-400">
          {label}
        </span>

        <strong className="mt-1 block break-words text-[11px] font-medium text-slate-700">
          {value}
        </strong>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label
      className={`grid gap-1.5 text-xs font-semibold text-slate-700 ${className}`}
    >
      <span>{label}</span>

      <div className="[&>input]:h-10 [&>input]:w-full [&>input]:rounded-lg [&>input]:border [&>input]:border-slate-200 [&>input]:bg-white [&>input]:px-3 [&>input]:text-xs [&>input]:font-normal [&>input]:text-slate-800 [&>input]:outline-none [&>input]:focus:border-sky-400 [&>input]:focus:ring-4 [&>input]:focus:ring-sky-100">
        {children}
      </div>
    </label>
  );
}