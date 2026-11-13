import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  clearStoredSession,
  getStoredSession,
  registerUnauthorizedHandler,
  setStoredSession,
} from '@/features/auth/sessionStorage';
import { authService } from '@/services/authService';
import type {
  AuthResponse,
  LoginRequest,
  OrganizationRole,
  RegisterOrganizationRequest,
} from '@/types/api';

interface AuthContextValue {
  session: AuthResponse | null;
  isAuthenticated: boolean;
  sessionExpiredMessage: string | null;
  clearSessionExpiredMessage: () => void;
  login: (payload: LoginRequest) => Promise<AuthResponse>;
  register: (payload: RegisterOrganizationRequest) => Promise<AuthResponse>;
  switchOrganization: (organizationId: string) => Promise<AuthResponse>;
  logout: () => void;
  hasRole: (allowedRoles: OrganizationRole[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<AuthResponse | null>(() => getStoredSession());
  const [sessionExpiredMessage, setSessionExpiredMessage] = useState<string | null>(null);

  useEffect(() => {
    return registerUnauthorizedHandler(() => {
      setSession(null);
      queryClient.clear();
      setSessionExpiredMessage('Tu sesión expiró o fue revocada. Inicia sesión nuevamente.');
    });
  }, [queryClient]);

  const applySession = useCallback(
    (nextSession: AuthResponse) => {
      setStoredSession(nextSession);
      setSession(nextSession);
      setSessionExpiredMessage(null);
      queryClient.clear();
    },
    [queryClient],
  );

  const login = useCallback(
    async (payload: LoginRequest) => {
      const response = await authService.login(payload);
      applySession(response);
      return response;
    },
    [applySession],
  );

  const register = useCallback(
    async (payload: RegisterOrganizationRequest) => {
      const response = await authService.register(payload);
      applySession(response);
      return response;
    },
    [applySession],
  );

  const switchOrganization = useCallback(
    async (organizationId: string) => {
      const response = await authService.switchOrganization(organizationId);
      applySession(response);
      return response;
    },
    [applySession],
  );

  const logout = useCallback(() => {
    clearStoredSession();
    setSession(null);
    setSessionExpiredMessage(null);
    queryClient.clear();
  }, [queryClient]);

  const hasRole = useCallback(
    (allowedRoles: OrganizationRole[]) => {
      if (!session) return false;
      return allowedRoles.includes(session.role);
    },
    [session],
  );

  const clearSessionExpiredMessage = useCallback(() => {
    setSessionExpiredMessage(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      isAuthenticated: Boolean(session?.accessToken),
      sessionExpiredMessage,
      clearSessionExpiredMessage,
      login,
      register,
      switchOrganization,
      logout,
      hasRole,
    }),
    [
      session,
      sessionExpiredMessage,
      clearSessionExpiredMessage,
      login,
      register,
      switchOrganization,
      logout,
      hasRole,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
