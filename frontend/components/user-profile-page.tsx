"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Building2,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  UserRound,
} from "lucide-react";

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL ||
  "http://127.0.0.1:8000"
).replace(/\/+$/, "");

const AUTH_TOKEN_KEYS = [
  "cashguard_access_token",
  "access_token",
  "accessToken",
  "token",
  "auth_token",
  "jwt_token",
  "jwt",
  "cashguard_token",
] as const;

type UserProfile = {
  id?: string;
  name: string;
  email: string;
  role: string;
  mobile?: string;
  job_title?: string;
  city?: string;
  state?: string;
  business_id?: string;
};

const DEFAULT_PROFILE: UserProfile = {
  name: "User",
  email: "",
  role: "user",
};

function getToken(): string {
  if (typeof window === "undefined") {
    return "";
  }

  const storages = [
    window.localStorage,
    window.sessionStorage,
  ];

  for (const storage of storages) {
    for (const key of AUTH_TOKEN_KEYS) {
      const value = storage.getItem(key)?.trim();

      if (value) {
        return value.replace(/^Bearer\s+/i, "");
      }
    }
  }

  return "";
}

function asRecord(
  value: unknown,
): Record<string, unknown> | null {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return null;
  }

  return value as Record<string, unknown>;
}

function readString(
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

function normalizeProfile(
  value: unknown,
): UserProfile | null {
  const source = asRecord(value);

  if (!source) {
    return null;
  }

  const name =
    readString(
      source.full_name ??
        source.fullName ??
        source.name ??
        source.username,
    ) || "User";

  const email = readString(
    source.email,
  );

  const role =
    readString(
      source.role ??
        source.user_role ??
        source.userRole,
    ) || "user";

  const mobile =
    readString(
      source.mobile ??
        source.phone ??
        source.phone_number ??
        source.phoneNumber,
    ) || undefined;

  const jobTitle =
    readString(
      source.job_title ??
        source.jobTitle ??
        source.designation,
    ) || undefined;

  const city =
    readString(source.city) || undefined;

  const state =
    readString(source.state) || undefined;

  const businessId =
    readString(
      source.business_id ??
        source.businessId ??
        source.businessID,
    ) || undefined;

  const id =
    readString(
      source.id ??
        source.user_id ??
        source.userId,
    ) || undefined;

  return {
    id,
    name,
    email,
    role,
    mobile,
    job_title: jobTitle,
    city,
    state,
    business_id: businessId,
  };
}

function getStoredProfile(): UserProfile {
  if (typeof window === "undefined") {
    return DEFAULT_PROFILE;
  }

  const localName =
    window.localStorage
      .getItem("user_name")
      ?.trim();

  const sessionName =
    window.sessionStorage
      .getItem("user_name")
      ?.trim();

  const localEmail =
    window.localStorage
      .getItem("user_email")
      ?.trim();

  const sessionEmail =
    window.sessionStorage
      .getItem("user_email")
      ?.trim();

  const authEmail =
    window.localStorage
      .getItem("auth_email")
      ?.trim();

  const localRole =
    window.localStorage
      .getItem("user_role")
      ?.trim();

  const sessionRole =
    window.sessionStorage
      .getItem("user_role")
      ?.trim();

  const businessId =
    window.localStorage
      .getItem("business_id")
      ?.trim() ||
    window.sessionStorage
      .getItem("business_id")
      ?.trim() ||
    window.localStorage
      .getItem("cashguard_business_id")
      ?.trim();

  return {
    name:
      localName ||
      sessionName ||
      "User",

    email:
      localEmail ||
      sessionEmail ||
      authEmail ||
      "",

    role:
      localRole ||
      sessionRole ||
      "user",

    business_id:
      businessId || undefined,
  };
}

function persistProfile(
  profile: UserProfile,
): void {
  if (typeof window === "undefined") {
    return;
  }

  const values: Record<string, string> = {
    user_name: profile.name,
    user_email: profile.email,
    user_role: profile.role,
  };

  if (profile.business_id) {
    values.business_id =
      profile.business_id;

    values.businessId =
      profile.business_id;

    values.cashguard_business_id =
      profile.business_id;
  }

  if (profile.mobile) {
    values.user_mobile =
      profile.mobile;
  }

  if (profile.job_title) {
    values.user_job_title =
      profile.job_title;
  }

  if (profile.city) {
    values.user_city =
      profile.city;
  }

  if (profile.state) {
    values.user_state =
      profile.state;
  }

  for (const [key, value] of Object.entries(
    values,
  )) {
    try {
      window.localStorage.setItem(
        key,
        value,
      );
    } catch {
      // Keep the profile in memory if storage is unavailable.
    }
  }
}

function profileInitials(
  name: string,
  email = "",
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

  if (parts[0]) {
    return parts[0]
      .slice(0, 2)
      .toUpperCase();
  }

  return (
    email
      .trim()
      .slice(0, 2)
      .toUpperCase() || "CG"
  );
}

function roleLabel(
  role: string,
): string {
  const normalized =
    role.trim().toLowerCase();

  const labels: Record<
    string,
    string
  > = {
    admin: "Administrator",
    administrator: "Administrator",
    owner: "Owner",
    super_admin:
      "Super Administrator",
    superadmin:
      "Super Administrator",
    platform_admin:
      "Platform Administrator",
    "platform-admin":
      "Platform Administrator",
    finance_manager:
      "Finance Manager",
    manager: "Manager",
    viewer: "Viewer",
    user: "User",
  };

  if (labels[normalized]) {
    return labels[normalized];
  }

  return (
    normalized
      .replace(/[_-]+/g, " ")
      .replace(/\b\w/g, (match) =>
        match.toUpperCase(),
      ) || "User"
  );
}

async function fetchCurrentProfile(): Promise<UserProfile | null> {
  const token = getToken();

  if (!token) {
    return null;
  }

  const response = await fetch(
    `${API_BASE_URL}/api/auth/me`,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      credentials: "include",
      cache: "no-store",
    },
  );

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
    body =
      await response.text();
  }

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error(
        "Your session has expired. Please login again.",
      );
    }

    if (
      typeof body === "object" &&
      body !== null
    ) {
      const root =
        body as Record<
          string,
          unknown
        >;

      if (
        typeof root.detail ===
        "string"
      ) {
        throw new Error(
          root.detail,
        );
      }

      if (
        typeof root.message ===
        "string"
      ) {
        throw new Error(
          root.message,
        );
      }
    }

    throw new Error(
      "Unable to load the latest profile details.",
    );
  }

  const root = asRecord(body);

  const nestedUser =
    asRecord(root?.user);

  const nestedData =
    asRecord(root?.data);

  const dataUser =
    asRecord(
      nestedData?.user,
    );

  return (
    normalizeProfile(
      nestedUser ||
        dataUser ||
        nestedData ||
        body,
    ) || null
  );
}

