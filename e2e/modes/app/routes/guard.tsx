import { Slot } from 'state-surface';
import Layout from '../layouts/Layout';
import LinkCard from './_components/LinkCard';

/** DESIGN 8.1: a strict client slot whose props come from a transition (stage 9). */
export default async function Page() {
  return (
    <Layout title="Guard">
      <Slot name="link" client:load>
        <LinkCard href="/guard" label="safe" />
      </Slot>
      <button type="button" data-action="inject">
        Inject
      </button>
    </Layout>
  );
}
