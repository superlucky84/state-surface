import { Slot } from 'state-surface';
import Layout from '../layouts/Layout';
import Title from './_components/Title';
import Secret from './_components/Secret';

/** Static page: no client components, actions, boot or plugins → no engine script. */
export default async function Page() {
  return (
    <Layout title="Static">
      <Slot name="hero">
        <Title text="Static page" />
      </Slot>
      <Slot name="secret" mode="server">
        <Secret id="1" />
      </Slot>
    </Layout>
  );
}
