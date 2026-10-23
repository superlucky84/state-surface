import type { SurfaceContext } from 'state-surface/server';
import { getEntry } from 'state-surface/content';
import type { HeaderProps } from '../routes/_shared/components/pageHeader.js';
import { localPath, pageLang, type Lang } from './i18n.js';

/**
 * Page UI texts from `content/pages/<lang>/<page>.yaml` (DC-25 ⑥) and the slot props built
 * from them. Paths in the files are language-neutral (`/guide/surface`); the builders turn
 * them into the page language's URLs.
 */

type Link = { title: string; description: string; href: string };
export type SectionHeading = { eyebrow: string; title: string; description: string };
export type Card = {
  id: string;
  title: string;
  color: string;
  description: string;
  detail: string;
};
export type SearchItem = Link & { tags: string[] };

export interface PageTexts {
  home: {
    title: string;
    hero: {
      badge: string;
      title: string;
      /** Second line of the headline, in the accent gradient. */
      highlight: string;
      description: string;
      primaryLabel: string;
      primaryHref: string;
      secondaryLabel: string;
      secondaryHref: string;
      commandLabel: string;
      command: string;
      imageAlt: string;
    };
    sections: Record<'concepts' | 'features', SectionHeading & { linkLabel: string }>;
    concepts: Array<Link & { key: string }>;
    features: Link[];
    cta: {
      title: string;
      description: string;
      primaryLabel: string;
      primaryHref: string;
      secondaryLabel: string;
      secondaryHref: string;
    };
  };
  examples: {
    title: string;
    list: { title: string; description: string; items: Array<Link & { color: string }> };
  };
  streaming: {
    title: string;
    controls: { description: string; runLabel: string; errorLabel: string };
  };
  actions: { title: string; likes: { title: string; description: string } };
  'view-transition': {
    title: string;
    description: { title: string; description: string };
    cards: Card[];
    backLabel: string;
  };
  search: {
    title: string;
    input: { placeholder: string; label: string; buttonLabel: string; hint: string };
    /** `{query}` is replaced with the search text. */
    results: { loading: string; empty: string };
    features: SearchItem[];
  };
  chat: {
    title: string;
    welcomeText: string;
    input: { placeholder: string; submitLabel: string; hint: string };
  };
  'ui-patch': { title: string };
  guide: { title: string };
}

/** The texts of one page in one language (parity-checked across languages at build time). */
export async function pageText<Page extends keyof PageTexts>(
  page: Page,
  lang: Lang
): Promise<PageTexts[Page]> {
  const entry = await getEntry('pages', page, { lang });
  if (!entry) throw new Error(`content/pages/${lang}/${page}.yaml is missing`);
  return entry.data as unknown as PageTexts[Page];
}

const localized = <T extends { href: string }>(lang: Lang, items: T[]) =>
  items.map(item => ({ ...item, href: localPath(lang, item.href) }));

/** `page:header` props: navigation and language links of the current page (static slot). */
export function headerProps(
  ctx: SurfaceContext,
  options: { title: string; nav: HeaderProps['nav']; back?: boolean; showTitle?: boolean }
): HeaderProps {
  const lang = pageLang(ctx);
  const i18n = ctx.i18n!;
  return {
    title: options.title,
    nav: options.nav,
    lang,
    links: {
      home: localPath(lang, '/'),
      guide: localPath(lang, '/guide/surface'),
      examples: localPath(lang, '/examples'),
    },
    // Switch links remember the choice in the `lang` cookie (`?lang=`, then a redirect).
    languages: i18n.locales.map(locale => ({
      lang: locale,
      label: locale.toUpperCase(),
      href: i18n.switchHref(locale),
    })),
    ...(options.back
      ? {
          backHref: localPath(lang, '/examples'),
          backLabel: lang === 'ko' ? '예제 목록' : 'All examples',
        }
      : {}),
    ...(options.showTitle === false ? { showTitle: false } : {}),
  };
}

export async function homeContent(lang: Lang) {
  const t = await pageText('home', lang);
  return {
    title: t.title,
    'page:hero': {
      ...t.hero,
      primaryHref: localPath(lang, t.hero.primaryHref),
      secondaryHref: localPath(lang, t.hero.secondaryHref),
    },
    sections: t.sections,
    'page:concepts': {
      concepts: localized(lang, t.concepts),
      linkLabel: t.sections.concepts.linkLabel,
    },
    'page:features': {
      features: localized(lang, t.features),
      linkLabel: t.sections.features.linkLabel,
    },
    cta: {
      ...t.cta,
      command: t.hero.command,
      primaryHref: localPath(lang, t.cta.primaryHref),
      secondaryHref: localPath(lang, t.cta.secondaryHref),
    },
  };
}

export async function examplesContent(lang: Lang) {
  const t = await pageText('examples', lang);
  return {
    title: t.title,
    'examples:list': { ...t.list, items: localized(lang, t.list.items), lang },
  };
}

export async function streamingContent(lang: Lang) {
  const t = await pageText('streaming', lang);
  return {
    title: t.title,
    'demo:controls': { ...t.controls, lang },
    'demo:timeline': { frames: [] as never[] },
    'demo:output': { activeKeys: [] as string[] },
  };
}

export async function actionsContent(lang: Lang) {
  const t = await pageText('actions', lang);
  return {
    title: t.title,
    likes: t.likes,
    'actions:playground': { lastAction: null, lastParams: null, lang },
    'actions:log': { entries: [] as never[], lang },
    // Server components read comments and likes from the demo store (shared/actionsStore.server.ts).
    'actions:likes': { lang },
    'actions:comments': { lang },
  };
}

export async function viewTransitionContent(lang: Lang) {
  const t = await pageText('view-transition', lang);
  return {
    title: t.title,
    backLabel: t.backLabel,
    'vt:description': t.description,
    'vt:gallery': { mode: 'grid' as const, cards: t.cards, lang },
  };
}

export async function searchContent(lang: Lang, query = '') {
  const t = await pageText('search', lang);
  return { title: t.title, results: t.results, 'search:input': { ...t.input, query, lang } };
}

function matchScore(item: SearchItem, query: string): number {
  const q = query.toLowerCase();
  if (item.title.toLowerCase().includes(q)) return 3;
  if (item.tags.some(tag => tag.includes(q))) return 2;
  if (item.description.toLowerCase().includes(q)) return 1;
  return 0;
}

export async function searchResults(lang: Lang, query: string) {
  const { features } = await pageText('search', lang);
  const ranked = query
    ? features
        .map(feature => ({ feature, score: matchScore(feature, query) }))
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .map(item => item.feature)
    : features;
  return ranked.map(({ tags: _tags, ...rest }) => ({ ...rest, href: localPath(lang, rest.href) }));
}

export async function chatContent(lang: Lang) {
  const t = await pageText('chat', lang);
  return {
    title: t.title,
    'chat:messages': { messages: [] as never[], welcomeText: t.welcomeText },
    'chat:input': { ...t.input, lang },
  };
}

export async function uiPatchContent(lang: Lang) {
  const t = await pageText('ui-patch', lang);
  return {
    title: t.title,
    'uipatch:controls': { currentTheme: 'reset', lang },
    'uipatch:preview': { theme: 'reset', lang, updating: false },
  };
}
