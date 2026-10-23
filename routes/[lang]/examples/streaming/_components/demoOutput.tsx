type OutputProps = {
  activeKeys: string[];
  detail?: string;
};

const DemoOutput = ({ activeKeys, detail }: OutputProps) => (
  <section class="h-full rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
    <h3 class="mb-5 text-base font-semibold text-slate-950">Current Output</h3>
    <div class="space-y-5">
      <div>
        <p class="text-xs font-semibold tracking-wider text-slate-500 uppercase">Active Slots</p>
        <div class="mt-2 flex flex-wrap gap-2">
          {activeKeys.length === 0 ? (
            <span class="text-sm text-slate-400">None</span>
          ) : (
            activeKeys.map(k => (
              <span
                key={k}
                class="inline-flex items-center gap-1.5 rounded-lg bg-slate-950 px-2.5 py-1 font-mono text-xs text-slate-100"
              >
                <span aria-hidden="true" class="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                {k}
              </span>
            ))
          )}
        </div>
      </div>
      {detail && (
        <div class="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200/70 ring-inset">
          <p class="text-xs font-semibold tracking-wider text-slate-500 uppercase">Detail</p>
          <p class="mt-1 text-sm leading-6 text-slate-700">{detail}</p>
        </div>
      )}
    </div>
  </section>
);

export default DemoOutput;
