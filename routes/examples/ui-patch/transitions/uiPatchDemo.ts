import { defineTransition } from 'state-surface/server';
import type { StateFrame } from 'state-surface';
import { isValidLang } from '../../../../shared/i18n.js';
import type { Lang } from '../../../../shared/i18n.js';

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

const THEMES: Record<
  string,
  { classAdd: string[]; classRemove: string[]; cssVars: Record<string, string> }
> = {
  warning: {
    classAdd: ['tone-warning'],
    classRemove: ['tone-default', 'tone-success', 'tone-info'],
    cssVars: { '--card-accent': '#f59e0b', '--card-bg': '#fffbeb' },
  },
  success: {
    classAdd: ['tone-success'],
    classRemove: ['tone-default', 'tone-warning', 'tone-info'],
    cssVars: { '--card-accent': '#10b981', '--card-bg': '#ecfdf5' },
  },
  info: {
    classAdd: ['tone-info'],
    classRemove: ['tone-default', 'tone-warning', 'tone-success'],
    cssVars: { '--card-accent': '#3b82f6', '--card-bg': '#eff6ff' },
  },
  reset: {
    classAdd: ['tone-default'],
    classRemove: ['tone-warning', 'tone-success', 'tone-info'],
    cssVars: { '--card-accent': '#64748b', '--card-bg': '#f8fafc' },
  },
};

async function* uiPatchDemo(
  params: Record<string, unknown>
): AsyncGenerator<StateFrame, void, unknown> {
  const action = (params.action as string) ?? 'theme';
  const theme = (params.theme as string) ?? 'reset';
  const lang: Lang = isValidLang(params.lang) ? params.lang : 'en';
  const ko = lang === 'ko';
  const headerTitle = ko ? 'UI Patch 데모' : 'UI Patch Demo';

  if (action === 'theme') {
    const patch = THEMES[theme] ?? THEMES.reset;

    // Frame 1: full with ui
    yield {
      type: 'state',
      states: {
        'page:header': { title: headerTitle, nav: 'examples', page: 'ui-patch', lang },
        'uipatch:controls': { currentTheme: theme, lang },
        'uipatch:preview': { theme, lang, updating: true },
      },
      ui: {
        'uipatch:preview': patch,
      },
    };

    await delay(300);

    // Frame 2: partial — update preview done
    yield {
      type: 'state',
      full: false,
      states: {
        'uipatch:preview': { theme, lang, updating: false },
      },
      changed: ['uipatch:preview'],
    };

    yield { type: 'done' };
  } else if (action === 'style-only') {
    // Style-only partial: no state change, only ui
    const patch = THEMES[theme] ?? THEMES.reset;

    yield {
      type: 'state',
      states: {
        'page:header': { title: headerTitle, nav: 'examples', page: 'ui-patch', lang },
        'uipatch:controls': { currentTheme: theme, lang },
        'uipatch:preview': { theme, lang, updating: false },
      },
    };

    await delay(200);

    // Style-only partial
    yield {
      type: 'state',
      full: false,
      states: {},
      ui: { 'uipatch:preview': patch },
      uiChanged: ['uipatch:preview'],
    };

    yield { type: 'done' };
  } else if (action === 'clear') {
    // Clear UI: set ui to null
    yield {
      type: 'state',
      states: {
        'page:header': { title: headerTitle, nav: 'examples', page: 'ui-patch', lang },
        'uipatch:controls': { currentTheme: 'reset', lang },
        'uipatch:preview': { theme: 'reset', lang, updating: false },
      },
      ui: {},
    };

    yield { type: 'done' };
  }
}

export default defineTransition('ui-patch-demo', uiPatchDemo);
