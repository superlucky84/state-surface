import { defineTemplate } from '../../../shared/templateRegistry.js';

type HeaderProps = {
  title: string;
  nav: string;
};

const Header = ({ title }: HeaderProps) => (
  <header class="site-header">
    <h1>{title}</h1>
    <nav>
      <a href="/">Home</a>
      {' | '}
      <a href="/article/1">Article #1</a>
      {' | '}
      <a href="/search">Search</a>
      {' | '}
      <a href="/about">About</a>
    </nav>
  </header>
);

export default defineTemplate('page:header', Header);
