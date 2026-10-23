type ControlsProps = {
  currentTheme: string;
  lang?: string;
};

const UiPatchControls = ({ currentTheme, lang }: ControlsProps) => {
  const ko = lang === 'ko';
  return (
    <section class="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
      <div>
        <h2 class="text-lg font-semibold tracking-tight text-slate-950">
          {ko ? 'UI Patch 데모' : 'UI Patch Demo'}
        </h2>
        <p class="mt-1 text-sm leading-6 text-slate-600">
          {ko
            ? 'classAdd/classRemove/cssVars로 h-state 엘리먼트의 외형을 바꿉니다 — UI 패치 자체는 템플릿을 다시 렌더링하지 않습니다.'
            : 'Change the appearance of h-state elements with classAdd, classRemove and cssVars. A UI patch itself does not re-render the template.'}
        </p>
      </div>

      {/* Theme buttons: full frame with ui */}
      <div class="space-y-2 border-t border-slate-100 pt-5">
        <h3 class="text-sm font-semibold text-slate-800">
          {ko ? '테마 변경 (Full Frame + UI)' : 'Theme Switch (Full Frame + UI)'}
        </h3>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            data-action="ui-patch-demo"
            data-params={JSON.stringify({ action: 'theme', theme: 'warning', lang })}
            class={`rounded-full px-4 py-2 text-sm font-semibold transition ${currentTheme === 'warning' ? 'bg-amber-500 text-white shadow-sm shadow-amber-500/30' : 'bg-white text-amber-700 ring-1 ring-amber-300 ring-inset hover:bg-amber-50'}`}
          >
            Warning
          </button>
          <button
            type="button"
            data-action="ui-patch-demo"
            data-params={JSON.stringify({ action: 'theme', theme: 'success', lang })}
            class={`rounded-full px-4 py-2 text-sm font-semibold transition ${currentTheme === 'success' ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/30' : 'bg-white text-emerald-700 ring-1 ring-emerald-300 ring-inset hover:bg-emerald-50'}`}
          >
            Success
          </button>
          <button
            type="button"
            data-action="ui-patch-demo"
            data-params={JSON.stringify({ action: 'theme', theme: 'info', lang })}
            class={`rounded-full px-4 py-2 text-sm font-semibold transition ${currentTheme === 'info' ? 'bg-blue-500 text-white shadow-sm shadow-blue-500/30' : 'bg-white text-blue-700 ring-1 ring-blue-300 ring-inset hover:bg-blue-50'}`}
          >
            Info
          </button>
        </div>
      </div>

      {/* Style-only partial */}
      <div class="space-y-2 border-t border-slate-100 pt-5">
        <h3 class="text-sm font-semibold text-slate-800">
          {ko ? '스타일만 Partial (UI 만)' : 'Style-Only Partial (UI Only)'}
        </h3>
        <p class="text-xs leading-5 text-slate-500">
          {ko
            ? '먼저 full 프레임(모든 스트림의 첫 프레임: 카드를 다시 렌더하고 패치를 지움)을 보낸 뒤, 렌더링 없이 h-state 엘리먼트만 바꾸는 UI 전용 partial 프레임을 보냅니다.'
            : 'Starts with a full frame (every stream does: it renders the card again and clears its patch), then sends a UI-only partial frame that changes just the h-state element, without rendering.'}
        </p>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            data-action="ui-patch-demo"
            data-params={JSON.stringify({ action: 'style-only', theme: 'success', lang })}
            class="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-300 transition ring-inset hover:bg-slate-50"
          >
            {ko ? '스타일만 적용' : 'Style-Only Apply'}
          </button>
        </div>
      </div>

      {/* Clear UI */}
      <div class="space-y-2 border-t border-slate-100 pt-5">
        <h3 class="text-sm font-semibold text-slate-800">{ko ? 'UI 초기화' : 'Clear UI'}</h3>
        <p class="text-xs leading-5 text-slate-500">
          {ko
            ? 'UI 패치를 초기화하여 기본 외형으로 복원합니다.'
            : 'Resets all UI patches, restoring the default appearance.'}
        </p>
        <button
          type="button"
          data-action="ui-patch-demo"
          data-params={JSON.stringify({ action: 'clear', lang })}
          class="rounded-full bg-white px-4 py-2 text-sm font-semibold text-rose-700 ring-1 ring-rose-300 transition ring-inset hover:bg-rose-50"
        >
          {ko ? '기본값 초기화' : 'Reset to Default'}
        </button>
      </div>
    </section>
  );
};

export default UiPatchControls;
