import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/features/auth/AuthContext';
import { setStoredSession } from '@/features/auth/sessionStorage';
import { AppRoutes } from '@/routes/AppRoutes';
import { authService } from '@/services/authService';
import { auditService } from '@/services/auditService';
import { documentsService } from '@/services/documentsService';
import { healthService } from '@/services/healthService';
import { OrganizationRole, type AuthResponse } from '@/types/api';

function renderWithRoutes(initialEntries: string[]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={initialEntries}>
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe('Authentication and route protection', () => {
  it('redirects unauthenticated users to /login', async () => {
    renderWithRoutes(['/documents']);
    expect(await screen.findByRole('heading', { name: /iniciar sesión/i })).toBeInTheDocument();
  });

  it('logs in user, stores session in sessionStorage (not localStorage), and navigates to dashboard', async () => {
    const fakeAuth: AuthResponse = {
      accessToken: 'jwt-token-demo',
      userId: '11111111-1111-1111-1111-111111111111',
      email: 'owner@acme.com',
      fullName: 'Laura Gómez',
      organizationId: '22222222-2222-2222-2222-222222222222',
      organizationSlug: 'acme',
      role: OrganizationRole.Owner,
    };

    const loginSpy = vi.spyOn(authService, 'login').mockResolvedValueOnce(fakeAuth);
    vi.spyOn(documentsService, 'getPaged').mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 5,
      totalCount: 0,
    });
    vi.spyOn(auditService, 'getPaged').mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 5,
      totalCount: 0,
    });
    vi.spyOn(healthService, 'check').mockResolvedValue({ status: 'healthy', database: 'connected' });
    const user = userEvent.setup();

    renderWithRoutes(['/login']);

    await user.type(screen.getByLabelText(/correo electrónico/i), 'owner@acme.com');
    await user.type(screen.getByLabelText(/contraseña/i), 'Password123!');
    await user.click(screen.getByRole('button', { name: /entrar a docuflow ai/i }));

    await waitFor(() => {
      expect(loginSpy).toHaveBeenCalledWith({
        email: 'owner@acme.com',
        password: 'Password123!',
        organizationSlug: undefined,
      });
    });

    expect(await screen.findByRole('heading', { name: /dashboard/i })).toBeInTheDocument();
    expect(window.sessionStorage.getItem('docuflow.session')).toContain('jwt-token-demo');
    expect(window.localStorage?.getItem('docuflow.session') ?? null).toBeNull();
  });

  it('blocks Viewer from accessing /audit route', async () => {
    setStoredSession({
      accessToken: 'viewer-token',
      userId: '11111111-1111-1111-1111-111111111111',
      email: 'viewer@acme.com',
      fullName: 'Carlos Lector',
      organizationId: '22222222-2222-2222-2222-222222222222',
      organizationSlug: 'acme',
      role: OrganizationRole.Viewer,
    });

    renderWithRoutes(['/audit']);
    expect(await screen.findByText(/acceso restringido/i)).toBeInTheDocument();
  });
});
