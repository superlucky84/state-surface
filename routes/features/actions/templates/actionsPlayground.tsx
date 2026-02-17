import { defineTemplate } from '../../../../shared/templateRegistry.js';

type PlaygroundProps = {
  lastAction: string | null;
  lastParams: Record<string, unknown> | null;
  processing?: boolean;
  result?: string;
  lang?: string;
};

const ActionsPlayground = ({ lastAction, result, processing, lang }: PlaygroundProps) => {
  const ko = lang === 'ko';
  return (
    <section class="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div>
        <h2 class="text-xl font-semibold tracking-tight text-slate-900">
          {ko ? '액션 플레이그라운드' : 'Actions Playground'}
        </h2>
        <p class="mt-1 text-sm text-slate-600">
          {ko
            ? '아래에서 다양한 액션 유형을 시도하세요. 각각 선언적 data-action 속성을 통해 서버 transition을 트리거합니다.'
            : 'Try different action types below. Each triggers a server transition via declarative data-action attributes.'}
        </p>
      </div>

      {/* Button action */}
      <div class="space-y-2">
        <h3 class="text-sm font-semibold text-slate-700">
          {ko ? '버튼 액션 (data-action + data-params)' : 'Button Action (data-action + data-params)'}
        </h3>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            data-action="action-demo"
            data-params='{"type":"button","variant":"primary"}'
            class="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
          >
            {ko ? '기본 버튼' : 'Primary Button'}
          </button>
          <button
            type="button"
            data-action="action-demo"
            data-params='{"type":"button","variant":"secondary"}'
            class="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
          >
            {ko ? '보조 버튼' : 'Secondary Button'}
          </button>
        </div>
      </div>

      {/* Form action */}
      <div class="space-y-2">
        <h3 class="text-sm font-semibold text-slate-700">
          {ko ? '폼 액션 (form의 data-action)' : 'Form Action (data-action on form)'}
        </h3>
        <form data-action="action-demo" class="flex gap-2">
          <input type="hidden" name="type" value="form" />
          <input
            name="message"
            type="text"
            placeholder={ko ? '메시지를 입력하세요...' : 'Type a message...'}
            class="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm transition focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
          <button
            type="submit"
            class="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-700"
          >
            {ko ? '폼 제출' : 'Submit Form'}
          </button>
        </form>
      </div>

      {/* Scoped pending action */}
      <div class="space-y-2">
        <h3 class="text-sm font-semibold text-slate-700">
          {ko ? '스코프드 Pending (data-pending-targets)' : 'Scoped Pending (data-pending-targets)'}
        </h3>
        <p class="text-xs text-slate-500">
          {ko
            ? '이 버튼은 플레이그라운드가 아닌 로그 섹션만 pending으로 표시합니다.'
            : 'This button marks only the log section as pending, not the playground.'}
        </p>
        <button
          type="button"
          data-action="action-demo"
          data-params='{"type":"scoped"}'
          data-pending-targets="actions:log"
          class="rounded-md border border-amber-400 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 transition hover:bg-amber-100"
        >
          {ko ? '스코프드 Pending 액션' : 'Scoped Pending Action'}
        </button>
      </div>

      {/* Result display */}
      {(lastAction || processing || result) && (
        <div class="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {ko ? '결과' : 'Result'}
          </p>
          {processing ? (
            <p class="mt-1 text-sm text-slate-500">{ko ? '처리 중...' : 'Processing...'}</p>
          ) : (
            <p class="mt-1 text-sm text-slate-700">{result}</p>
          )}
        </div>
      )}
    </section>
  );
};

export default defineTemplate('actions:playground', ActionsPlayground);
