import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
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
        <h1 className="text-2xl font-semibold text-slate-900">Registro de auditoría</h1>
        <p className="mt-1 text-sm text-slate-500">
          Trazabilidad de operaciones de seguridad, carga, extracción y decisiones humanas.
        </p>
      </div>

      <Card className="p-4">
        <form onSubmit={handleFilterSubmit} className="flex flex-wrap gap-3">
          <input
            type="text"
            value={actionInput}
            onChange={(e) => setActionInput(e.target.value)}
            placeholder="Filtrar por acción exacta (ej. DocumentApproved)"
            aria-label="Filtrar por acción de auditoría"
            className="min-w-[260px] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
          />
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
                    <th className="px-5 py-3">Fecha</th>
                    <th className="px-4 py-3">Operación</th>
                    <th className="px-4 py-3">Entidad</th>
                    <th className="px-4 py-3">Actor (UserId)</th>
                    <th className="px-4 py-3">Detalles</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {auditQuery.data.items.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/70">
                      <td className="px-5 py-3 text-xs text-slate-600">{formatDateTime(log.occurredAt)}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{log.action}</td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {log.entityType}
                        {log.entityId ? ` · ${log.entityId.slice(0, 8)}…` : ''}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">
                        {log.actorUserId ? `${log.actorUserId.slice(0, 8)}…` : 'Sistema'}
                      </td>
                      <td className="max-w-xs truncate px-4 py-3 font-mono text-xs text-slate-500">
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

