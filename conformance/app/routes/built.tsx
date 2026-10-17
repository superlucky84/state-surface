import Document from '../conformance/Document';

export const prerender = true;

export default function Built() {
  return (
    <Document>
      <p>built-marker /built</p>
    </Document>
  );
}
