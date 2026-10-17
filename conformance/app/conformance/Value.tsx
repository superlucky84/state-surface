export default function Value(props: { n?: number }) {
  return <p class="value">{String(props.n ?? '')}</p>;
}
