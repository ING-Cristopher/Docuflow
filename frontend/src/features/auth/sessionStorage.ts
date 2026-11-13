import type { AuthResponse } from '@/types/api';

const SESSION_KEY = 'docuflow.session';

let inMemorySession: AuthResponse | null = null;
let unauthorizedHandler: (() => void) | null = null;

export function registerUnauthorizedHandler(handler: () => void): () => void {
  unauthorizedHandler = handler;
  return () => {
    if (unauthorizedHandler === handler) {
      unauthorizedHandler = null;
    }
  };
}

export function notifyUnauthorized(): void {
  clearStoredSession();
  unauthorizedHandler?.();
}

export function getStoredSession(): AuthResponse | null {
  if (inMemorySession) {
    return inMemorySession;
  }

  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthResponse;
    if (!parsed?.accessToken || !parsed?.organizationId) {
      return null;
    }
    inMemorySession = parsed;
    return parsed;
  } catch {
    return null;
  }
}

export function setStoredSession(session: AuthResponse): void {
  inMemorySession = session;
  try {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // Fallback to in-memory only if sessionStorage is unavailable.
  }
}

export function clearStoredSession(): void {
  inMemorySession = null;
  try {
    window.sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // Ignore storage errors on cleanup.
  }
}

