import { apiFetch } from "./client";

export interface DashboardApiResponse {
  status?: string;
  message?: string;
  data?: unknown;
  [key: string]: unknown;
}

export async function getDashboardSummary() {
  return apiFetch<DashboardApiResponse>(
    "/api/dashboard/summary"
  );
}

export async function getDashboardCashFlow() {
  return apiFetch<DashboardApiResponse>(
    "/api/dashboard/cash-flow"
  );
}

export async function getDashboardRecentTransactions() {
  return apiFetch<DashboardApiResponse>(
    "/api/dashboard/recent-transactions"
  );
}

export async function getDashboardAlerts() {
  return apiFetch<DashboardApiResponse>(
    "/api/dashboard/alerts"
  );
}