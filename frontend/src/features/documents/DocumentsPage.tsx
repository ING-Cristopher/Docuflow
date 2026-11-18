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
    refetchInterval: (query) => {
      const hasInFlight = query.state.data?.items.some(
        (d) =>
          d.status === DocumentStatus.Uploaded ||
          d.status === DocumentStatus.Queued ||
          d.status === DocumentStatus.Processing,
      );
      return hasInFlight ? 3000 : false;
    },
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
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">Gestión documental</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Documentos</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Búsqueda, estado de extracción con IA y descarga autorizada.
          </p>
        </div>

        {canUpload ? (
          <Button
            onClick={() => setUploadOpen(true)}
            className="w-full sm:w-auto"
            leftIcon={<Plus className="h-4 w-4" aria-hidden="true" />}
          >
            Cargar documento
          </Button>
        ) : null}
      </div>

      {downloadError ? <Alert tone="error">{downloadError}</Alert> : null}

      {/* Filters bar */}
      <Card className="p-3.5 sm:p-4">
        <form onSubmit={handleSearchSubmit} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative sm:col-span-2">
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
              className="block w-full rounded-xl border border-slate-200 bg-slate-50/70 py-2 pl-9 pr-3 text-sm focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20"
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
            className="block w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 text-sm focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20"
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
              className="block w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 text-sm focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20"
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
                    <th className="px-4 py-3 sm:px-5">Título</th>
                    <th className="hidden px-4 py-3 sm:table-cell">Tipo</th>
                    <th className="px-3 py-3 sm:px-4">Estado</th>
                    <th className="hidden px-4 py-3 lg:table-cell">Versión</th>
                    <th className="hidden px-4 py-3 lg:table-cell">Reintentos</th>
                    <th className="hidden px-4 py-3 md:table-cell">Creado</th>
                    <th className="px-4 py-3 text-right sm:px-5">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {documentsQuery.data.items.map((doc) => (
                    <tr key={doc.id} className="transition-colors hover:bg-slate-50/80">
                      <td className="max-w-[180px] px-4 py-3.5 font-medium text-slate-900 sm:max-w-none sm:px-5">
                        <Link to={`/documents/${doc.id}`} className="flex items-center gap-2.5 hover:text-brand-600 sm:gap-3">
                          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                            <FileText className="h-4 w-4" aria-hidden="true" />
                          </span>
                          <div className="min-w-0">
                            <span className="block truncate">{doc.title}</span>
                            <span className="mt-0.5 block truncate text-[11px] font-normal text-slate-400 md:hidden">
                              <span className="sm:hidden">{documentTypeLabels[doc.documentType]} · </span>
                              v{doc.currentVersionNumber} · {formatDateTime(doc.createdAt)}
                            </span>
                          </div>
                        </Link>
                      </td>
                      <td className="hidden px-4 py-3.5 text-xs text-slate-600 sm:table-cell">
                        {documentTypeLabels[doc.documentType]}
                      </td>
                      <td className="px-3 py-3.5 sm:px-4">
                        <DocumentStatusBadge status={doc.status} />
                      </td>
                      <td className="hidden px-4 py-3.5 text-xs font-medium text-slate-600 lg:table-cell">
                        v{doc.currentVersionNumber}
                      </td>
                      <td className="hidden px-4 py-3.5 text-xs text-slate-600 lg:table-cell">{doc.retryCount}</td>
                      <td className="hidden px-4 py-3.5 text-xs text-slate-500 md:table-cell">
                        {formatDateTime(doc.createdAt)}
                      </td>
                      <td className="px-4 py-3.5 sm:px-5">
                        <div className="flex justify-end gap-1.5 sm:gap-2">
                          <Link
                            to={`/documents/${doc.id}`}
                            aria-label={`Detalle de ${doc.title}`}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 hover:text-brand-600"
                          >
                            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                            <span className="hidden sm:inline">Detalle</span>
                          </Link>
                          <button
                            type="button"
                            onClick={() => handleDownload(doc.id)}
                            aria-label={`Descargar ${doc.title}`}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 hover:text-brand-600"
                          >
                            <Download className="h-3.5 w-3.5" aria-hidden="true" />
                            <span className="hidden sm:inline">Descargar</span>
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

