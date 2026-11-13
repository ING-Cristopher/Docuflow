import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ClipboardCheck } from 'lucide-react';
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
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Bandeja de revisión humana</h1>
        <p className="mt-1 text-sm text-slate-500">
          Documentos que requieren verificación, corrección de campos, aprobación o rechazo.
        </p>
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
                    <th className="px-5 py-3">Título</th>
                    <th className="px-4 py-3">Tipo</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3">Creado</th>
                    <th className="px-5 py-3 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pendingQuery.data.items.map((doc) => (
                    <tr key={doc.id} className="hover:bg-slate-50/80">
                      <td className="px-5 py-3 font-medium text-slate-900">{doc.title}</td>
                      <td className="px-4 py-3 text-slate-600">{documentTypeLabels[doc.documentType]}</td>
                      <td className="px-4 py-3">
                        <DocumentStatusBadge status={doc.status} />
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">{formatDateTime(doc.createdAt)}</td>
                      <td className="px-5 py-3 text-right">
                        <Link
                          to={`/documents/${doc.id}`}
                          className="inline-flex items-center rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
                        >
                          Revisar documento
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

