"use client";

import {
  ArrowUpRight,
  Bell,
  Check,
  CheckCheck,
  Clock3,
  CreditCard,
  FileText,
  Landmark,
  MoreHorizontal,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  UserRound,
  Wallet,
  X,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
} from "react";

type NotificationType =
  | "Payments"
  | "Invoices"
  | "Banking"
  | "Reconciliation"
  | "Customers"
  | "Vendors"
  | "Risk"
  | "System";

type Priority = "Important" | "Normal";

type Notice = {
  id: string;
  title: string;
  description: string;
  type: NotificationType;
  priority: Priority;
  read: boolean;
  amount?: string;
  entity?: string;
  reference?: string;
  createdAt: number;
  relatedRoute: string;
};

type AIInsight = {
  title: string;
  summary: string;
  recommendation: string;
  priority?: string;
  confidence?: string;
};

const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.trim() ||
  "http://127.0.0.1:8000";

const NOTIFICATION_LIMIT = 100;
const MAX_NOTIFICATION_PAGES = 100;

const iconFor: Record<
  NotificationType,
  typeof Bell
> = {
  Payments: CreditCard,
  Invoices: FileText,
  Banking: Landmark,
  Reconciliation: CheckCheck,
  Customers: UserRound,
  Vendors: Wallet,
  Risk: ShieldAlert,
  System: Sparkles,
};

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
      const value = storage
        .getItem(key)
        ?.trim();

      if (value) {
        return value.replace(
          /^Bearer\s+/i,
          "",
        );
      }
    }
  }

  return "";
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

  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

function getTimestamp(
  value: unknown,
): number {
  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return value < 10_000_000_000
      ? value * 1000
      : value;
  }

  const raw = text(value);

  if (!raw) {
    return Date.now();
  }

  const timestamp =
    new Date(raw).getTime();

  return Number.isNaN(timestamp)
    ? Date.now()
    : timestamp;
}

function normalizeNotificationType(
  value: unknown,
): NotificationType {
  const normalized = text(value)
    .toLowerCase()
    .replace(/[\s_-]+/g, "");

  if (normalized.includes("payment")) {
    return "Payments";
  }

  if (normalized.includes("invoice")) {
    return "Invoices";
  }

  if (normalized.includes("bank")) {
    return "Banking";
  }

  if (
    normalized.includes("reconcil")
  ) {
    return "Reconciliation";
  }

  if (normalized.includes("customer")) {
    return "Customers";
  }

  if (
    normalized.includes("vendor") ||
    normalized.includes("supplier")
  ) {
    return "Vendors";
  }

  if (normalized.includes("risk")) {
    return "Risk";
  }

  return "System";
}

function normalizePriority(
  value: unknown,
): Priority {
  const normalized = text(value)
    .toLowerCase()
    .trim();

  if (
    normalized === "important" ||
    normalized === "high" ||
    normalized === "critical" ||
    normalized === "urgent"
  ) {
    return "Important";
  }

  return "Normal";
}

function normalizeReadState(
  raw: Record<string, unknown>,
): boolean {
  if (
    typeof raw.read === "boolean"
  ) {
    return raw.read;
  }

  if (
    typeof raw.is_read === "boolean"
  ) {
    return raw.is_read;
  }

  if (
    typeof raw.isRead === "boolean"
  ) {
    return raw.isRead;
  }

  const status = text(
    raw.status ??
      raw.read_status ??
      raw.readStatus,
  ).toLowerCase();

  if (
    status === "read" ||
    status === "seen"
  ) {
    return true;
  }

  if (
    status === "unread" ||
    status === "new"
  ) {
    return false;
  }

  return false;
}

function normalizeNotification(
  raw: Record<string, unknown>,
  index: number,
): Notice {
  const id =
    text(
      raw.id ??
        raw.notification_id ??
        raw.notificationId,
    ) || `notification-${index + 1}`;

  const title =
    text(
      raw.title ??
        raw.name ??
        raw.subject,
    ) || "Business notification";

  const description =
    text(
      raw.description ??
        raw.message ??
        raw.body ??
        raw.content,
    ) || "New business activity requires attention.";

  const relatedRoute =
    text(
      raw.related_route ??
        raw.relatedRoute ??
        raw.route ??
        raw.link ??
        raw.url,
    ) || "/dashboard";

  const rawAmount =
    raw.amount ??
    raw.amount_display ??
    raw.amountDisplay ??
    raw.value;

  const numericAmount =
    toNumber(rawAmount);

  const amount =
    text(rawAmount) ||
    (numericAmount !== null
      ? new Intl.NumberFormat(
          "en-IN",
          {
            style: "currency",
            currency: "INR",
            maximumFractionDigits: 2,
          },
        ).format(numericAmount)
      : undefined);

  return {
    id,
    title,
    description,
    type: normalizeNotificationType(
      raw.type ??
        raw.notification_type ??
        raw.notificationType ??
        raw.category,
    ),
    priority: normalizePriority(
      raw.priority ??
        raw.severity ??
        raw.level,
    ),
    read: normalizeReadState(raw),
    amount:
      amount || undefined,
    entity:
      text(
        raw.entity ??
          raw.entity_name ??
          raw.entityName ??
          raw.customer_name ??
          raw.customerName ??
          raw.vendor_name ??
          raw.vendorName,
      ) || undefined,
    reference:
      text(
        raw.reference ??
          raw.reference_id ??
          raw.referenceId ??
          raw.invoice_number ??
          raw.invoiceNumber,
      ) || undefined,
    createdAt: getTimestamp(
      raw.created_at ??
        raw.createdAt ??
        raw.timestamp ??
        raw.created_on ??
        raw.createdOn,
    ),
    relatedRoute,
  };
}

