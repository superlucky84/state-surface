import { h, mount } from 'lithent';
import { registerTemplate } from '../shared/templateRegistry.js';

// ── page:header ──

const HeaderTemplate = mount((_renew, _props: { title: string; nav: string }) => {
  return (props: { title: string; nav: string }) =>
    h(
      'header',
      { class: 'site-header' },
      h('h1', {}, props.title),
      h(
        'nav',
        {},
        h('a', { href: '#', 'data-transition': 'article-load' }, 'Articles'),
        ' | ',
        h('a', { href: '#', 'data-transition': 'search' }, 'Search')
      )
    );
});

// ── page:content ──

const ContentTemplate = mount(
  (_renew, _props: { loading?: boolean; title?: string; body?: string; articleId?: number }) => {
    return (props: { loading?: boolean; title?: string; body?: string; articleId?: number }) => {
      if (props.loading) {
        return h('div', { class: 'loading' }, `Loading article #${props.articleId ?? ''}...`);
      }
      return h(
        'article',
        { class: 'article-content' },
        h('h2', {}, props.title ?? ''),
        h('p', {}, props.body ?? '')
      );
    };
  }
);

// ── panel:comments ──

const CommentsTemplate = mount(
  (_renew, _props: { articleId: number; comments: Array<{ author: string; text: string }> }) => {
    return (props: { articleId: number; comments: Array<{ author: string; text: string }> }) =>
      h(
        'section',
        { class: 'comments' },
        h('h3', {}, `Comments (${props.comments.length})`),
        ...props.comments.map(c =>
          h('div', { class: 'comment' }, h('strong', {}, c.author), ': ', c.text)
        )
      );
  }
);

// ── search:input ──

const SearchInputTemplate = mount((_renew, _props: { query: string }) => {
  return (props: { query: string }) =>
    h(
      'div',
      { class: 'search-input' },
      h('input', { type: 'text', value: props.query, placeholder: 'Search...' })
    );
});

// ── search:results ──

const SearchResultsTemplate = mount(
  (
    _renew,
    _props: { loading: boolean; query: string; items?: Array<{ title: string; url: string }> }
  ) => {
    return (props: {
      loading: boolean;
      query: string;
      items?: Array<{ title: string; url: string }>;
    }) => {
      if (props.loading) {
        return h('div', { class: 'loading' }, `Searching for "${props.query}"...`);
      }
      const items = props.items ?? [];
      if (items.length === 0) {
        return h('div', { class: 'no-results' }, 'No results found.');
      }
      return h(
        'ul',
        { class: 'search-results' },
        ...items.map(item => h('li', {}, h('a', { href: item.url }, item.title)))
      );
    };
  }
);

// ── system:error ──

const ErrorTemplate = mount((_renew, _props: { message?: string }) => {
  return (props: { message?: string }) =>
    h('div', { class: 'error-panel' }, h('strong', {}, 'Error: '), props.message ?? 'Unknown');
});

export function registerDemoTemplates() {
  registerTemplate('page:header', HeaderTemplate);
  registerTemplate('page:content', ContentTemplate);
  registerTemplate('panel:comments', CommentsTemplate);
  registerTemplate('search:input', SearchInputTemplate);
  registerTemplate('search:results', SearchResultsTemplate);
  registerTemplate('system:error', ErrorTemplate);
}
