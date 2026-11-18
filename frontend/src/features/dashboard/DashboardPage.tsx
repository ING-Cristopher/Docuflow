import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Calendar,
  CheckCircle2,
  Clock,
  Cpu,
  Download,
  Eye,
  FileText,
  Sparkles,
  Zap,
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
import { DocumentStatus, DocumentType, rolePermissions, type DocumentSummaryDto } from '@/types/api';

type PeriodOption = 7 | 30 | 0;

const typeColors: Record<DocumentType, { stroke: string; dot: string; badge: string; label: string }> = {
  [DocumentType.Invoice]: {
    stroke: '#2554e8',
    dot: 'bg-brand-600',
    badge: 'bg-rose-50 text-rose-600',
    label: 'Facturas',
  },
  [DocumentType.PurchaseOrder]: {
    stroke: '#10b981',
    dot: 'bg-emerald-500',
    badge: 'bg-sky-50 text-sky-600',
    label: 'Órdenes Compra',
  },
  [DocumentType.Contract]: {
    stroke: '#8b5cf6',
    dot: 'bg-violet-500',
    badge: 'bg-violet-50 text-violet-600',
    label: 'Contratos',
  },
  [DocumentType.Receipt]: {
    stroke: '#f59e0b',
    dot: 'bg-amber-500',
    badge: 'bg-amber-50 text-amber-600',
    label: 'Recibos',
  },
  [DocumentType.Other]: {
    stroke: '#94a3b8',
    dot: 'bg-slate-400',
    badge: 'bg-slate-100 text-slate-600',
    label: 'Otros',
  },
  [DocumentType.Unknown]: {
    stroke: '#cbd5e1',
    dot: 'bg-slate-300',
    badge: 'bg-slate-100 text-slate-500',
    label: 'Sin clasificar',
  },
};

function buildDailySeries(documents: DocumentSummaryDto[], days: number) {
  const bucketCount = days === 7 ? 7 : 7;
  const now = new Date();
  const buckets: { key: string; label: string; count: number }[] = [];

  for (let i = bucketCount - 1; i >= 0; i -= 1) {
    const date = new Date(now);
    date.setDate(now.getDate() - i);
    const key = date.toISOString().slice(0, 10);
    const label = new Intl.DateTimeFormat('es-ES', { month: 'short', day: 'numeric' }).format(date);
    buckets.push({ key, label, count: 0 });
  }

  const map = new Map(buckets.map((b) => [b.key, b]));
  for (const doc of documents) {
    const key = doc.createdAt.slice(0, 10);
    const bucket = map.get(key);
    if (bucket) {
      bucket.count += 1;
    }
  }

  return buckets;
}

