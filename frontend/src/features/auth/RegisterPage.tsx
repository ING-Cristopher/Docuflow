import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
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
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-slate-900">Registrar organización</h1>
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
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
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
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
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
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
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
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
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
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
              placeholder="Mínimo 8 caracteres"
            />
            {errors.password ? <p className="mt-1 text-xs text-rose-600">{errors.password.message}</p> : null}
          </div>

          <Button type="submit" isLoading={isSubmitting} className="w-full">
            Crear organización y entrar
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-600">
          ¿Ya tienes cuenta?{' '}
          <Link to="/login" className="font-semibold text-brand-600 hover:text-brand-700">
            Iniciar sesión
          </Link>
        </p>
      </div>
    </div>
  );
}

