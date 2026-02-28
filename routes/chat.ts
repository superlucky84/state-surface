import type { RouteModule } from 'state-surface';
import { chatSurface, joinSurface } from '../layouts/surface.js';
import { getLang } from '../shared/i18n.js';
import { chatContent } from '../shared/content.js';

export default {
  layout: stateScript => {
    // chat:messages gets flex:1 + min-height:0 so it fills remaining space and scrolls.
    // chat:typing and chat:input sit at the bottom naturally.
    const body = joinSurface(
      '<main class="flex min-h-0 w-full max-w-2xl flex-1 flex-col gap-2 self-center pb-4 pt-4 md:pt-6">',
      '<h-state name="chat:messages" style="flex:1;min-height:0;display:flex;flex-direction:column"></h-state>',
      '<h-state name="chat:current"></h-state>',
      '<h-state name="chat:typing"></h-state>',
      '<h-state name="chat:input"></h-state>',
      '</main>'
    );
    return chatSurface(body, stateScript);
  },

  transition: 'chat',

  initial: req => chatContent(getLang(req)),
} satisfies RouteModule;
