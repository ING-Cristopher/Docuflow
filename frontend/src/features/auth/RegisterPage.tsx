import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2, ShieldCheck, Sparkles } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/AuthContext';
import { getApiErrorMessage } from '@/lib/errors';
import {
  registerOrganizationSchema,
  type RegisterOrganizationFormValues,
} from '@/schemas/authSchemas';

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export function RegisterPage() {
  const { isAuthenticated, register: registerOrganization } = useAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);
  const [slugTouched, setSlugTouched] = useState(false);

  const {
    register,
    setValue,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterOrganizationFormValues>({
    resolver: zodResolver(registerOrganizationSchema),
    defaultValues: {
      organizationName: '',
      organizationSlug: '',
      fullName: '',
      email: '',
      password: '',
    },
  });

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  const onSubmit = async (values: RegisterOrganizationFormValues) => {
    setServerError(null);
    try {
      await registerOrganization(values);
      navigate('/dashboard', { replace: true });
    } catch (error) {
      setServerError(getApiErrorMessage(error, 'No se pudo completar el registro.'));
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#F4F7FB] lg:grid lg:grid-cols-12">
      {/* Compact mobile/tablet brand header */}
      <header className="flex items-center justify-between bg-[#0F1E3D] px-4 py-3.5 text-white sm:px-6 lg:hidden">
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
          Onboarding
        </span>
      </header>

      {/* Left Brand Panel */}
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-[#0F1E3D] p-10 text-white lg:col-span-5 lg:flex">
        <div
          className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-brand-500/20 blur-3xl"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -bottom-24 -left-24 h-80 w-80 rounded-full bg-sky-500/15 blur-3xl"
          aria-hidden="true"
        />

        <div className="relative flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-400 via-brand-500 to-indigo-600 shadow-lg shadow-brand-900/50">
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
            <p className="text-lg font-bold tracking-tight">
              DocuFlow <span className="text-sky-400">AI</span>
            </p>
            <p className="text-xs text-slate-400">Procesa. Verifica. Confía.</p>
          </div>
        </div>

        <div className="relative space-y-6">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-sky-300 ring-1 ring-white/15">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              Onboarding Multi-Tenant
            </span>
            <h2 className="mt-4 text-3xl font-bold leading-tight tracking-tight">
              Crea el espacio aislado de tu organización en segundos.
            </h2>
          </div>

          <ul className="space-y-3 text-sm text-slate-300">
            <li className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
              <span>Control de acceso por roles (Propietario, Administrador, Revisor, Operador y Lector).</span>
            </li>
            <li className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" aria-hidden="true" />
              <span>Almacenamiento privado cifrado y auditoría completa por organización.</span>
            </li>
          </ul>
        </div>

        <p className="relative text-xs text-slate-400">
          DocuFlow AI · Seguridad y control documental empresarial
        </p>
      </aside>

      {/* Right Form Panel */}
      <main className="flex flex-1 items-center justify-center px-3 py-6 sm:px-8 sm:py-12 lg:col-span-7">
        <div className="w-full max-w-lg rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-8">
          <div className="mb-6">
            <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">Registrar organización</h1>
            <p className="mt-1 text-xs text-slate-500">
              Crea un espacio aislado para tu empresa y tu cuenta inicial de Propietario.
            </p>
          </div>

          {serverError ? (
            <Alert tone="error" className="mb-4">
              {serverError}
            </Alert>
          ) : null}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="organizationName" className="block text-sm font-medium text-slate-700">
                  Nombre de la empresa
                </label>
                <input
                  id="organizationName"
                  type="text"
                  {...register('organizationName', {
                    onChange: (e) => {
                      if (!slugTouched) {
                        setValue('organizationSlug', toSlug(e.target.value), { shouldValidate: true });
                      }
                    },
                  })}
                  className="mt-1.5 block w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-sm focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                  placeholder="Acme Logística"
                />
                {errors.organizationName ? (
                  <p className="mt-1 text-xs text-rose-600">{errors.organizationName.message}</p>
                ) : null}
              </div>

              <div>
                <label htmlFor="organizationSlug" className="block text-sm font-medium text-slate-700">
                  Slug de organización
                </label>
                <input
                  id="organizationSlug"
                  type="text"
                  {...register('organizationSlug', {
                    onChange: () => setSlugTouched(true),
                  })}
                  className="mt-1.5 block w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-sm focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                  placeholder="acme-logistica"
                />
                {errors.organizationSlug ? (
                  <p className="mt-1 text-xs text-rose-600">{errors.organizationSlug.message}</p>
                ) : null}
              </div>
            </div>

            <div>
              <label htmlFor="fullName" className="block text-sm font-medium text-slate-700">
                Nombre completo
              </label>
              <input
                id="fullName"
                type="text"
                autoComplete="name"
                {...register('fullName')}
                className="mt-1.5 block w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-sm focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                placeholder="Laura Gómez"
              />
              {errors.fullName ? <p className="mt-1 text-xs text-rose-600">{errors.fullName.message}</p> : null}
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700">
                Correo electrónico corporativo
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                {...register('email')}
                className="mt-1.5 block w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-sm focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                placeholder="laura@acme.com"
              />
              {errors.email ? <p className="mt-1 text-xs text-rose-600">{errors.email.message}</p> : null}
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700">
                Contraseña
              </label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                {...register('password')}
                className="mt-1.5 block w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-sm focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                placeholder="Mínimo 8 caracteres, mayúscula, minúscula y número"
              />
              {errors.password ? <p className="mt-1 text-xs text-rose-600">{errors.password.message}</p> : null}
            </div>

            <Button type="submit" isLoading={isSubmitting} className="w-full py-2.5">
              Crear organización y entrar
            </Button>
          </form>

          <p className="mt-6 text-center text-xs text-slate-600">
            ¿Ya tienes una cuenta?{' '}
            <Link to="/login" className="font-semibold text-brand-600 hover:text-brand-700">
              Iniciar sesión
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
