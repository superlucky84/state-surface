type ControlsProps = {
  description: string;
  runLabel?: string;
  errorLabel?: string;
  /** Sent with the actions: the transition answers in the page language. */
  lang?: string;
};

const DemoControls = ({ description, runLabel, errorLabel, lang }: ControlsProps) => (
  <section class="flex h-full flex-col gap-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs md:flex-row md:items-center md:justify-between">
    <div class="max-w-2xl">
      <h2 class="text-lg font-semibold tracking-tight text-slate-950">Streaming Frame Demo</h2>
      <p class="mt-1 text-sm leading-6 text-slate-600">{description}</p>
    </div>
    <div class="flex shrink-0 flex-wrap gap-3">
      <button
        type="button"
        data-action="stream-demo"
        data-params={JSON.stringify({ mode: 'full-sequence', lang })}
        class="inline-flex items-center justify-center rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-indigo-600/25 transition hover:bg-indigo-500"
      >
        {runLabel ?? 'Run Full Sequence'}
      </button>
      <button
        type="button"
        data-action="stream-demo"
        data-params={JSON.stringify({ mode: 'error-demo', lang })}
        class="inline-flex items-center justify-center rounded-full bg-white px-4 py-2 text-sm font-semibold text-rose-700 ring-1 ring-rose-200 transition ring-inset hover:bg-rose-50"
      >
        {errorLabel ?? 'Trigger Error Frame'}
      </button>
    </div>
  </section>
);

export default DemoControls;
