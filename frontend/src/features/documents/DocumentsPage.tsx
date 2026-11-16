import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Download, Eye, FileText, Plus, Search } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { DocumentStatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { useAuth } from '@/features/auth/AuthContext';
import { UploadDocumentModal } from '@/features/documents/UploadDocumentModal';
import { getApiErrorMessage } from '@/lib/errors';
import { documentStatusLabels, documentTypeLabels, formatDateTime } from '@/lib/formatters';
import { documentsService } from '@/services/documentsService';
import { DocumentStatus, DocumentType, rolePermissions } from '@/types/api';

export function DocumentsPage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const initialStatusRaw = searchParams.get('status');
  const urlSearch = searchParams.get('search') ?? '';
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState(urlSearch);
  const [appliedSearch, setAppliedSearch] = useState(urlSearch);
  const [statusFilter, setStatusFilter] = useState<DocumentStatus | ''>(
    initialStatusRaw ? (Number(initialStatusRaw) as DocumentStatus) : '',
  );

  useEffect(() => {
    setSearchInput(urlSearch);
    setAppliedSearch(urlSearch);
    setPage(1);
  }, [urlSearch]);
  const [typeFilter, setTypeFilter] = useState<DocumentType | ''>('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const canUpload = session ? rolePermissions.canUpload(session.role) : false;

  const documentsQuery = useQuery({
    queryKey: ['documents', session?.organizationId, page, statusFilter, typeFilter, appliedSearch],
    queryFn: () =>
      documentsService.getPaged({
        page,
        pageSize: 15,
        status: statusFilter === '' ? undefined : statusFilter,
        documentType: typeFilter === '' ? undefined : typeFilter,
        search: appliedSearch,
      }),
  });

  const handleDownload = async (id: string) => {
    setDownloadError(null);
    try {
      const { blob, fileName } = await documentsService.download(id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setDownloadError(getApiErrorMessage(error, 'No se pudo descargar el documento.'));
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setAppliedSearch(searchInput.trim());
  };

  const statusOptions = Object.values(DocumentStatus).filter(
    (v): v is DocumentStatus => typeof v === 'number',
  );
  const typeOptions = Object.values(DocumentType).filter(
    (v): v is DocumentType => typeof v === 'number',
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Documentos</h1>
          <p className="mt-1 text-sm text-slate-500">
            Gestión documental, búsqueda, estado de extracción y descarga autorizada.
          </p>
        </div>

        {canUpload ? (
          <Button
            onClick={() => setUploadOpen(true)}
            leftIcon={<Plus className="h-4 w-4" aria-hidden="true" />}
          >
            Cargar documento
          </Button>
        ) : null}
      </div>

      {downloadError ? <Alert tone="error">{downloadError}</Alert> : null}

      {/* Filters bar */}
      <Card className="p-4">
        <form onSubmit={handleSearchSubmit} className="grid gap-3 md:grid-cols-4">
          <div className="relative md:col-span-2">
            <Search
              className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Buscar por título..."
              aria-label="Buscar documentos por título"
              className="block w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
            />
          </div>

          <select
            aria-label="Filtrar por estado"
            value={statusFilter}
            onChange={(e) => {
              const val = e.target.value === '' ? '' : (Number(e.target.value) as DocumentStatus);
              setStatusFilter(val);
              setPage(1);
              if (val === '') {
                searchParams.delete('status');
                setSearchParams(searchParams, { replace: true });
              }
            }}
            className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
          >
            <option value="">Todos los estados</option>
            {statusOptions.map((st) => (
              <option key={st} value={st}>
                {documentStatusLabels[st]}
              </option>
            ))}
          </select>

          <div className="flex gap-2">
            <select
              aria-label="Filtrar por tipo"
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value === '' ? '' : (Number(e.target.value) as DocumentType));
                setPage(1);
              }}
              className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
            >
              <option value="">Todos los tipos</option>
              {typeOptions.map((t) => (
                <option key={t} value={t}>
                  {documentTypeLabels[t]}
                </option>
              ))}
            </select>
            <Button type="submit" variant="secondary">
              Buscar
            </Button>
          </div>
        </form>
      </Card>

      {/* Table */}
      <Card>
        {documentsQuery.isLoading ? (
          <div className="p-8 text-center text-sm text-slate-500">Cargando documentos...</div>
        ) : documentsQuery.isError ? (
          <div className="p-5">
            <Alert tone="error">{getApiErrorMessage(documentsQuery.error)}</Alert>
          </div>
        ) : !documentsQuery.data || documentsQuery.data.items.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={<FileText className="h-6 w-6" aria-hidden="true" />}
              title="No se encontraron documentos"
              description="Ajusta los filtros de búsqueda o carga un nuevo documento para iniciar el procesamiento."
              action={
                canUpload ? (
                  <Button onClick={() => setUploadOpen(true)}>Cargar documento</Button>
                ) : undefined
              }
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
                    <th className="px-4 py-3">Versión</th>
                    <th className="px-4 py-3">Reintentos</th>
                    <th className="px-4 py-3">Creado</th>
                    <th className="px-5 py-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {documentsQuery.data.items.map((doc) => (
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
                      <td className="px-4 py-3 text-slate-600">v{doc.currentVersionNumber}</td>
                      <td className="px-4 py-3 text-slate-600">{doc.retryCount}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{formatDateTime(doc.createdAt)}</td>
                      <td className="px-5 py-3">
                        <div className="flex justify-end gap-2">
                          <Link
                            to={`/documents/${doc.id}`}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                            Detalle
                          </Link>
                          <button
                            type="button"
                            onClick={() => handleDownload(doc.id)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            <Download className="h-3.5 w-3.5" aria-hidden="true" />
                            Descargar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination
              page={documentsQuery.data.page}
              pageSize={documentsQuery.data.pageSize}
              totalCount={documentsQuery.data.totalCount}
              onPageChange={setPage}
            />
          </>
        )}
      </Card>

      <UploadDocumentModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onUploaded={(id) => navigate(`/documents/${id}`)}
      />
    </div>
  );
}

