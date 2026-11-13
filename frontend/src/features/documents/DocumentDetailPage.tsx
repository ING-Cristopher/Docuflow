import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, Download, Pencil, XCircle } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Badge, DocumentStatusBadge, ValidationSeverityBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { useAuth } from '@/features/auth/AuthContext';
import { getApiErrorMessage } from '@/lib/errors';
import {
  documentTypeLabels,
  formatBytes,
  formatConfidence,
  formatDateTime,
} from '@/lib/formatters';
import { documentsService } from '@/services/documentsService';
import { DocumentStatus, rolePermissions, type ExtractedFieldDto } from '@/types/api';

export function DocumentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { session } = useAuth();
  const queryClient = useQueryClient();

  const [editingField, setEditingField] = useState<ExtractedFieldDto | null>(null);
  const [correctedValue, setCorrectedValue] = useState('');
  const [approveOpen, setApproveOpen] = useState(false);
  const [approveNotes, setApproveNotes] = useState('');
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const canReview = session ? rolePermissions.canReview(session.role) : false;

  const detailQuery = useQuery({
    queryKey: ['documents', 'detail', session?.organizationId, id],
    queryFn: () => documentsService.getById(id!),
    enabled: Boolean(id),
  });

  const invalidateDoc = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['documents'] }),
      queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
    ]);
  };

  const correctFieldMutation = useMutation({
    mutationFn: ({ fieldId, value }: { fieldId: string; value: string }) =>
      documentsService.correctField(id!, fieldId, value),
    onSuccess: async () => {
      setEditingField(null);
      setCorrectedValue('');
      setActionError(null);
      setActionSuccess('Campo corregido y marcado como validado.');
      await invalidateDoc();
    },
    onError: (err) => setActionError(getApiErrorMessage(err)),
  });

  const approveMutation = useMutation({
    mutationFn: (notes?: string) => documentsService.approve(id!, notes),
    onSuccess: async () => {
      setApproveOpen(false);
      setApproveNotes('');
      setActionError(null);
      setActionSuccess('Documento aprobado correctamente.');
      await invalidateDoc();
    },
    onError: (err) => setActionError(getApiErrorMessage(err)),
  });

  const rejectMutation = useMutation({
    mutationFn: (reason: string) => documentsService.reject(id!, reason),
    onSuccess: async () => {
      setRejectOpen(false);
      setRejectReason('');
      setActionError(null);
      setActionSuccess('Documento rechazado correctamente.');
      await invalidateDoc();
    },
    onError: (err) => setActionError(getApiErrorMessage(err)),
  });

  const handleDownload = async () => {
    if (!id) return;
    setActionError(null);
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
    } catch (err) {
      setActionError(getApiErrorMessage(err));
    }
  };

  if (detailQuery.isLoading) {
    return <p className="py-12 text-center text-sm text-slate-500">Cargando detalle del documento...</p>;
  }

  if (detailQuery.isError || !detailQuery.data) {
    return (
      <div className="space-y-4">
        <Link to="/documents" className="inline-flex items-center gap-1 text-sm font-medium text-brand-600">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Volver a documentos
        </Link>
        <Alert tone="error">
          {detailQuery.isError ? getApiErrorMessage(detailQuery.error) : 'Documento no encontrado.'}
        </Alert>
      </div>
    );
  }

  const doc = detailQuery.data;
  const isReviewableStatus =
    doc.status === DocumentStatus.PendingReview || doc.status === DocumentStatus.Extracted;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            to="/documents"
            className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Volver al listado
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-slate-900">{doc.title}</h1>
            <DocumentStatusBadge status={doc.status} />
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {documentTypeLabels[doc.documentType]} · Versión v{doc.currentVersionNumber} · Creado el{' '}
            {formatDateTime(doc.createdAt)}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={handleDownload}
            leftIcon={<Download className="h-4 w-4" aria-hidden="true" />}
          >
            Descargar archivo
          </Button>
          {canReview && isReviewableStatus ? (
            <>
              <Button
                variant="danger"
                onClick={() => setRejectOpen(true)}
                leftIcon={<XCircle className="h-4 w-4" aria-hidden="true" />}
              >
                Rechazar
              </Button>
              <Button
                onClick={() => setApproveOpen(true)}
                leftIcon={<CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
              >
                Aprobar
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {actionError ? <Alert tone="error">{actionError}</Alert> : null}
      {actionSuccess ? <Alert tone="success">{actionSuccess}</Alert> : null}

      {doc.lastError ? (
        <Alert tone="error" title="Error en procesamiento de IA">
          {doc.lastError}
        </Alert>
      ) : null}

      {/* Review decision summary */}
      {doc.reviewedAt ? (
        <Card>
          <CardHeader title="Historial de decisión humana" />
          <CardContent className="grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <p className="text-xs text-slate-500">Fecha de revisión</p>
              <p className="mt-0.5 font-medium text-slate-900">{formatDateTime(doc.reviewedAt)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Revisor (UserId)</p>
              <p className="mt-0.5 font-mono text-xs text-slate-700">{doc.reviewedByUserId ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Notas / Motivo</p>
              <p className="mt-0.5 text-slate-800">{doc.reviewNotes || 'Sin observaciones'}</p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Extracted fields */}
      <Card>
        <CardHeader
          title="Campos extraídos por IA"
          description="Niveles de confianza, sensibilidad financiera y estado de validación"
        />
        <CardContent className="p-0">
          {doc.extractedFields.length === 0 ? (
            <p className="p-5 text-sm text-slate-500">
              Aún no hay campos extraídos para este documento.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500">
                  <tr>
                    <th className="px-5 py-3">Campo</th>
                    <th className="px-4 py-3">Valor detectado</th>
                    <th className="px-4 py-3">Valor corregido</th>
                    <th className="px-4 py-3">Confianza</th>
                    <th className="px-4 py-3">Estado</th>
                    {canReview && isReviewableStatus ? (
                      <th className="px-5 py-3 text-right">Edición</th>
                    ) : null}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {doc.extractedFields.map((field) => (
                    <tr key={field.id} className="hover:bg-slate-50/70">
                      <td className="px-5 py-3">
                        <p className="font-medium text-slate-900">{field.fieldName}</p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {field.isFinanciallySensitive ? (
                            <Badge tone="amber">Financiero</Badge>
                          ) : null}
                          {field.pageNumber ? (
                            <span className="text-xs text-slate-400">Pág. {field.pageNumber}</span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {field.normalizedValue ?? field.rawValue ?? '—'}
                      </td>
                      <td className="px-4 py-3 font-medium text-brand-700">
                        {field.correctedValue ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs font-semibold ${
                            field.confidence >= 0.85
                              ? 'text-emerald-700'
                              : field.confidence >= 0.65
                                ? 'text-amber-700'
                                : 'text-rose-700'
                          }`}
                        >
                          {formatConfidence(field.confidence)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {field.isValidated ? (
                          <Badge tone="emerald">Validado</Badge>
                        ) : field.requiresReview ? (
                          <Badge tone="amber">Requiere revisión</Badge>
                        ) : (
                          <Badge tone="slate">Extraído</Badge>
                        )}
                      </td>
                      {canReview && isReviewableStatus ? (
                        <td className="px-5 py-3 text-right">
                          <Button
                            variant="secondary"
                            size="sm"
                            leftIcon={<Pencil className="h-3 w-3" aria-hidden="true" />}
                            onClick={() => {
                              setEditingField(field);
                              setCorrectedValue(
                                field.correctedValue ?? field.normalizedValue ?? field.rawValue ?? '',
                              );
                            }}
                          >
                            Corregir
                          </Button>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Validation issues */}
      <Card>
        <CardHeader title="Incidencias de validación" />
        <CardContent>
          {doc.validationIssues.length === 0 ? (
            <p className="text-sm text-slate-500">No se registraron incidencias de validación.</p>
          ) : (
            <ul className="space-y-3">
              {doc.validationIssues.map((issue) => (
                <li
                  key={issue.id}
                  className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-slate-200 p-3 text-sm"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <ValidationSeverityBadge severity={issue.severity} />
                      <span className="font-mono text-xs text-slate-600">{issue.ruleCode}</span>
                      {issue.fieldName ? (
                        <span className="text-xs font-medium text-slate-700">· {issue.fieldName}</span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-slate-800">{issue.message}</p>
                  </div>
                  <Badge tone={issue.isResolved ? 'emerald' : 'slate'}>
                    {issue.isResolved ? 'Resuelta' : 'Abierta'}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Version history */}
      <Card>
        <CardHeader title="Historial de versiones" />
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500">
                <tr>
                  <th className="px-5 py-3">Versión</th>
                  <th className="px-4 py-3">Archivo</th>
                  <th className="px-4 py-3">Tamaño</th>
                  <th className="px-4 py-3">SHA-256</th>
                  <th className="px-4 py-3">Fecha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {doc.versions.map((ver) => (
                  <tr key={ver.id}>
                    <td className="px-5 py-3 font-medium">v{ver.versionNumber}</td>
                    <td className="px-4 py-3 text-slate-700">{ver.originalFileName}</td>
                    <td className="px-4 py-3 text-slate-600">{formatBytes(ver.sizeBytes)}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">
                      {ver.sha256Hash.slice(0, 16)}…
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{formatDateTime(ver.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Correct Field Modal */}
      <Modal
        open={Boolean(editingField)}
        onClose={() => setEditingField(null)}
        title={`Corregir campo: ${editingField?.fieldName ?? ''}`}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!editingField || !correctedValue.trim()) return;
            correctFieldMutation.mutate({ fieldId: editingField.id, value: correctedValue.trim() });
          }}
          className="space-y-4"
        >
          <div>
            <label htmlFor="corrected-value" className="block text-sm font-medium text-slate-700">
              Valor corregido
            </label>
            <input
              id="corrected-value"
              type="text"
              value={correctedValue}
              onChange={(e) => setCorrectedValue(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
              required
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditingField(null)}>
              Cancelar
            </Button>
            <Button type="submit" isLoading={correctFieldMutation.isPending}>
              Guardar corrección
            </Button>
          </div>
        </form>
      </Modal>

      {/* Approve Modal */}
      <Modal
        open={approveOpen}
        onClose={() => setApproveOpen(false)}
        title="Aprobar documento"
        description="Confirma la validación de los campos extraídos y aprueba el documento."
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            approveMutation.mutate(approveNotes);
          }}
          className="space-y-4"
        >
          <div>
            <label htmlFor="approve-notes" className="block text-sm font-medium text-slate-700">
              Notas de aprobación <span className="font-normal text-slate-400">(opcional)</span>
            </label>
            <textarea
              id="approve-notes"
              rows={3}
              value={approveNotes}
              onChange={(e) => setApproveNotes(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
              placeholder="Validado contra orden de compra."
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setApproveOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" isLoading={approveMutation.isPending}>
              Confirmar aprobación
            </Button>
          </div>
        </form>
      </Modal>

      {/* Reject Modal */}
      <Modal
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        title="Rechazar documento"
        description="Indica claramente el motivo del rechazo para trazabilidad y auditoría."
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (rejectReason.trim().length < 5) return;
            rejectMutation.mutate(rejectReason.trim());
          }}
          className="space-y-4"
        >
          <div>
            <label htmlFor="reject-reason" className="block text-sm font-medium text-slate-700">
              Motivo del rechazo
            </label>
            <textarea
              id="reject-reason"
              rows={3}
              required
              minLength={5}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
              placeholder="El total de la factura no coincide con el importe neto."
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setRejectOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="danger" isLoading={rejectMutation.isPending}>
              Confirmar rechazo
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

