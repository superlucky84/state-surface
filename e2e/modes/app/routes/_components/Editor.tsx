import { mount } from 'lithent';

// V-04 fixture: the input keeps its own text state; the counter shows what the component saw.
export default mount<{ title: string }>((renew, props) => {
  let text = props.title;
  return () => (
    <label>
      <input
        id="editor-input"
        value={text}
        onInput={(event: Event) => ((text = (event.target as HTMLInputElement).value), renew())}
      />
      <output id="editor-count">{String(text.length)}</output>
    </label>
  );
});
