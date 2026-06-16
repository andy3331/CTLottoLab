import type {
  DrawRecord,
  FrequencyRow,
  GeneratedTicket,
  ImportSummary,
  PickerRequest,
  SummaryResponse,
  SyncStatus,
} from "@shared/types";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, options);
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(payload?.message ?? "Request failed");
  }
  return response.json() as Promise<T>;
}

export const api = {
  getSummary: () => request<SummaryResponse>("/analytics/summary"),
  getFrequency: () => request<FrequencyRow[]>("/analytics/frequency"),
  getSyncStatus: () => request<SyncStatus>("/sync/status"),
  getDraws: (query?: { date?: string; number?: number; jackpotWinnerCount?: number }) => {
    const params = new URLSearchParams();
    if (query?.date) params.set("date", query.date);
    if (query?.number) params.set("number", String(query.number));
    if (query?.jackpotWinnerCount !== undefined) {
      params.set("jackpotWinnerCount", String(query.jackpotWinnerCount));
    }
    return request<DrawRecord[]>(`/draws${params.size ? `?${params.toString()}` : ""}`);
  },
  importFile: async (file: File) => {
    const data = new FormData();
    data.append("file", file);
    return request<ImportSummary>("/imports/ct-lotto", {
      method: "POST",
      body: data,
    });
  },
  generateTickets: (payload: PickerRequest) =>
    request<GeneratedTicket[]>("/picks/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }),
  syncNow: () =>
    request<ImportSummary>("/sync/ct-lotto", {
      method: "POST",
    }),
};
