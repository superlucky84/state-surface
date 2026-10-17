import { Slot } from 'state-surface';
import Layout from '../../layouts/Layout';
import Counter from '../_components/Counter';
import Note from '../_components/Note';

// DC-24: built once into dist/client/pre/index.html; actions and islands still work.
export const prerender = true;

export default async function Page() {
  return (
    <Layout title="Prerendered">
      <h1>Prerendered page</h1>
      <Slot name="note" mode="server">
        <Note text="static note" />
      </Slot>
      <button type="button" data-action="ping">
        Ping
      </button>
      <Counter start={1} label="pre" client:load />
    </Layout>
  );
}
