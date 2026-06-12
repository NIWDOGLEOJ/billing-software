/**
 * Central API client for the React frontend.
 * - Automatically attaches JWT from localStorage to every request.
 * - Converts non-2xx responses to thrown errors with server message.
 * - Base URL: same origin in production; proxied /api in Vite dev mode.
 */

const BASE = '/api';

function getToken(): string | null {
  return localStorage.getItem('authToken');
}

export function setToken(token: string) {
  localStorage.setItem('authToken', token);
}

export function clearToken() {
  localStorage.removeItem('authToken');
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    
    // Auto-logout on 401 (Authentication required) or 403 (Invalid/expired token)
    // but avoid doing it for the login request itself to allow invalid password errors to show normally
    if ((res.status === 401 || res.status === 403) && path !== '/auth/login') {
      localStorage.removeItem('authToken');
      localStorage.removeItem('currentUser');
      localStorage.removeItem('currentSession');
      localStorage.removeItem('activeShift');
      localStorage.removeItem('currentBreak');
      localStorage.removeItem('isOnBreak');
      
      // Dispatch a custom event to notify AuthContext to update its React state
      window.dispatchEvent(new Event('auth-expired'));
      
      // Redirect to login page
      window.location.href = '/login';
    }
    
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  // 204 No Content
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  get:    <T>(path: string)                    => request<T>('GET',    path),
  post:   <T>(path: string, body: unknown)     => request<T>('POST',   path, body),
  put:    <T>(path: string, body: unknown)     => request<T>('PUT',    path, body),
  patch:  <T>(path: string, body: unknown)     => request<T>('PATCH',  path, body),
  delete: <T>(path: string)                    => request<T>('DELETE', path),
};
