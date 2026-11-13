import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { clearStoredSession } from '@/features/auth/sessionStorage';

afterEach(() => {
  cleanup();
  clearStoredSession();
  window.localStorage?.clear?.();
  window.sessionStorage?.clear?.();
  vi.restoreAllMocks();
});
