import { defineTemplate } from '../../../shared/templateRegistry.js';

type SearchItem = { title: string; url: string };
type SearchResultsProps = {
  loading: boolean;
  query: string;
  items?: SearchItem[];
};

const SearchResults = ({ loading, query, items }: SearchResultsProps) => {
  if (loading) {
    return <div class="loading">Searching for "{query}"...</div>;
  }

  const list = items ?? [];
  if (list.length === 0) {
    return <div class="no-results">No results found.</div>;
  }

  return (
    <ul class="search-results">
      {list.map(item => (
        <li>
          <a href={item.url}>{item.title}</a>
        </li>
      ))}
    </ul>
  );
};

export default defineTemplate('search:results', SearchResults);
