type FrameEntry = {
  type: string;
  label: string;
  ts: number;
};

type TimelineProps = {
  frames: FrameEntry[];
};

function typeColor(type: string): string {
  if (type === 'full') return 'bg-sky-50 text-sky-700 ring-sky-200';
  if (type === 'partial-changed') return 'bg-amber-50 text-amber-700 ring-amber-200';
  if (type === 'partial-removed') return 'bg-rose-50 text-rose-700 ring-rose-200';
  if (type === 'accumulate') return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
  return 'bg-slate-50 text-slate-700 ring-slate-200';
}

function dotColor(type: string): string {
  if (type === 'full') return 'bg-sky-500';
  if (type === 'partial-changed') return 'bg-amber-500';
  if (type === 'partial-removed') return 'bg-rose-500';
  if (type === 'accumulate') return 'bg-emerald-500';
  return 'bg-slate-400';
}

function typeBadge(type: string): string {
  if (type === 'full') return 'FULL';
  if (type === 'partial-changed') return 'PARTIAL+CHANGED';
  if (type === 'partial-removed') return 'PARTIAL+REMOVED';
  if (type === 'accumulate') return 'ACCUMULATE';
  return type.toUpperCase();
}

const DemoTimeline = ({ frames }: TimelineProps) => (
  <section class="h-full rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
    <h3 class="mb-5 text-base font-semibold text-slate-950">Frame Timeline</h3>
    {frames.length === 0 ? (
      <p class="rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
        No frames received yet. Click a button above to start.
      </p>
    ) : (
      <ol class="relative ml-1.5 space-y-4 border-l border-slate-200">
        {frames.map((f, i) => (
          <li key={i} class="relative flex flex-wrap items-start gap-x-3 gap-y-1 pl-5">
            <span
              aria-hidden="true"
              class={`absolute top-1.5 -left-[5px] h-2.5 w-2.5 rounded-full ring-4 ring-white ${dotColor(f.type)}`}
            />
            <span
              class={`shrink-0 rounded-full px-2 py-0.5 font-mono text-[0.6875rem] font-semibold ring-1 ring-inset ${typeColor(f.type)}`}
            >
              {typeBadge(f.type)}
            </span>
            <span class="min-w-0 text-sm leading-6 text-slate-700">{f.label}</span>
          </li>
        ))}
      </ol>
    )}
  </section>
);

export default DemoTimeline;
