import { defineTemplate, prefixPath } from 'state-surface';
import type { Block, DebugItem } from '../../../shared/content.js';

// ── Block renderers ──

const ParagraphBlock = ({ text }: { text: string }) => (
  <p class="text-sm leading-7 text-slate-600">{text}</p>
);

const BulletsBlock = ({ items }: { items: string[] }) => (
  <ul class="space-y-1.5 text-sm text-slate-600">
    {items.map((item, i) => (
      <li key={i} class="flex gap-2">
        <span class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
        <span class="leading-7">{item}</span>
      </li>
    ))}
  </ul>
);

const PRISM_LANG_MAP: Record<string, string> = {
  typescript: 'typescript',
  ts: 'typescript',
  tsx: 'tsx',
  html: 'markup',
  javascript: 'javascript',
  js: 'javascript',
};

const CodeBlock = ({ lang, label, text }: { lang?: string; label?: string; text: string }) => {
  const prismLang = lang ? PRISM_LANG_MAP[lang] || lang : '';
  const langClass = prismLang ? `language-${prismLang}` : '';
  return (
    <div class="overflow-hidden rounded-lg border border-slate-700/50 bg-slate-900">
      <div class="flex items-center justify-between gap-2 border-b border-slate-800 px-4 py-2">
        <div class="flex items-center gap-2">
          {lang && (
            <span class="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-xs text-slate-400">
              {lang}
            </span>
          )}
          {label && <span class="font-mono text-xs text-slate-500">{label}</span>}
        </div>
        <button
          type="button"
          class="rounded px-2 py-0.5 text-xs text-slate-500 transition hover:bg-slate-800 hover:text-slate-200"
          onclick={(e: MouseEvent) => {
            const btn = e.currentTarget as HTMLButtonElement;
            navigator.clipboard?.writeText(text);
            btn.textContent = 'Copied!';
            setTimeout(() => {
              btn.textContent = 'Copy';
            }, 1500);
          }}
        >
          Copy
        </button>
      </div>
      <div class="overflow-x-auto">
        <pre class="code-with-lines p-4 font-mono text-xs leading-snug"><code class={langClass}>{text}</code></pre>
      </div>
    </div>
  );
};

