import type { TransitionHooks } from '../../engine/server.js';
import { getLang, isValidLang, langCookie } from '../../shared/i18n.js';

export const transitionHooks: TransitionHooks = {
  onBeforeTransition({ name, body, req, res }) {
    const nextBody = { ...body };

    if (!nextBody.lang) {
      nextBody.lang = getLang(req);
    }

    if (name === 'switch-lang' && isValidLang(nextBody.lang)) {
      res.setHeader('Set-Cookie', langCookie(nextBody.lang));
    }

    return nextBody;
  },
};
