type ControlsProps = {
  currentTheme: string;
  lang?: string;
};

const UiPatchControls = ({ currentTheme, lang }: ControlsProps) => {
  const ko = lang === 'ko';
  return (
    <section class="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div>
        <h2 class="text-xl font-semibold tracking-tight text-slate-900">
          {ko ? 'UI Patch 데모' : 'UI Patch Demo'}
        </h2>
        <p class="mt-1 text-sm text-slate-600">
          {ko
            ? 'classAdd/classRemove/cssVars로 h-state 엘리먼트의 외형을 바꿉니다 — UI 패치 자체는 템플릿을 다시 렌더링하지 않습니다.'
            : 'Change the appearance of h-state elements with classAdd, classRemove and cssVars. A UI patch itself does not re-render the template.'}
        </p>
      </div>

      {/* Theme buttons: full frame with ui */}
      <div class="space-y-2">
        <h3 class="text-sm font-semibold text-slate-700">
          {ko ? '테마 변경 (Full Frame + UI)' : 'Theme Switch (Full Frame + UI)'}
        </h3>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            data-action="ui-patch-demo"
            data-params={JSON.stringify({ action: 'theme', theme: 'warning', lang })}
            class={`rounded-md px-4 py-2 text-sm font-medium transition ${currentTheme === 'warning' ? 'bg-amber-500 text-white' : 'border border-amber-300 text-amber-700 hover:bg-amber-50'}`}
          >
            Warning
          </button>
          <button
            type="button"
            data-action="ui-patch-demo"
            data-params={JSON.stringify({ action: 'theme', theme: 'success', lang })}
            class={`rounded-md px-4 py-2 text-sm font-medium transition ${currentTheme === 'success' ? 'bg-emerald-500 text-white' : 'border border-emerald-300 text-emerald-700 hover:bg-emerald-50'}`}
          >
            Success
          </button>
          <button
            type="button"
            data-action="ui-patch-demo"
            data-params={JSON.stringify({ action: 'theme', theme: 'info', lang })}
            class={`rounded-md px-4 py-2 text-sm font-medium transition ${currentTheme === 'info' ? 'bg-blue-500 text-white' : 'border border-blue-300 text-blue-700 hover:bg-blue-50'}`}
          >
            Info
          </button>
        </div>
      </div>

      {/* Style-only partial */}
      <div class="space-y-2">
        <h3 class="text-sm font-semibold text-slate-700">
          {ko ? '스타일만 Partial (UI 만)' : 'Style-Only Partial (UI Only)'}
        </h3>
        <p class="text-xs text-slate-500">
          {ko
            ? '먼저 full 프레임(모든 스트림의 첫 프레임: 카드를 다시 렌더하고 패치를 지움)을 보낸 뒤, 렌더링 없이 h-state 엘리먼트만 바꾸는 UI 전용 partial 프레임을 보냅니다.'
            : 'Starts with a full frame (every stream does: it renders the card again and clears its patch), then sends a UI-only partial frame that changes just the h-state element, without rendering.'}
        </p>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            data-action="ui-patch-demo"
            data-params={JSON.stringify({ action: 'style-only', theme: 'success', lang })}
            class="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            {ko ? '스타일만 적용' : 'Style-Only Apply'}
          </button>
        </div>
      </div>

      {/* Clear UI */}
      <div class="space-y-2">
        <h3 class="text-sm font-semibold text-slate-700">{ko ? 'UI 초기화' : 'Clear UI'}</h3>
        <p class="text-xs text-slate-500">
          {ko
            ? 'UI 패치를 초기화하여 기본 외형으로 복원합니다.'
            : 'Resets all UI patches, restoring the default appearance.'}
        </p>
        <button
          type="button"
          data-action="ui-patch-demo"
          data-params={JSON.stringify({ action: 'clear', lang })}
          class="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50"
        >
          {ko ? '기본값 초기화' : 'Reset to Default'}
        </button>
      </div>
    </section>
  );
};

export default UiPatchControls;
