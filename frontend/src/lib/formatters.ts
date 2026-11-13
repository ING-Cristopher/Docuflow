import { DocumentStatus, DocumentType, OrganizationRole, ValidationSeverity } from '@/types/api';

export const roleLabels: Record<OrganizationRole, string> = {
  [OrganizationRole.Viewer]: 'Lector',
  [OrganizationRole.Reviewer]: 'Revisor',
  [OrganizationRole.Operator]: 'Operador',
  [OrganizationRole.Admin]: 'Administrador',
  [OrganizationRole.Owner]: 'Propietario',
};

export const documentTypeLabels: Record<DocumentType, string> = {
  [DocumentType.Unknown]: 'Desconocido',
  [DocumentType.Invoice]: 'Factura',
  [DocumentType.PurchaseOrder]: 'Orden de compra',
  [DocumentType.Contract]: 'Contrato',
  [DocumentType.Receipt]: 'Recibo',
  [DocumentType.Other]: 'Otro',
};

export const documentStatusLabels: Record<DocumentStatus, string> = {
  [DocumentStatus.Uploaded]: 'Cargado',
  [DocumentStatus.Queued]: 'En cola',
  [DocumentStatus.Processing]: 'Procesando',
  [DocumentStatus.Extracted]: 'Extraído',
  [DocumentStatus.PendingReview]: 'Pendiente de revisión',
  [DocumentStatus.Approved]: 'Aprobado',
  [DocumentStatus.Rejected]: 'Rechazado',
  [DocumentStatus.Failed]: 'Error',
};

export const validationSeverityLabels: Record<ValidationSeverity, string> = {
  [ValidationSeverity.Info]: 'Info',
  [ValidationSeverity.Warning]: 'Advertencia',
  [ValidationSeverity.Error]: 'Error',
};

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('es-ES', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** i;
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatConfidence(confidence: number): string {
  const pct = confidence <= 1 ? confidence * 100 : confidence;
  return `${pct.toFixed(1)}%`;
}

