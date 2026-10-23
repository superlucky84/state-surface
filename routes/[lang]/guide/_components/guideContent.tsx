import { highlightLines, type BlockComponents, type Nodes } from 'state-surface/content';
import prose from './guideProse.module.css';

/**
 * Styled renderers of the 10 guide blocks for `entry.Content({ components })` (DC-25 ③).
 * Text arrives as rendered Markdown nodes; code is highlighted on the server with line
 * numbers, so the page needs no highlighter script.
 */

const CodeLines = ({ lang, text }: { lang?: string; text: string }) => {
  const lines = highlightLines(text, lang);
  const pad = String(lines.length).length;
  return (
    <div
      data-code-block
      class="overflow-hidden rounded-xl bg-slate-950 shadow-lg ring-1 shadow-slate-900/10 ring-slate-900/10"
    >
      <div class="flex items-center justify-between gap-2 border-b border-white/5 bg-white/[0.03] px-4 py-2">
        <div class="flex items-center gap-3">
          <span aria-hidden="true" class="flex gap-1.5">
            <span class="h-2.5 w-2.5 rounded-full bg-slate-700" />
            <span class="h-2.5 w-2.5 rounded-full bg-slate-700" />
            <span class="h-2.5 w-2.5 rounded-full bg-slate-700" />
          </span>
          {lang && <span class="font-mono text-xs text-slate-400">{lang}</span>}
        </div>
        {/* Copied by the guide-toc plugin (client/plugins/guideToc.ts). */}
        <button
          type="button"
          data-copy-code
          class="rounded-md px-2 py-0.5 text-xs font-medium text-slate-400 transition hover:bg-white/10 hover:text-white"
        >
          Copy
        </button>
      </div>
      <div class="overflow-x-auto">
        <pre class="code-with-lines px-4 py-4 font-mono text-[0.8125rem] leading-6">
          {/* Lithent SSR prints undefined attributes: spread them only when set. */}
          <code {...(lang ? { class: `language-${lang}` } : {})}>
            {lines.map((line, index) => [
              index ? '\n' : null,
              <span class="code-ln">{String(index + 1).padStart(pad)}</span>,
              ...line,
            ])}
          </code>
        </pre>
      </div>
    </div>
  );
};

const listItem = (children: Nodes) => <span class="leading-7">{children}</span>;

const DEBUG_LABELS: Record<string, [string, string, string]> = {
  ko: ['증상', '원인', '해결'],
  en: ['Symptom', 'Cause', 'Fix'],
};

