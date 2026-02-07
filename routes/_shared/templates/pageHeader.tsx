import { defineTemplate } from '../../../shared/templateRegistry.js';

type HeaderProps = {
  title: string;
  nav: string;
};

const Header = ({ title }: HeaderProps) => (
  <header class="site-header">
    <h1>{title}</h1>
    <nav>
      <a href="#" data-transition="article-load">Articles</a>
      {' | '}
      <a href="#" data-transition="search">Search</a>
    </nav>
  </header>
);

export default defineTemplate('page:header', Header);
