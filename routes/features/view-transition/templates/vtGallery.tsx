import { defineTemplate } from '../../../../shared/templateRegistry.js';

type Card = {
  id: string;
  title: string;
  description: string;
  color: string;
  detail: string;
};

type GalleryProps = {
  mode: 'grid' | 'detail';
  cards: Card[];
  selected?: Card;
  backLabel?: string;
  lang?: string;
};

const colorMap: Record<string, string> = {
  indigo: 'bg-indigo-500',
  emerald: 'bg-emerald-500',
  amber: 'bg-amber-500',
};

const colorMapLight: Record<string, string> = {
  indigo: 'bg-indigo-50 border-indigo-200',
  emerald: 'bg-emerald-50 border-emerald-200',
  amber: 'bg-amber-50 border-amber-200',
};

const colorMapText: Record<string, string> = {
  indigo: 'text-indigo-900',
  emerald: 'text-emerald-900',
  amber: 'text-amber-900',
};

const VTGallery = ({ mode, cards, selected, backLabel }: GalleryProps) => {
  if (mode === 'detail' && selected) {
    return (
      <section class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div
          style={{ viewTransitionName: `card-${selected.id}` }}
          class={`mb-6 flex h-48 items-center justify-center rounded-xl ${colorMap[selected.color] ?? 'bg-slate-500'}`}
        >
          <span class="text-4xl font-bold text-white">{selected.title}</span>
        </div>
        <h3
          style={{ viewTransitionName: `card-title-${selected.id}` }}
          class="text-2xl font-bold text-slate-900"
        >
          {selected.title}
        </h3>
        <p class="mt-2 text-sm text-slate-600">{selected.description}</p>
        <div class={`mt-4 rounded-lg border p-4 ${colorMapLight[selected.color] ?? ''}`}>
          <p class={`text-sm ${colorMapText[selected.color] ?? 'text-slate-700'}`}>
            {selected.detail}
          </p>
        </div>
        <button
          type="button"
          data-action="vt-demo"
          data-params='{"back":true}'
          class="mt-6 rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          {backLabel ?? 'Back to Gallery'}
        </button>
      </section>
    );
  }

  return (
    <section class="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {cards.map(card => (
        <button
          type="button"
          data-action="vt-demo"
          data-params={JSON.stringify({ card: card.id })}
          class="group cursor-pointer rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:shadow-md"
        >
          <div
            style={{ viewTransitionName: `card-${card.id}` }}
            class={`mb-3 flex h-28 items-center justify-center rounded-xl ${colorMap[card.color] ?? 'bg-slate-500'} transition group-hover:scale-[1.02]`}
          >
            <span class="text-2xl font-bold text-white">{card.title}</span>
          </div>
          <h3
            style={{ viewTransitionName: `card-title-${card.id}` }}
            class="font-semibold text-slate-900"
          >
            {card.title}
          </h3>
          <p class="mt-1 text-xs text-slate-500">{card.description}</p>
        </button>
      ))}
    </section>
  );
};

export default defineTemplate('vt:gallery', VTGallery);
