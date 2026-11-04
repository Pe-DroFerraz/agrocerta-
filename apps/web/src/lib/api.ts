export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
let refresh: Promise<Response> | null = null;
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const request = () =>
    fetch(`/api${path}`, {
      ...options,
      credentials: 'include',
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    });
  let response = await request();
  if (response.status === 401 && (!path.startsWith('/auth/') || path === '/auth/me')) {
    if (!refresh)
      refresh = fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' }).finally(
        () => {
          refresh = null;
        },
      );
    const renewed = await refresh;
    if (renewed.ok) response = await request();
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    if (response.status === 401 && !path.startsWith('/auth/'))
      window.dispatchEvent(new Event('agro-session-expired'));
    throw new ApiError(
      response.status,
      body?.error?.message ?? 'Não foi possível conectar ao servidor.',
    );
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
export interface Viewer {
  id: string;
  name: string;
  email: string;
  role: 'OWNER' | 'PRODUCTION' | 'SALES' | 'DRIVER';
  permissions: string[];
}
export interface PageData {
  rows: Record<string, unknown>[];
  total: number;
  page: number;
  limit: number;
}
