import Layout from '../layouts/Layout';
import Counter from './_components/Counter';
import Lazy from './_components/Lazy';

export default async function Page() {
  return (
    <Layout title="Islands">
      <Counter start={1} label="eager" client:load />
      <div style="height: 4000px">spacer</div>
      <Lazy start={10} client:visible />
    </Layout>
  );
}
