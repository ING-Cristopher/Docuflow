import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Building2, Check, UserPlus } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { useAuth } from '@/features/auth/AuthContext';
import { getApiErrorMessage } from '@/lib/errors';
import { roleLabels } from '@/lib/formatters';
import { inviteMemberSchema, type InviteMemberFormValues } from '@/schemas/authSchemas';
import { authService } from '@/services/authService';
import { OrganizationRole, rolePermissions } from '@/types/api';

export function OrganizationPage() {
  const { session, switchOrganization } = useAuth();
  const [switchError, setSwitchError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const membershipsQuery = useQuery({
    queryKey: ['auth', 'memberships', session?.userId],
    queryFn: () => authService.getMyMemberships(),
  });

  const switchMutation = useMutation({
    mutationFn: (organizationId: string) => switchOrganization(organizationId),
    onError: (err) => setSwitchError(getApiErrorMessage(err)),
  });

  const canManageAdmin = session ? rolePermissions.canManageAdmin(session.role) : false;
  const canAssignOwner = session ? rolePermissions.canAssignOwner(session.role) : false;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<InviteMemberFormValues>({
    resolver: zodResolver(inviteMemberSchema),
    defaultValues: {
      email: '',
      fullName: '',
      temporaryPassword: '',
      role: OrganizationRole.Viewer,
    },
  });

  const onInviteSubmit = async (values: InviteMemberFormValues) => {
    setInviteError(null);
    setInviteSuccess(null);
    try {
      const created = await authService.inviteMember(values);
      setInviteSuccess(
        `Miembro añadido en ${created.organizationName} con rol ${roleLabels[created.role]}.`,
      );
      reset();
    } catch (error) {
      setInviteError(getApiErrorMessage(error));
    }
  };

  if (!session) return null;

  const assignableRoles = [
    OrganizationRole.Viewer,
    OrganizationRole.Reviewer,
    OrganizationRole.Operator,
    OrganizationRole.Admin,
    ...(canAssignOwner ? [OrganizationRole.Owner] : []),
  ];

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">Multi-tenant</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Organización</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Contexto activo de tenant, cambio de organización e incorporación de miembros.
        </p>
      </div>

      {/* Current organization summary */}
      <Card>
        <CardHeader title="Organización activa" description="Datos del contexto autorizado en tu token actual" />
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs text-slate-500">Slug de organización</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{session.organizationSlug}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">OrganizationId</p>
            <p className="mt-1 break-all font-mono text-xs text-slate-700">{session.organizationId}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Tu rol actual</p>
            <div className="mt-1">
              <Badge tone="indigo">{roleLabels[session.role]}</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Memberships & org switcher */}
      <Card>
        <CardHeader
          title="Tus organizaciones"
          description="Cambia de espacio de trabajo para operar sobre otro tenant autorizado"
        />
        <CardContent className="space-y-3">
          {switchError ? <Alert tone="error">{switchError}</Alert> : null}

          {membershipsQuery.isLoading ? (
            <p className="text-sm text-slate-500">Cargando membresías...</p>
          ) : membershipsQuery.isError ? (
            <Alert tone="error">{getApiErrorMessage(membershipsQuery.error)}</Alert>
          ) : (
            <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              {membershipsQuery.data?.map((membership) => {
                const isCurrent = membership.organizationId === session.organizationId;
                return (
                  <div
                    key={membership.organizationId}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-slate-50/60"
                  >
                    <div className="flex items-center gap-3">
                      <div className="rounded-xl bg-brand-50 p-2.5 text-brand-600">
                        <Building2 className="h-4 w-4" aria-hidden="true" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-900">{membership.organizationName}</p>
                        <p className="text-xs text-slate-500">
                          {membership.organizationSlug} · Rol: {roleLabels[membership.role]}
                        </p>
                      </div>
                    </div>

                    {isCurrent ? (
                      <Badge tone="emerald">
                        <Check className="mr-1 h-3 w-3" aria-hidden="true" />
                        Activa
                      </Badge>
                    ) : (
                      <Button
                        variant="secondary"
                        size="sm"
                        className="w-full sm:w-auto"
                        isLoading={switchMutation.isPending}
                        onClick={() => {
                          setSwitchError(null);
                          switchMutation.mutate(membership.organizationId);
                        }}
                      >
                        Cambiar organización
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Invite / Add member */}
      {canManageAdmin ? (
        <Card>
          <CardHeader
            title="Añadir miembro a la organización"
            description="Disponible para Administradores y Propietarios (POST /api/auth/members)"
          />
          <CardContent className="space-y-4">
            {inviteError ? <Alert tone="error">{inviteError}</Alert> : null}
            {inviteSuccess ? <Alert tone="success">{inviteSuccess}</Alert> : null}

            <form onSubmit={handleSubmit(onInviteSubmit)} className="grid gap-4 sm:grid-cols-2" noValidate>
              <div>
                <label htmlFor="member-fullName" className="block text-sm font-medium text-slate-700">
                  Nombre completo
                </label>
                <input
                  id="member-fullName"
                  type="text"
                  {...register('fullName')}
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
                />
                {errors.fullName ? <p className="mt-1 text-xs text-rose-600">{errors.fullName.message}</p> : null}
              </div>

              <div>
                <label htmlFor="member-email" className="block text-sm font-medium text-slate-700">
                  Correo electrónico
                </label>
                <input
                  id="member-email"
                  type="email"
                  {...register('email')}
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
                />
                {errors.email ? <p className="mt-1 text-xs text-rose-600">{errors.email.message}</p> : null}
              </div>

              <div>
                <label htmlFor="member-password" className="block text-sm font-medium text-slate-700">
                  Contraseña temporal
                </label>
                <input
                  id="member-password"
                  type="password"
                  {...register('temporaryPassword')}
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
                />
                {errors.temporaryPassword ? (
                  <p className="mt-1 text-xs text-rose-600">{errors.temporaryPassword.message}</p>
                ) : null}
              </div>

              <div>
                <label htmlFor="member-role" className="block text-sm font-medium text-slate-700">
                  Rol asignado
                </label>
                <select
                  id="member-role"
                  {...register('role', { valueAsNumber: true })}
                  className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
                >
                  {assignableRoles.map((roleValue) => (
                    <option key={roleValue} value={roleValue}>
                      {roleLabels[roleValue]}
                    </option>
                  ))}
                </select>
                {errors.role ? <p className="mt-1 text-xs text-rose-600">{errors.role.message}</p> : null}
              </div>

              <div className="sm:col-span-2">
                <Button
                  type="submit"
                  isLoading={isSubmitting}
                  className="w-full sm:w-auto"
                  leftIcon={<UserPlus className="h-4 w-4" aria-hidden="true" />}
                >
                  Añadir miembro
                </Button>
              </div>
            </form>

            <Alert tone="info">
              Nota: El backend actual no expone endpoints para listar todos los miembros de una organización ni para
              editar o desactivar membresías existentes desde la UI.
            </Alert>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

