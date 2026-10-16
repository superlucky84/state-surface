import { mount } from 'lithent';

export default mount<{ start: number; label: string }>((renew, props) => {
  let count = props.start;
  return () => (
    <button type="button" class={props.label} onClick={() => (count++, renew())}>
      {props.label}:{count}
    </button>
  );
});
