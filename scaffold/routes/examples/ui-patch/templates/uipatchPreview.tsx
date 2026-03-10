import { defineTemplate } from 'state-surface';

type PreviewProps = {
  theme: string;
  updating?: boolean;
  lang?: string;
};

const UiPatchPreview = ({ theme, updating, lang }: PreviewProps) => {
  const ko = lang === 'ko';
  return (
    <section
      class="rounded-2xl border p-6 shadow-sm transition-all duration-300"
      style="background-color: var(--card-bg, #f8fafc); border-color: var(--card-accent, #e2e8f0);"
    >
      <div class="flex items-center gap-3">
        <div
          class="h-4 w-4 rounded-full transition-colors duration-300"
          style="background-color: var(--card-accent, #64748b);"
        />
        <h3 class="text-lg font-semibold" style="color: var(--card-accent, #64748b);">
          {ko ? '???????????? ?????????' : 'Preview Card'}
        </h3>
        {updating && (
          <span class="text-xs text-slate-400">{ko ? '???????????? ???...' : 'Updating...'}</span>
        )}
      </div>

      <p class="mt-3 text-sm text-slate-600">
        {ko
          ? `?????? ?????????: "${theme}". h-state ??????????????? CSS ????????? ????????? ????????? ??? ??????????????? ????????? ???????????????.`
          : `Current theme: "${theme}". CSS variables on the h-state element control the accent color and background.`}
      </p>

      <div class="mt-4 flex gap-2">
        <div
          class="h-2 flex-1 rounded-full transition-colors duration-300"
          style="background-color: var(--card-accent, #64748b);"
        />
        <div
          class="h-2 w-16 rounded-full opacity-50 transition-colors duration-300"
          style="background-color: var(--card-accent, #64748b);"
        />
      </div>
    </section>
  );
};

export default defineTemplate('uipatch:preview', UiPatchPreview);
