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
    <section class="h-full space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
      <div>
        <h2 class="text-lg font-semibold tracking-tight text-slate-950">
          {ko ? '액션 플레이그라운드' : 'Actions Playground'}
        </h2>
        <p class="mt-1 text-sm leading-6 text-slate-600">
          {ko
            ? '아래에서 다양한 액션 유형을 시도하세요. 각각 선언적 data-action 속성을 통해 서버 transition을 트리거합니다.'
            : 'Try different action types below. Each triggers a server transition via declarative data-action attributes.'}
        </p>
      </div>

      {/* Button action */}
      <div class="space-y-2.5 border-t border-slate-100 pt-5">
        <h3 class="text-sm font-semibold text-slate-800">
          {ko
            ? '버튼 액션 (data-action + data-params)'
            : 'Button Action (data-action + data-params)'}
        </h3>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            data-action="action-demo"
            data-params={JSON.stringify({ type: 'button', variant: 'primary', lang })}
            class="rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-indigo-600/25 transition hover:bg-indigo-500"
          >
            {ko ? '기본 버튼' : 'Primary Button'}
          </button>
          <button
            type="button"
            data-action="action-demo"
            data-params={JSON.stringify({ type: 'button', variant: 'secondary', lang })}
            class="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-300 transition ring-inset hover:bg-slate-50"
          >
            {ko ? '보조 버튼' : 'Secondary Button'}
          </button>
        </div>
      </div>

      {/* Form action */}
      <div class="space-y-2.5 border-t border-slate-100 pt-5">
        <h3 class="text-sm font-semibold text-slate-800">
          {ko ? '폼 액션 (form의 data-action)' : 'Form Action (data-action on form)'}
        </h3>
        <form data-action="action-demo" class="flex gap-2">
          <input type="hidden" name="type" value="form" />
          <input type="hidden" name="lang" value={lang ?? 'en'} />
          <input
            name="message"
            type="text"
            placeholder={ko ? '메시지를 입력하세요...' : 'Type a message...'}
            class="min-w-0 flex-1 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm shadow-xs outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/15"
          />
          <button
            type="submit"
            class="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            {ko ? '폼 제출' : 'Submit Form'}
          </button>
        </form>
      </div>

      {/* Scoped pending action */}
      <div class="space-y-2.5 border-t border-slate-100 pt-5">
        <h3 class="text-sm font-semibold text-slate-800">
          {ko ? '스코프드 Pending (data-pending-targets)' : 'Scoped Pending (data-pending-targets)'}
        </h3>
        <p class="text-xs leading-5 text-slate-500">
          {ko
            ? '이 버튼은 플레이그라운드가 아닌 로그 섹션만 pending으로 표시합니다.'
            : 'This button marks only the log section as pending, not the playground.'}
        </p>
        <button
          type="button"
          data-action="action-demo"
          data-params={JSON.stringify({ type: 'scoped', lang })}
          data-pending-targets="actions:log"
          class="rounded-full bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800 ring-1 ring-amber-300 transition ring-inset hover:bg-amber-100"
        >
          {ko ? '스코프드 Pending 액션' : 'Scoped Pending Action'}
        </button>
      </div>

      {/* Result display */}
      {(lastAction || processing || result) && (
        <div class="rounded-xl bg-indigo-50/60 p-4 ring-1 ring-indigo-100 ring-inset">
          <p class="text-xs font-semibold tracking-wider text-indigo-600 uppercase">
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

export default ActionsPlayground;
