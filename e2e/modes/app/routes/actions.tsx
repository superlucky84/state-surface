import { Slot } from 'state-surface';
import Layout from '../layouts/Layout';
import Note from './_components/Note';

/** Actions without client components: action runtime only, no Lithent. */
export default async function Page() {
  return (
    <Layout title="Actions">
      <Slot name="note">
        <Note text="static note" />
      </Slot>
      <button type="button" data-action="ping" data-params='{"n":1}'>
        Ping
      </button>
    </Layout>
  );
}
