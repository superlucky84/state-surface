import { defineTemplate } from '../../../shared/templateRegistry.js';

type TocProps = {
  slug: string;
  items: string[];
};

const GuideToc = ({ slug, items }: TocProps) => (
  <nav class="sticky top-6 space-y-1">
    <p class="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Guides</p>
    {items.map(item => (
      <a
        key={item}
        href={`/guide/${item}`}
        class={
          item === slug
            ? 'block rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white'
            : 'block rounded-md px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900'
        }
      >
        {item.charAt(0).toUpperCase() + item.slice(1)}
      </a>
    ))}
  </nav>
);

export default defineTemplate('guide:toc', GuideToc);
