"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import type { ReactNode } from "react";

import Link from "next/link";

import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Bell,
  Check,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileText,
  Filter,
  Info,
  Loader2,
  MoreHorizontal,
  RefreshCw,
  Search,
  ShieldAlert,
  Wallet,
  X,
} from "lucide-react";

/* ============================================================================
 * TYPES
 * ========================================================================== */

type ApiRecord = Record<string, unknown>;

type AlertSeverity =
  | "critical"
  | "high"
  | "medium"
  | "low"
  | "info"
  | "unknown";

type NormalizedStatus =
  | "unread"
  | "read"
  | "active"
  | "resolved"
  | "dismissed"
  | "unknown";

type AlertItem = {
  id: string;

  title: string;
  message: string;

  severity: AlertSeverity;
  status: NormalizedStatus;

  category: string;
  source: string;

  createdAt: string | null;
  updatedAt: string | null;

  businessId: string | null;

  invoiceId: string | null;
  invoiceNumber: string | null;

  customerId: string | null;
  customerName: string | null;

  amount: number | null;
  currency: string;

  isRead: boolean;
  isResolved: boolean;

  actionUrl: string | null;

  raw: ApiRecord;
};

type AlertFilter =
  | "all"
  | AlertSeverity;

type StatusFilter =
  | "all"
  | NormalizedStatus;

type SortMode =
  | "newest"
  | "oldest"
  | "severity";

/* ============================================================================
 * API CONFIGURATION
 * ========================================================================== */

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL ||
  "http://127.0.0.1:8000"
).replace(/\/+$/, "");

const DEFAULT_BUSINESS_ID = (
  process.env.NEXT_PUBLIC_BUSINESS_ID || ""
).trim();

const AUTH_TOKEN_KEYS = [
  "access_token",
  "accessToken",
  "token",
  "auth_token",
  "jwt_token",
  "jwt",
  "cashguard_access_token",
  "cashguard_token",
] as const;

const AUTH_OBJECT_KEYS = [
  "auth",
  "session",
  "authData",
  "auth_data",
  "currentUser",
  "current_user",
  "userSession",
  "cashguard_session",
] as const;

const BUSINESS_ID_KEYS = [
  "business_id",
  "businessId",
  "cashguard_business_id",
] as const;

/* ============================================================================
 * GENERIC HELPERS
 * ========================================================================== */

function isRecord(
  value: unknown,
): value is ApiRecord {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function stringValue(
  value: unknown,
): string {
  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "number") {
    return String(value);
  }

  return "";
}

function nullableString(
  value: unknown,
): string | null {
  const result = stringValue(value);
  return result || null;
}

function numberValue(
  value: unknown,
): number | null {
  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return value;
  }

  if (typeof value === "string") {
    const cleaned = value
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

  return null;
}

function firstValue(
  record: ApiRecord,
  keys: string[],
): unknown {
  for (const key of keys) {
    if (
      key in record &&
      record[key] !== null &&
      record[key] !== undefined
    ) {
      return record[key];
    }
  }

  return null;
}

/* ============================================================================
 * AUTHENTICATION
 * ========================================================================== */

function cleanToken(
  value: unknown,
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const token = value
    .trim()
    .replace(/^Bearer\s+/i, "")
    .trim();

  return token || null;
}

function extractToken(
  value: unknown,
): string | null {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    const direct = cleanToken(value);

    if (direct) {
      return direct;
    }

    try {
      const parsed = JSON.parse(value);
      return extractToken(parsed);
    } catch {
      return null;
    }
  }

  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    return null;
  }

  const object =
    value as Record<string, unknown>;

  const directKeys = [
    "access_token",
    "accessToken",
    "token",
    "jwt",
    "jwt_token",
    "cashguard_access_token",
    "cashguard_token",
  ];

  for (const key of directKeys) {
    const token = cleanToken(object[key]);

    if (token) {
      return token;
    }
  }

  const nestedKeys = [
    "data",
    "auth",
    "session",
    "tokens",
    "credentials",
    "user",
  ];

  for (const key of nestedKeys) {
    const token = extractToken(object[key]);

    if (token) {
      return token;
    }
  }

  return null;
}

function getAuthToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const storages = [
    window.localStorage,
    window.sessionStorage,
  ];

  for (const storage of storages) {
    for (const key of AUTH_TOKEN_KEYS) {
      try {
        const token = extractToken(
          storage.getItem(key),
        );

        if (token) {
          return token;
        }
      } catch {
        // Ignore storage access failures.
      }
    }
  }

  for (const storage of storages) {
    for (const key of AUTH_OBJECT_KEYS) {
      try {
        const token = extractToken(
          storage.getItem(key),
        );

        if (token) {
          return token;
        }
      } catch {
        // Ignore storage access failures.
      }
    }
  }

  return null;
}

function getBusinessId(): string {
  if (typeof window === "undefined") {
    return DEFAULT_BUSINESS_ID;
  }

  const storages = [
    window.localStorage,
    window.sessionStorage,
  ];

  for (const storage of storages) {
    for (const key of BUSINESS_ID_KEYS) {
      try {
        const value =
          storage.getItem(key)?.trim();

        if (value) {
          return value;
        }
      } catch {
        // Ignore storage access failures.
      }
    }
  }

  return DEFAULT_BUSINESS_ID;
}

/* ============================================================================
 * API ERROR
 * ========================================================================== */

class CashGuardApiError extends Error {
  readonly status: number;
  readonly endpoint: string;
  readonly payload: unknown;

  constructor(
    message: string,
    status: number,
    endpoint: string,
    payload: unknown = null,
  ) {
    super(message);

    this.name = "CashGuardApiError";
    this.status = status;
    this.endpoint = endpoint;
    this.payload = payload;

    Object.setPrototypeOf(
      this,
      CashGuardApiError.prototype,
    );
  }
}

/* ============================================================================
 * API RESPONSE HELPERS
 * ========================================================================== */

function extractErrorMessage(
  body: unknown,
  fallback: string,
): string {
  if (
    typeof body === "string" &&
    body.trim()
  ) {
    return body.trim();
  }

  if (isRecord(body)) {
    const directMessage =
      stringValue(body.message) ||
      stringValue(body.error);

    if (directMessage) {
      return directMessage;
    }

    if (typeof body.detail === "string") {
      return body.detail;
    }

    if (Array.isArray(body.detail)) {
      const messages = body.detail
        .map((item) => {
          if (isRecord(item)) {
            return (
              stringValue(item.msg) ||
              stringValue(item.message)
            );
          }

          return stringValue(item);
        })
        .filter(Boolean);

      if (messages.length > 0) {
        return messages.join(", ");
      }
    }
  }

  return fallback;
}

