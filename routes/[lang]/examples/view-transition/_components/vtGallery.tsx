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
  indigo: 'bg-linear-to-br from-indigo-500 to-violet-600',
  emerald: 'bg-linear-to-br from-emerald-400 to-teal-600',
  amber: 'bg-linear-to-br from-amber-400 to-orange-500',
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

const VTGallery = ({ mode, cards, selected, backLabel, lang }: GalleryProps) => {
  if (mode === 'detail' && selected) {
    return (
      <section class="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <div
          style={{ viewTransitionName: `card-${selected.id}` }}
          class={`mb-6 flex h-56 items-center justify-center rounded-2xl shadow-inner ${colorMap[selected.color] ?? 'bg-slate-500'}`}
        >
          <span class="text-4xl font-bold tracking-tight text-white drop-shadow-sm">
            {selected.title}
          </span>
        </div>
        <h3
          style={{ viewTransitionName: `card-title-${selected.id}` }}
          class="text-2xl font-bold tracking-tight text-slate-950"
        >
          {selected.title}
        </h3>
        <p class="mt-2 text-sm leading-6 text-slate-600">{selected.description}</p>
        <div class={`mt-4 rounded-xl border p-4 ${colorMapLight[selected.color] ?? ''}`}>
          <p class={`text-sm leading-6 ${colorMapText[selected.color] ?? 'text-slate-700'}`}>
            {selected.detail}
          </p>
        </div>
        <button
          type="button"
          data-action="vt-demo"
          data-params={JSON.stringify({ back: true, lang })}
          class="mt-6 inline-flex items-center rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-300 transition ring-inset hover:bg-slate-50"
        >
          {backLabel ?? 'Back to Gallery'}
        </button>
      </section>
    );
  }

  return (
    <section class="grid grid-cols-1 gap-5 sm:grid-cols-3">
      {cards.map(card => (
        <button
          type="button"
          data-action="vt-demo"
          data-params={JSON.stringify({ card: card.id, lang })}
          class="group cursor-pointer rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-xs transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-900/5"
        >
          <div
            style={{ viewTransitionName: `card-${card.id}` }}
            class={`mb-4 flex h-32 items-center justify-center rounded-xl ${colorMap[card.color] ?? 'bg-slate-500'} transition group-hover:scale-[1.02]`}
          >
            <span class="text-2xl font-bold tracking-tight text-white drop-shadow-sm">
              {card.title}
            </span>
          </div>
          <h3
            style={{ viewTransitionName: `card-title-${card.id}` }}
            class="font-semibold text-slate-950"
          >
            {card.title}
          </h3>
          <p class="mt-1 text-sm leading-6 text-slate-500">{card.description}</p>
        </button>
      ))}
    </section>
  );
};

export default VTGallery;
