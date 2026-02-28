import { defineTemplate } from 'state-surface';

type Concept = {
  key: string;
  title: string;
  description: string;
  href: string;
};

type ConceptsProps = {
  concepts: Concept[];
};

const Concepts = ({ concepts }: ConceptsProps) => (
  <section class="space-y-4">
    <h3 class="text-xl font-semibold tracking-tight text-slate-900">Core Concepts</h3>
    <div class="grid gap-4 sm:grid-cols-2">
      {concepts.map(c => (
        <a
          key={c.key}
          href={c.href}
          class="group block rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow"
        >
          <p class="text-xs font-semibold uppercase tracking-wide text-sky-600">{c.title}</p>
          <p class="mt-2 text-sm leading-6 text-slate-600">{c.description}</p>
        </a>
      ))}
    </div>
  </section>
);

export default defineTemplate('page:concepts', Concepts);
