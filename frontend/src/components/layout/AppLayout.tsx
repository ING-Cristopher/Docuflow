import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Building2,
  ClipboardCheck,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useAuth } from '@/features/auth/AuthContext';
import { roleLabels } from '@/lib/formatters';
import { rolePermissions } from '@/types/api';

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  visible: boolean;
}

export function AppLayout() {
  const { session, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  if (!session) return null;

  const navItems: NavItem[] = [
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, visible: true },
    { to: '/documents', label: 'Documentos', icon: FileText, visible: true },
    {
      to: '/reviews',
      label: 'Revisión humana',
      icon: ClipboardCheck,
      visible: rolePermissions.canReview(session.role),
    },
    { to: '/organization', label: 'Organización', icon: Building2, visible: true },
    {
      to: '/audit',
      label: 'Auditoría',
      icon: ShieldCheck,
      visible: rolePermissions.canManageAdmin(session.role),
    },
  ].filter((item) => item.visible);

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const renderNavLinks = (onNavigate?: () => void) => (
    <nav aria-label="Navegación principal" className="space-y-1 px-3 py-4">
      {navItems.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`
            }
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{item.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen bg-slate-50 lg:flex">
      {/* Desktop Sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="flex h-16 items-center gap-2.5 border-b border-slate-200 px-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
            DF
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">DocuFlow AI</p>
            <p className="text-xs text-slate-500">Plataforma B2B</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">{renderNavLinks()}</div>

        <div className="border-t border-slate-200 p-4">
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="truncate text-xs font-semibold text-slate-900">{session.fullName}</p>
            <p className="truncate text-xs text-slate-500">{session.email}</p>
            <div className="mt-2 flex items-center justify-between text-xs">
              <span className="truncate font-medium text-brand-700">{session.organizationSlug}</span>
              <span className="rounded bg-white px-1.5 py-0.5 text-[11px] font-medium text-slate-600 ring-1 ring-slate-200">
                {roleLabels[session.role]}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Mobile Header + Drawer */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 lg:px-8">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Abrir menú de navegación"
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>
            <div className="flex items-center gap-2 lg:hidden">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-600 text-xs font-bold text-white">
                DF
              </div>
              <span className="text-sm font-semibold text-slate-900">DocuFlow AI</span>
            </div>
            <div className="hidden items-center gap-2 text-xs text-slate-500 lg:flex">
              <span>Organización activa:</span>
              <span className="rounded-md bg-slate-100 px-2 py-1 font-medium text-slate-800">
                {session.organizationSlug}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <span className="hidden text-slate-600 sm:inline">{session.fullName}</span>
            <span className="rounded-full bg-brand-50 px-2.5 py-1 font-medium text-brand-700">
              {roleLabels[session.role]}
            </span>
          </div>
        </header>

        {mobileMenuOpen ? (
          <div className="fixed inset-0 z-50 flex lg:hidden" role="dialog" aria-modal="true">
            <div
              className="fixed inset-0 bg-slate-900/50"
              onClick={() => setMobileMenuOpen(false)}
              aria-hidden="true"
            />
            <div className="relative flex w-72 max-w-full flex-col bg-white shadow-xl">
              <div className="flex h-16 items-center justify-between border-b border-slate-200 px-5">
                <span className="text-sm font-semibold text-slate-900">DocuFlow AI</span>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  aria-label="Cerrar menú"
                  className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                {renderNavLinks(() => setMobileMenuOpen(false))}
              </div>
              <div className="border-t border-slate-200 p-4">
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                  Cerrar sesión
                </button>
              </div>
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

