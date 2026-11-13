import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  CheckCircle2,
  Clock,
  FileText,
  XCircle,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { DocumentStatusBadge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuth } from '@/features/auth/AuthContext';
import { getApiErrorMessage } from '@/lib/errors';
import { documentTypeLabels, formatDateTime } from '@/lib/formatters';
import { auditService } from '@/services/auditService';
import { documentsService } from '@/services/documentsService';
import { healthService } from '@/services/healthService';
import { DocumentStatus, rolePermissions } from '@/types/api';

export function DashboardPage() {
  const { session } = useAuth();
  const isAdmin = session ? rolePermissions.canManageAdmin(session.role) : false;

  const summaryQuery = useQuery({
    queryKey: ['dashboard', 'summary', session?.organizationId],
    queryFn: async () => {
      const [recent, pendingReview, approved, rejected, queued, processing, failed] = await Promise.all([
        documentsService.getPaged({ page: 1, pageSize: 5 }),
        documentsService.getPaged({ page: 1, pageSize: 1, status: DocumentStatus.PendingReview }),
        documentsService.getPaged({ page: 1, pageSize: 1, status: DocumentStatus.Approved }),
        documentsService.getPaged({ page: 1, pageSize: 1, status: DocumentStatus.Rejected }),
        documentsService.getPaged({ page: 1, pageSize: 1, status: DocumentStatus.Queued }),
        documentsService.getPaged({ page: 1, pageSize: 1, status: DocumentStatus.Processing }),
        documentsService.getPaged({ page: 1, pageSize: 1, status: DocumentStatus.Failed }),
      ]);

      return {
        totalDocuments: recent.totalCount,
        pendingReviewCount: pendingReview.totalCount,
        approvedCount: approved.totalCount,
        rejectedCount: rejected.totalCount,
        inPipelineCount: queued.totalCount + processing.totalCount,
        failedCount: failed.totalCount,
        recentDocuments: recent.items,
      };
    },
  });

  const auditQuery = useQuery({
    queryKey: ['dashboard', 'recent-audit', session?.organizationId],
    queryFn: () => auditService.getPaged({ page: 1, pageSize: 5 }),
    enabled: isAdmin,
  });

  const healthQuery = useQuery({
    queryKey: ['health'],
    queryFn: () => healthService.check(),
    retry: false,
  });

  const stats = summaryQuery.data;

  const statCards = [
    {
      label: 'Total de documentos',
      value: stats?.totalDocuments ?? 0,
      icon: FileText,
      tone: 'text-brand-600 bg-brand-50',
    },
    {
      label: 'Pendientes de revisión',
      value: stats?.pendingReviewCount ?? 0,
      icon: Clock,
      tone: 'text-amber-700 bg-amber-50',
    },
    {
      label: 'Aprobados',
      value: stats?.approvedCount ?? 0,
      icon: CheckCircle2,
      tone: 'text-emerald-700 bg-emerald-50',
    },
    {
      label: 'Rechazados',
      value: stats?.rejectedCount ?? 0,
      icon: XCircle,
      tone: 'text-rose-700 bg-rose-50',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">
            Resumen operativo en tiempo real de la organización <strong>{session?.organizationSlug}</strong>
          </p>
        </div>

        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs">
          <Activity
            className={`h-3.5 w-3.5 ${
              healthQuery.data?.status === 'healthy' ? 'text-emerald-600' : 'text-amber-500'
            }`}
            aria-hidden="true"
          />
          <span className="text-slate-600">
            API:{' '}
            <strong>
              {healthQuery.isLoading
                ? 'Comprobando...'
                : healthQuery.data?.status === 'healthy'
                  ? 'Conectada'
                  : 'No disponible'}
            </strong>
          </span>
        </div>
      </div>

      {summaryQuery.isError ? (
        <Alert tone="error" title="No se pudieron cargar las métricas">
          {getApiErrorMessage(summaryQuery.error)}
        </Alert>
      ) : null}

      {/* KPI Grid */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.label}>
              <CardContent className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-500">{card.label}</p>
                  <p className="mt-2 text-3xl font-semibold text-slate-900">
                    {summaryQuery.isLoading ? '—' : card.value}
                  </p>
                </div>
                <div className={`rounded-xl p-3 ${card.tone}`}>
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Processing indicators */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500">En cola / procesando por IA</p>
              <p className="mt-1 text-xl font-semibold text-slate-900">
                {summaryQuery.isLoading ? '—' : (stats?.inPipelineCount ?? 0)}
              </p>
            </div>
            <Link
              to="/documents"
              className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
            >
              Ver documentos <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-rose-50 p-2 text-rose-700">
                <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500">Documentos con error de extracción</p>
                <p className="mt-0.5 text-xl font-semibold text-slate-900">
                  {summaryQuery.isLoading ? '—' : (stats?.failedCount ?? 0)}
                </p>
              </div>
            </div>
            <Link
              to="/documents?status=8"
              className="inline-flex items-center gap-1 text-xs font-medium text-rose-700 hover:text-rose-800"
            >
              Revisar fallos <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Recent documents + Recent audit activity */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Documentos recientes"
            description="Últimos documentos registrados en la organización actual"
            action={
              <Link to="/documents" className="text-xs font-semibold text-brand-600 hover:text-brand-700">
                Ir al listado
              </Link>
            }
          />
          <CardContent className="p-0">
            {summaryQuery.isLoading ? (
              <p className="p-5 text-sm text-slate-500">Cargando documentos...</p>
            ) : !stats || stats.recentDocuments.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  title="Sin documentos todavía"
                  description="Cuando cargues facturas, contratos u órdenes de compra aparecerán aquí."
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-100 text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500">
                    <tr>
                      <th className="px-5 py-3">Título</th>
                      <th className="px-4 py-3">Tipo</th>
                      <th className="px-4 py-3">Estado</th>
                      <th className="px-4 py-3">Creado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {stats.recentDocuments.map((doc) => (
                      <tr key={doc.id} className="hover:bg-slate-50/80">
                        <td className="px-5 py-3 font-medium text-slate-900">
                          <Link to={`/documents/${doc.id}`} className="hover:text-brand-600">
                            {doc.title}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{documentTypeLabels[doc.documentType]}</td>
                        <td className="px-4 py-3">
                          <DocumentStatusBadge status={doc.status} />
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">{formatDateTime(doc.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader
            title="Actividad reciente"
            description="Eventos de auditoría de la organización"
            action={
              isAdmin ? (
                <Link to="/audit" className="text-xs font-semibold text-brand-600 hover:text-brand-700">
                  Ver todo
                </Link>
              ) : null
            }
          />
          <CardContent>
            {!isAdmin ? (
              <p className="text-xs text-slate-500">
                La consulta de registros de auditoría requiere rol de <strong>Administrador</strong> o{' '}
                <strong>Propietario</strong>.
              </p>
            ) : auditQuery.isLoading ? (
              <p className="text-sm text-slate-500">Cargando actividad...</p>
            ) : auditQuery.isError ? (
              <Alert tone="error">{getApiErrorMessage(auditQuery.error)}</Alert>
            ) : !auditQuery.data || auditQuery.data.items.length === 0 ? (
              <p className="text-xs text-slate-500">No hay eventos registrados aún.</p>
            ) : (
              <ul className="space-y-3">
                {auditQuery.data.items.map((item) => (
                  <li key={item.id} className="border-b border-slate-100 pb-2.5 last:border-0 last:pb-0">
                    <p className="text-xs font-semibold text-slate-800">{item.action}</p>
                    <p className="text-xs text-slate-500">
                      {item.entityType} · {formatDateTime(item.occurredAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

