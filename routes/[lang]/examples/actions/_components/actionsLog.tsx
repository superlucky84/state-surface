type LogEntry = {
  id: number;
  action: string;
  params: string;
  status: string;
  ts: number;
};

type LogProps = {
  entries: LogEntry[];
  lang?: string;
};

function statusBadge(status: string): string {
  if (status === 'done') return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
  if (status === 'processing') return 'bg-amber-50 text-amber-700 ring-amber-200';
  return 'bg-slate-50 text-slate-700 ring-slate-200';
}

const ActionsLog = ({ entries, lang }: LogProps) => {
  const ko = lang === 'ko';
  return (
    <section class="h-full rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
      <h3 class="mb-4 text-base font-semibold text-slate-950">{ko ? '액션 로그' : 'Action Log'}</h3>
      {entries.length === 0 ? (
        <p class="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm leading-6 text-slate-500">
          {ko
            ? '아직 트리거된 액션이 없습니다. 위의 버튼을 사용해보세요.'
            : 'No actions triggered yet. Try the buttons above.'}
        </p>
      ) : (
        <ul class="space-y-2">
          {entries.map(e => (
            <li
              key={e.id}
              class="flex items-start gap-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100 ring-inset"
            >
              <span
                class={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 font-mono text-[0.6875rem] font-semibold ring-1 ring-inset ${statusBadge(e.status)}`}
              >
                {e.status.toUpperCase()}
              </span>
              <div class="min-w-0">
                <p class="text-sm font-medium text-slate-700">
                  {ko ? '액션' : 'Action'}: {e.action}
                </p>
                <p class="mt-0.5 truncate font-mono text-xs text-slate-500">{e.params}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default ActionsLog;
