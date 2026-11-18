import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, ClipboardCheck, FileText } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { DocumentStatusBadge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { useAuth } from '@/features/auth/AuthContext';
import { getApiErrorMessage } from '@/lib/errors';
import { documentTypeLabels, formatDateTime } from '@/lib/formatters';
import { documentsService } from '@/services/documentsService';
import { DocumentStatus } from '@/types/api';

export function ReviewsPage() {
  const { session } = useAuth();
  const [page, setPage] = useState(1);

  const pendingQuery = useQuery({
    queryKey: ['documents', 'pending-review', session?.organizationId, page],
    queryFn: () =>
      documentsService.getPaged({
        page,
        pageSize: 15,
        status: DocumentStatus.PendingReview,
      }),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">Control de calidad</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Bandeja de revisión humana</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Documentos que requieren verificación, corrección de campos, aprobación o rechazo.
          </p>
        </div>
        {pendingQuery.data ? (
          <span className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800">
            {pendingQuery.data.totalCount} pendientes
          </span>
        ) : null}
      </div>

      <Card>
        {pendingQuery.isLoading ? (
          <div className="p-8 text-center text-sm text-slate-500">Cargando bandeja...</div>
        ) : pendingQuery.isError ? (
          <div className="p-5">
            <Alert tone="error">{getApiErrorMessage(pendingQuery.error)}</Alert>
          </div>
        ) : !pendingQuery.data || pendingQuery.data.items.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={<ClipboardCheck className="h-6 w-6" aria-hidden="true" />}
              title="No hay documentos pendientes de revisión"
              description="Todos los documentos extraídos han sido procesados o revisados."
            />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500">
                  <tr>
                    <th className="px-4 py-3 sm:px-5">Título</th>
                    <th className="hidden px-4 py-3 sm:table-cell">Tipo</th>
                    <th className="px-3 py-3 sm:px-4">Estado</th>
                    <th className="hidden px-4 py-3 md:table-cell">Creado</th>
                    <th className="px-4 py-3 text-right sm:px-5">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pendingQuery.data.items.map((doc) => (
                    <tr key={doc.id} className="transition-colors hover:bg-slate-50/80">
                      <td className="max-w-[180px] px-4 py-3.5 font-medium text-slate-900 sm:max-w-none sm:px-5">
                        <div className="flex items-center gap-2.5 sm:gap-3">
                          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                            <FileText className="h-4 w-4" aria-hidden="true" />
                          </span>
                          <div className="min-w-0">
                            <span className="block truncate">{doc.title}</span>
                            <span className="mt-0.5 block truncate text-[11px] font-normal text-slate-400 md:hidden">
                              <span className="sm:hidden">{documentTypeLabels[doc.documentType]} · </span>
                              {formatDateTime(doc.createdAt)}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="hidden px-4 py-3.5 text-xs text-slate-600 sm:table-cell">
                        {documentTypeLabels[doc.documentType]}
                      </td>
                      <td className="px-3 py-3.5 sm:px-4">
                        <DocumentStatusBadge status={doc.status} />
                      </td>
                      <td className="hidden px-4 py-3.5 text-xs text-slate-500 md:table-cell">
                        {formatDateTime(doc.createdAt)}
                      </td>
                      <td className="px-4 py-3.5 text-right sm:px-5">
                        <Link
                          to={`/documents/${doc.id}`}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-2.5 py-1.5 text-xs font-medium text-white shadow-sm shadow-brand-600/20 transition-colors hover:bg-brand-700 sm:px-3"
                        >
                          <span className="sm:hidden">Revisar</span>
                          <span className="hidden sm:inline">Revisar documento</span>
                          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination
              page={pendingQuery.data.page}
              pageSize={pendingQuery.data.pageSize}
              totalCount={pendingQuery.data.totalCount}
              onPageChange={setPage}
            />
          </>
        )}
      </Card>
    </div>
  );
}

