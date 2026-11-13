import type { ReactNode } from 'react';
import { DocumentStatus, ValidationSeverity } from '@/types/api';
import { documentStatusLabels, validationSeverityLabels } from '@/lib/formatters';

type BadgeTone = 'slate' | 'blue' | 'amber' | 'emerald' | 'rose' | 'indigo';

const toneClasses: Record<BadgeTone, string> = {
  slate: 'bg-slate-100 text-slate-700 ring-slate-200',
  blue: 'bg-sky-50 text-sky-700 ring-sky-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  rose: 'bg-rose-50 text-rose-700 ring-rose-200',
  indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
};

export function Badge({ tone = 'slate', children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${toneClasses[tone]}`}
    >
      {children}
    </span>
  );
}

const statusToneMap: Record<DocumentStatus, BadgeTone> = {
  [DocumentStatus.Uploaded]: 'slate',
  [DocumentStatus.Queued]: 'blue',
  [DocumentStatus.Processing]: 'indigo',
  [DocumentStatus.Extracted]: 'blue',
  [DocumentStatus.PendingReview]: 'amber',
  [DocumentStatus.Approved]: 'emerald',
  [DocumentStatus.Rejected]: 'rose',
  [DocumentStatus.Failed]: 'rose',
};

export function DocumentStatusBadge({ status }: { status: DocumentStatus }) {
  return <Badge tone={statusToneMap[status] ?? 'slate'}>{documentStatusLabels[status] ?? 'Desconocido'}</Badge>;
}

const severityToneMap: Record<ValidationSeverity, BadgeTone> = {
  [ValidationSeverity.Info]: 'blue',
  [ValidationSeverity.Warning]: 'amber',
  [ValidationSeverity.Error]: 'rose',
};

export function ValidationSeverityBadge({ severity }: { severity: ValidationSeverity }) {
  return (
    <Badge tone={severityToneMap[severity] ?? 'slate'}>
      {validationSeverityLabels[severity] ?? 'Info'}
    </Badge>
  );
}

