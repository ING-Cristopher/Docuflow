import { useMemo, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle, ArrowRight, Building2, Eye, EyeOff, Lock, Mail, UserRound } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/AuthContext';
import { LoginShowcase } from '@/features/auth/LoginShowcase';
import { getApiErrorMessage } from '@/lib/errors';
import { usePrefersReducedMotion } from '@/lib/usePrefersReducedMotion';
import { loginSchema, type LoginFormValues } from '@/schemas/authSchemas';

/**
 * Local-development convenience only. Vite statically replaces import.meta.env.DEV,
 * so these seed credentials are tree-shaken out of production builds.
 */
const DEMO_ACCOUNTS = import.meta.env.DEV
  ? [
      { label: 'Admin', email: 'admin@docuflow.local', password: 'DocuFlow_Admin_123!' },
      { label: 'Revisor', email: 'reviewer@docuflow.local', password: 'DocuFlow_Reviewer_123!' },
    ]
  : [];

const inputClass =
  'block w-full rounded-xl border border-slate-200 bg-slate-50/70 py-2.5 pl-10 text-sm text-slate-900 transition-all duration-200 placeholder:text-slate-400 hover:border-slate-300 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand-500/15';

const iconClass =
  'pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 transition-colors duration-200 group-focus-within/field:text-brand-600';