function unwrapResponse(
  body: unknown,
): unknown {
  if (!isRecord(body)) {
    return body;
  }

  const candidates = [
    body.data,
    body.items,
    body.results,
    body.alerts,
    body.records,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  return body;
}

function extractRows(
  body: unknown,
): unknown[] {
  const unwrapped = unwrapResponse(body);

  if (Array.isArray(unwrapped)) {
    return unwrapped;
  }

  if (isRecord(unwrapped)) {
    const candidates = [
      unwrapped.data,
      unwrapped.items,
      unwrapped.results,
      unwrapped.alerts,
      unwrapped.records,
    ];

    for (const candidate of candidates) {
      if (Array.isArray(candidate)) {
        return candidate;
      }
    }
  }

  return [];
}

/* ============================================================================
 * API FETCH
 * ========================================================================== */

async function apiFetch<T = unknown>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getAuthToken();

  if (
    !token &&
    typeof window !== "undefined"
  ) {
    window.dispatchEvent(
      new Event(
        "cashguard-auth-required",
      ),
    );

    throw new CashGuardApiError(
      "Authentication required. Please sign in again.",
      401,
      endpoint,
    );
  }

  const headers = new Headers(
    options.headers || {},
  );

  headers.set(
    "Accept",
    "application/json",
  );

  if (
    options.body &&
    !(options.body instanceof FormData) &&
    !headers.has("Content-Type")
  ) {
    headers.set(
      "Content-Type",
      "application/json",
    );
  }

  headers.set(
    "Authorization",
    `Bearer ${token}`,
  );

  const url =
    `${API_BASE_URL}${endpoint}`;

  let response: Response;

  try {
    response = await fetch(
      url,
      {
        ...options,
        method:
          options.method || "GET",
        headers,
        credentials: "include",
        cache: "no-store",
      },
    );
  } catch {
    throw new CashGuardApiError(
      `Unable to connect to CashGuard-AI backend at ${API_BASE_URL}. Make sure FastAPI is running.`,
      0,
      endpoint,
    );
  }

  const contentType =
    response.headers.get(
      "content-type",
    ) || "";

  let body: unknown = null;

  try {
    if (
      contentType
        .toLowerCase()
        .includes("application/json")
    ) {
      body = await response.json();
    } else {
      body = await response.text();
    }
  } catch {
    body = null;
  }

  if (!response.ok) {
    if (
      response.status === 401 &&
      typeof window !== "undefined"
    ) {
      window.dispatchEvent(
        new Event(
          "cashguard-auth-expired",
        ),
      );
    }

    throw new CashGuardApiError(
      extractErrorMessage(
        body,
        `API request failed with status ${response.status}.`,
      ),
      response.status,
      endpoint,
      body,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return body as T;
}

/* ============================================================================
 * NORMALIZATION
 * ========================================================================== */

function normalizeSeverity(
  value: unknown,
): AlertSeverity {
  const normalized = stringValue(
    value,
  ).toLowerCase();

  if (
    ["critical", "urgent"].includes(
      normalized,
    )
  ) {
    return "critical";
  }

  if (
    ["high", "danger", "error"].includes(
      normalized,
    )
  ) {
    return "high";
  }

  if (
    [
      "medium",
      "warning",
      "warn",
    ].includes(normalized)
  ) {
    return "medium";
  }

  if (normalized === "low") {
    return "low";
  }

  if (
    ["info", "information"].includes(
      normalized,
    )
  ) {
    return "info";
  }

  return "unknown";
}

function booleanValue(
  value: unknown,
): boolean {
  if (
    value === true ||
    value === 1
  ) {
    return true;
  }

  if (typeof value === "string") {
    return [
      "true",
      "1",
      "yes",
      "read",
    ].includes(
      value.trim().toLowerCase(),
    );
  }

  return false;
}

function normalizeStatus(
  record: ApiRecord,
  isRead: boolean,
  isResolved: boolean,
): NormalizedStatus {
  const raw = stringValue(
    firstValue(record, [
      "status",
      "state",
    ]),
  ).toLowerCase();

  if (
    [
      "resolved",
      "closed",
      "complete",
      "completed",
    ].includes(raw)
  ) {
    return "resolved";
  }

  if (
    [
      "dismissed",
      "ignored",
      "archived",
    ].includes(raw)
  ) {
    return "dismissed";
  }

  if (isResolved) {
    return "resolved";
  }

  if (
    raw === "active" ||
    raw === "open"
  ) {
    return isRead ? "read" : "unread";
  }

  if (raw === "read") {
    return "read";
  }

  if (
    raw === "unread" ||
    raw === "new"
  ) {
    return "unread";
  }

  return isRead ? "read" : "unread";
}

function normalizeAlert(
  value: unknown,
  index: number,
): AlertItem | null {
  if (!isRecord(value)) {
    return null;
  }

  const id =
    stringValue(
      firstValue(value, [
        "id",
        "alert_id",
        "alertId",
        "uuid",
      ]),
    ) || `alert-${index + 1}`;

  const title =
    stringValue(
      firstValue(value, [
        "title",
        "name",
        "headline",
        "subject",
      ]),
    ) || "Business alert";

  const message =
    stringValue(
      firstValue(value, [
        "message",
        "description",
        "body",
        "details",
        "reason",
      ]),
    ) ||
    "This alert requires your attention.";

  const severity =
    normalizeSeverity(
      firstValue(value, [
        "severity",
        "priority",
        "level",
        "risk_level",
        "riskLevel",
      ]),
    );

  const isRead =
    booleanValue(
      firstValue(value, [
        "is_read",
        "isRead",
        "read",
      ]),
    );

  const isResolved =
    booleanValue(
      firstValue(value, [
        "is_resolved",
        "isResolved",
        "resolved",
      ]),
    );

  const status =
    normalizeStatus(
      value,
      isRead,
      isResolved,
    );

  const category =
    stringValue(
      firstValue(value, [
        "category",
        "alert_type",
        "alertType",
        "type",
        "domain",
      ]),
    ) || "General";

  const source =
    stringValue(
      firstValue(value, [
        "source",
        "origin",
        "service",
      ]),
    ) || "CashGuard-AI";

  return {
    id,
    title,
    message,
    severity,
    status,
    category,
    source,

    createdAt:
      nullableString(
        firstValue(value, [
          "created_at",
          "createdAt",
          "timestamp",
          "date",
        ]),
      ),

    updatedAt:
      nullableString(
        firstValue(value, [
          "updated_at",
          "updatedAt",
        ]),
      ),

    businessId:
      nullableString(
        firstValue(value, [
          "business_id",
          "businessId",
        ]),
      ),

    invoiceId:
      nullableString(
        firstValue(value, [
          "invoice_id",
          "invoiceId",
        ]),
      ),

    invoiceNumber:
      nullableString(
        firstValue(value, [
          "invoice_number",
          "invoiceNumber",
        ]),
      ),

    customerId:
      nullableString(
        firstValue(value, [
          "customer_id",
          "customerId",
        ]),
      ),

    customerName:
      nullableString(
        firstValue(value, [
          "customer_name",
          "customerName",
          "customer",
        ]),
      ),

    amount:
      numberValue(
        firstValue(value, [
          "amount",
          "invoice_amount",
          "invoiceAmount",
          "impact_amount",
          "impactAmount",
          "value",
        ]),
      ),

    currency:
      stringValue(
        firstValue(value, [
          "currency",
        ]),
      ) || "INR",

    isRead,
    isResolved,

    actionUrl:
      nullableString(
        firstValue(value, [
          "action_url",
          "actionUrl",
          "url",
          "link",
        ]),
      ),

    raw: {
      ...value,
      __index: index,
    },
  };
}

/* ============================================================================
 * DISPLAY HELPERS
 * ========================================================================== */

function formatCurrency(
  value: number | null,
  currency = "INR",
): string {
  if (
    value === null ||
    !Number.isFinite(value)
  ) {
    return "—";
  }

  try {
    return new Intl.NumberFormat(
      "en-IN",
      {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
      },
    ).format(value);
  } catch {
    return `₹${Math.round(
      value,
    ).toLocaleString("en-IN")}`;
  }
}

function formatDateTime(
  value: string | null,
): string {
  if (!value) {
    return "Not available";
  }

  const date = new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return value;
  }

  return new Intl.DateTimeFormat(
    "en-IN",
    {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Kolkata",
    },
  ).format(date);
}

function relativeTime(
  value: string | null,
): string {
  if (!value) {
    return "Unknown";
  }

  const date = new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return "Unknown";
  }

  const diff = Math.max(
    0,
    Date.now() - date.getTime(),
  );

  const seconds = Math.floor(
    diff / 1000,
  );

  if (seconds < 60) {
    return "Just now";
  }

  const minutes = Math.floor(
    seconds / 60,
  );

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(
    minutes / 60,
  );

  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(
    hours / 24,
  );

  if (days < 7) {
    return `${days}d ago`;
  }

  return formatDateTime(value);
}

function severityLabel(
  severity: AlertSeverity,
): string {
  switch (severity) {
    case "critical":
      return "Critical";

    case "high":
      return "High";

    case "medium":
      return "Medium";

    case "low":
      return "Low";

    case "info":
      return "Info";

    default:
      return "Unknown";
  }
}

function severityWeight(
  severity: AlertSeverity,
): number {
  const weights: Record<
    AlertSeverity,
    number
  > = {
    critical: 5,
    high: 4,
    medium: 3,
    low: 2,
    info: 1,
    unknown: 0,
  };

  return weights[severity];
}

function severityIcon(
  severity: AlertSeverity,
): ReactNode {
  if (
    severity === "critical" ||
    severity === "high"
  ) {
    return <ShieldAlert size={17} />;
  }

  if (severity === "medium") {
    return <AlertTriangle size={17} />;
  }

  if (severity === "info") {
    return <Info size={17} />;
  }

  return <AlertCircle size={17} />;
}

function severityTone(
  severity: AlertSeverity,
): string {
  switch (severity) {
    case "critical":
      return "critical";

    case "high":
      return "high";

    case "medium":
      return "medium";

    case "low":
      return "low";

    case "info":
      return "info";

    default:
      return "unknown";
  }
}

/* ============================================================================
 * SMALL UI COMPONENTS
 * ========================================================================== */

