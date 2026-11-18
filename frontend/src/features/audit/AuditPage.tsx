import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, ShieldCheck } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { useAuth } from '@/features/auth/AuthContext';
import { getApiErrorMessage } from '@/lib/errors';
import { formatDateTime } from '@/lib/formatters';
import { auditService } from '@/services/auditService';

export function AuditPage() {
  const { session } = useAuth();
  const [page, setPage] = useState(1);
  const [actionInput, setActionInput] = useState('');
  const [appliedAction, setAppliedAction] = useState('');

  const auditQuery = useQuery({
    queryKey: ['audit-logs', session?.organizationId, page, appliedAction],
    queryFn: () =>
      auditService.getPaged({
        page,
        pageSize: 25,
        action: appliedAction,
      }),
  });

  const handleFilterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setAppliedAction(actionInput.trim());
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">Seguridad y cumplimiento</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Registro de auditoría</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Trazabilidad de operaciones de seguridad, carga, extracción y decisiones humanas.
        </p>
      </div>

      <Card className="p-3.5 sm:p-4">
        <form onSubmit={handleFilterSubmit} className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              type="text"
              value={actionInput}
              onChange={(e) => setActionInput(e.target.value)}
              placeholder="Filtrar por acción exacta (ej. DocumentApproved)"
              aria-label="Filtrar por acción de auditoría"
              className="w-full rounded-xl border border-slate-200 bg-slate-50/70 py-2 pl-10 pr-3.5 text-sm focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            />
          </div>
          <Button type="submit" variant="secondary">
            Filtrar
          </Button>
          {appliedAction ? (
            <Button
              variant="ghost"
              onClick={() => {
                setActionInput('');
                setAppliedAction('');
                setPage(1);
              }}
            >
              Limpiar
            </Button>
          ) : null}
        </form>
      </Card>

      <Card>
        {auditQuery.isLoading ? (
          <div className="p-8 text-center text-sm text-slate-500">Cargando auditoría...</div>
        ) : auditQuery.isError ? (
          <div className="p-5">
            <Alert tone="error">{getApiErrorMessage(auditQuery.error)}</Alert>
          </div>
        ) : !auditQuery.data || auditQuery.data.items.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={<ShieldCheck className="h-6 w-6" aria-hidden="true" />}
              title="Sin eventos de auditoría"
              description="No existen registros que coincidan con el filtro seleccionado."
            />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500">
                  <tr>
                    <th className="px-4 py-3 sm:px-5">Fecha</th>
                    <th className="px-3 py-3 sm:px-4">Operación</th>
                    <th className="px-3 py-3 sm:px-4">Entidad</th>
                    <th className="hidden px-4 py-3 md:table-cell">Actor (UserId)</th>
                    <th className="hidden px-4 py-3 lg:table-cell">Detalles</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {auditQuery.data.items.map((log) => (
                    <tr key={log.id} className="transition-colors hover:bg-slate-50/70">
                      <td className="px-4 py-3.5 text-xs text-slate-600 sm:px-5">{formatDateTime(log.occurredAt)}</td>
                      <td className="px-3 py-3.5 sm:px-4">
                        <Badge tone="blue">{log.action}</Badge>
                      </td>
                      <td className="px-3 py-3.5 text-xs text-slate-600 sm:px-4">
                        {log.entityType}
                        {log.entityId ? ` · ${log.entityId.slice(0, 8)}…` : ''}
                      </td>
                      <td className="hidden px-4 py-3.5 font-mono text-xs text-slate-500 md:table-cell">
                        {log.actorUserId ? `${log.actorUserId.slice(0, 8)}…` : 'Sistema'}
                      </td>
                      <td className="hidden max-w-xs truncate px-4 py-3.5 font-mono text-xs text-slate-500 lg:table-cell">
                        {log.detailsJson ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination
              page={auditQuery.data.page}
              pageSize={auditQuery.data.pageSize}
              totalCount={auditQuery.data.totalCount}
              onPageChange={setPage}
            />
          </>
        )}
      </Card>
    </div>
  );
}