export function LoginPage() {
  const { isAuthenticated, login, sessionExpiredMessage, clearSessionExpiredMessage } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const reducedMotion = usePrefersReducedMotion();
  const cardRef = useRef<HTMLDivElement>(null);

  const [serverError, setServerError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);

  const fromPath = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname || '/dashboard';

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Buenos días';
    if (hour < 19) return 'Buenas tardes';
    return 'Buenas noches';
  }, []);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
      organizationSlug: '',
    },
  });

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  const shakeCard = () => {
    const el = cardRef.current;
    if (!el || reducedMotion || typeof el.animate !== 'function') return;
    el.animate(
      [
        { transform: 'translateX(0)' },
        { transform: 'translateX(-8px)' },
        { transform: 'translateX(7px)' },
        { transform: 'translateX(-4px)' },
        { transform: 'translateX(3px)' },
        { transform: 'translateX(0)' },
      ],
      { duration: 420, easing: 'ease-in-out' },
    );
  };

  const onSubmit = async (values: LoginFormValues) => {
    setServerError(null);
    clearSessionExpiredMessage();
    try {
      await login({
        email: values.email,
        password: values.password,
        organizationSlug: values.organizationSlug?.trim() || undefined,
      });
      navigate(fromPath, { replace: true });
    } catch (error) {
      setServerError(getApiErrorMessage(error, 'No se pudo iniciar sesión.'));
      shakeCard();
    }
  };

  const detectCapsLock = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (typeof event.getModifierState === 'function') {
      setCapsLockOn(event.getModifierState('CapsLock'));
    }
  };

  const fillDemoAccount = (email: string, password: string) => {
    setServerError(null);
    setValue('email', email, { shouldValidate: true, shouldDirty: true });
    setValue('password', password, { shouldValidate: true, shouldDirty: true });
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#F4F7FB] lg:grid lg:grid-cols-12">
      {/* Compact mobile/tablet brand header */}
      <header className="flex items-center justify-between bg-[#0B1730] px-4 py-3.5 text-white sm:px-6 lg:hidden">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-sky-400 via-brand-500 to-indigo-600 text-xs font-bold text-white">
            DF
          </div>
          <div>
            <p className="text-sm font-bold tracking-tight">
              DocuFlow <span className="text-sky-400">AI</span>
            </p>
            <p className="text-[10px] text-slate-400">Procesa. Verifica. Confía.</p>
          </div>
        </div>
        <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-medium text-sky-300 ring-1 ring-white/15">
          Plataforma B2B
        </span>
      </header>

      <LoginShowcase />

      {/* Form panel */}
      <main className="relative flex flex-1 items-center justify-center overflow-hidden px-3 py-6 sm:px-8 sm:py-12 lg:col-span-7">
        <div
          className="animate-float-slow pointer-events-none absolute -right-32 top-10 h-72 w-72 rounded-full bg-brand-200/40 blur-3xl"
          aria-hidden="true"
        />
        <div
          className="animate-float-delayed pointer-events-none absolute -left-24 bottom-0 h-64 w-64 rounded-full bg-sky-200/40 blur-3xl"
          aria-hidden="true"
        />

        <div className="animate-fade-slide-up group relative w-full max-w-md">
          {/* Gradient halo that lights up while the user interacts with the form */}
          <div
            className="pointer-events-none absolute -inset-px rounded-[1.05rem] bg-gradient-to-br from-sky-400 via-brand-500 to-indigo-500 opacity-0 blur-[2px] transition-opacity duration-500 group-focus-within:opacity-70"
            aria-hidden="true"
          />

          <div
            ref={cardRef}
            className="relative rounded-2xl border border-slate-200/80 bg-white/95 p-5 shadow-xl shadow-slate-900/[0.04] backdrop-blur sm:p-8"
          >
            <div className="mb-6 flex items-center gap-3 sm:mb-7">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">{greeting} 👋</p>
                <h1 className="mt-0.5 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">Iniciar sesión</h1>
                <p className="mt-0.5 text-xs text-slate-500">Accede a tu espacio multi-tenant de DocuFlow AI</p>
              </div>
            </div>

            {sessionExpiredMessage ? (
              <Alert tone="warning" className="mb-4">
                {sessionExpiredMessage}
              </Alert>
            ) : null}

            {serverError ? (
              <Alert tone="error" className="animate-fade-slide-up mb-4">
                {serverError}
              </Alert>
            ) : null}

            {DEMO_ACCOUNTS.length > 0 ? (
              <div className="mb-5 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-3">
                <p className="text-[11px] font-medium text-slate-500">Entorno local · acceso rápido de demostración</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {DEMO_ACCOUNTS.map((account) => (
                    <button
                      key={account.email}
                      type="button"
                      onClick={() => fillDemoAccount(account.email, account.password)}
                      aria-label={`Rellenar con cuenta ${account.label} de demostración`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-300 hover:text-brand-700 hover:shadow-sm active:translate-y-0"
                    >
                      <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
                      {account.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <form onSubmit={handleSubmit(onSubmit, shakeCard)} className="space-y-4" noValidate>
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-slate-700">
                  Correo electrónico
                </label>
                <div className="group/field relative mt-1.5">
                  <Mail className={iconClass} aria-hidden="true" />
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    aria-invalid={errors.email ? 'true' : 'false'}
                    {...register('email')}
                    className={`${inputClass} pr-3.5 ${errors.email ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-500/15' : ''}`}
                    placeholder="analista@empresa.com"
                  />
                </div>
                {errors.email ? <p className="mt-1 text-xs text-rose-600">{errors.email.message}</p> : null}
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-slate-700">
                  Contraseña
                </label>
                <div className="group/field relative mt-1.5">
                  <Lock className={iconClass} aria-hidden="true" />
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    aria-invalid={errors.password ? 'true' : 'false'}
                    {...register('password')}
                    onKeyDown={detectCapsLock}
                    onKeyUp={detectCapsLock}
                    className={`${inputClass} pr-11 ${errors.password ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-500/15' : ''}`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Ocultar caracteres' : 'Mostrar caracteres'}
                    aria-pressed={showPassword}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                  </button>
                </div>
                {capsLockOn ? (
                  <p className="animate-fade-slide-up mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-amber-700">
                    <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> Bloq Mayús está activado
                  </p>
                ) : null}
                {errors.password ? <p className="mt-1 text-xs text-rose-600">{errors.password.message}</p> : null}
              </div>

              <div>
                <label htmlFor="organizationSlug" className="block text-sm font-medium text-slate-700">
                  Identificador de organización <span className="font-normal text-slate-400">(opcional)</span>
                </label>
                <div className="group/field relative mt-1.5">
                  <Building2 className={iconClass} aria-hidden="true" />
                  <input
                    id="organizationSlug"
                    type="text"
                    {...register('organizationSlug')}
                    className={`${inputClass} pr-3.5`}
                    placeholder="mi-empresa"
                  />
                </div>
                <p className="mt-1.5 text-xs text-slate-500">
                  Si perteneces a múltiples organizaciones, indica cuál activar al entrar.
                </p>
              </div>

              <Button
                type="submit"
                isLoading={isSubmitting}
                className="group/btn w-full bg-gradient-to-r from-brand-600 to-indigo-600 py-2.5 hover:from-brand-700 hover:to-indigo-700 active:scale-[0.99]"
              >
                Entrar a DocuFlow AI
                {!isSubmitting ? (
                  <ArrowRight
                    className="h-4 w-4 transition-transform duration-200 group-hover/btn:translate-x-1"
                    aria-hidden="true"
                  />
                ) : null}
              </Button>
            </form>

            <p className="mt-6 text-center text-xs text-slate-600">
              ¿Tu empresa aún no tiene cuenta?{' '}
              <Link to="/register" className="font-semibold text-brand-600 transition-colors hover:text-brand-700">
                Registrar organización
              </Link>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
