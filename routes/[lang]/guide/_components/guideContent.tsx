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
    <div class="overflow-hidden rounded-lg border border-slate-700/50 bg-slate-900">
      <div class="flex items-center justify-between gap-2 border-b border-slate-800 px-4 py-2">
        <div class="flex items-center gap-2">
          {lang && (
            <span class="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-xs text-slate-400">
              {lang}
            </span>
          )}
        </div>
        {/* Copied by the guide-toc plugin (client/plugins/guideToc.ts). */}
        <button
          type="button"
          data-copy-code
          class="rounded px-2 py-0.5 text-xs text-slate-500 transition hover:bg-slate-800 hover:text-slate-200"
        >
          Copy
        </button>
      </div>
      <div class="overflow-x-auto">
        <pre class="code-with-lines p-4 font-mono text-[0.6875rem] leading-snug">
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
      <section id={id} class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 class="mb-3 text-base font-semibold text-slate-900">{heading}</h3>
        <div class="space-y-3">{children}</div>
      </section>
    ),
    paragraph: ({ children }) => <p class="text-sm leading-7 text-slate-600">{children}</p>,
    bullets: ({ items }) => (
      <ul class="space-y-1.5 text-sm text-slate-600">
        {items.map(item => (
          <li class="flex gap-2">
            <span class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
            {listItem(item)}
          </li>
        ))}
      </ul>
    ),
    code: ({ lang: code, label, text, collapsible }) =>
      collapsible ? (
        <div class="space-y-1.5">
          <details class="code-collapsible group">
            <summary class="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm font-semibold text-slate-500 transition select-none hover:bg-slate-100">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform group-open:rotate-90"
                viewBox="0 0 16 16"
                fill="currentColor"
              >
                <path d="M6 3l5 5-5 5V3z" />
              </svg>
              {label}
            </summary>
            <div class="code-collapsible-body">
              <CodeLines lang={code} text={text} />
            </div>
          </details>
        </div>
      ) : (
        <div class="space-y-1.5">
          {label && <p class="text-sm font-semibold text-emerald-600">{label}</p>}
          <CodeLines lang={code} text={text} />
        </div>
      ),
    checklist: ({ items }) => (
      <ul class="space-y-1.5 text-sm text-slate-600">
        {items.map(item => (
          <li class="flex gap-2">
            <span class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border border-slate-300 bg-white text-slate-400">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-3 w-3"
                viewBox="0 0 12 12"
                fill="none"
              >
                <path
                  d="M2 6l3 3 5-5"
                  stroke="currentColor"
                  stroke-width="1.5"
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
      <div class="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
        <span class="mt-0.5 shrink-0 text-amber-500">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-4 w-4"
            viewBox="0 0 16 16"
            fill="currentColor"
          >
            <path d="M8 1.5a.5.5 0 0 1 .447.276l6 11A.5.5 0 0 1 14 13.5H2a.5.5 0 0 1-.447-.724l6-11A.5.5 0 0 1 8 1.5zM8 5a.5.5 0 0 0-.5.5v3a.5.5 0 0 0 1 0v-3A.5.5 0 0 0 8 5zm0 6a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5z" />
          </svg>
        </span>
        <div class={`${prose.block} text-sm leading-6 text-amber-800`}>{children}</div>
      </div>
    ),
    sequence: ({ steps }) => (
      <ol class="space-y-2 text-sm text-slate-600">
        {steps.map((step, i) => (
          <li class="flex gap-3">
            <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 font-mono text-xs font-semibold text-white">
              {String(i + 1)}
            </span>
            <span class="leading-6">{step}</span>
          </li>
        ))}
      </ol>
    ),
    diagram: ({ label, text }) => (
      <div class="overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
        {label && (
          <div class="border-b border-slate-200 px-4 py-2">
            <span class="text-xs font-medium text-slate-500">{label}</span>
          </div>
        )}
        <div class="overflow-x-auto">
          <pre class="whitespace-pre p-4 font-mono text-[0.6875rem] leading-relaxed text-slate-700">
            {text}
          </pre>
        </div>
      </div>
    ),
    callout: ({ kind, children }) => {
      const styles = {
        tip: ['border-emerald-200 bg-emerald-50', 'text-emerald-500', 'text-emerald-800', 'Tip'],
        info: ['border-blue-200 bg-blue-50', 'text-blue-500', 'text-blue-800', 'Info'],
        note: ['border-violet-200 bg-violet-50', 'text-violet-500', 'text-violet-800', 'Note'],
      }[kind];
      return (
        <div class={`flex gap-3 rounded-lg border px-4 py-3 ${styles[0]}`}>
          <span class={`mt-0.5 shrink-0 font-bold text-xs leading-5 ${styles[1]}`}>
            {styles[3]}
          </span>
          <div class={`${prose.block} text-sm leading-6 ${styles[2]}`}>{children}</div>
        </div>
      );
    },
    analogy: ({ children }) => (
      <div class="flex gap-3 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3">
        <span class="mt-0.5 shrink-0 text-indigo-400">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-4 w-4"
            viewBox="0 0 16 16"
            fill="currentColor"
          >
            <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 12.5a5.5 5.5 0 1 1 0-11 5.5 5.5 0 0 1 0 11zM7.25 5.75a.75.75 0 1 1 1.5 0 .75.75 0 0 1-1.5 0zm-.25 2a.75.75 0 0 1 .75-.75h.5a.75.75 0 0 1 .75.75v2.5a.75.75 0 0 1-1.5 0v-1.75H7a.75.75 0 0 1-.75-.75z" />
          </svg>
        </span>
        <div class={`${prose.block} text-sm italic leading-6 text-indigo-800`}>{children}</div>
      </div>
    ),
    debug: ({ items }) => (
      <div class="space-y-3">
        {items.map(item => (
          <div class="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div class="flex items-start gap-3 border-b border-slate-100 bg-red-50 px-4 py-2.5">
              <span class="mt-0.5 shrink-0 rounded bg-red-100 px-1.5 py-0.5 text-xs font-semibold text-red-600">
                {symptom}
              </span>
              <p class="text-sm leading-6 text-red-800">{item.symptom}</p>
            </div>
            <div class="flex items-start gap-3 border-b border-slate-100 px-4 py-2.5">
              <span class="mt-0.5 shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-700">
                {cause}
              </span>
              <p class="text-sm leading-6 text-slate-600">{item.cause}</p>
            </div>
            <div class="flex items-start gap-3 px-4 py-2.5">
              <span class="mt-0.5 shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-semibold text-emerald-700">
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
