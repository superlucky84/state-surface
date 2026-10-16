import { mount } from 'lithent';

// Separate module so its chunk can be observed: requested only after it becomes visible.
export default mount<{ start: number }>((renew, props) => {
  let count = props.start;
  return () => (
    <button type="button" class="lazy" onClick={() => (count++, renew())}>
      lazy:{count}
    </button>
  );
});
