import { Slot } from 'state-surface';
import Layout from '../layouts/Layout';
import Player from './_components/Player';

/** `swap="morph"` over media: each morph parses the new HTML (stage 9 document check). */
export default async function Page() {
  return (
    <Layout title="Morph media">
      <Slot name="player" mode="server" swap="morph">
        <Player n={0} />
      </Slot>
      <button type="button" data-action="remorph">
        Morph
      </button>
    </Layout>
  );
}
