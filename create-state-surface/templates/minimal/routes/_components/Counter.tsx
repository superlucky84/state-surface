import { mount } from 'lithent';

/** A client island: rendered on the server, then hydrated and interactive in the browser. */
export default mount<{ start: number }>((renew, props) => {
  let count = props.start;
  return () => (
    <button
      type="button"
      class="rounded-md border border-slate-300 bg-white px-4 py-2"
      onClick={() => {
        count += 1;
        renew();
      }}
    >
      Clicked {count} times
    </button>
  );
});
