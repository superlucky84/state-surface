/**
 * Application template registration.
 *
 * Import this module at startup to register all templates.
 * Templates are Lithent mount() components that receive state data as props.
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
