import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/AuthContext';
import { getApiErrorMessage } from '@/lib/errors';
import { loginSchema, type LoginFormValues } from '@/schemas/authSchemas';

export function LoginPage() {
  const { isAuthenticated, login, sessionExpiredMessage, clearSessionExpiredMessage } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [serverError, setServerError] = useState<string | null>(null);

  const fromPath = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname || '/dashboard';

  const {
    register,
    handleSubmit,
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
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-base font-bold text-white">
            DF
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Iniciar sesión</h1>
            <p className="text-xs text-slate-500">Accede a tu espacio multi-tenant de DocuFlow AI</p>
          </div>
        </div>

        {sessionExpiredMessage ? (
          <Alert tone="warning" className="mb-4">
            {sessionExpiredMessage}
          </Alert>
        ) : null}

        {serverError ? (
          <Alert tone="error" className="mb-4">
            {serverError}
          </Alert>
        ) : null}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700">
              Correo electrónico
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              {...register('email')}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
              placeholder="analista@empresa.com"
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
              autoComplete="current-password"
              {...register('password')}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
            />
            {errors.password ? <p className="mt-1 text-xs text-rose-600">{errors.password.message}</p> : null}
          </div>

          <div>
            <label htmlFor="organizationSlug" className="block text-sm font-medium text-slate-700">
              Identificador de organización <span className="font-normal text-slate-400">(opcional)</span>
            </label>
            <input
              id="organizationSlug"
              type="text"
              {...register('organizationSlug')}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
              placeholder="mi-empresa"
            />
            <p className="mt-1 text-xs text-slate-500">
              Si perteneces a múltiples organizaciones, puedes indicar cuál activar al entrar.
            </p>
          </div>

          <Button type="submit" isLoading={isSubmitting} className="w-full">
            Entrar a DocuFlow AI
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-600">
          ¿Tu empresa aún no tiene cuenta?{' '}
          <Link to="/register" className="font-semibold text-brand-600 hover:text-brand-700">
            Registrar organización
          </Link>
        </p>
      </div>
    </div>
  );
}

