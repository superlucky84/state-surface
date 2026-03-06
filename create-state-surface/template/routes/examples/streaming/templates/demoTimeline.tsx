import { defineTemplate } from 'state-surface';

type FrameEntry = {
  type: string;
  label: string;
  ts: number;
};

type TimelineProps = {
  frames: FrameEntry[];
};

function typeColor(type: string): string {
  if (type === 'full') return 'bg-sky-100 text-sky-800 border-sky-200';
  if (type === 'partial-changed') return 'bg-amber-100 text-amber-800 border-amber-200';
  if (type === 'partial-removed') return 'bg-red-100 text-red-800 border-red-200';
  if (type === 'accumulate') return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  return 'bg-slate-100 text-slate-800 border-slate-200';
}

function typeBadge(type: string): string {
  if (type === 'full') return 'FULL';
  if (type === 'partial-changed') return 'PARTIAL+CHANGED';
  if (type === 'partial-removed') return 'PARTIAL+REMOVED';
  if (type === 'accumulate') return 'ACCUMULATE';
  return type.toUpperCase();
}

const DemoTimeline = ({ frames }: TimelineProps) => (
  <section class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
    <h3 class="mb-4 text-lg font-semibold text-slate-900">Frame Timeline</h3>
    {frames.length === 0 ? (
      <p class="text-sm text-slate-500">No frames received yet. Click a button above to start.</p>
    ) : (
      <ol class="space-y-3">
        {frames.map((f, i) => (
          <li key={i} class="flex items-start gap-3">
            <span
              class={`mt-0.5 shrink-0 rounded border px-2 py-0.5 text-xs font-semibold ${typeColor(f.type)}`}
            >
              {typeBadge(f.type)}
            </span>
            <span class="text-sm text-slate-700">{f.label}</span>
          </li>
        ))}
      </ol>
    )}
  </section>
);

export default defineTemplate('demo:timeline', DemoTimeline);
