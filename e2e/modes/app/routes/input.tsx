import Layout from '../layouts/Layout';
import Editor from './_components/Editor';

// The media query never matches, so only an interaction activates the island (DC-04 ⑤).
export default async function Page() {
  return (
    <Layout title="Input">
      <Editor title="snapshot" client:media="(min-width: 100000px)" />
    </Layout>
  );
}