function extractRows(
  payload: unknown,
): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter(
      (row) =>
        row &&
        typeof row === "object",
    ) as Record<string, unknown>[];
  }

  if (
    payload &&
    typeof payload === "object"
  ) {
    const root =
      payload as Record<
        string,
        unknown
      >;

    const candidates = [
      root.data,
      root.notifications,
      root.items,
      root.results,
      root.records,
    ];

    for (const candidate of candidates) {
      if (Array.isArray(candidate)) {
        return candidate.filter(
          (row) =>
            row &&
            typeof row === "object",
        ) as Record<
          string,
          unknown
        >[];
      }

      if (
        candidate &&
        typeof candidate === "object"
      ) {
        const object =
          candidate as Record<
            string,
            unknown
          >;

        if (Array.isArray(object.items)) {
          return object.items.filter(
            (row) =>
              row &&
              typeof row === "object",
          ) as Record<
            string,
            unknown
          >[];
        }
      }
    }
  }

  return [];
}

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

  const token =
    getStoredToken();

  if (
    token &&
    !headers.has("Authorization")
  ) {
    headers.set(
      "Authorization",
      `Bearer ${token}`,
    );
  }

  const response =
    await fetch(
      `${cleanApiUrl()}${path}`,
      {
        ...options,
        headers,
        credentials: "include",
        cache: "no-store",
      },
    );

  const contentType =
    response.headers.get(
      "content-type",
    ) || "";

  let data: unknown = null;

  if (
    contentType.includes(
      "application/json",
    )
  ) {
    data =
      await response.json();
  } else {
    data =
      await response.text();
  }

  if (!response.ok) {
    let message =
      `API request failed (${response.status})`;

    if (
      typeof data === "object" &&
      data !== null
    ) {
      const root =
        data as Record<
          string,
          unknown
        >;

      if (
        typeof root.detail ===
        "string"
      ) {
        message = root.detail;
      } else if (
        typeof root.message ===
        "string"
      ) {
        message = root.message;
      } else if (
        typeof root.error ===
        "string"
      ) {
        message = root.error;
      } else if (
        Array.isArray(root.detail)
      ) {
        const messages =
          root.detail
            .map((item) => {
              if (
                item &&
                typeof item ===
                  "object"
              ) {
                const object =
                  item as Record<
                    string,
                    unknown
                  >;

                return (
                  text(
                    object.msg,
                  ) ||
                  text(
                    object.message,
                  )
                );
              }

              return text(item);
            })
            .filter(Boolean);

        if (messages.length) {
          message =
            messages.join(" • ");
        }
      }
    } else if (
      typeof data ===
        "string" &&
      data.trim()
    ) {
      message = data;
    }

    throw new Error(message);
  }

  return data as T;
}

async function fetchAllNotifications(): Promise<
  Notice[]
> {
  const rows: Record<
    string,
    unknown
  >[] = [];

  for (
    let pageIndex = 0;
    pageIndex <
    MAX_NOTIFICATION_PAGES;
    pageIndex += 1
  ) {
    const offset =
      pageIndex *
      NOTIFICATION_LIMIT;

    const payload =
      await apiRequest<unknown>(
        `/api/notifications?limit=${NOTIFICATION_LIMIT}&offset=${offset}`,
        {
          method: "GET",
        },
      );

    const pageRows =
      extractRows(payload);

    if (!pageRows.length) {
      break;
    }

    rows.push(...pageRows);

    if (
      pageRows.length <
      NOTIFICATION_LIMIT
    ) {
      break;
    }
  }

  return rows.map(
    normalizeNotification,
  );
}

function relative(
  time: number,
): string {
  const mins = Math.max(
    0,
    Math.round(
      (Date.now() - time) /
        60000,
    ),
  );

  if (mins < 1) {
    return "Just now";
  }

  if (mins < 60) {
    return `${mins} min ago`;
  }

  if (mins < 1440) {
    const hours =
      Math.round(mins / 60);

    return `${hours} ${
      hours === 1
        ? "hour"
        : "hours"
    } ago`;
  }

  const days =
    Math.round(mins / 1440);

  return `${days} ${
    days === 1
      ? "day"
      : "days"
  } ago`;
}

