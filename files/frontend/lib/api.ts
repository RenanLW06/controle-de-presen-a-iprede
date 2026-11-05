export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/** Todas as chamadas passam por /api (proxy). O cabeçalho X-Requested-With é exigido pela API contra CSRF. */
export async function api<T = unknown>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', 'x-requested-with': 'fetch' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const m = data?.message;
    throw new ApiError(res.status, Array.isArray(m) ? m.join(' ') : typeof m === 'string' ? m : 'Algo deu errado. Tente novamente.');
  }
  return data as T;
}

export interface Page<T> { items: T[]; nextCursor: string | null }
export const qs = (p: Record<string, string | number | null | undefined>) =>
  Object.entries(p).filter(([, v]) => v != null && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');
