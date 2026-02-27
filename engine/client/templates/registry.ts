/**
 * Template registry re-export for convenience.
 *
 * Templates are auto-registered by `client/templates/auto.ts` from route-level templates dirs.
 * Templates are Lithent components that receive state data as props.
 *
 * Example:
 *   import { mount } from 'lithent';
 *   import { registerTemplate } from '../../shared/templateRegistry.js';
 *
 *   const ArticleTemplate = mount((renew, props) => {
 *     return (props) => h('article', {}, h('h1', {}, props.title));
 *   });
 *
 *   registerTemplate('page:article', ArticleTemplate);
 */
export { registerTemplate, getTemplate, hasTemplate } from '../../shared/templateRegistry.js';
