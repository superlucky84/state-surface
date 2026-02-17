import { defineTemplate } from '../../../../shared/templateRegistry.js';

type ControlsProps = {
  description: string;
  runLabel?: string;
  errorLabel?: string;
};

const DemoControls = ({ description, runLabel, errorLabel }: ControlsProps) => (
  <section class="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
    <h2 class="text-xl font-semibold tracking-tight text-slate-900">Streaming Frame Demo</h2>
    <p class="text-sm leading-6 text-slate-600">{description}</p>
    <div class="flex flex-wrap gap-3">
      <button
        type="button"
        data-action="stream-demo"
        data-params='{"mode":"full-sequence"}'
        class="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
      >
        {runLabel ?? 'Run Full Sequence'}
      </button>
      <button
        type="button"
        data-action="stream-demo"
        data-params='{"mode":"error-demo"}'
        class="rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50"
      >
        {errorLabel ?? 'Trigger Error Frame'}
      </button>
    </div>
  </section>
);

export default defineTemplate('demo:controls', DemoControls);
