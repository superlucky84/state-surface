export default function Fixture(props: { value: unknown; [key: string]: unknown }) {
  return <p>{String(props.value)}</p>;
}