function normalizePriorityLabel(
  value: unknown,
): string {
  const normalized =
    text(value).toUpperCase();

  if (
    normalized === "HIGH" ||
    normalized === "MEDIUM" ||
    normalized === "LOW" ||
    normalized === "CRITICAL"
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
      ? (payload as Record<
          string,
          unknown
        >)
      : {};

  let candidate =
    root.insight &&
    typeof root.insight ===
      "object"
      ? (root.insight as Record<
          string,
          unknown
        >)
      : root;

  const nested = [
    root.data,
    root.result,
    root.response,
    root.content,
    root.message,
  ];

  for (const value of nested) {
    if (
      value &&
      typeof value ===
        "object"
    ) {
      candidate =
        value as Record<
          string,
          unknown
        >;
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
        candidate.action,
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

  if (!summary && rawText) {
    try {
      const parsed =
        JSON.parse(
          rawText,
        ) as unknown;

      if (
        parsed &&
        typeof parsed ===
          "object"
      ) {
        const object =
          parsed as Record<
            string,
            unknown
          >;

        title =
          text(
            object.title,
          ) || title;

        summary =
          text(
            object.summary ??
              object.explanation,
          ) || summary;

        recommendation =
          text(
            object.recommendation ??
              object.action,
          ) ||
          recommendation;

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
      summary =
        rawText;
    }
  }

  if (!summary) {
    throw new Error(
      "AI response did not contain a usable notification insight.",
    );
  }

  return {
    title:
      title ||
      "Notification Intelligence",
    summary,
    recommendation:
      recommendation ||
      "Review the highest-priority business notifications and take action on unresolved financial risks.",
    priority:
      normalizePriorityLabel(
        priority,
      ),
    confidence:
      confidence || undefined,
  };
}

export default function NotificationsPage() {
  const [items, setItems] =
    useState<Notice[]>([]);

  const [tab, setTab] =
    useState("All");

  const [query, setQuery] =
    useState("");

  const [type, setType] =
    useState("All types");

  const [priority, setPriority] =
    useState("All priorities");

  const [read, setRead] =
    useState("All");

  const [selected, setSelected] =
    useState<Notice | null>(
      null,
    );

  const [loading, setLoading] =
    useState(true);

  const [notice, setNotice] =
    useState("");

  const [error, setError] =
    useState("");

  const [updated, setUpdated] =
    useState(Date.now());

  const [aiLoading, setAiLoading] =
    useState(false);

  const [aiError, setAiError] =
    useState("");

  const [aiInsight, setAiInsight] =
    useState<AIInsight | null>(
      null,
    );

  const [
    aiGeneratedAt,
    setAiGeneratedAt,
  ] = useState<number | null>(
    null,
  );

  useEffect(() => {
    void loadNotifications();
  }, []);

  useEffect(() => {
    const timer =
      window.setInterval(
        () => {
          setUpdated(
            Date.now(),
          );
        },
        30000,
      );

    return () =>
      window.clearInterval(
        timer,
      );
  }, []);

  function toast(
    message: string,
  ) {
    setNotice(message);

    window.setTimeout(() => {
      setNotice("");
    }, 3000);
  }

  async function loadNotifications(
    showRefresh = false,
  ) {
    setLoading(true);
    setError("");

    try {
      const rows =
        await fetchAllNotifications();

      setItems(rows);
      setUpdated(Date.now());

      if (showRefresh) {
        toast(
          "Notifications refreshed just now",
        );
      }
    } catch (err) {
      console.error(
        "[Notifications] Failed to load notifications.",
        err,
      );

      setError(
        err instanceof Error
          ? err.message
          : "Unable to load notifications.",
      );

      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  const unread =
    items.filter(
      (item) => !item.read,
    ).length;

  const important =
    items.filter(
      (item) =>
        item.priority ===
        "Important",
    ).length;

  const today =
    items.filter(
      (item) =>
        Date.now() -
          item.createdAt <
        86400000,
    ).length;

  const filtered =
    useMemo(
      () =>
        items.filter(
          (item) => {
            const haystack =
              [
                item.title,
                item.description,
                item.entity ??
                  "",
                item.reference ??
                  "",
                item.type,
                item.priority,
              ]
                .join(" ")
                .toLowerCase();

            const matchesTab =
              tab === "All" ||
              (
                tab === "Unread" &&
                !item.read
              ) ||
              (
                tab ===
                  "Important" &&
                item.priority ===
                  "Important"
              ) ||
              item.type === tab;

            const matchesType =
              type === "All types" ||
              item.type === type;

            const matchesPriority =
              priority ===
                "All priorities" ||
              item.priority ===
                priority;

            const matchesRead =
              read === "All" ||
              (
                read === "Unread" &&
                !item.read
              ) ||
              (
                read === "Read" &&
                item.read
              );

            return (
              matchesTab &&
              matchesType &&
              matchesPriority &&
              matchesRead &&
              haystack.includes(
                query
                  .trim()
                  .toLowerCase(),
              )
            );
          },
        ),
      [
        items,
        tab,
        query,
        type,
        priority,
        read,
      ],
    );

  async function updateReadState(
    item: Notice,
    value: boolean,
    showToast = true,
  ) {
    const previous =
      items;

    setItems((all) =>
      all.map((entry) =>
        entry.id === item.id
          ? {
              ...entry,
              read: value,
            }
          : entry,
      ),
    );

    if (
      selected?.id === item.id
    ) {
      setSelected({
        ...item,
        read: value,
      });
    }

    try {
      /*
       * Backend contract:
       * PATCH /api/notifications/{id}/read
       * PATCH /api/notifications/{id}/unread
       */
      await apiRequest(
        `/api/notifications/${encodeURIComponent(
          item.id,
        )}/${value ? "read" : "unread"}`,
        {
          method: "PATCH",
        },
      );

      if (showToast) {
        toast(
          value
            ? "Notification marked as read"
            : "Notification marked as unread",
        );
      }
    } catch (err) {
      console.error(
        "[Notifications] Failed to update read state.",
        err,
      );

      setItems(previous);

      if (
        selected?.id === item.id
      ) {
        setSelected(item);
      }

      toast(
        err instanceof Error
          ? err.message
          : "Unable to update notification.",
      );
    }
  }

  async function markAllAsRead() {
    const previous =
      items;

    setItems((all) =>
      all.map((item) => ({
        ...item,
        read: true,
      })),
    );

    try {
      await apiRequest(
        "/api/notifications/mark-all-read",
        {
          method: "POST",
        },
      );

      toast(
        "All notifications marked as read",
      );
    } catch (err) {
      console.error(
        "[Notifications] Failed to mark all as read.",
        err,
      );

      setItems(previous);

      toast(
        err instanceof Error
          ? err.message
          : "Unable to mark all notifications as read.",
      );
    }
  }

  function clear() {
    setQuery("");
    setType("All types");
    setPriority(
      "All priorities",
    );
    setRead("All");
    setTab("All");
  }

  async function generateAIInsight() {
    setAiLoading(true);
    setAiError("");
    setAiInsight(null);

    try {
      const intelligence = {
        source:
          "live_cashguard_notifications_page",

        summary: {
          total:
            items.length,
          unread,
          important,
          today,
        },

        notifications:
          items.map(
            (item) => ({
              id: item.id,
              title:
                item.title,
              description:
                item.description,
              type:
                item.type,
              priority:
                item.priority,
              read:
                item.read,
              amount:
                item.amount ??
                null,
              entity:
                item.entity ??
                null,
              reference:
                item.reference ??
                null,
              created_at:
                new Date(
                  item.createdAt,
                ).toISOString(),
              related_route:
                item.relatedRoute,
            }),
          ),

        top_unread:
          items
            .filter(
              (item) =>
                !item.read,
            )
            .slice(0, 20)
            .map(
              (item) => ({
                id: item.id,
                title:
                  item.title,
                description:
                  item.description,
                type:
                  item.type,
                priority:
                  item.priority,
                amount:
                  item.amount ??
                  null,
                entity:
                  item.entity ??
                  null,
              }),
            ),
      };

      const response =
        await apiRequest<unknown>(
          "/ai/insight/notifications",
          {
            method: "POST",
            body: JSON.stringify({
              intelligence,
            }),
          },
        );

      const insight =
        parseAIInsight(
          response,
        );

      setAiInsight(insight);
      setAiGeneratedAt(
        Date.now(),
      );
    } catch (err) {
      console.error(
        "[Notifications] AI insight failed.",
        err,
      );

      setAiError(
        err instanceof Error
          ? err.message
          : "Unable to generate notification AI insight.",
      );
    } finally {
      setAiLoading(false);
    }
  }

  const tabs = [
    "All",
    "Unread",
    "Important",
    "Payments",
    "Invoices",
    "Banking",
    "System",
  ];

  return (
    <main className="foundation-content notifications-page">
      <style jsx>{`
        .notifications-page {
          max-width: 1440px;
        }

        .notifications-header {
          display: flex;
          justify-content: space-between;
          gap: 20px;
          align-items: flex-end;
        }

        .notifications-actions {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }

        .notifications-updated {
          font-size: 11px;
          color: var(--muted-foreground);
          margin-right: 8px;
        }

        .notifications-stats {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 10px;
          margin: 20px 0;
        }

        .notification-stat {
          padding: 16px 18px;
        }

        .notification-stat span {
          font-size: 11px;
          color: var(--muted-foreground);
          display: block;
        }

        .notification-stat strong {
          display: block;
          font-size: 25px;
          margin-top: 8px;
        }

        .notification-stat small {
          color: var(--muted-foreground);
        }

        .notifications-workspace {
          overflow: hidden;
        }

        .notifications-tabs {
          display: flex;
          gap: 4px;
          padding: 0 18px;
          border-bottom: 1px solid var(--border);
          overflow-x: auto;
        }

        .notifications-tabs button {
          white-space: nowrap;
          padding: 13px 12px;
          border: 0;
          background: transparent;
          color: var(--muted-foreground);
          font-size: 12px;
          border-bottom: 2px solid transparent;
        }

        .notifications-tabs button.active {
          color: var(--foreground);
          border-bottom-color: var(--primary);
          font-weight: 700;
        }

        .notifications-tabs b {
          margin-left: 5px;
          font-size: 10px;
        }

        .notifications-filters {
          display: flex;
          gap: 8px;
          padding: 16px 18px;
          flex-wrap: wrap;
          border-bottom: 1px solid var(--border);
        }

        .notifications-filters .search-control {
          flex: 1;
          min-width: 220px;
        }

        .notifications-filters select {
          min-height: 34px;
        }

        .notifications-live {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 14px 18px;
          background: color-mix(
            in srgb,
            var(--primary) 5%,
            transparent
          );
          font-size: 12px;
        }

        .live-dot {
          display: inline-block;
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: var(--success);
          margin-right: 7px;
        }

        .notification-list {
          display: flex;
          flex-direction: column;
        }

        .notification-item {
          display: grid;
          grid-template-columns: 28px 1fr auto auto 24px;
          gap: 12px;
          align-items: start;
          text-align: left;
          padding: 16px 18px;
          border: 0;
          border-bottom: 1px solid var(--border);
          background: transparent;
          color: inherit;
          width: 100%;
          cursor: pointer;
        }

        .notification-item:hover {
          background: color-mix(
            in srgb,
            var(--primary) 4%,
            transparent
          );
        }

        .notification-item.unread {
          background: color-mix(
            in srgb,
            var(--primary) 3%,
            transparent
          );
        }

        .notification-icon {
          width: 28px;
          height: 28px;
          border-radius: 8px;
          display: grid;
          place-items: center;
          background: color-mix(
            in srgb,
            var(--primary) 11%,
            transparent
          );
          color: var(--primary);
        }

        .notification-item strong {
          font-size: 13px;
        }

        .notification-item p {
          font-size: 12px;
          color: var(--muted-foreground);
          margin: 4px 0;
        }

        .notification-meta {
          display: flex;
          gap: 8px;
          align-items: center;
          flex-wrap: wrap;
        }

        .notification-meta small {
          color: var(--muted-foreground);
          font-size: 11px;
        }

        .unread-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: var(--primary);
          margin-top: 10px;
          display: block;
        }

        .priority-important {
          color: var(--destructive);
          font-size: 10px;
          font-weight: 700;
        }

        .notification-amount {
          font-size: 12px;
          font-weight: 700;
        }

        .notification-empty {
          text-align: center;
          padding: 44px 20px;
          color: var(--muted-foreground);
        }

        .notification-bottom {
          display: grid;
          grid-template-columns: 1.2fr 1fr;
          gap: 12px;
          margin-top: 12px;
        }

        .notification-section {
          padding: 18px;
        }

        .notification-section h3 {
          margin: 0 0 10px;
        }

        .important-row {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          padding: 10px 0;
          border-bottom: 1px solid var(--border);
          font-size: 12px;
        }

        .important-row small {
          display: block;
          color: var(--muted-foreground);
          margin-top: 2px;
        }

        .notification-ai {
          margin-top: 12px;
          padding: 18px;
          border: 1px solid var(--border);
          border-radius: 12px;
          background: color-mix(
            in srgb,
            var(--primary) 4%,
            transparent
          );
        }

        .notification-ai-head {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: center;
        }

        .notification-ai-title {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .notification-ai-title svg {
          color: var(--primary);
        }

        .notification-ai-head h3 {
          margin: 0;
        }

        .notification-ai-copy {
          margin-top: 8px;
          color: var(--muted-foreground);
          line-height: 1.6;
          font-size: 12px;
        }

        .notification-ai-recommendation {
          margin-top: 14px;
          padding: 12px;
          border-radius: 9px;
          background: var(--background);
          border: 1px solid var(--border);
          font-size: 12px;
          line-height: 1.6;
        }

        .notification-ai-meta {
          margin-top: 10px;
          font-size: 10px;
          color: var(--muted-foreground);
        }

        .notification-drawer-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.35);
          z-index: 30;
        }

        .notification-drawer {
          position: absolute;
          right: 0;
          top: 0;
          height: 100%;
          width: min(440px, 100%);
          background: var(--background);
          padding: 22px;
          overflow: auto;
          box-shadow:
            -12px 0 35px rgba(15, 23, 42, 0.18);
        }

        .drawer-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
        }

        .drawer-kicker {
          font-size: 10px;
          color: var(--primary);
          font-weight: 800;
          letter-spacing: 0.1em;
        }

        .drawer-icon {
          margin: 24px 0 14px;
          width: 40px;
          height: 40px;
          border-radius: 12px;
          display: grid;
          place-items: center;
          background: color-mix(
            in srgb,
            var(--primary) 10%,
            transparent
          );
          color: var(--primary);
        }

        .drawer-description {
          color: var(--muted-foreground);
          line-height: 1.6;
        }

        .drawer-details {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin: 20px 0;
        }

        .drawer-details span {
          display: block;
          font-size: 10px;
          color: var(--muted-foreground);
        }

        .drawer-details strong {
          font-size: 12px;
        }

        .drawer-timeline {
          border-top: 1px solid var(--border);
          padding-top: 16px;
        }

        .drawer-timeline div {
          display: flex;
          gap: 12px;
          padding: 8px 0;
          font-size: 12px;
        }

        .drawer-timeline time {
          color: var(--muted-foreground);
          width: 42px;
        }

        .drawer-actions {
          display: flex;
          gap: 8px;
          margin-top: 20px;
          flex-wrap: wrap;
        }

        .notifications-toast {
          position: fixed;
          right: 20px;
          bottom: 20px;
          z-index: 40;
        }

        .notifications-error {
          margin-bottom: 12px;
          padding: 12px 14px;
          border-radius: 10px;
          border: 1px solid color-mix(
            in srgb,
            var(--destructive) 25%,
            var(--border)
          );
          color: var(--destructive);
          background: color-mix(
            in srgb,
            var(--destructive) 5%,
            transparent
          );
          font-size: 12px;
        }

        .spin {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        @media (max-width: 760px) {
          .notifications-header {
            display: block;
          }

          .notifications-actions {
            margin-top: 14px;
          }

          .notifications-stats {
            grid-template-columns: repeat(2, 1fr);
          }

          .notification-item {
            grid-template-columns: 20px 1fr 20px;
          }

          .notification-item > .notification-amount,
          .notification-item > .priority-important {
            display: none;
          }

          .notification-bottom {
            grid-template-columns: 1fr;
          }

          .notifications-updated {
            display: block;
            margin: 0 0 8px;
          }

          .notifications-live {
            align-items: flex-start;
            gap: 10px;
            flex-direction: column;
          }

          .notification-ai-head {
            align-items: flex-start;
            flex-direction: column;
          }
        }
      `}</style>

      <div className="notifications-header">
        <div>
          <p className="auth-eyebrow">
            WORKSPACE · LIVE MONITORING
          </p>

          <h2>
            Notifications
          </h2>

          <p>
            Stay updated with important
            business activity.
          </p>
        </div>

        <div className="notifications-actions">
          <span className="notifications-updated">
            Last updated:{" "}
            {relative(updated)}
          </span>

          <button
            className="secondary-button"
            onClick={() =>
              void markAllAsRead()
            }
            disabled={
              !unread ||
              loading
            }
          >
            <Check size={14} />
            Mark all as read
          </button>

          <button
            className="secondary-button"
            onClick={() =>
              void loadNotifications(
                true,
              )
            }
            disabled={loading}
          >
            <RefreshCw
              size={14}
              className={
                loading
                  ? "spin"
                  : ""
              }
            />

            {loading
              ? "Refreshing"
              : "Refresh"}
          </button>

          <button
            className="auth-button compact"
            onClick={() =>
              void generateAIInsight()
            }
            disabled={
              aiLoading ||
              loading ||
              !items.length
            }
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
              : "AI Intelligence"}
          </button>
        </div>
      </div>

      {error ? (
        <div className="notifications-error">
          <strong>
            Notification loading failed:
          </strong>{" "}
          {error}
        </div>
      ) : null}

      <div className="notifications-stats">
        {[
          [
            "All Notifications",
            items.length,
            "All recent notifications.",
          ],
          [
            "Unread",
            unread,
            "Require your attention.",
          ],
          [
            "Important",
            important,
            "High-value business updates.",
          ],
          [
            "Today",
            today,
            "Notifications received today.",
          ],
        ].map(
          ([
            label,
            value,
            detail,
          ]) => (
            <section
              className="foundation-card notification-stat"
              key={String(label)}
            >
              <span>
                {label}
              </span>

              <strong>
                {value}
              </strong>

              <small>
                {detail}
              </small>
            </section>
          ),
        )}
      </div>

      {notice && (
        <div className="operations-success notifications-toast">
          <CheckCheck size={16} />

          {notice}

          <button
            aria-label="Dismiss notification"
            onClick={() =>
              setNotice("")
            }
          >
            <X size={15} />
          </button>
        </div>
      )}

      {aiError ? (
        <section className="notifications-error">
          <strong>
            AI intelligence:
          </strong>{" "}
          {aiError}
        </section>
      ) : null}

      {aiInsight ? (
        <section className="foundation-card notification-ai">
          <div className="notification-ai-head">
            <div>
              <div className="notification-ai-title">
                <Sparkles size={16} />

                <h3>
                  {aiInsight.title}
                </h3>
              </div>

              <p className="notification-ai-copy">
                {aiInsight.summary}
              </p>
            </div>

            <span className="priority-important">
              {aiInsight.priority}
            </span>
          </div>

          <div className="notification-ai-recommendation">
            <strong>
              Recommended action
            </strong>

            <div>
              {
                aiInsight.recommendation
              }
            </div>
          </div>

          {aiInsight.confidence ? (
            <div className="notification-ai-meta">
              Confidence:{" "}
              <strong>
                {
                  aiInsight.confidence
                }
              </strong>
            </div>
          ) : null}

          {aiGeneratedAt ? (
            <div className="notification-ai-meta">
              Generated{" "}
              {relative(
                aiGeneratedAt,
              )}
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="foundation-card notifications-workspace">
        <div className="notifications-live">
          <span>
            <i className="live-dot" />
            Notification monitoring active
          </span>

          <span>
            Last checked:{" "}
            {relative(updated)}
          </span>
        </div>

        <div
          className="notifications-tabs"
          role="tablist"
        >
          {tabs.map(
            (item) => (
              <button
                key={item}
                className={
                  tab === item
                    ? "active"
                    : ""
                }
                onClick={() =>
                  setTab(item)
                }
              >
                {item}

                <b>
                  {item === "All"
                    ? items.length
                    : item ===
                        "Unread"
                      ? unread
                      : item ===
                          "Important"
                        ? important
                        : items.filter(
                            (n) =>
                              n.type ===
                              item,
                          ).length}
                </b>
              </button>
            ),
          )}
        </div>

        <div className="notifications-filters">
          <div className="search-control">
            <Search size={15} />

            <input
              aria-label="Search notifications"
              placeholder="Search notifications"
              value={query}
              onChange={(e) =>
                setQuery(
                  e.target.value,
                )
              }
            />
          </div>

          <select
            aria-label="Notification type"
            value={type}
            onChange={(e) =>
              setType(
                e.target.value,
              )
            }
          >
            <option>
              All types
            </option>

            {[
              "Payments",
              "Invoices",
              "Banking",
              "Reconciliation",
              "Customers",
              "Vendors",
              "Risk",
              "System",
            ].map(
              (x) => (
                <option
                  key={x}
                  value={x}
                >
                  {x}
                </option>
              ),
            )}
          </select>

          <select
            aria-label="Notification priority"
            value={priority}
            onChange={(e) =>
              setPriority(
                e.target.value,
              )
            }
          >
            <option>
              All priorities
            </option>
            <option>
              Important
            </option>
            <option>
              Normal
            </option>
          </select>

          <select
            aria-label="Read status"
            value={read}
            onChange={(e) =>
              setRead(
                e.target.value,
              )
            }
          >
            <option value="All">
              All status
            </option>

            <option value="Unread">
              Unread
            </option>

            <option value="Read">
              Read
            </option>
          </select>

          <button
            className="secondary-button"
            onClick={clear}
          >
            Clear filters
          </button>
        </div>

        <div className="notification-list">
          {loading ? (
            <div className="notification-empty">
              <RefreshCw
                size={22}
                className="spin"
              />

              <div>
                Loading live
                notifications...
              </div>
            </div>
          ) : filtered.length ? (
            filtered.map(
              (item) => {
                const Icon =
                  iconFor[
                    item.type
                  ];

                return (
                  <button
                    key={item.id}
                    className={`notification-item ${
                      item.read
                        ? ""
                        : "unread"
                    }`}
                    onClick={() => {
                      setSelected(
                        item,
                      );

                      void updateReadState(
                        item,
                        true,
                        false,
                      );
                    }}
                  >
                    <span
                      className={
                        item.read
                          ? ""
                          : "unread-dot"
                      }
                    >
                      {item.read ? (
                        <Check
                          size={13}
                        />
                      ) : null}
                    </span>

                    <span>
                      <span className="notification-icon">
                        <Icon
                          size={15}
                        />
                      </span>
                    </span>

                    <span>
                      <strong>
                        {
                          item.title
                        }
                      </strong>

                      <p>
                        {
                          item.description
                        }
                      </p>

                      <span className="notification-meta">
                        <small>
                          {item.entity ||
                            "Business activity"}{" "}
                          ·{" "}
                          {item.reference ||
                            item.id}
                        </small>

                        {item.priority ===
                        "Important" ? (
                          <em className="priority-important">
                            Important
                          </em>
                        ) : null}
                      </span>
                    </span>

                    <span className="notification-amount">
                      {item.amount ||
                        ""}
                    </span>

                    <MoreHorizontal
                      size={16}
                    />
                  </button>
                );
              },
            )
          ) : (
            <div className="notification-empty">
              <Bell size={22} />

              <strong>
                {query ||
                tab !== "All"
                  ? "No notifications matching your filters"
                  : "You're all caught up"}
              </strong>

              <p>
                There are no new
                notifications
                requiring your
                attention.
              </p>

              <button
                className="secondary-button"
                onClick={clear}
              >
                Clear filters
              </button>
            </div>
          )}
        </div>
      </section>

      <div className="notification-bottom">
        <section className="foundation-card notification-section">
          <h3>
            Important
          </h3>

          {items
            .filter(
              (item) =>
                item.priority ===
                "Important",
            )
            .slice(0, 4)
            .map(
              (item) => (
                <div
                  className="important-row"
                  key={item.id}
                >
                  <span>
                    {
                      item.title
                    }

                    <small>
                      {
                        item.entity
                      }
                    </small>
                  </span>

                  <strong>
                    {item.amount ||
                      item.type}
                  </strong>
                </div>
              ),
            )}

          {!items.some(
            (item) =>
              item.priority ===
              "Important",
          ) ? (
            <p className="notification-ai-copy">
              No important
              notifications are
              currently available.
            </p>
          ) : null}
        </section>

        <section className="foundation-card notification-section">
          <p className="auth-eyebrow">
            TODAY&apos;S ACTIVITY
          </p>

          <h3>
            Business pulse
          </h3>

          <div className="important-row">
            <span>
              Payments received
            </span>

            <strong>
              {
                items.filter(
                  (n) =>
                    n.type ===
                    "Payments",
                ).length
              }
            </strong>
          </div>

          <div className="important-row">
            <span>
              Banking updates
            </span>

            <strong>
              {
                items.filter(
                  (n) =>
                    n.type ===
                    "Banking",
                ).length
              }
            </strong>
          </div>

          <div className="important-row">
            <span>
              Risk events
            </span>

            <strong>
              {
                items.filter(
                  (n) =>
                    n.type ===
                    "Risk",
                ).length
              }
            </strong>
          </div>

          <div className="important-row">
            <span>
              Unread items
            </span>

            <strong>
              {unread}
            </strong>
          </div>
        </section>
      </div>

      {selected ? (
        <div
          className="notification-drawer-backdrop"
          onClick={() =>
            setSelected(null)
          }
        >
          <aside
            className="notification-drawer"
            onClick={(e) =>
              e.stopPropagation()
            }
          >
            <div className="drawer-head">
              <div>
                <span className="drawer-kicker">
                  NOTIFICATION DETAIL ·{" "}
                  {selected.id}
                </span>

                <h3>
                  {
                    selected.title
                  }
                </h3>
              </div>

              <button
                className="icon-action"
                aria-label="Close notification details"
                onClick={() =>
                  setSelected(null)
                }
              >
                <X size={17} />
              </button>
            </div>

            <div className="drawer-icon">
              {(() => {
                const Icon =
                  iconFor[
                    selected.type
                  ];

                return (
                  <Icon
                    size={20}
                  />
                );
              })()}
            </div>

            <p className="drawer-description">
              {
                selected.description
              }
            </p>

            <div className="drawer-details">
              {[
                [
                  "Type",
                  selected.type,
                ],
                [
                  "Priority",
                  selected.priority,
                ],
                [
                  "Amount",
                  selected.amount ||
                    "—",
                ],
                [
                  "Entity",
                  selected.entity ||
                    "—",
                ],
                [
                  "Reference",
                  selected.reference ||
                    "—",
                ],
                [
                  "Created",
                  new Date(
                    selected.createdAt,
                  ).toLocaleString(
                    "en-IN",
                  ),
                ],
              ].map(
                ([
                  label,
                  value,
                ]) => (
                  <div
                    key={label}
                  >
                    <span>
                      {label}
                    </span>

                    <strong>
                      {value}
                    </strong>
                  </div>
                ),
              )}
            </div>

            <div className="drawer-timeline">
              <p className="auth-eyebrow">
                ACTIVITY
              </p>

              <div>
                <time>
                  {new Date(
                    selected.createdAt,
                  ).toLocaleTimeString(
                    "en-IN",
                    {
                      hour: "2-digit",
                      minute:
                        "2-digit",
                    },
                  )}
                </time>

                <span>
                  Notification
                  created
                </span>
              </div>

              <div>
                <time>
                  Now
                </time>

                <span>
                  Notification
                  viewed
                </span>
              </div>

              <div>
                <time>
                  Live
                </time>

                <span>
                  Related business
                  activity available
                </span>
              </div>
            </div>

            <div className="drawer-actions">
              <button
                className="secondary-button"
                onClick={() =>
                  void updateReadState(
                    selected,
                    !selected.read,
                  )
                }
              >
                {selected.read
                  ? "Mark as unread"
                  : "Mark as read"}
              </button>

              <button
                className="auth-button compact"
                onClick={() =>
                  (window.location.href =
                    selected.relatedRoute)
                }
              >
                Open related record
                <ArrowUpRight
                  size={13}
                />
              </button>
            </div>
          </aside>
        </div>
      ) : null}
    </main>
  );
}