import { defineTemplate } from '../../../../shared/templateRegistry.js';

type PlaygroundProps = {
  lastAction: string | null;
  lastParams: Record<string, unknown> | null;
  processing?: boolean;
  result?: string;
};

const ActionsPlayground = ({ lastAction, result, processing }: PlaygroundProps) => (
  <section class="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
    <div>
      <h2 class="text-xl font-semibold tracking-tight text-slate-900">Actions Playground</h2>
      <p class="mt-1 text-sm text-slate-600">
        Try different action types below. Each triggers a server transition via declarative
        data-action attributes.
      </p>
    </div>

    {/* Button action */}
    <div class="space-y-2">
      <h3 class="text-sm font-semibold text-slate-700">Button Action (data-action + data-params)</h3>
      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          data-action="action-demo"
          data-params='{"type":"button","variant":"primary"}'
          class="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
        >
          Primary Button
        </button>
        <button
          type="button"
          data-action="action-demo"
          data-params='{"type":"button","variant":"secondary"}'
          class="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
        >
          Secondary Button
        </button>
      </div>
    </div>

    {/* Form action */}
    <div class="space-y-2">
      <h3 class="text-sm font-semibold text-slate-700">Form Action (data-action on form)</h3>
      <form
        data-action="action-demo"
        class="flex gap-2"
      >
        <input type="hidden" name="type" value="form" />
        <input
          name="message"
          type="text"
          placeholder="Type a message..."
          class="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm transition focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
        />
        <button
          type="submit"
          class="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-700"
        >
          Submit Form
        </button>
      </form>
    </div>

    {/* Scoped pending action */}
    <div class="space-y-2">
      <h3 class="text-sm font-semibold text-slate-700">
        Scoped Pending (data-pending-targets)
      </h3>
      <p class="text-xs text-slate-500">
        This button marks only the log section as pending, not the playground.
      </p>
      <button
        type="button"
        data-action="action-demo"
        data-params='{"type":"scoped"}'
        data-pending-targets="actions:log"
        class="rounded-md border border-amber-400 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 transition hover:bg-amber-100"
      >
        Scoped Pending Action
      </button>
    </div>

    {/* Result display */}
    {(lastAction || processing || result) && (
      <div class="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Result</p>
        {processing ? (
          <p class="mt-1 text-sm text-slate-500">Processing...</p>
        ) : (
          <p class="mt-1 text-sm text-slate-700">{result}</p>
        )}
      </div>
    )}
  </section>
);

export default defineTemplate('actions:playground', ActionsPlayground);
