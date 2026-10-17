/** Renders frame props into URL and spread attributes: the browser guard keeps it safe. */
export default function LinkCard(props: {
  href: string;
  label: string;
  attrs?: Record<string, string>;
  frame?: string;
}) {
  return (
    <div class="link-card">
      <a href={props.href} {...(props.attrs ?? {})}>
        {props.label}
      </a>
      {props.frame ? <iframe title="frame" src={props.frame} /> : null}
    </div>
  );
}