const ChecklistBlock = ({ items }: { items: string[] }) => (
  <ul class="space-y-1.5 text-sm text-slate-600">
    {items.map((item, i) => (
      <li key={i} class="flex gap-2">
        <span class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border border-slate-300 bg-white text-slate-400">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" viewBox="0 0 12 12" fill="none">
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
);

const WarningBlock = ({ text }: { text: string }) => (
  <div class="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
    <span class="mt-0.5 shrink-0 text-amber-500">
      <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 1.5a.5.5 0 0 1 .447.276l6 11A.5.5 0 0 1 14 13.5H2a.5.5 0 0 1-.447-.724l6-11A.5.5 0 0 1 8 1.5zM8 5a.5.5 0 0 0-.5.5v3a.5.5 0 0 0 1 0v-3A.5.5 0 0 0 8 5zm0 6a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5z" />
      </svg>
    </span>
    <p class="text-sm leading-6 text-amber-800">{text}</p>
  </div>
);

const SequenceBlock = ({ steps }: { steps: string[] }) => (
  <ol class="space-y-2 text-sm text-slate-600">
    {steps.map((step, i) => (
      <li key={i} class="flex gap-3">
        <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 font-mono text-xs font-semibold text-white">
          {i + 1}
        </span>
        <span class="leading-6">{step}</span>
      </li>
    ))}
  </ol>
);

const DiagramBlock = ({ text, label }: { text: string; label?: string }) => (
  <div class="overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
    {label && (
      <div class="border-b border-slate-200 px-4 py-2">
        <span class="text-xs font-medium text-slate-500">{label}</span>
      </div>
    )}
    <div class="overflow-x-auto">
      <pre class="whitespace-pre p-4 font-mono text-xs leading-relaxed text-slate-700">{text}</pre>
    </div>
  </div>
);

const CalloutBlock = ({ kind, text }: { kind: 'tip' | 'info' | 'note'; text: string }) => {
  const styles = {
    tip: {
      wrap: 'border-emerald-200 bg-emerald-50',
      icon: 'text-emerald-500',
      text: 'text-emerald-800',
      label: 'Tip',
    },
    info: {
      wrap: 'border-blue-200 bg-blue-50',
      icon: 'text-blue-500',
      text: 'text-blue-800',
      label: 'Info',
    },
    note: {
      wrap: 'border-violet-200 bg-violet-50',
      icon: 'text-violet-500',
      text: 'text-violet-800',
      label: 'Note',
    },
  };
  const s = styles[kind];
  return (
    <div class={`flex gap-3 rounded-lg border px-4 py-3 ${s.wrap}`}>
      <span class={`mt-0.5 shrink-0 font-bold text-xs leading-5 ${s.icon}`}>{s.label}</span>
      <p class={`text-sm leading-6 ${s.text}`}>{text}</p>
    </div>
  );
};

const AnalogyBlock = ({ text }: { text: string }) => (
  <div class="flex gap-3 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3">
    <span class="mt-0.5 shrink-0 text-indigo-400">
      <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 12.5a5.5 5.5 0 1 1 0-11 5.5 5.5 0 0 1 0 11zM7.25 5.75a.75.75 0 1 1 1.5 0 .75.75 0 0 1-1.5 0zm-.25 2a.75.75 0 0 1 .75-.75h.5a.75.75 0 0 1 .75.75v2.5a.75.75 0 0 1-1.5 0v-1.75H7a.75.75 0 0 1-.75-.75z" />
      </svg>
    </span>
    <p class="text-sm italic leading-6 text-indigo-800">{text}</p>
  </div>
);

const DebugBlock = ({ items }: { items: DebugItem[] }) => (
  <div class="space-y-3">
    {items.map((item, i) => (
      <div key={i} class="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div class="flex items-start gap-3 border-b border-slate-100 bg-red-50 px-4 py-2.5">
          <span class="mt-0.5 shrink-0 rounded bg-red-100 px-1.5 py-0.5 text-xs font-semibold text-red-600">
            증상
          </span>
          <p class="text-sm leading-6 text-red-800">{item.symptom}</p>
        </div>
        <div class="flex items-start gap-3 border-b border-slate-100 px-4 py-2.5">
          <span class="mt-0.5 shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-700">
            원인
          </span>
          <p class="text-sm leading-6 text-slate-600">{item.cause}</p>
        </div>
        <div class="flex items-start gap-3 px-4 py-2.5">
          <span class="mt-0.5 shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-semibold text-emerald-700">
            해결
          </span>
          <p class="text-sm leading-6 text-slate-600">{item.fix}</p>
        </div>
      </div>
    ))}
  </div>
);

function renderBlock(block: Block, idx: number) {
  switch (block.type) {
    case 'paragraph':
      return <ParagraphBlock key={idx} text={block.text} />;
    case 'bullets':
      return <BulletsBlock key={idx} items={block.items} />;
    case 'code':
      return <CodeBlock key={idx} lang={block.lang} label={block.label} text={block.text} />;
    case 'checklist':
      return <ChecklistBlock key={idx} items={block.items} />;
    case 'warning':
      return <WarningBlock key={idx} text={block.text} />;
    case 'sequence':
      return <SequenceBlock key={idx} steps={block.steps} />;
    case 'diagram':
      return <DiagramBlock key={idx} text={block.text} label={block.label} />;
    case 'callout':
      return <CalloutBlock key={idx} kind={block.kind} text={block.text} />;
    case 'analogy':
      return <AnalogyBlock key={idx} text={block.text} />;
    case 'debug':
      return <DebugBlock key={idx} items={block.items} />;
  }
}

// ── Section & props ──

type Section = {
  id: string;
  heading: string;
  blocks: Block[];
};

type GuideContentProps = {
  slug: string;
  loading?: boolean;
  title?: string;
  sections?: Section[];
  demoHref?: string;
  demoLabel?: string;
};

const CONCEPT_SLUGS = ['surface', 'template', 'transition', 'action'];

const GuideContent = ({ slug, loading, title, sections, demoHref, demoLabel }: GuideContentProps) => {
  if (loading) {
    return (
      <div class="space-y-6">
        {/* Title */}
        <div class="h-8 w-56 animate-pulse rounded bg-slate-200" />

        {/* Section 1: TL;DR style */}
        <div class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div class="mb-3 h-5 w-24 animate-pulse rounded bg-slate-200" />
          <div class="space-y-2">
            <div class="h-4 w-full animate-pulse rounded bg-slate-100" />
            <div class="h-4 w-5/6 animate-pulse rounded bg-slate-100" />
          </div>
        </div>

        {/* Section 2: Analogy style */}
        <div class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div class="mb-3 h-5 w-36 animate-pulse rounded bg-slate-200" />
          <div class="space-y-2">
            <div class="h-4 w-full animate-pulse rounded bg-slate-100" />
            <div class="h-4 w-4/5 animate-pulse rounded bg-slate-100" />
            <div class="h-4 w-full animate-pulse rounded bg-slate-100" />
          </div>
        </div>

        {/* Section 3: Code block style */}
        <div class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div class="mb-3 h-5 w-44 animate-pulse rounded bg-slate-200" />
          <div class="space-y-2">
            <div class="h-4 w-full animate-pulse rounded bg-slate-100" />
            <div class="h-32 w-full animate-pulse rounded-lg bg-slate-800/10" />
            <div class="h-4 w-3/4 animate-pulse rounded bg-slate-100" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <article class="space-y-6">
      <h2 class="text-2xl font-semibold tracking-tight text-slate-900">{title}</h2>

      {(sections ?? []).map(s => (
        <section key={s.id} id={s.id} class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 class="mb-3 text-base font-semibold text-slate-900">{s.heading}</h3>
          <div class="space-y-3">
            {(s.blocks ?? []).map((block, i) => renderBlock(block, i))}
          </div>
        </section>
      ))}

      <div class="flex flex-wrap items-center gap-3 pt-2">
        {demoHref && demoLabel && (
          <a
            href={demoHref}
            class="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
          >
            {demoLabel}
            <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 7h8M7 3l4 4-4 4" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </a>
        )}
        {CONCEPT_SLUGS.filter(s => s !== slug).map(s => (
          <a
            key={s}
            href={prefixPath(`/guide/${s}`)}
            class="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
          >
            {s.charAt(0).toUpperCase() + s.slice(1)} Guide
          </a>
        ))}
      </div>
    </article>
  );
};

export default defineTemplate('guide:content', GuideContent);
