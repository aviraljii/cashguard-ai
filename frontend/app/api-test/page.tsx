"use client";

import { useEffect, useState } from "react";

export default function ApiTestPage() {
  const [result, setResult] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;

    async function testCustomerApi() {
      const baseUrl = process.env.NEXT_PUBLIC_API_URL?.trim();

      if (!baseUrl) {
        if (!cancelled) {
          setLoading(false);
          setError("NEXT_PUBLIC_API_URL is not configured.");
        }
        return;
      }

      const cleanBaseUrl = baseUrl.replace(/\/+$/, "");
      const url = `${cleanBaseUrl}/api/customers?limit=5`;

      console.log("CUSTOMER TEST URL:", url);

      try {
        const token =
          typeof window !== "undefined"
            ? localStorage.getItem("access_token") ||
              sessionStorage.getItem("access_token") ||
              localStorage.getItem("cashguard_access_token") ||
              sessionStorage.getItem("cashguard_access_token")
            : null;

        const headers: HeadersInit = {
          Accept: "application/json",
        };

        if (token) {
          headers.Authorization = `Bearer ${token.replace(
            /^Bearer\s+/i,
            "",
          )}`;
        }

        const response = await fetch(url, {
          method: "GET",
          mode: "cors",
          credentials: "include",
          headers,
          cache: "no-store",
        });

        console.log(
          "CUSTOMER RESPONSE STATUS:",
          response.status,
        );

        const text = await response.text();

        console.log(
          "CUSTOMER RESPONSE BODY:",
          text,
        );

        if (!response.ok) {
          throw new Error(
            `HTTP ${response.status}: ${
              text || "Request failed"
            }`,
          );
        }

        let formattedResult = text;

        try {
          const parsed = JSON.parse(text);
          formattedResult = JSON.stringify(
            parsed,
            null,
            2,
          );
        } catch {
          // Keep original response text.
        }

        if (!cancelled) {
          setResult(formattedResult);
          setError("");
          setLoading(false);
        }
      } catch (err) {
        console.error(
          "CUSTOMER DIRECT FETCH ERROR:",
          err,
        );

        if (!cancelled) {
          setResult("");
          setLoading(false);

          if (err instanceof Error) {
            setError(err.message);
          } else {
            setError(
              "Failed to fetch customers.",
            );
          }
        }
      }
    }

    void testCustomerApi();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "40px",
        fontFamily:
          "Arial, Helvetica, sans-serif",
      }}
    >
      <h1>CashGuard Customer API Test</h1>

      <p style={{ marginTop: "10px" }}>
        Testing:
        <code style={{ marginLeft: "8px" }}>
          /api/customers?limit=5
        </code>
      </p>

      {loading && (
        <pre
          style={{
            whiteSpace: "pre-wrap",
            marginTop: "20px",
          }}
        >
          Testing...
        </pre>
      )}

      {!loading && result && (
        <pre
          style={{
            whiteSpace: "pre-wrap",
            marginTop: "20px",
            padding: "20px",
            borderRadius: "8px",
            background: "#f5f5f5",
            overflowX: "auto",
          }}
        >
          {result}
        </pre>
      )}

      {!loading && error && (
        <pre
          style={{
            whiteSpace: "pre-wrap",
            marginTop: "20px",
            padding: "20px",
            borderRadius: "8px",
            background: "#fff1f1",
            color: "red",
            overflowX: "auto",
          }}
        >
          {error}
        </pre>
      )}
    </main>
  );
}