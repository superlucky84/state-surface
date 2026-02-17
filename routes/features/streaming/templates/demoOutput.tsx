import { defineTemplate } from '../../../../shared/templateRegistry.js';

type OutputProps = {
  activeKeys: string[];
  detail?: string;
};

const DemoOutput = ({ activeKeys, detail }: OutputProps) => (
  <section class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
    <h3 class="mb-4 text-lg font-semibold text-slate-900">Current Output</h3>
    <div class="space-y-3">
      <div>
        <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Active Slots</p>
        <div class="mt-1 flex flex-wrap gap-2">
          {activeKeys.length === 0 ? (
            <span class="text-sm text-slate-400">None</span>
          ) : (
            activeKeys.map(k => (
              <span
                key={k}
                class="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-mono text-slate-700"
              >
                {k}
              </span>
            ))
          )}
        </div>
      </div>
      {detail && (
        <div>
          <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Detail</p>
          <p class="mt-1 text-sm text-slate-600">{detail}</p>
        </div>
      )}
    </div>
  </section>
);

export default defineTemplate('demo:output', DemoOutput);
