import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, FileText, ScanLine, ShieldCheck, Sparkles, Upload } from 'lucide-react';
import { usePrefersReducedMotion } from '@/lib/usePrefersReducedMotion';

const STEPS = [
  { label: 'Carga segura', detail: 'Blob privado cifrado', icon: Upload },
  { label: 'Lectura IA', detail: 'Análisis multimodal', icon: ScanLine },
  { label: 'Extracción', detail: 'Datos estructurados', icon: Sparkles },
  { label: 'Validación', detail: 'Revisión humana', icon: ShieldCheck },
] as const;

const FIELDS = [
  { label: 'Tipo de documento', value: 'Contrato de servicios' },
  { label: 'Emisor', value: 'Grupo Andino S.A.' },
  { label: 'Fecha', value: '15 nov 2026' },
  { label: 'Vigencia', value: '12 meses' },
] as const;

const PHASES = 8;
const PHASE_MS = 1400;

/**
 * Decorative, interactive left panel for the login screen.
 * - Pointer-reactive spotlight + 3D tilt (rAF-throttled, GPU transforms only).
 * - Looping simulated pipeline: upload → AI read → extraction → validation.
 * Purely visual: renders no real tenant data.
 */
export function LoginShowcase() {
  const reduced = usePrefersReducedMotion();
  const [tick, setTick] = useState(0);
  const panelRef = useRef<HTMLElement>(null);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (reduced) return;
    const id = window.setInterval(() => setTick((t) => (t + 1) % PHASES), PHASE_MS);
    return () => window.clearInterval(id);
  }, [reduced]);

  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    },
    [],
  );

  const phase = reduced ? PHASES - 1 : tick;
  const activeStep = Math.min(STEPS.length - 1, Math.floor(phase / 2));
  const revealed = phase < 4 ? 0 : Math.min(FIELDS.length, phase - 3);
  const confidence = revealed === 0 ? null : 90 + revealed * 2;
  const isScanning = activeStep <= 1;

  const handlePointerMove = (event: React.PointerEvent<HTMLElement>) => {
    if (reduced) return;
    const el = panelRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;

    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      el.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`);
      el.style.setProperty('--my', `${(y * 100).toFixed(1)}%`);
      el.style.setProperty('--rx', `${((x - 0.5) * 12).toFixed(2)}deg`);
      el.style.setProperty('--ry', `${((0.5 - y) * 10).toFixed(2)}deg`);
    });
  };

  const handlePointerLeave = () => {
    const el = panelRef.current;
    if (!el) return;
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--ry', '0deg');
  };

  return (
    <aside
      ref={panelRef}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      className="relative hidden flex-col justify-between overflow-hidden bg-[#0B1730] p-10 text-white lg:col-span-5 lg:flex"
    >
      {/* Technical grid */}
      <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.06]" aria-hidden="true">
        <defs>
          <pattern id="login-grid" width="32" height="32" patternUnits="userSpaceOnUse">
            <path d="M 32 0 L 0 0 0 32" fill="none" stroke="white" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#login-grid)" />
      </svg>

      {/* Pointer-following spotlight */}
      <div
        className="pointer-events-none absolute inset-0 transition-opacity duration-500"
        style={{
          background:
            'radial-gradient(520px circle at var(--mx, 60%) var(--my, 40%), rgba(56, 189, 248, 0.16), transparent 45%)',
        }}
        aria-hidden="true"
      />

      {/* Ambient orbs */}
      <div
        className="animate-float-slow pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-brand-500/25 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="animate-float-delayed pointer-events-none absolute -bottom-28 -left-24 h-96 w-96 rounded-full bg-indigo-500/20 blur-3xl"
        aria-hidden="true"
      />

      {/* Brand */}
      <div className="relative flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-400 via-brand-500 to-indigo-600 shadow-lg shadow-brand-900/50">
          <svg viewBox="0 0 24 24" className="h-5 w-5 text-white" fill="none" aria-hidden="true">
            <path
              d="M5 4.5C5 3.67 5.67 3 6.5 3H13L19 9V19.5C19 20.33 18.33 21 17.5 21H6.5C5.67 21 5 20.33 5 19.5V4.5Z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <path d="M13 3V9H19" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
            <path d="M8.5 13.5L11 16L15.5 11.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div>
          <p className="text-lg font-bold tracking-tight">
            DocuFlow <span className="text-sky-400">AI</span>
          </p>
          <p className="text-xs text-slate-400">Procesa. Verifica. Confía.</p>
        </div>
      </div>

      {/* Hero + interactive pipeline */}
      <div className="relative my-8 space-y-7">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-sky-300 ring-1 ring-white/15">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-60 motion-reduce:hidden" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-sky-400" />
            </span>
            Pipeline documental en vivo
          </span>
          <h2 className="mt-4 text-2xl font-bold leading-snug tracking-tight xl:text-3xl">
            De documento a{' '}
            <span className="animate-gradient-x bg-gradient-to-r from-sky-300 via-white to-indigo-300 bg-[length:200%_auto] bg-clip-text text-transparent">
              datos verificables
            </span>{' '}
            en segundos.
          </h2>
        </div>

        {/* 3D tilting document card */}
        <div className="relative mx-auto w-full max-w-sm [perspective:1100px]">
          <div
            className="relative transition-transform duration-300 ease-out [transform-style:preserve-3d]"
            style={{ transform: 'rotateX(var(--ry, 0deg)) rotateY(var(--rx, 0deg))' }}
          >
            {/* Floating confidence chip (depth layer) */}
            <div className="absolute -right-4 -top-4 z-20" style={{ transform: 'translateZ(48px)' }}>
              <div
                className={`animate-float-slow flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-semibold shadow-xl backdrop-blur transition-colors duration-500 ${
                  confidence
                    ? 'border-emerald-400/40 bg-slate-900/90 text-emerald-300'
                    : 'border-sky-400/30 bg-slate-900/90 text-sky-300'
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${confidence ? 'bg-emerald-400' : 'animate-pulse bg-sky-400'}`}
                  aria-hidden="true"
                />
                {confidence ? `Confianza ${confidence}%` : 'Analizando…'}
              </div>
            </div>

            <div className="relative overflow-hidden rounded-2xl border border-white/15 bg-white/[0.07] p-5 shadow-2xl shadow-black/30 backdrop-blur-md">
              {isScanning ? (
                <div
                  className="animate-scan-beam pointer-events-none absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-sky-400/0 via-sky-400/30 to-sky-400/0"
                  aria-hidden="true"
                />
              ) : null}

              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/20 text-sky-300">
                    <FileText className="h-4 w-4" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-white">Contrato_Servicios.pdf</p>
                    <p className="text-[11px] text-slate-400">{STEPS[activeStep]?.detail}</p>
                  </div>
                </div>
                <span className="rounded-full bg-sky-400/15 px-2 py-0.5 text-[10px] font-semibold text-sky-300">
                  {Math.round(((activeStep + 1) / STEPS.length) * 100)}%
                </span>
              </div>

              {/* Progress */}
              <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-sky-400 to-indigo-400 transition-[width] duration-700 ease-out"
                  style={{ width: `${((activeStep + 1) / STEPS.length) * 100}%` }}
                />
              </div>

              {/* Skeleton document lines */}
              <div className="mt-4 space-y-2">
                <div className="h-2 w-3/4 rounded-full bg-white/20" />
                <div className="h-2 w-full rounded-full bg-white/10" />
                <div className="h-2 w-5/6 rounded-full bg-white/10" />
              </div>

              {/* Progressive extracted fields */}
              <dl className="mt-4 grid grid-cols-2 gap-2">
                {FIELDS.map((field, index) => {
                  const visible = index < revealed;
                  return (
                    <div
                      key={field.label}
                      className={`rounded-xl border p-2.5 transition-all duration-500 ease-out ${
                        visible
                          ? 'translate-y-0 border-sky-400/25 bg-sky-400/[0.08] opacity-100'
                          : 'translate-y-2 border-white/5 bg-white/[0.03] opacity-40'
                      }`}
                    >
                      <dt className="text-[10px] text-slate-400">{field.label}</dt>
                      <dd className="mt-0.5 truncate text-xs font-semibold text-white">
                        {visible ? field.value : '·····'}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </div>
          </div>
        </div>

        {/* Pipeline stepper */}
        <ol className="grid grid-cols-4 gap-2">
          {STEPS.map((step, index) => {
            const Icon = step.icon;
            const done = index < activeStep;
            const active = index === activeStep;
            return (
              <li key={step.label} className="flex flex-col items-center text-center">
                <span
                  className={`flex h-9 w-9 items-center justify-center rounded-xl border transition-all duration-500 ${
                    active
                      ? 'scale-110 border-sky-400/60 bg-sky-400/20 text-sky-200 shadow-lg shadow-sky-500/20'
                      : done
                        ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300'
                        : 'border-white/10 bg-white/5 text-slate-500'
                  }`}
                >
                  {done ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : <Icon className="h-4 w-4" aria-hidden="true" />}
                </span>
                <span
                  className={`mt-1.5 text-[11px] font-medium transition-colors duration-500 ${
                    active ? 'text-white' : done ? 'text-slate-300' : 'text-slate-500'
                  }`}
                >
                  {step.label}
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="relative flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-slate-400">
        <span className="inline-flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5 text-sky-400" aria-hidden="true" /> Aislamiento multi-tenant
        </span>
        <span className="inline-flex items-center gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" /> Auditoría completa
        </span>
      </div>
    </aside>
  );
}
