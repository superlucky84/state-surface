import { defineTemplate } from 'state-surface';

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
  if (status === 'done') return 'bg-green-100 text-green-800 border-green-200';
  if (status === 'processing') return 'bg-amber-100 text-amber-800 border-amber-200';
  return 'bg-slate-100 text-slate-800 border-slate-200';
}

const ActionsLog = ({ entries, lang }: LogProps) => {
  const ko = lang === 'ko';
  return (
    <section class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 class="mb-4 text-lg font-semibold text-slate-900">
        {ko ? '액션 로그' : 'Action Log'}
      </h3>
      {entries.length === 0 ? (
        <p class="text-sm text-slate-500">
          {ko ? '아직 트리거된 액션이 없습니다. 위의 버튼을 사용해보세요.' : 'No actions triggered yet. Try the buttons above.'}
        </p>
      ) : (
        <ul class="space-y-3">
          {entries.map(e => (
            <li key={e.id} class="flex items-start gap-3 rounded-lg border border-slate-100 bg-slate-50 p-3">
              <span
                class={`mt-0.5 shrink-0 rounded border px-2 py-0.5 text-xs font-semibold ${statusBadge(e.status)}`}
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

export default defineTemplate('actions:log', ActionsLog);
