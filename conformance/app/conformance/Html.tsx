export default function Html(props: { text?: string }) {
  return <p class="html">{props.text ?? ''}</p>;
}
