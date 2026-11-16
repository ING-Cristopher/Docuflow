import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Bell,
  Building2,
  ChevronRight,
  ClipboardCheck,
  FileText,
  Home,
  LogOut,
  Menu,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useAuth } from '@/features/auth/AuthContext';
import { roleLabels } from '@/lib/formatters';
import { documentsService } from '@/services/documentsService';
import { healthService } from '@/services/healthService';
import { DocumentStatus, rolePermissions } from '@/types/api';

interface NavItem {
  to: string;
  label: string;
  icon: typeof Home;
  visible: boolean;
  badge?: number;
}

function getInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const first = parts[0];
  if (!first) return 'DF';
  if (parts.length === 1) return first.slice(0, 2).toUpperCase();
  const last = parts[parts.length - 1] ?? first;
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
}

export function AppLayout() {
  const { session, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const canReview = session ? rolePermissions.canReview(session.role) : false;

  const pendingReviewsQuery = useQuery({
    queryKey: ['layout', 'pending-reviews-count', session?.organizationId],
    queryFn: () => documentsService.getPaged({ page: 1, pageSize: 1, status: DocumentStatus.PendingReview }),
    enabled: Boolean(session && canReview),
    staleTime: 30_000,
    retry: false,
  });

  const healthQuery = useQuery({
    queryKey: ['health'],
    queryFn: () => healthService.check(),
    staleTime: 60_000,
    retry: false,
  });

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (!session) return null;

  const pendingCount = pendingReviewsQuery.data?.totalCount ?? 0;

  const navItems: NavItem[] = [
    { to: '/dashboard', label: 'Dashboard', icon: Home, visible: true },
    { to: '/documents', label: 'Documentos', icon: FileText, visible: true },
    {
      to: '/reviews',
      label: 'Revisiones',
      icon: ClipboardCheck,
      visible: canReview,
      badge: pendingCount > 0 ? pendingCount : undefined,
    },
    {
      to: '/audit',
      label: 'Auditoría',
      icon: ShieldCheck,
      visible: rolePermissions.canManageAdmin(session.role),
    },
    { to: '/organization', label: 'Organizaciones', icon: Building2, visible: true },
  ].filter((item) => item.visible);

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const handleGlobalSearchSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const term = globalSearch.trim();
    if (term.length > 0) {
      navigate(`/documents?search=${encodeURIComponent(term)}`);
    } else {
      navigate('/documents');
    }
  };

  const renderBrand = () => (
    <div className="flex items-center gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-400 via-brand-500 to-indigo-600 shadow-md shadow-brand-900/40">
        <svg viewBox="0 0 24 24" className="h-5 w-5 text-white" fill="none" aria-hidden="true">
          <path
            d="M5 4.5C5 3.67 5.67 3 6.5 3H13L19 9V19.5C19 20.33 18.33 21 17.5 21H6.5C5.67 21 5 20.33 5 19.5V4.5Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path d="M13 3V9H19" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M8.5 13.5L11 16L15.5 11.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <div>
        <p className="text-base font-bold tracking-tight text-white">
          DocuFlow <span className="text-sky-400">AI</span>
        </p>
        <p className="text-[11px] font-medium text-slate-400">Procesa. Verifica. Confía.</p>
      </div>
    </div>
  );

  const renderNavLinks = (onNavigate?: () => void) => (
    <nav aria-label="Navegación principal" className="space-y-1.5 px-3 py-5">
      {navItems.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={({ isActive }) =>
              `group flex items-center justify-between rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all ${
                isActive
                  ? 'bg-gradient-to-r from-brand-600/90 to-brand-500/30 text-white shadow-sm ring-1 ring-white/10'
                  : 'text-slate-300 hover:bg-white/5 hover:text-white'
              }`
            }
          >
            <span className="flex items-center gap-3">
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{item.label}</span>
            </span>
            {item.badge !== undefined ? (
              <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-amber-400 px-1.5 text-[11px] font-bold text-slate-950">
                {item.badge}
              </span>
            ) : null}
          </NavLink>
        );
      })}
    </nav>
  );

  const renderSidebarFooter = (onNavigate?: () => void) => (
    <div className="space-y-3 border-t border-white/10 p-4">
      <Link
        to="/organization"
        onClick={onNavigate}
        className="flex items-center gap-3 rounded-xl bg-white/[0.06] p-3 transition-colors hover:bg-white/[0.1]"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-500/20 text-sky-300">
          <Building2 className="h-4 w-4" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-white">{session.organizationSlug}</p>
          <p className="truncate text-[11px] font-medium text-emerald-400">
            Organización activa
          </p>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
      </Link>

      <div className="flex items-center gap-3 px-1">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-indigo-600 text-xs font-bold text-white ring-2 ring-white/15">
          {getInitials(session.fullName)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-white">{session.fullName}</p>
          <p className="truncate text-[11px] text-slate-400">{roleLabels[session.role]}</p>
        </div>
      </div>

      <button
        type="button"
        onClick={handleLogout}
        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
      >
        <LogOut className="h-4 w-4 text-slate-400" aria-hidden="true" />
        Cerrar sesión
      </button>
    </div>
  );

  const isHealthy = healthQuery.data?.status === 'healthy';

  return (
    <div className="min-h-screen bg-[#F4F7FB] lg:flex">
      {/* Desktop Sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col bg-[#0F1E3D] text-white lg:flex">
        <div className="flex h-[72px] items-center border-b border-white/10 px-5">{renderBrand()}</div>

        <div className="flex-1 overflow-y-auto">{renderNavLinks()}</div>

        {renderSidebarFooter()}
      </aside>

      {/* Main Content Wrapper */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-slate-200/80 bg-white/95 px-4 backdrop-blur sm:px-6 lg:px-8">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Abrir menú de navegación"
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>

            <form onSubmit={handleGlobalSearchSubmit} className="relative w-full max-w-md">
              <Search
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                ref={searchInputRef}
                type="search"
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                placeholder="Buscar documentos por título... (Ctrl + K)"
                aria-label="Buscar documentos"
                className="w-full rounded-xl border border-slate-200 bg-slate-50/80 py-2 pl-10 pr-4 text-sm text-slate-800 placeholder:text-slate-400 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              />
            </form>
          </div>

          <div className="flex items-center gap-3">
            <div
              className="hidden items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600 sm:inline-flex"
              title="Estado de conexión con el backend"
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  healthQuery.isLoading ? 'bg-slate-400' : isHealthy ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
                aria-hidden="true"
              />
              <span>{healthQuery.isLoading ? 'API...' : isHealthy ? 'API en línea' : 'API sin conexión'}</span>
            </div>

            {canReview ? (
              <Link
                to="/reviews"
                aria-label="Ir a revisiones pendientes"
                className="relative rounded-xl border border-slate-200 bg-white p-2 text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
              >
                <Bell className="h-4 w-4" aria-hidden="true" />
                {pendingCount > 0 ? (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                    {pendingCount}
                  </span>
                ) : null}
              </Link>
            ) : null}

            <Link
              to="/organization"
              className="hidden items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 md:inline-flex"
            >
              <span className="font-semibold text-brand-700">{session.organizationSlug}</span>
              <span className="text-slate-300">·</span>
              <span>{roleLabels[session.role]}</span>
            </Link>
          </div>
        </header>

        {/* Mobile Drawer */}
        {mobileMenuOpen ? (
          <div className="fixed inset-0 z-50 flex lg:hidden" role="dialog" aria-modal="true">
            <div
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs"
              onClick={() => setMobileMenuOpen(false)}
              aria-hidden="true"
            />
            <div className="relative flex w-72 max-w-full flex-col bg-[#0F1E3D] text-white shadow-2xl">
              <div className="flex h-[72px] items-center justify-between border-b border-white/10 px-5">
                {renderBrand()}
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  aria-label="Cerrar menú"
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">{renderNavLinks(() => setMobileMenuOpen(false))}</div>
              {renderSidebarFooter(() => setMobileMenuOpen(false))}
            </div>
          </div>
        ) : null}

        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-7xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