function SeverityBadge({
  severity,
}: {
  severity: AlertSeverity;
}) {
  const tone = severityTone(severity);

  return (
    <span
      className={`alert-severity alert-severity-${tone}`}
    >
      {severityIcon(severity)}
      {severityLabel(severity)}
    </span>
  );
}

function StatCard({
  label,
  value,
  caption,
  icon,
  tone,
}: {
  label: string;
  value: string;
  caption: string;
  icon: ReactNode;
  tone:
    | "blue"
    | "red"
    | "amber"
    | "green";
}) {
  return (
    <article
      className={`alert-stat alert-stat-${tone}`}
    >
      <div className="alert-stat-icon">
        {icon}
      </div>

      <div className="alert-stat-content">
        <span>{label}</span>

        <strong>{value}</strong>

        <small>{caption}</small>
      </div>
    </article>
  );
}

/* ============================================================================
 * ALERT PAGE
 * ========================================================================== */

export default function AlertsPage() {
  const [alerts, setAlerts] =
    useState<AlertItem[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [error, setError] =
    useState("");

  const [query, setQuery] =
    useState("");

  const [
    severityFilter,
    setSeverityFilter,
  ] = useState<AlertFilter>("all");

  const [
    statusFilter,
    setStatusFilter,
  ] = useState<StatusFilter>("all");

  const [
    categoryFilter,
    setCategoryFilter,
  ] = useState("all");

  const [sortMode, setSortMode] =
    useState<SortMode>("newest");

  const [
    selectedAlertId,
    setSelectedAlertId,
  ] = useState<string | null>(null);

  const [menuAlertId, setMenuAlertId] =
    useState<string | null>(null);

  const [
    mutationLoadingId,
    setMutationLoadingId,
  ] = useState<string | null>(null);

  const [
    actionMessage,
    setActionMessage,
  ] = useState("");

  const loadAlerts =
    useCallback(
      async (
        showRefresh = false,
      ) => {
        const businessId =
          getBusinessId();

        const token =
          getAuthToken();

        if (!token) {
          setAlerts([]);
          setSelectedAlertId(null);
          setLoading(false);
          setRefreshing(false);
          setError(
            "Authentication session is missing. Please sign in again.",
          );
          return;
        }

        if (!businessId) {
          setAlerts([]);
          setSelectedAlertId(null);
          setLoading(false);
          setRefreshing(false);
          setError(
            "Business ID is missing. Configure NEXT_PUBLIC_BUSINESS_ID in frontend/.env.local.",
          );
          return;
        }

        if (showRefresh) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        setError("");

        try {
          const search =
            new URLSearchParams();

          search.set(
            "business_id",
            businessId,
          );

          search.set("limit", "100");
          search.set("offset", "0");

          const response =
            await apiFetch<unknown>(
              `/api/alerts?${search.toString()}`,
            );

          const rows =
            extractRows(response);

          const normalized =
            rows
              .map(
                (row, index) =>
                  normalizeAlert(
                    row,
                    index,
                  ),
              )
              .filter(
                (
                  item,
                ): item is AlertItem =>
                  item !== null,
              );

          setAlerts(normalized);

          setSelectedAlertId(
            (current) => {
              if (
                current &&
                normalized.some(
                  (item) =>
                    item.id === current,
                )
              ) {
                return current;
              }

              return (
                normalized[0]?.id ??
                null
              );
            },
          );
        } catch (caught) {
          if (
            caught instanceof
            CashGuardApiError
          ) {
            if (
              caught.status === 401
            ) {
              setError(
                "Authentication failed. Please sign in again.",
              );
            } else if (
              caught.status === 403
            ) {
              setError(
                "You are not authorized to view alerts for this business.",
              );
            } else if (
              caught.status === 404
            ) {
              setError(
                "The backend alert endpoint was not found. Confirm that /api/alerts is registered.",
              );
            } else {
              setError(caught.message);
            }
          } else if (
            caught instanceof Error
          ) {
            setError(caught.message);
          } else {
            setError(
              "Unable to load live alerts.",
            );
          }

          setAlerts([]);
          setSelectedAlertId(null);
        } finally {
          setLoading(false);
          setRefreshing(false);
        }
      },
      [],
    );

  useEffect(() => {
    void loadAlerts();

    const handleAuthChanged = () => {
      const token = getAuthToken();

      if (token) {
        void loadAlerts(true);
      }
    };

    const handleAuthRequired = () => {
      setError(
        "Authentication session is missing. Please sign in again.",
      );
    };

    const handleAuthExpired = () => {
      setError(
        "Your authentication token was rejected by the backend. Please sign in again.",
      );
    };

    window.addEventListener(
      "auth-changed",
      handleAuthChanged,
    );

    window.addEventListener(
      "cashguard-auth-required",
      handleAuthRequired,
    );

    window.addEventListener(
      "cashguard-auth-expired",
      handleAuthExpired,
    );

    return () => {
      window.removeEventListener(
        "auth-changed",
        handleAuthChanged,
      );

      window.removeEventListener(
        "cashguard-auth-required",
        handleAuthRequired,
      );

      window.removeEventListener(
        "cashguard-auth-expired",
        handleAuthExpired,
      );
    };
  }, [loadAlerts]);

  useEffect(() => {
    const timer =
      window.setInterval(() => {
        if (!getAuthToken()) {
          return;
        }

        void loadAlerts(true);
      }, 60000);

    return () =>
      window.clearInterval(timer);
  }, [loadAlerts]);

  const categories = useMemo(() => {
    const values = alerts
      .map(
        (alert) => alert.category,
      )
      .filter(Boolean);

    return Array.from(
      new Set(values),
    ).sort((a, b) =>
      a.localeCompare(b),
    );
  }, [alerts]);

  const filteredAlerts =
    useMemo(() => {
      const searchValue =
        query.trim().toLowerCase();

      const result = alerts.filter(
        (alert) => {
          const searchable = [
            alert.id,
            alert.title,
            alert.message,
            alert.category,
            alert.source,
            alert.invoiceId || "",
            alert.invoiceNumber || "",
            alert.customerId || "",
            alert.customerName || "",
          ]
            .join(" ")
            .toLowerCase();

          const matchesQuery =
            !searchValue ||
            searchable.includes(
              searchValue,
            );

          const matchesSeverity =
            severityFilter === "all" ||
            alert.severity ===
              severityFilter;

          const matchesStatus =
            statusFilter === "all" ||
            alert.status === statusFilter;

          const matchesCategory =
            categoryFilter === "all" ||
            alert.category ===
              categoryFilter;

          return (
            matchesQuery &&
            matchesSeverity &&
            matchesStatus &&
            matchesCategory
          );
        },
      );

      result.sort((a, b) => {
        if (sortMode === "severity") {
          return (
            severityWeight(
              b.severity,
            ) -
            severityWeight(
              a.severity,
            )
          );
        }

        const aTime = a.createdAt
          ? new Date(
              a.createdAt,
            ).getTime()
          : 0;

        const bTime = b.createdAt
          ? new Date(
              b.createdAt,
            ).getTime()
          : 0;

        return sortMode === "newest"
          ? bTime - aTime
          : aTime - bTime;
      });

      return result;
    }, [
      alerts,
      query,
      severityFilter,
      statusFilter,
      categoryFilter,
      sortMode,
    ]);

  const criticalCount =
    useMemo(
      () =>
        alerts.filter(
          (alert) =>
            alert.severity ===
            "critical",
        ).length,
      [alerts],
    );

  const highPriorityCount =
    useMemo(
      () =>
        alerts.filter(
          (alert) =>
            (
              alert.severity ===
                "high" ||
              alert.severity ===
                "critical"
            ) &&
            !alert.isResolved,
        ).length,
      [alerts],
    );

  const unreadCount =
    useMemo(
      () =>
        alerts.filter(
          (alert) =>
            !alert.isRead &&
            !alert.isResolved &&
            alert.status !==
              "dismissed",
        ).length,
      [alerts],
    );

  const resolvedCount =
    useMemo(
      () =>
        alerts.filter(
          (alert) =>
            alert.status ===
            "resolved",
        ).length,
      [alerts],
    );

  const selectedAlert = useMemo(
    () =>
      alerts.find(
        (alert) =>
          alert.id ===
          selectedAlertId,
      ) || null,
    [alerts, selectedAlertId],
  );

  const clearFilters =
    useCallback(() => {
      setQuery("");
      setSeverityFilter("all");
      setStatusFilter("all");
      setCategoryFilter("all");
      setSortMode("newest");
    }, []);

  const mutateAlert =
    useCallback(
      async (
        alert: AlertItem,
        payload: ApiRecord,
        successMessage: string,
      ) => {
        const token =
          getAuthToken();

        if (!token) {
          setActionMessage(
            "Authentication required. Please sign in again.",
          );
          return;
        }

        setMutationLoadingId(
          alert.id,
        );
        setActionMessage("");

        try {
          await apiFetch(
            `/api/alerts/${encodeURIComponent(
              alert.id,
            )}`,
            {
              method: "PATCH",
              body: JSON.stringify(
                payload,
              ),
            },
          );

          setActionMessage(
            successMessage,
          );

          setMenuAlertId(null);

          await loadAlerts(true);
        } catch (caught) {
          if (
            caught instanceof
            CashGuardApiError
          ) {
            setActionMessage(
              caught.message,
            );
          } else if (
            caught instanceof Error
          ) {
            setActionMessage(
              caught.message,
            );
          } else {
            setActionMessage(
              "Unable to update alert.",
            );
          }
        } finally {
          setMutationLoadingId(null);
        }
      },
      [loadAlerts],
    );

  const markAsRead =
    useCallback(
      async (alert: AlertItem) => {
        if (alert.isRead) {
          return;
        }

        await mutateAlert(
          alert,
          {
            is_read: true,
          },
          "Alert marked as read.",
        );
      },
      [mutateAlert],
    );

  const resolveAlert =
    useCallback(
      async (alert: AlertItem) => {
        await mutateAlert(
          alert,
          {
            status: "resolved",
            is_resolved: true,
          },
          "Alert resolved successfully.",
        );
      },
      [mutateAlert],
    );

  const dismissAlert =
    useCallback(
      async (alert: AlertItem) => {
        await mutateAlert(
          alert,
          {
            status: "dismissed",
          },
          "Alert dismissed successfully.",
        );
      },
      [mutateAlert],
    );

  const openAlert =
    useCallback(
      (alert: AlertItem) => {
        setSelectedAlertId(
          alert.id,
        );

        if (!alert.isRead) {
          void markAsRead(alert);
        }
      },
      [markAsRead],
    );

  const closeDetail =
    useCallback(() => {
      setSelectedAlertId(null);
      setActionMessage("");
    }, []);

  return (
    <main className="cashguard-alerts-page">
      <style jsx>{`
        .cashguard-alerts-page {
          min-height: 100%;
          padding: 24px;
          background:
            linear-gradient(
              180deg,
              #f8fafc 0%,
              #f1f5f9 100%
            );
          color: #0f172a;
        }

        .alert-shell {
          width: 100%;
          max-width: 1500px;
          margin: 0 auto;
        }

        .alert-header {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 20px;
          margin-bottom: 20px;
        }

        .alert-header-copy {
          min-width: 0;
        }

        .alert-eyebrow {
          display: flex;
          align-items: center;
          gap: 7px;
          margin: 0 0 8px;
          color: #0284c7;
          font-size: 10px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.14em;
        }

        .alert-live-dot {
          width: 7px;
          height: 7px;
          border-radius: 999px;
          background: #22c55e;
          box-shadow:
            0 0 0 4px
            rgba(34, 197, 94, 0.12);
        }

        .alert-header h1 {
          margin: 0;
          font-size: clamp(30px, 4vw, 40px);
          line-height: 1;
          font-weight: 800;
          letter-spacing: -0.05em;
        }

        .alert-header-description {
          max-width: 760px;
          margin: 10px 0 0;
          color: #64748b;
          font-size: 12px;
          line-height: 1.65;
        }

        .alert-header-actions {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }

        .alert-business-pill {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          min-height: 38px;
          padding: 0 11px;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          background: #ffffff;
          color: #475569;
          font-size: 9px;
          font-weight: 700;
        }

        .alert-business-pill svg {
          color: #0284c7;
        }

        .alert-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          min-height: 38px;
          padding: 0 12px;
          border: 1px solid #dbe3ec;
          border-radius: 10px;
          background: #ffffff;
          color: #0f172a;
          font-size: 10px;
          font-weight: 750;
          cursor: pointer;
          transition:
            transform 0.15s ease,
            border-color 0.15s ease,
            box-shadow 0.15s ease;
        }

        .alert-button:hover {
          transform: translateY(-1px);
          border-color: #cbd5e1;
          box-shadow:
            0 8px 20px
            rgba(15, 23, 42, 0.06);
        }

        .alert-button:disabled {
          opacity: 0.55;
          cursor: not-allowed;
          transform: none;
        }

        .alert-button-primary {
          border-color: #0284c7;
          background: #0284c7;
          color: #ffffff;
        }

        .alert-button-primary:hover {
          border-color: #0369a1;
          background: #0369a1;
        }

        .alert-error {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          margin-bottom: 14px;
          padding: 13px;
          border: 1px solid #fecaca;
          border-radius: 12px;
          background: #ffffff;
          color: #b91c1c;
        }

        .alert-error-copy {
          flex: 1;
          min-width: 0;
        }

        .alert-error-copy strong {
          display: block;
          font-size: 11px;
        }

        .alert-error-copy p {
          margin: 3px 0 0;
          color: #7f1d1d;
          font-size: 10px;
          line-height: 1.5;
        }

        .alert-stats {
          display: grid;
          grid-template-columns:
            repeat(5, minmax(0, 1fr));
          gap: 10px;
          margin-bottom: 14px;
        }

        .alert-stat {
          display: flex;
          align-items: center;
          gap: 12px;
          min-width: 0;
          padding: 15px;
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          background: #ffffff;
          box-shadow:
            0 6px 20px
            rgba(15, 23, 42, 0.04);
        }

        .alert-stat-icon {
          display: grid;
          place-items: center;
          flex: 0 0 auto;
          width: 38px;
          height: 38px;
          border-radius: 10px;
        }

        .alert-stat-blue .alert-stat-icon {
          background: #e0f2fe;
          color: #0284c7;
        }

        .alert-stat-red .alert-stat-icon {
          background: #fef2f2;
          color: #dc2626;
        }

        .alert-stat-amber .alert-stat-icon {
          background: #fffbeb;
          color: #d97706;
        }

        .alert-stat-green .alert-stat-icon {
          background: #f0fdf4;
          color: #16a34a;
        }

        .alert-stat-content {
          min-width: 0;
        }

        .alert-stat-content > span {
          display: block;
          color: #64748b;
          font-size: 9px;
          font-weight: 700;
        }

        .alert-stat-content strong {
          display: block;
          margin-top: 4px;
          color: #0f172a;
          font-size: 23px;
          line-height: 1;
          letter-spacing: -0.04em;
        }

        .alert-stat-content small {
          display: block;
          margin-top: 5px;
          color: #94a3b8;
          font-size: 8px;
          line-height: 1.35;
        }

        .alert-toolbar-card {
          margin-bottom: 12px;
          padding: 12px;
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          background: #ffffff;
          box-shadow:
            0 6px 20px
            rgba(15, 23, 42, 0.035);
        }

        .alert-toolbar {
          display: grid;
          grid-template-columns:
            minmax(250px, 1.7fr)
            repeat(4, minmax(125px, 0.65fr));
          gap: 8px;
        }

        .alert-search {
          position: relative;
        }

        .alert-search > svg {
          position: absolute;
          top: 50%;
          left: 11px;
          transform: translateY(-50%);
          color: #94a3b8;
          pointer-events: none;
        }

        .alert-search input,
        .alert-select {
          width: 100%;
          height: 39px;
          border: 1px solid #dbe3ec;
          border-radius: 9px;
          outline: none;
          background: #ffffff;
          color: #0f172a;
          font-size: 10px;
          font-weight: 600;
        }

        .alert-search input {
          padding: 0 11px 0 34px;
        }

        .alert-select {
          padding: 0 9px;
        }

        .alert-search input:focus,
        .alert-select:focus {
          border-color: #7dd3fc;
          box-shadow:
            0 0 0 3px
            rgba(14, 165, 233, 0.1);
        }

        .alert-toolbar-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding-top: 9px;
          margin-top: 9px;
          border-top: 1px solid #f1f5f9;
        }

        .alert-toolbar-result {
          color: #64748b;
          font-size: 9px;
        }

        .alert-toolbar-result strong {
          color: #0f172a;
        }

        .alert-live-status {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          color: #64748b;
          font-size: 8px;
          font-weight: 700;
        }

        .alert-live-status::before {
          content: "";
          width: 6px;
          height: 6px;
          border-radius: 999px;
          background: #22c55e;
        }

        .alert-list-card {
          overflow: hidden;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          background: #ffffff;
          box-shadow:
            0 7px 24px
            rgba(15, 23, 42, 0.045);
        }

        .alert-list-header {
          display: grid;
          grid-template-columns:
            minmax(340px, 1.8fr)
            110px
            120px
            145px
            140px
            45px;
          gap: 10px;
          align-items: center;
          padding: 11px 16px;
          border-bottom: 1px solid #eef2f7;
          background: #f8fafc;
          color: #94a3b8;
          font-size: 8px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.09em;
        }

        .alert-row {
          display: grid;
          grid-template-columns:
            minmax(340px, 1.8fr)
            110px
            120px
            145px
            140px
            45px;
          gap: 10px;
          align-items: center;
          width: 100%;
          padding: 13px 16px;
          border: 0;
          border-bottom: 1px solid #f1f5f9;
          background: #ffffff;
          text-align: left;
          cursor: pointer;
          transition:
            background 0.15s ease;
        }

        .alert-row:last-child {
          border-bottom: 0;
        }

        .alert-row:hover {
          background: #fbfdff;
        }

        .alert-row-unread {
          background:
            linear-gradient(
              90deg,
              #f7fcff 0%,
              #ffffff 60%
            );
        }

        .alert-main {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          min-width: 0;
        }

        .alert-main-icon {
          display: grid;
          place-items: center;
          flex: 0 0 auto;
          width: 38px;
          height: 38px;
          border-radius: 10px;
        }

        .alert-main-icon-critical,
        .alert-main-icon-high {
          color: #dc2626;
          background: #fef2f2;
        }

        .alert-main-icon-medium {
          color: #d97706;
          background: #fffbeb;
        }

        .alert-main-icon-low {
          color: #16a34a;
          background: #f0fdf4;
        }

        .alert-main-icon-info,
        .alert-main-icon-unknown {
          color: #0284c7;
          background: #e0f2fe;
        }

        .alert-main-copy {
          min-width: 0;
        }

        .alert-title-line {
          display: flex;
          align-items: center;
          gap: 7px;
          min-width: 0;
        }

        .alert-title-line strong {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: #0f172a;
          font-size: 11px;
          font-weight: 800;
        }

        .alert-unread-dot {
          flex: 0 0 auto;
          width: 7px;
          height: 7px;
          border-radius: 999px;
          background: #0284c7;
        }

        .alert-message {
          display: -webkit-box;
          margin-top: 4px;
          overflow: hidden;
          color: #64748b;
          font-size: 9px;
          line-height: 1.5;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
        }

        .alert-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 5px;
          margin-top: 6px;
        }

        .alert-meta-pill {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          min-height: 20px;
          padding: 0 7px;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          background: #ffffff;
          color: #64748b;
          font-size: 7px;
          font-weight: 700;
        }

        .alert-meta-pill svg {
          color: #0284c7;
        }

        .alert-severity {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          width: fit-content;
          min-height: 24px;
          padding: 0 8px;
          border-radius: 999px;
          font-size: 7px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        .alert-severity svg {
          width: 12px;
          height: 12px;
        }

        .alert-severity-critical,
        .alert-severity-high {
          color: #b91c1c;
          background: #fef2f2;
        }

        .alert-severity-medium {
          color: #b45309;
          background: #fffbeb;
        }

        .alert-severity-low {
          color: #15803d;
          background: #f0fdf4;
        }

        .alert-severity-info,
        .alert-severity-unknown {
          color: #0369a1;
          background: #e0f2fe;
        }

        .alert-cell {
          color: #475569;
          font-size: 9px;
          line-height: 1.5;
        }

        .alert-cell strong {
          display: block;
          color: #334155;
          font-size: 9px;
          font-weight: 750;
        }

        .alert-cell small {
          display: block;
          margin-top: 3px;
          color: #94a3b8;
          font-size: 7px;
          line-height: 1.4;
        }

        .alert-amount {
          color: #0f172a;
          font-weight: 800;
        }

        .alert-menu-wrap {
          position: relative;
        }

        .alert-menu-button {
          display: grid;
          place-items: center;
          width: 31px;
          height: 31px;
          margin-left: auto;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          background: #ffffff;
          color: #64748b;
          cursor: pointer;
        }

        .alert-menu-button:hover {
          color: #0f172a;
          background: #f8fafc;
        }

        .alert-menu {
          position: absolute;
          z-index: 30;
          top: 36px;
          right: 0;
          width: 175px;
          padding: 5px;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          background: #ffffff;
          box-shadow:
            0 18px 38px
            rgba(15, 23, 42, 0.14);
        }

        .alert-menu button {
          display: flex;
          align-items: center;
          gap: 8px;
          width: 100%;
          padding: 8px 9px;
          border: 0;
          border-radius: 7px;
          background: transparent;
          color: #334155;
          text-align: left;
          font-size: 9px;
          font-weight: 700;
          cursor: pointer;
        }

        .alert-menu button:hover {
          background: #f8fafc;
        }

        .alert-menu button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .alert-menu .danger {
          color: #b91c1c;
        }

        .alert-empty {
          display: grid;
          place-items: center;
          min-height: 340px;
          padding: 30px;
          text-align: center;
        }

        .alert-empty-icon {
          display: grid;
          place-items: center;
          width: 58px;
          height: 58px;
          border-radius: 16px;
          background: #e0f2fe;
          color: #0284c7;
        }

        .alert-empty h3 {
          margin: 13px 0 0;
          color: #0f172a;
          font-size: 16px;
        }

        .alert-empty p {
          max-width: 500px;
          margin: 7px 0 0;
          color: #64748b;
          font-size: 10px;
          line-height: 1.6;
        }

        .alert-empty-actions {
          display: flex;
          gap: 8px;
          margin-top: 15px;
        }

        .alert-skeleton-list {
          display: grid;
          gap: 8px;
          padding: 12px;
        }

        .alert-skeleton {
          height: 74px;
          border-radius: 11px;
          background:
            linear-gradient(
              90deg,
              #f1f5f9 25%,
              #e2e8f0 37%,
              #f1f5f9 63%
            );
          background-size: 400% 100%;
          animation:
            alert-loading 1.25s ease infinite;
        }

        @keyframes alert-loading {
          0% {
            background-position: 100% 0;
          }

          100% {
            background-position: -100% 0;
          }
        }

        .alert-lower-grid {
          display: grid;
          grid-template-columns:
            minmax(0, 1.2fr)
            minmax(320px, 0.8fr);
          gap: 12px;
          margin-top: 12px;
        }

        .alert-info-card {
          padding: 17px;
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          background: #ffffff;
          box-shadow:
            0 6px 20px
            rgba(15, 23, 42, 0.035);
        }

        .alert-info-card h3 {
          margin: 3px 0 6px;
          color: #0f172a;
          font-size: 14px;
          letter-spacing: -0.02em;
        }

        .alert-info-card p {
          margin: 0;
          color: #64748b;
          font-size: 9px;
          line-height: 1.6;
        }

        .alert-info-row {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          padding: 10px 0;
          border-top: 1px solid #f1f5f9;
        }

        .alert-info-row:first-of-type {
          margin-top: 11px;
        }

        .alert-info-row > span {
          display: grid;
          place-items: center;
          flex: 0 0 auto;
          width: 28px;
          height: 28px;
          border-radius: 8px;
          background: #e0f2fe;
          color: #0284c7;
        }

        .alert-info-row strong {
          display: block;
          color: #0f172a;
          font-size: 9px;
        }

        .alert-info-row small {
          display: block;
          margin-top: 3px;
          color: #94a3b8;
          font-size: 8px;
          line-height: 1.45;
        }

        .alert-category-list {
          display: flex;
          flex-wrap: wrap;
          gap: 7px;
          margin-top: 12px;
        }

        .alert-category {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 6px 8px;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          color: #334155;
          background: #ffffff;
          font-size: 8px;
          font-weight: 700;
        }

        .alert-category b {
          display: grid;
          place-items: center;
          min-width: 19px;
          height: 19px;
          padding: 0 4px;
          border-radius: 6px;
          background: #e0f2fe;
          color: #0369a1;
          font-size: 7px;
        }

        .alert-drawer-backdrop {
          position: fixed;
          z-index: 100;
          inset: 0;
          background:
            rgba(15, 23, 42, 0.38);
          backdrop-filter: blur(3px);
        }

        .alert-drawer {
          position: absolute;
          top: 0;
          right: 0;
          width: min(540px, 100%);
          height: 100%;
          overflow-y: auto;
          background: #ffffff;
          box-shadow:
            -20px 0 50px
            rgba(15, 23, 42, 0.15);
        }

        .alert-drawer-header {
          position: sticky;
          top: 0;
          z-index: 5;
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          padding: 18px;
          border-bottom: 1px solid #eef2f7;
          background:
            rgba(255, 255, 255, 0.96);
          backdrop-filter: blur(12px);
        }

        .alert-drawer-header-copy {
          min-width: 0;
        }

        .alert-drawer-header h2 {
          margin: 4px 0 0;
          color: #0f172a;
          font-size: 20px;
          line-height: 1.2;
          letter-spacing: -0.035em;
        }

        .alert-drawer-close {
          display: grid;
          place-items: center;
          flex: 0 0 auto;
          width: 33px;
          height: 33px;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          background: #ffffff;
          color: #64748b;
          cursor: pointer;
        }

        .alert-drawer-body {
          padding: 16px 18px 26px;
        }

        .alert-detail-top {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          padding: 13px;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          background: #f8fafc;
        }

        .alert-detail-top-copy {
          flex: 1;
          min-width: 0;
        }

        .alert-detail-top-copy strong {
          display: block;
          color: #0f172a;
          font-size: 11px;
        }

        .alert-detail-top-copy small {
          display: block;
          margin-top: 4px;
          color: #64748b;
          font-size: 8px;
        }

        .alert-detail-message {
          margin: 12px 0 0;
          color: #334155;
          font-size: 10px;
          line-height: 1.65;
        }

        .alert-impact-box {
          margin-top: 12px;
          padding: 14px;
          border: 1px solid #dbeafe;
          border-radius: 12px;
          background:
            linear-gradient(
              135deg,
              #f8fdff,
              #eff6ff
            );
        }

        .alert-impact-box span {
          display: block;
          color: #0369a1;
          font-size: 8px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }

        .alert-impact-box strong {
          display: block;
          margin-top: 6px;
          color: #0f172a;
          font-size: 27px;
          line-height: 1;
          letter-spacing: -0.045em;
        }

        .alert-detail-grid {
          display: grid;
          grid-template-columns:
            repeat(2, minmax(0, 1fr));
          gap: 8px;
          margin-top: 12px;
        }

        .alert-detail-box {
          min-width: 0;
          padding: 11px;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          background: #ffffff;
        }

        .alert-detail-box span {
          display: block;
          color: #94a3b8;
          font-size: 7px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }

        .alert-detail-box strong {
          display: block;
          margin-top: 5px;
          color: #334155;
          font-size: 9px;
          line-height: 1.45;
          word-break: break-word;
        }

        .alert-detail-section {
          margin-top: 16px;
          padding-top: 16px;
          border-top: 1px solid #f1f5f9;
        }

        .alert-detail-section-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }

        .alert-detail-section-head h3 {
          margin: 0;
          color: #0f172a;
          font-size: 10px;
        }

        .alert-detail-section-head span {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          color: #16a34a;
          font-size: 7px;
          font-weight: 750;
        }

        .alert-link {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          margin-top: 8px;
          color: #0284c7;
          font-size: 8px;
          font-weight: 800;
          text-decoration: none;
        }

        .alert-link:hover {
          text-decoration: underline;
        }

        .alert-drawer-actions {
          display: grid;
          grid-template-columns:
            repeat(2, minmax(0, 1fr));
          gap: 8px;
          margin-top: 12px;
        }

        .alert-drawer-actions .alert-button {
          width: 100%;
        }

        .alert-action-message {
          margin-top: 10px;
          padding: 9px 10px;
          border: 1px solid #dbeafe;
          border-radius: 9px;
          background: #f8fdff;
          color: #0369a1;
          font-size: 8px;
          line-height: 1.5;
        }

        .alert-drawer-note {
          display: flex;
          align-items: flex-start;
          gap: 6px;
          margin-top: 16px;
          color: #94a3b8;
          font-size: 8px;
          line-height: 1.5;
        }

        .alert-spinner {
          animation: alert-spin 0.9s linear infinite;
        }

        @keyframes alert-spin {
          to {
            transform: rotate(360deg);
          }
        }

        @media (max-width: 1180px) {
          .alert-stats {
            grid-template-columns:
              repeat(3, minmax(0, 1fr));
          }

          .alert-toolbar {
            grid-template-columns:
              minmax(230px, 1fr)
              repeat(2, minmax(120px, 0.7fr));
          }

          .alert-list-header,
          .alert-row {
            grid-template-columns:
              minmax(280px, 1.8fr)
              105px
              110px
              130px
              125px
              40px;
          }
        }

        @media (max-width: 900px) {
          .cashguard-alerts-page {
            padding: 18px;
          }

          .alert-header {
            align-items: flex-start;
            flex-direction: column;
          }

          .alert-header-actions {
            justify-content: flex-start;
          }

          .alert-lower-grid {
            grid-template-columns: 1fr;
          }

          .alert-list-header {
            display: none;
          }

          .alert-row {
            grid-template-columns:
              1fr auto;
            align-items: flex-start;
          }

          .alert-row
            > :nth-child(2),
          .alert-row
            > :nth-child(3),
          .alert-row
            > :nth-child(4),
          .alert-row
            > :nth-child(5) {
            display: none;
          }

          .alert-main {
            grid-column: 1;
          }

          .alert-menu-wrap {
            grid-column: 2;
          }
        }

        @media (max-width: 650px) {
          .cashguard-alerts-page {
            padding: 12px;
          }

          .alert-stats {
            grid-template-columns:
              repeat(2, minmax(0, 1fr));
          }

          .alert-toolbar {
            grid-template-columns: 1fr;
          }

          .alert-toolbar-footer {
            align-items: flex-start;
            flex-direction: column;
          }

          .alert-business-pill {
            max-width: 100%;
          }

          .alert-detail-grid {
            grid-template-columns: 1fr;
          }

          .alert-drawer-actions {
            grid-template-columns: 1fr;
          }

          .alert-empty-actions {
            flex-direction: column;
          }
        }
      `}</style>

      <div className="alert-shell">
        {/* ================================================================
         * HEADER
         * ================================================================ */}

        <header className="alert-header">
          <div className="alert-header-copy">
            <p className="alert-eyebrow">
              <span className="alert-live-dot" />
              Live business monitoring
            </p>

            <h1>Alerts</h1>

            <p className="alert-header-description">
              Review live CashGuard-AI
              alerts, financial impact,
              customer exposure and
              unresolved business risks
              from one clean workspace.
            </p>
          </div>

          <div className="alert-header-actions">
            <div
              className="alert-business-pill"
              title={
                getBusinessId() ||
                "Business ID not configured"
              }
            >
              <Wallet size={13} />

              <span>
                {getBusinessId() ||
                  "Business not configured"}
              </span>
            </div>

            <button
              type="button"
              className="alert-button alert-button-primary"
              onClick={() =>
                void loadAlerts(true)
              }
              disabled={
                loading || refreshing
              }
            >
              <RefreshCw
                size={13}
                className={
                  refreshing
                    ? "alert-spinner"
                    : undefined
                }
              />

              {refreshing
                ? "Refreshing"
                : "Refresh"}
            </button>
          </div>
        </header>

        {/* ================================================================
         * ERROR
         * ================================================================ */}

        {error ? (
          <div
            className="alert-error"
            role="alert"
          >
            <AlertCircle size={17} />

            <div className="alert-error-copy">
              <strong>
                Alert data unavailable
              </strong>

              <p>{error}</p>
            </div>

            <button
              type="button"
              className="alert-button"
              onClick={() =>
                void loadAlerts(true)
              }
            >
              Retry
            </button>
          </div>
        ) : null}

        {/* ================================================================
         * STATS
         * ================================================================ */}

        <section className="alert-stats">
          <StatCard
            label="Total alerts"
            value={String(
              alerts.length,
            )}
            caption="Live backend records"
            icon={<Bell size={15} />}
            tone="blue"
          />

          <StatCard
            label="Critical"
            value={String(
              criticalCount,
            )}
            caption="Highest urgency"
            icon={
              <ShieldAlert size={15} />
            }
            tone="red"
          />

          <StatCard
            label="Unread"
            value={String(
              unreadCount,
            )}
            caption="Needs your attention"
            icon={
              <AlertTriangle size={15} />
            }
            tone="amber"
          />

          <StatCard
            label="High priority"
            value={String(
              highPriorityCount,
            )}
            caption="Critical + high"
            icon={
              <AlertCircle size={15} />
            }
            tone="red"
          />

          <StatCard
            label="Resolved"
            value={String(
              resolvedCount,
            )}
            caption="Backend-resolved"
            icon={
              <CheckCircle2 size={15} />
            }
            tone="green"
          />
        </section>

        {/* ================================================================
         * FILTER BAR
         * ================================================================ */}

        <section className="alert-toolbar-card">
          <div className="alert-toolbar">
            <div className="alert-search">
              <Search size={14} />

              <input
                value={query}
                onChange={(event) =>
                  setQuery(
                    event.target.value,
                  )
                }
                placeholder="Search alerts, invoices, customers..."
                aria-label="Search alerts"
              />
            </div>

            <select
              className="alert-select"
              value={severityFilter}
              onChange={(event) =>
                setSeverityFilter(
                  event.target
                    .value as AlertFilter,
                )
              }
            >
              <option value="all">
                All severity
              </option>

              <option value="critical">
                Critical
              </option>

              <option value="high">
                High
              </option>

              <option value="medium">
                Medium
              </option>

              <option value="low">
                Low
              </option>

              <option value="info">
                Info
              </option>
            </select>

            <select
              className="alert-select"
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(
                  event.target
                    .value as StatusFilter,
                )
              }
            >
              <option value="all">
                All status
              </option>

              <option value="unread">
                Unread
              </option>

              <option value="read">
                Read
              </option>

              <option value="active">
                Active
              </option>

              <option value="resolved">
                Resolved
              </option>

              <option value="dismissed">
                Dismissed
              </option>
            </select>

            <select
              className="alert-select"
              value={categoryFilter}
              onChange={(event) =>
                setCategoryFilter(
                  event.target.value,
                )
              }
            >
              <option value="all">
                All categories
              </option>

              {categories.map(
                (category) => (
                  <option
                    key={category}
                    value={category}
                  >
                    {category}
                  </option>
                ),
              )}
            </select>

            <select
              className="alert-select"
              value={sortMode}
              onChange={(event) =>
                setSortMode(
                  event.target
                    .value as SortMode,
                )
              }
            >
              <option value="newest">
                Newest first
              </option>

              <option value="oldest">
                Oldest first
              </option>

              <option value="severity">
                Highest severity
              </option>
            </select>
          </div>

          <div className="alert-toolbar-footer">
            <span className="alert-toolbar-result">
              Showing{" "}
              <strong>
                {filteredAlerts.length}
              </strong>{" "}
              of{" "}
              <strong>
                {alerts.length}
              </strong>{" "}
              backend alerts
            </span>

            <span className="alert-live-status">
              Auto-refresh every 60 seconds
            </span>
          </div>
        </section>

        {/* ================================================================
         * ALERT LIST
         * ================================================================ */}

        <section className="alert-list-card">
          {loading ? (
            <div className="alert-skeleton-list">
              <div className="alert-skeleton" />
              <div className="alert-skeleton" />
              <div className="alert-skeleton" />
              <div className="alert-skeleton" />
            </div>
          ) : filteredAlerts.length ===
            0 ? (
            <div className="alert-empty">
              <div className="alert-empty-icon">
                <Filter size={23} />
              </div>

              <h3>
                {alerts.length > 0
                  ? "No matching alerts"
                  : error
                    ? "Unable to load backend alerts"
                    : "No backend alerts found"}
              </h3>

              <p>
                {alerts.length > 0
                  ? "Change your search or filters to view other alerts."
                  : error
                    ? "Check your authenticated session and backend connection, then retry."
                    : "The CashGuard-AI backend returned no alert records for this business."}
              </p>

              <div className="alert-empty-actions">
                {alerts.length > 0 ? (
                  <button
                    type="button"
                    className="alert-button"
                    onClick={
                      clearFilters
                    }
                  >
                    Clear filters
                  </button>
                ) : null}

                <button
                  type="button"
                  className="alert-button alert-button-primary"
                  onClick={() =>
                    void loadAlerts(true)
                  }
                >
                  <RefreshCw size={13} />
                  Retry
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="alert-list-header">
                <span>Alert</span>
                <span>Severity</span>
                <span>Category</span>
                <span>Impact</span>
                <span>Updated</span>
                <span />
              </div>

              {filteredAlerts.map(
                (alert) => (
                  <div
                    key={alert.id}
                    className={`alert-row ${
                      !alert.isRead
                        ? "alert-row-unread"
                        : ""
                    }`}
                    onClick={() =>
                      openAlert(alert)
                    }
                  >
                    <div className="alert-main">
                      <span
                        className={`alert-main-icon alert-main-icon-${alert.severity}`}
                      >
                        {severityIcon(
                          alert.severity,
                        )}
                      </span>

                      <div className="alert-main-copy">
                        <div className="alert-title-line">
                          <strong>
                            {alert.title}
                          </strong>

                          {!alert.isRead ? (
                            <span
                              className="alert-unread-dot"
                              title="Unread"
                            />
                          ) : null}
                        </div>

                        <div className="alert-message">
                          {alert.message}
                        </div>

                        <div className="alert-meta">
                          {alert.invoiceNumber ? (
                            <span className="alert-meta-pill">
                              <FileText
                                size={9}
                              />
                              {
                                alert.invoiceNumber
                              }
                            </span>
                          ) : null}

                          {alert.customerName ? (
                            <span className="alert-meta-pill">
                              {alert.customerName}
                            </span>
                          ) : null}

                          <span className="alert-meta-pill">
                            {alert.source}
                          </span>
                        </div>
                      </div>
                    </div>

                    <SeverityBadge
                      severity={
                        alert.severity
                      }
                    />

                    <span className="alert-cell">
                      <strong>
                        {alert.category}
                      </strong>

                      <small>
                        Alert category
                      </small>
                    </span>

                    <span className="alert-cell">
                      <strong className="alert-amount">
                        {alert.amount !==
                        null
                          ? formatCurrency(
                              alert.amount,
                              alert.currency,
                            )
                          : "Not supplied"}
                      </strong>

                      <small>
                        Financial impact
                      </small>
                    </span>

                    <span className="alert-cell">
                      <strong>
                        {relativeTime(
                          alert.updatedAt ||
                            alert.createdAt,
                        )}
                      </strong>

                      <small>
                        {formatDateTime(
                          alert.updatedAt ||
                            alert.createdAt,
                        )}
                      </small>
                    </span>

                    <div
                      className="alert-menu-wrap"
                      onClick={(event) =>
                        event.stopPropagation()
                      }
                    >
                      <button
                        type="button"
                        className="alert-menu-button"
                        aria-label={`Actions for ${alert.title}`}
                        onClick={() =>
                          setMenuAlertId(
                            (current) =>
                              current ===
                              alert.id
                                ? null
                                : alert.id,
                          )
                        }
                      >
                        <MoreHorizontal
                          size={15}
                        />
                      </button>

                      {menuAlertId ===
                      alert.id ? (
                        <div className="alert-menu">
                          <button
                            type="button"
                            onClick={() => {
                              setMenuAlertId(
                                null,
                              );

                              openAlert(
                                alert,
                              );
                            }}
                          >
                            <ExternalLink
                              size={13}
                            />
                            Open details
                          </button>

                          {!alert.isRead ? (
                            <button
                              type="button"
                              disabled={
                                mutationLoadingId ===
                                alert.id
                              }
                              onClick={() =>
                                void markAsRead(
                                  alert,
                                )
                              }
                            >
                              {mutationLoadingId ===
                              alert.id ? (
                                <Loader2
                                  size={13}
                                  className="alert-spinner"
                                />
                              ) : (
                                <Check
                                  size={13}
                                />
                              )}

                              Mark as read
                            </button>
                          ) : null}

                          {!alert.isResolved ? (
                            <button
                              type="button"
                              disabled={
                                mutationLoadingId ===
                                alert.id
                              }
                              onClick={() =>
                                void resolveAlert(
                                  alert,
                                )
                              }
                            >
                              <CheckCircle2
                                size={13}
                              />
                              Resolve
                            </button>
                          ) : null}

                          <button
                            type="button"
                            className="danger"
                            disabled={
                              mutationLoadingId ===
                              alert.id
                            }
                            onClick={() =>
                              void dismissAlert(
                                alert,
                              )
                            }
                          >
                            <X size={13} />
                            Dismiss
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ),
              )}
            </>
          )}
        </section>

        {/* ================================================================
         * LOWER INFORMATION
         * ================================================================ */}

        <div className="alert-lower-grid">
          <section className="alert-info-card">
            <p className="alert-eyebrow">
              ALERT WORKFLOW
            </p>

            <h3>
              One clean queue for
              important business signals.
            </h3>

            <p>
              Alerts are loaded directly
              from the CashGuard-AI
              backend. The frontend does
              not create synthetic alert
              records.
            </p>

            <div className="alert-info-row">
              <span>
                <ShieldAlert size={14} />
              </span>

              <div>
                <strong>
                  Prioritised review
                </strong>

                <small>
                  Critical and high severity
                  alerts stay visually
                  prominent.
                </small>
              </div>
            </div>

            <div className="alert-info-row">
              <span>
                <RefreshCw size={14} />
              </span>

              <div>
                <strong>
                  Live backend refresh
                </strong>

                <small>
                  The page refreshes every
                  60 seconds when an
                  authenticated session
                  is available.
                </small>
              </div>
            </div>

            <div className="alert-info-row">
              <span>
                <CheckCircle2 size={14} />
              </span>

              <div>
                <strong>
                  Persistent alert state
                </strong>

                <small>
                  Read, resolve and dismiss
                  operations are sent back
                  to the backend.
                </small>
              </div>
            </div>
          </section>

          <section className="alert-info-card">
            <p className="alert-eyebrow">
              LIVE CATEGORIES
            </p>

            <h3>
              Backend alert distribution
            </h3>

            <p>
              Categories are derived from
              the currently loaded backend
              alerts.
            </p>

            <div className="alert-category-list">
              {categories.length > 0 ? (
                categories.map(
                  (category) => {
                    const count =
                      alerts.filter(
                        (alert) =>
                          alert.category ===
                          category,
                      ).length;

                    return (
                      <span
                        key={category}
                        className="alert-category"
                      >
                        {category}

                        <b>
                          {count}
                        </b>
                      </span>
                    );
                  },
                )
              ) : (
                <span className="alert-category">
                  No categories
                </span>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* ================================================================
       * DETAIL DRAWER
       * ================================================================ */}

      {selectedAlert ? (
        <div
          className="alert-drawer-backdrop"
          onClick={closeDetail}
        >
          <aside
            className="alert-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Alert details"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div className="alert-drawer-header">
              <div className="alert-drawer-header-copy">
                <p className="alert-eyebrow">
                  ALERT DETAIL
                </p>

                <h2>
                  {selectedAlert.title}
                </h2>
              </div>

              <button
                type="button"
                className="alert-drawer-close"
                onClick={closeDetail}
                aria-label="Close alert details"
              >
                <X size={16} />
              </button>
            </div>

            <div className="alert-drawer-body">
              <div className="alert-detail-top">
                <span
                  className={`alert-main-icon alert-main-icon-${selectedAlert.severity}`}
                >
                  {severityIcon(
                    selectedAlert.severity,
                  )}
                </span>

                <div className="alert-detail-top-copy">
                  <strong>
                    {selectedAlert.category}
                  </strong>

                  <small>
                    {selectedAlert.source}
                  </small>
                </div>

                <SeverityBadge
                  severity={
                    selectedAlert.severity
                  }
                />
              </div>

              <p className="alert-detail-message">
                {selectedAlert.message}
              </p>

              {selectedAlert.amount !==
              null ? (
                <div className="alert-impact-box">
                  <span>
                    Financial impact
                  </span>

                  <strong>
                    {formatCurrency(
                      selectedAlert.amount,
                      selectedAlert.currency,
                    )}
                  </strong>
                </div>
              ) : null}

              <div className="alert-detail-grid">
                <div className="alert-detail-box">
                  <span>Alert ID</span>

                  <strong>
                    {selectedAlert.id}
                  </strong>
                </div>

                <div className="alert-detail-box">
                  <span>Status</span>

                  <strong>
                    {selectedAlert.status}
                  </strong>
                </div>

                <div className="alert-detail-box">
                  <span>Created</span>

                  <strong>
                    {formatDateTime(
                      selectedAlert.createdAt,
                    )}
                  </strong>
                </div>

                <div className="alert-detail-box">
                  <span>Updated</span>

                  <strong>
                    {formatDateTime(
                      selectedAlert.updatedAt,
                    )}
                  </strong>
                </div>

                <div className="alert-detail-box">
                  <span>Customer</span>

                  <strong>
                    {selectedAlert.customerName ||
                      selectedAlert.customerId ||
                      "Not supplied"}
                  </strong>
                </div>

                <div className="alert-detail-box">
                  <span>Business</span>

                  <strong>
                    {selectedAlert.businessId ||
                      getBusinessId() ||
                      "Not supplied"}
                  </strong>
                </div>
              </div>

              {(
                selectedAlert.invoiceId ||
                selectedAlert.invoiceNumber
              ) ? (
                <section className="alert-detail-section">
                  <div className="alert-detail-section-head">
                    <h3>
                      Related invoice
                    </h3>

                    <span>
                      <CheckCircle2
                        size={12}
                      />
                      Linked record
                    </span>
                  </div>

                  <div
                    className="alert-detail-box"
                    style={{
                      marginTop: 9,
                    }}
                  >
                    <span>
                      Invoice
                    </span>

                    <strong>
                      {selectedAlert.invoiceNumber ||
                        selectedAlert.invoiceId}
                    </strong>

                    {selectedAlert.invoiceId ? (
                      <Link
                        href={`/invoices?invoice_id=${encodeURIComponent(
                          selectedAlert.invoiceId,
                        )}`}
                        className="alert-link"
                      >
                        Open invoice
                        <ArrowRight
                          size={11}
                        />
                      </Link>
                    ) : null}
                  </div>
                </section>
              ) : null}

              {selectedAlert.actionUrl ? (
                <section className="alert-detail-section">
                  <div className="alert-detail-section-head">
                    <h3>
                      Backend action
                    </h3>
                  </div>

                  <a
                    href={
                      selectedAlert.actionUrl
                    }
                    className="alert-link"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open action
                    <ExternalLink
                      size={11}
                    />
                  </a>
                </section>
              ) : null}

              <section className="alert-detail-section">
                <div className="alert-detail-section-head">
                  <h3>
                    Alert actions
                  </h3>

                  <span>
                    <CheckCircle2
                      size={12}
                    />
                    Backend persisted
                  </span>
                </div>

                <div className="alert-drawer-actions">
                  {!selectedAlert.isRead ? (
                    <button
                      type="button"
                      className="alert-button"
                      onClick={() =>
                        void markAsRead(
                          selectedAlert,
                        )
                      }
                      disabled={
                        mutationLoadingId ===
                        selectedAlert.id
                      }
                    >
                      {mutationLoadingId ===
                      selectedAlert.id ? (
                        <Loader2
                          size={13}
                          className="alert-spinner"
                        />
                      ) : (
                        <Check
                          size={13}
                        />
                      )}

                      Mark as read
                    </button>
                  ) : null}

                  {!selectedAlert.isResolved ? (
                    <button
                      type="button"
                      className="alert-button alert-button-primary"
                      onClick={() =>
                        void resolveAlert(
                          selectedAlert,
                        )
                      }
                      disabled={
                        mutationLoadingId ===
                        selectedAlert.id
                      }
                    >
                      <CheckCircle2
                        size={13}
                      />

                      Resolve alert
                    </button>
                  ) : null}

                  <button
                    type="button"
                    className="alert-button"
                    onClick={() =>
                      void dismissAlert(
                        selectedAlert,
                      )
                    }
                    disabled={
                      mutationLoadingId ===
                      selectedAlert.id
                    }
                  >
                    <X size={13} />
                    Dismiss
                  </button>

                  <button
                    type="button"
                    className="alert-button"
                    onClick={() =>
                      void loadAlerts(true)
                    }
                    disabled={refreshing}
                  >
                    <RefreshCw
                      size={13}
                      className={
                        refreshing
                          ? "alert-spinner"
                          : undefined
                      }
                    />
                    Refresh
                  </button>
                </div>

                {actionMessage ? (
                  <div className="alert-action-message">
                    {actionMessage}
                  </div>
                ) : null}
              </section>

              <div className="alert-drawer-note">
                <Info size={11} />

                <span>
                  Alert state changes are
                  persisted through the
                  CashGuard-AI backend and
                  the alert list refreshes
                  afterward.
                </span>
              </div>
            </div>
          </aside>
        </div>
      ) : null}
    </main>
  );
}