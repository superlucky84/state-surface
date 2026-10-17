import Layout from '../../layouts/Layout';

// A page without <ClientRouter>: router pages reach it with a document load.
export default async function Page() {
  return (
    <Layout title="Plain">
      <h1>Plain page</h1>
    </Layout>
  );
}
