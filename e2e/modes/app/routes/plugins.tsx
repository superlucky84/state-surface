import { Slot } from 'state-surface';
import Layout from '../layouts/Layout';
import Note from './_components/Note';
import { marker } from '../client/marker';

export const plugins = [marker];

export default async function Page() {
  return (
    <Layout title="Plugins">
      <Slot name="box">
        <Note text="plugin target" />
      </Slot>
    </Layout>
  );
}