export function guideComponents(lang: string): Partial<BlockComponents> {
  const [symptom, cause, fix] = DEBUG_LABELS[lang] ?? DEBUG_LABELS.en;
  return {
    section: ({ id, heading, children }) => (
      <section id={id} class="scroll-mt-24">
        <h2 class="text-xl font-semibold tracking-tight break-keep text-slate-950 sm:text-2xl">
          {heading}
        </h2>
        <div class="mt-4 space-y-5">{children}</div>
      </section>
    ),
    paragraph: ({ children }) => (
      <p class="text-[0.9375rem] leading-7 text-slate-600">{children}</p>
    ),
    bullets: ({ items }) => (
      <ul class="space-y-2 text-[0.9375rem] text-slate-600">
        {items.map(item => (
          <li class="flex gap-3">
            <span class="mt-[0.7rem] h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400" />
            {listItem(item)}
          </li>
        ))}
      </ul>
    ),
    code: ({ lang: code, label, text, collapsible }) =>
      collapsible ? (
        <details class="code-collapsible group rounded-xl border border-slate-200 bg-slate-50/60">
          <summary class="flex cursor-pointer items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-slate-700 transition select-none hover:bg-slate-100/80">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform group-open:rotate-90"
              viewBox="0 0 16 16"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M6 3l5 5-5 5V3z" />
            </svg>
            {label}
          </summary>
          <div class="code-collapsible-body">
            <div class="px-3 pb-3">
              <CodeLines lang={code} text={text} />
            </div>
          </div>
        </details>
      ) : (
        <div class="space-y-2">
          {label && (
            <p class="flex items-start gap-2 text-sm font-semibold text-slate-800">
              <span
                aria-hidden="true"
                class="mt-[0.1875rem] h-3.5 w-1 shrink-0 rounded-full bg-indigo-500"
              />
              <span class="min-w-0">{label}</span>
            </p>
          )}
          <CodeLines lang={code} text={text} />
        </div>
      ),
    checklist: ({ items }) => (
      <ul class="space-y-2.5 text-[0.9375rem] text-slate-600">
        {items.map(item => (
          <li class="flex gap-3">
            <span class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-3 w-3"
                viewBox="0 0 12 12"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M2 6l3 3 5-5"
                  stroke="currentColor"
                  stroke-width="1.75"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </span>
            <span class="leading-6">{item}</span>
          </li>
        ))}
      </ul>
    ),
    warning: ({ children }) => (
      <div class="flex gap-3 rounded-r-xl border-l-4 border-amber-400 bg-amber-50/80 px-4 py-3.5">
        <span class="mt-0.5 shrink-0 text-amber-500">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-4 w-4"
            viewBox="0 0 16 16"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M8 1.5a.5.5 0 0 1 .447.276l6 11A.5.5 0 0 1 14 13.5H2a.5.5 0 0 1-.447-.724l6-11A.5.5 0 0 1 8 1.5zM8 5a.5.5 0 0 0-.5.5v3a.5.5 0 0 0 1 0v-3A.5.5 0 0 0 8 5zm0 6a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5z" />
          </svg>
        </span>
        <div class={`${prose.block} text-sm leading-6 text-amber-900`}>{children}</div>
      </div>
    ),
    sequence: ({ steps }) => (
      <ol class="relative space-y-4 text-[0.9375rem] text-slate-600">
        {steps.map((step, i) => (
          <li class="relative flex gap-4">
            {i < steps.length - 1 && (
              <span
                aria-hidden="true"
                class="absolute top-8 bottom-[-0.75rem] left-[0.8125rem] w-px bg-indigo-100"
              />
            )}
            <span class="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-600 font-mono text-xs font-semibold text-white shadow-sm shadow-indigo-600/30">
              {String(i + 1)}
            </span>
            <span class="pt-0.5 leading-6">{step}</span>
          </li>
        ))}
      </ol>
    ),
    diagram: ({ label, text }) => (
      <div class="overflow-hidden rounded-xl border border-slate-200 bg-slate-50/70">
        {label && (
          <div class="border-b border-slate-200 bg-white/60 px-4 py-2">
            <span class="text-xs font-semibold text-slate-500">{label}</span>
          </div>
        )}
        <div class="overflow-x-auto">
          <pre class="p-4 font-mono text-xs leading-relaxed whitespace-pre text-slate-700">
            {text}
          </pre>
        </div>
      </div>
    ),
    callout: ({ kind, children }) => {
      const styles = {
        tip: ['border-emerald-400 bg-emerald-50/80', 'text-emerald-700', 'text-emerald-900', 'Tip'],
        info: ['border-sky-400 bg-sky-50/80', 'text-sky-700', 'text-sky-950', 'Info'],
        note: ['border-violet-400 bg-violet-50/80', 'text-violet-700', 'text-violet-950', 'Note'],
      }[kind];
      return (
        <div class={`rounded-r-xl border-l-4 px-4 py-3.5 ${styles[0]}`}>
          <p class={`text-xs font-bold tracking-wider uppercase ${styles[1]}`}>{styles[3]}</p>
          <div class={`${prose.block} mt-1 text-sm leading-6 ${styles[2]}`}>{children}</div>
        </div>
      );
    },
    analogy: ({ children }) => (
      <div class="flex gap-3 rounded-xl bg-linear-to-br from-indigo-50 to-violet-50 px-4 py-3.5 ring-1 ring-indigo-100">
        <span class="mt-0.5 shrink-0 text-indigo-400">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-4 w-4"
            viewBox="0 0 16 16"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 12.5a5.5 5.5 0 1 1 0-11 5.5 5.5 0 0 1 0 11zM7.25 5.75a.75.75 0 1 1 1.5 0 .75.75 0 0 1-1.5 0zm-.25 2a.75.75 0 0 1 .75-.75h.5a.75.75 0 0 1 .75.75v2.5a.75.75 0 0 1-1.5 0v-1.75H7a.75.75 0 0 1-.75-.75z" />
          </svg>
        </span>
        <div class={`${prose.block} text-sm leading-6 text-indigo-950 italic`}>{children}</div>
      </div>
    ),
    debug: ({ items }) => (
      <div class="space-y-3">
        {items.map(item => (
          <div class="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
            <div class="flex items-start gap-3 border-b border-slate-100 bg-rose-50/70 px-4 py-3">
              <span class="mt-0.5 shrink-0 rounded-md bg-rose-100 px-1.5 py-0.5 text-xs font-semibold text-rose-700">
                {symptom}
              </span>
              <p class="text-sm leading-6 text-rose-900">{item.symptom}</p>
            </div>
            <div class="flex items-start gap-3 border-b border-slate-100 px-4 py-3">
              <span class="mt-0.5 shrink-0 rounded-md bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-700">
                {cause}
              </span>
              <p class="text-sm leading-6 text-slate-600">{item.cause}</p>
            </div>
            <div class="flex items-start gap-3 px-4 py-3">
              <span class="mt-0.5 shrink-0 rounded-md bg-emerald-100 px-1.5 py-0.5 text-xs font-semibold text-emerald-700">
                {fix}
              </span>
              <div class={`${prose.block} text-sm leading-6 text-slate-600`}>{item.fix}</div>
            </div>
          </div>
        ))}
      </div>
    ),
  };
}
