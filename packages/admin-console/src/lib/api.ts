export interface ProviderRow {
  providerId: string;
  enabled: boolean;
  hasSecret: boolean;
  quota: { rpm: number; daily: number };
  timeoutMs: number;
}

export interface AuditRow {
  actor: string;
  ts: string;
  action: string;
  target: string;
  before?: unknown;
  after?: unknown;
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, message?: string) {
    super(message ?? code);
  }
}

function resolveUrl(path: string): string {
  if (typeof window !== 'undefined') return path;
  const base = process.env.APP_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
  return new URL(path, base).toString();
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(resolveUrl(path), { ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (body as Record<string, unknown>).error as string ?? 'UNKNOWN');
  return body as T;
}

export const adminApi = {
  listProviders: async () => (await call<{ providers: ProviderRow[] }>('/api/providers')).providers,
  updateProvider: (id: string, body: { enabled: boolean; quota: { rpm: number; daily: number }; timeoutMs: number }) =>
    call<ProviderRow>(`/api/providers/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  putSecret: (id: string, value: string) =>
    call<{ providerId: string; versionId: string }>(`/api/providers/${id}/secret`, { method: 'POST', body: JSON.stringify({ value }) }),
  revealSecret: (id: string) =>
    call<{ providerId: string; value: string }>(`/api/providers/${id}/secret/reveal`, { method: 'POST' }),
  testProvider: (id: string) =>
    call<{ ok: boolean; results?: number; error?: string }>(`/api/providers/${id}/test`, { method: 'POST' }),
  metrics: (ids: string[]) =>
    call<{
      metrics: Array<{
        providerId: string;
        p95LatencyMs?: number;
        errorRate?: number;
        latencySeries?: number[];
        errorSeries?: number[];
      }>;
    }>(`/api/metrics?providers=${ids.join(',')}`),
  auditList: () => call<{ rows: AuditRow[] }>('/api/audit')
};
