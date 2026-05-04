"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

type TelemetryEvent = {
  id: string;
  type: "page_view" | "client_error" | "unhandled_rejection" | "fetch_error" | "api_failure";
  message: string;
  source?: string;
  status?: number;
  date: string;
};

const TELEMETRY_KEY = "readingQuestTelemetryEvents";
const MAX_EVENTS = 80;

function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function saveTelemetry(event: Omit<TelemetryEvent, "id" | "date">) {
  try {
    const stored = window.localStorage.getItem(TELEMETRY_KEY);
    const current = stored ? (JSON.parse(stored) as TelemetryEvent[]) : [];
    const next = [
      {
        ...event,
        id: createId(),
        date: new Date().toISOString(),
      },
      ...current,
    ].slice(0, MAX_EVENTS);
    window.localStorage.setItem(TELEMETRY_KEY, JSON.stringify(next));
  } catch {
    // Telemetry should never interrupt the reading experience.
  }
}

export default function AppTelemetry() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname || pathname.startsWith("/admin")) {
      return;
    }

    saveTelemetry({
      type: "page_view",
      message: `Viewed ${pathname}`,
      source: pathname,
    });
  }, [pathname]);

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      saveTelemetry({
        type: "client_error",
        message: event.message || "Unknown client error",
        source: event.filename,
      });
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason instanceof Error ? event.reason.message : String(event.reason ?? "Unhandled promise rejection");
      saveTelemetry({
        type: "unhandled_rejection",
        message: reason,
      });
    };

    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      try {
        const response = await originalFetch(input, init);
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        if (!response.ok && url.includes("/api/")) {
          saveTelemetry({
            type: "api_failure",
            message: `${init?.method ?? "GET"} ${url}`,
            source: url,
            status: response.status,
          });
        }
        return response;
      } catch (error) {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        saveTelemetry({
          type: "fetch_error",
          message: error instanceof Error ? error.message : "Fetch failed",
          source: url,
        });
        throw error;
      }
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);

    return () => {
      window.fetch = originalFetch;
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, []);

  return null;
}