export default function UserProfilePage() {
  const [
    profile,
    setProfile,
  ] = useState<UserProfile>(
    () => getStoredProfile(),
  );

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    error,
    setError,
  ] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      try {
        const latest =
          await fetchCurrentProfile();

        if (
          latest &&
          !cancelled
        ) {
          setProfile(latest);
          persistProfile(latest);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Unable to load profile details.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadProfile();

    return () => {
      cancelled = true;
    };
  }, []);

  const initials = useMemo(
    () =>
      profileInitials(
        profile.name,
        profile.email,
      ),
    [
      profile.name,
      profile.email,
    ],
  );

  const role = roleLabel(
    profile.role,
  );

  return (
    <main className="foundation-content">
      <div className="dashboard-heading">
        <div>
          <p className="auth-eyebrow">
            USER PROFILE
          </p>

          <h2>
            {profile.name}
          </h2>

          <p>
            Your CashGuard-AI
            account profile and
            authenticated business
            access details.
          </p>
        </div>

        <div className="dashboard-actions">
          <Link
            href="/dashboard"
            className="secondary-button"
          >
            <ArrowLeft size={14} />
            Back to Dashboard
          </Link>

          <Link
            href="/settings"
            className="auth-button compact"
          >
            Account Settings
          </Link>
        </div>
      </div>

      {error ? (
        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {error} The locally
          stored profile is
          still being shown.
        </div>
      ) : null}

      <section
        className="foundation-card"
        style={{
          marginTop: 20,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 18,
            flexWrap: "wrap",
          }}
        >
          <div
            aria-hidden="true"
            style={{
              width: 72,
              height: 72,
              borderRadius: 18,
              display: "grid",
              placeItems: "center",
              background:
                "#e0f2fe",
              color: "#0369a1",
              fontSize: 22,
              fontWeight: 800,
            }}
          >
            {initials}
          </div>

          <div
            style={{
              flex: 1,
              minWidth: 220,
            }}
          >
            <div className="auth-eyebrow">
              SIGNED-IN USER
            </div>

            <h3
              style={{
                marginTop: 6,
              }}
            >
              {profile.name}
            </h3>

            <p
              style={{
                marginTop: 6,
                color: "#64748b",
              }}
            >
              {role}
            </p>
          </div>

          <div className="status-pill ready">
            <ShieldCheck size={13} />
            Authenticated
          </div>
        </div>
      </section>

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 16,
          marginTop: 16,
        }}
      >
        <section className="foundation-card">
          <div className="panel-heading">
            <div>
              <h3>
                Personal information
              </h3>

              <p>
                Current account
                details
              </p>
            </div>

            <UserRound size={18} />
          </div>

          <div
            style={{
              display: "grid",
              gap: 16,
              marginTop: 18,
            }}
          >
            <ProfileRow
              icon={
                <UserRound size={15} />
              }
              label="Full name"
              value={
                profile.name ||
                "—"
              }
            />

            <ProfileRow
              icon={
                <Mail size={15} />
              }
              label="Email"
              value={
                profile.email ||
                "—"
              }
            />

            <ProfileRow
              icon={
                <Phone size={15} />
              }
              label="Mobile"
              value={
                profile.mobile ||
                "—"
              }
            />

            <ProfileRow
              icon={
                <ShieldCheck size={15} />
              }
              label="Role"
              value={role}
            />
          </div>
        </section>

        <section className="foundation-card">
          <div className="panel-heading">
            <div>
              <h3>
                Business access
              </h3>

              <p>
                Workspace and
                access context
              </p>
            </div>

            <Building2 size={18} />
          </div>

          <div
            style={{
              display: "grid",
              gap: 16,
              marginTop: 18,
            }}
          >
            <ProfileRow
              icon={
                <ShieldCheck size={15} />
              }
              label="Business ID"
              value={
                profile.business_id ||
                "—"
              }
            />

            <ProfileRow
              icon={
                <Building2 size={15} />
              }
              label="Job title"
              value={
                profile.job_title ||
                "—"
              }
            />

            <ProfileRow
              icon={
                <MapPin size={15} />
              }
              label="City"
              value={
                profile.city ||
                "—"
              }
            />

            <ProfileRow
              icon={
                <MapPin size={15} />
              }
              label="State"
              value={
                profile.state ||
                "—"
              }
            />
          </div>
        </section>
      </div>

      <section
        className="foundation-card"
        style={{
          marginTop: 16,
        }}
      >
        <div className="panel-heading">
          <div>
            <h3>
              Account actions
            </h3>

            <p>
              Manage the rest of
              your CashGuard-AI
              account from the
              existing settings
              area.
            </p>
          </div>
        </div>

        <div
          className="card-actions"
          style={{
            marginTop: 16,
          }}
        >
          <Link
            href="/settings"
            className="secondary-button"
          >
            Open Settings
          </Link>

          <Link
            href="/help"
            className="secondary-button"
          >
            Help centre
          </Link>
        </div>
      </section>

      {loading ? (
        <p
          style={{
            marginTop: 12,
            fontSize: 11,
            color: "#94a3b8",
          }}
        >
          Syncing your latest
          profile details…
        </p>
      ) : null}
    </main>
  );
}

function ProfileRow({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        alignItems: "flex-start",
      }}
    >
      <span
        style={{
          color: "#0284c7",
          marginTop: 2,
        }}
      >
        {icon}
      </span>

      <div
        style={{
          minWidth: 0,
        }}
      >
        <span
          style={{
            display: "block",
            color: "#94a3b8",
            fontSize: 10,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing:
              "0.08em",
          }}
        >
          {label}
        </span>

        <strong
          style={{
            display: "block",
            marginTop: 4,
            color: "#334155",
            fontSize: 13,
            fontWeight: 600,
            wordBreak: "break-word",
          }}
        >
          {value}
        </strong>
      </div>
    </div>
  );
}