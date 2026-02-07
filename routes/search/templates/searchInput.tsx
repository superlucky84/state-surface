import { defineTemplate } from '../../../shared/templateRegistry.js';

type SearchInputProps = { query: string };

const SearchInput = ({ query }: SearchInputProps) => (
  <div class="search-input">
    <input type="text" value={query} placeholder="Search..." />
  </div>
);

export default defineTemplate('search:input', SearchInput);
