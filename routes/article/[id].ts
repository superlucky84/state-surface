import type { RouteModule } from '../../shared/routeModule.js';
import { baseSurface, joinSurface, stateSlots } from '../../layouts/surface.js';

function parseArticleId(req: { params: Record<string, string> }): number {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id < 1) {
    throw new Error(`Invalid article id: "${req.params.id}"`);
  }
  return id;
}

export default {
  layout: stateScript => {
    const body = joinSurface('<main class="page">', stateSlots('page:content', 'panel:comments'), '</main>');
    return baseSurface(body, stateScript);
  },

  transition: 'article-load',

  params: req => ({ articleId: parseArticleId(req) }),

  initial: req => ({
    'page:header': { title: 'Blog', nav: 'article' },
    'page:content': {
      loading: false,
      articleId: parseArticleId(req),
    },
  }),

  boot: {
    auto: true,
    params: req => ({ articleId: parseArticleId(req) }),
  },
} satisfies RouteModule;