export function DashboardPage() {
  const { session } = useAuth();
  const [periodDays, setPeriodDays] = useState<PeriodOption>(30);
  const [hoveredPoint, setHoveredPoint] = useState<number | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const isAdmin = session ? rolePermissions.canManageAdmin(session.role) : false;
  const firstName = session?.fullName.trim().split(/\s+/)[0] || 'Usuario';

  const summaryQuery = useQuery({
    queryKey: ['dashboard', 'summary', session?.organizationId],
    queryFn: async () => {
      const [recent, pendingReview, approved, rejected, queued, processing, failed] = await Promise.all([
        documentsService.getPaged({ page: 1, pageSize: 50 }),
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
        allFetchedDocuments: recent.items,
        recentDocuments: recent.items.slice(0, 5),
      };
    },
  });

  const auditQuery = useQuery({
    queryKey: ['dashboard', 'recent-audit', session?.organizationId],
    queryFn: () => auditService.getPaged({ page: 1, pageSize: 5 }),
    enabled: isAdmin,
  });

  const stats = summaryQuery.data;

  const filteredByPeriod = useMemo(() => {
    const docs = stats?.allFetchedDocuments ?? [];
    if (periodDays === 0) return docs;
    const cutoff = Date.now() - periodDays * 24 * 60 * 60 * 1000;
    return docs.filter((d) => new Date(d.createdAt).getTime() >= cutoff);
  }, [stats?.allFetchedDocuments, periodDays]);

  const approvalRate = useMemo(() => {
    if (!stats || stats.totalDocuments === 0) return '0%';
    const decided = stats.approvedCount + stats.rejectedCount;
    const base = decided > 0 ? decided : stats.totalDocuments;
    return `${((stats.approvedCount / base) * 100).toFixed(1)}%`;
  }, [stats]);

  const dailySeries = useMemo(
    () => buildDailySeries(filteredByPeriod, periodDays === 7 ? 7 : 30),
    [filteredByPeriod, periodDays],
  );

  const typeDistribution = useMemo(() => {
    const counts = new Map<DocumentType, number>();
    for (const doc of filteredByPeriod) {
      counts.set(doc.documentType, (counts.get(doc.documentType) ?? 0) + 1);
    }
    const total = filteredByPeriod.length;
    const entries = Array.from(counts.entries())
      .map(([type, count]) => ({
        type,
        count,
        pct: total > 0 ? Math.round((count / total) * 100) : 0,
        meta: typeColors[type] ?? typeColors[DocumentType.Other],
      }))
      .sort((a, b) => b.count - a.count);

    return { total, entries };
  }, [filteredByPeriod]);

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

  const kpiCards = [
    {
      label: 'Documentos totales',
      value: stats?.totalDocuments ?? 0,
      sublabel: `${stats?.approvedCount ?? 0} aprobados`,
      icon: FileText,
      iconBg: 'bg-sky-50 text-brand-600',
    },
    {
      label: 'Tasa de aprobación',
      value: approvalRate,
      sublabel: `${stats?.rejectedCount ?? 0} rechazados`,
      icon: CheckCircle2,
      iconBg: 'bg-emerald-50 text-emerald-600',
    },
    {
      label: 'En procesamiento',
      value: stats?.inPipelineCount ?? 0,
      sublabel: stats && stats.failedCount > 0 ? `${stats.failedCount} con error` : 'Cola de extracción IA',
      icon: Clock,
      iconBg: 'bg-violet-50 text-violet-600',
    },
    {
      label: 'Requieren revisión',
      value: stats?.pendingReviewCount ?? 0,
      sublabel: 'Validación humana',
      icon: AlertTriangle,
      iconBg: 'bg-amber-50 text-amber-600',
    },
  ];

  // SVG chart geometry
  const chartWidth = 420;
  const chartHeight = 150;
  const padX = 24;
  const padY = 18;
  const maxVal = Math.max(1, ...dailySeries.map((d) => d.count));
  const chartPoints = dailySeries.map((point, index) => {
    const x =
      dailySeries.length === 1
        ? chartWidth / 2
        : padX + (index / (dailySeries.length - 1)) * (chartWidth - padX * 2);
    const y = chartHeight - padY - (point.count / maxVal) * (chartHeight - padY * 2);
    return { ...point, x, y };
  });

  const linePath = chartPoints
    .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');
  const firstPoint = chartPoints[0];
  const lastPoint = chartPoints[chartPoints.length - 1];
  const areaPath =
    firstPoint && lastPoint
      ? `${linePath} L ${lastPoint.x.toFixed(1)} ${chartHeight - padY} L ${firstPoint.x.toFixed(1)} ${chartHeight - padY} Z`
      : '';

  // Donut chart geometry
  const donutRadius = 46;
  const donutCircumference = 2 * Math.PI * donutRadius;

  return (
    <div className="space-y-6">
      {/* Greeting & Period Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xs font-semibold uppercase tracking-wider text-brand-600">Dashboard</h1>
          <p className="mt-1 text-2xl font-bold tracking-tight text-slate-900">¡Hola, {firstName}!</p>
          <p className="mt-0.5 text-sm text-slate-500">
            Aquí tienes un resumen del estado de{' '}
            <span className="font-medium text-slate-700">{session?.organizationSlug}</span>.
          </p>
        </div>

        <div className="inline-flex w-full items-center justify-between gap-1.5 rounded-xl border border-slate-200 bg-white p-1 shadow-sm sm:w-auto sm:justify-start">
          <div className="flex items-center gap-1.5">
            <Calendar className="ml-2 h-4 w-4 text-slate-400" aria-hidden="true" />
            <span className="text-xs text-slate-500 sm:hidden">Período:</span>
          </div>
          <select
            aria-label="Rango de tiempo"
            value={periodDays}
            onChange={(e) => setPeriodDays(Number(e.target.value) as PeriodOption)}
            className="rounded-lg bg-transparent py-1 pr-2 text-xs font-medium text-slate-700 focus:outline-none"
          >
            <option value={7}>Últimos 7 días</option>
            <option value={30}>Últimos 30 días</option>
            <option value={0}>Todo el historial</option>
          </select>
        </div>
      </div>

      {summaryQuery.isError ? (
        <Alert tone="error" title="No se pudieron cargar las métricas">
          {getApiErrorMessage(summaryQuery.error)}
        </Alert>
      ) : null}

      {downloadError ? <Alert tone="error">{downloadError}</Alert> : null}

      {/* 4 KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpiCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.label}>
              <CardContent className="flex items-center gap-4">
                <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${card.iconBg}`}>
                  <Icon className="h-6 w-6" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="text-2xl font-bold tracking-tight text-slate-900">
                    {summaryQuery.isLoading ? '—' : card.value}
                  </p>
                  <p className="truncate text-xs font-medium text-slate-500">{card.label}</p>
                  <p className="mt-0.5 truncate text-[11px] text-slate-400">{card.sublabel}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Middle Row: Activity Chart + Document Type Donut + AI Highlight Card */}
      <div className="grid gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-12">
        {/* Actividad Reciente */}
        <Card className="md:col-span-1 lg:col-span-5">
          <CardHeader
            title="Actividad Reciente"
            action={
              <Link
                to="/documents"
                className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700"
              >
                Ver todo <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            }
          />
          <CardContent>
            <div className="mb-2 flex items-center gap-2 text-xs text-slate-500">
              <BarChart3 className="h-3.5 w-3.5 text-brand-600" aria-hidden="true" />
              <span>Documentos ingresados por día (últimos 7 días)</span>
            </div>

            <div className="relative">
              <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="h-44 w-full overflow-visible">
                <defs>
                  <linearGradient id="docuflowAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2554e8" stopOpacity="0.22" />
                    <stop offset="100%" stopColor="#2554e8" stopOpacity="0.01" />
                  </linearGradient>
                </defs>

                {[0.25, 0.5, 0.75, 1].map((ratio) => {
                  const y = chartHeight - padY - ratio * (chartHeight - padY * 2);
                  return (
                    <line
                      key={ratio}
                      x1={padX}
                      y1={y}
                      x2={chartWidth - padX}
                      y2={y}
                      stroke="#e2e8f0"
                      strokeDasharray="3 3"
                    />
                  );
                })}

                {areaPath ? <path d={areaPath} fill="url(#docuflowAreaGrad)" /> : null}
                {linePath ? (
                  <path
                    d={linePath}
                    fill="none"
                    stroke="#2554e8"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ) : null}

                {chartPoints.map((point, index) => (
                  <g
                    key={point.key}
                    onMouseEnter={() => setHoveredPoint(index)}
                    onMouseLeave={() => setHoveredPoint(null)}
                    className="cursor-pointer"
                  >
                    <circle
                      cx={point.x}
                      cy={point.y}
                      r={hoveredPoint === index ? 5.5 : 3.5}
                      fill="#ffffff"
                      stroke="#2554e8"
                      strokeWidth="2.5"
                    />
                    <text
                      x={point.x}
                      y={chartHeight - 2}
                      textAnchor="middle"
                      className="fill-slate-400 text-[10px]"
                    >
                      {point.label}
                    </text>
                  </g>
                ))}
              </svg>

              {hoveredPoint !== null && chartPoints[hoveredPoint] ? (
                <div className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-2.5 py-1 text-[11px] font-medium text-white">
                  <span>{chartPoints[hoveredPoint].label}:</span>
                  <strong>{chartPoints[hoveredPoint].count} documentos</strong>
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>

        {/* Por Tipo de Documento */}
        <Card className="md:col-span-1 lg:col-span-4">
          <CardHeader
            title="Por Tipo de Documento"
            action={
              <Link
                to="/documents"
                className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700"
              >
                Ver detalles <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            }
          />
          <CardContent>
            {typeDistribution.total === 0 ? (
              <p className="py-10 text-center text-xs text-slate-500">
                Sin documentos en el rango seleccionado.
              </p>
            ) : (
              <div className="flex flex-col items-center gap-5 sm:flex-row">
                <div className="relative flex h-32 w-32 shrink-0 items-center justify-center">
                  <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
                    <circle
                      cx="60"
                      cy="60"
                      r={donutRadius}
                      fill="none"
                      stroke="#f1f5f9"
                      strokeWidth="16"
                    />
                    {(() => {
                      let accumulated = 0;
                      return typeDistribution.entries.map((entry) => {
                        const segment = (entry.count / typeDistribution.total) * donutCircumference;
                        const offset = -accumulated;
                        accumulated += segment;
                        return (
                          <circle
                            key={entry.type}
                            cx="60"
                            cy="60"
                            r={donutRadius}
                            fill="none"
                            stroke={entry.meta.stroke}
                            strokeWidth="16"
                            strokeDasharray={`${segment} ${donutCircumference - segment}`}
                            strokeDashoffset={offset}
                          />
                        );
                      });
                    })()}
                  </svg>
                  <div className="absolute text-center">
                    <p className="text-lg font-bold text-slate-900">{typeDistribution.total}</p>
                    <p className="text-[10px] font-medium text-slate-400">Total</p>
                  </div>
                </div>

                <ul className="w-full space-y-2 text-xs">
                  {typeDistribution.entries.map((entry) => (
                    <li key={entry.type} className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 text-slate-600">
                        <span className={`h-2.5 w-2.5 rounded-full ${entry.meta.dot}`} aria-hidden="true" />
                        <span className="truncate">{entry.meta.label}</span>
                      </span>
                      <span className="font-semibold text-slate-900">{entry.pct}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        {/* AI Highlight Card */}
        <section className="relative flex flex-col justify-between overflow-hidden rounded-2xl bg-gradient-to-br from-brand-600 via-indigo-600 to-violet-600 p-5 text-white shadow-sm sm:p-6 md:col-span-2 lg:col-span-3">
          <div
            className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/10 blur-xl"
            aria-hidden="true"
          />
          <div className="relative">
            <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25">
              <Cpu className="h-6 w-6 text-white" aria-hidden="true" />
            </div>
            <h2 className="text-base font-bold leading-snug">
              Extracción Inteligente con IA
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-blue-100">
              Azure Document Intelligence extrae campos clave, preserva niveles de confianza y marca datos sensibles para revisión humana.
            </p>
          </div>

          <div className="relative mt-5">
            <Link
              to="/documents"
              className="inline-flex items-center gap-1.5 rounded-xl bg-white/20 px-4 py-2 text-xs font-semibold text-white backdrop-blur transition-colors hover:bg-white/30"
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              Gestionar documentos
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
        </section>
      </div>

      {/* Bottom Row: Recent Documents + System Activity */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Documentos Recientes"
            description="Últimos documentos registrados en la organización actual"
            action={
              <Link
                to="/documents"
                className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700"
              >
                Ver todos <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
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
                  <thead className="bg-slate-50/70 text-left text-xs font-semibold text-slate-500">
                    <tr>
                      <th className="px-4 py-3 sm:px-5">Documento</th>
                      <th className="hidden px-4 py-3 sm:table-cell">Tipo</th>
                      <th className="px-3 py-3 sm:px-4">Estado</th>
                      <th className="hidden px-4 py-3 md:table-cell">Fecha</th>
                      <th className="px-4 py-3 text-right sm:px-5">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {stats.recentDocuments.map((doc) => {
                      const meta = typeColors[doc.documentType] ?? typeColors[DocumentType.Other];
                      return (
                        <tr key={doc.id} className="transition-colors hover:bg-slate-50/80">
                          <td className="max-w-[180px] px-4 py-3 sm:max-w-none sm:px-5">
                            <Link
                              to={`/documents/${doc.id}`}
                              className="flex items-center gap-2.5 font-medium text-slate-900 hover:text-brand-600 sm:gap-3"
                            >
                              <span
                                className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold ${meta.badge}`}
                              >
                                <FileText className="h-4 w-4" aria-hidden="true" />
                              </span>
                              <div className="min-w-0">
                                <p className="truncate">{doc.title}</p>
                                <p className="mt-0.5 truncate text-[11px] font-normal text-slate-400 md:hidden">
                                  <span className="sm:hidden">{documentTypeLabels[doc.documentType]} · </span>
                                  {formatDateTime(doc.createdAt)}
                                </p>
                              </div>
                            </Link>
                          </td>
                          <td className="hidden px-4 py-3 text-xs text-slate-600 sm:table-cell">
                            {documentTypeLabels[doc.documentType]}
                          </td>
                          <td className="px-3 py-3 sm:px-4">
                            <DocumentStatusBadge status={doc.status} />
                          </td>
                          <td className="hidden px-4 py-3 text-xs text-slate-500 md:table-cell">
                            {formatDateTime(doc.createdAt)}
                          </td>
                          <td className="px-4 py-3 text-right sm:px-5">
                            <div className="inline-flex items-center gap-1">
                              <Link
                                to={`/documents/${doc.id}`}
                                title="Ver detalle"
                                aria-label={`Ver ${doc.title}`}
                                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-brand-600"
                              >
                                <Eye className="h-4 w-4" aria-hidden="true" />
                              </Link>
                              <button
                                type="button"
                                onClick={() => handleDownload(doc.id)}
                                title="Descargar"
                                aria-label={`Descargar ${doc.title}`}
                                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-brand-600"
                              >
                                <Download className="h-4 w-4" aria-hidden="true" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Actividad del Sistema */}
        <Card>
          <CardHeader
            title="Actividad del Sistema"
            description="Eventos recientes de auditoría"
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
              <div className="flex items-start gap-3 rounded-xl bg-slate-50 p-3.5 text-xs text-slate-600">
                <Zap className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />
                <p>
                  La consulta de registros de auditoría requiere rol de <strong>Administrador</strong> o{' '}
                  <strong>Propietario</strong>.
                </p>
              </div>
            ) : auditQuery.isLoading ? (
              <p className="text-sm text-slate-500">Cargando actividad...</p>
            ) : auditQuery.isError ? (
              <Alert tone="error">{getApiErrorMessage(auditQuery.error)}</Alert>
            ) : !auditQuery.data || auditQuery.data.items.length === 0 ? (
              <p className="text-xs text-slate-500">No hay eventos registrados aún.</p>
            ) : (
              <ul className="relative space-y-4 before:absolute before:bottom-2 before:left-[11px] before:top-2 before:w-px before:bg-slate-200">
                {auditQuery.data.items.map((item, idx) => (
                  <li key={item.id} className="relative flex items-start gap-3 pl-7">
                    <span
                      className={`absolute left-1.5 top-1 h-3 w-3 rounded-full ring-4 ring-white ${
                        idx === 0
                          ? 'bg-emerald-500'
                          : idx === 1
                            ? 'bg-brand-500'
                            : 'bg-violet-500'
                      }`}
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-slate-800">{item.action}</p>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        {item.entityType} · {formatDateTime(item.occurredAt)}
                      </p>
                    </div>
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
