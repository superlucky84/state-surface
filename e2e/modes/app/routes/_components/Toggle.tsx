import { mount } from 'lithent';
import s from './Toggle.module.css';

// DC-23: an island with CSS Modules (its chunk CSS, linked before it activates).
export default mount<{ label: string }>((renew, props) => {
  let on = false;
  return () => (
    <button type="button" id="toggle" class={s.toggle} onClick={() => ((on = !on), renew())}>
      {props.label}:{on ? 'on' : 'off'}
    </button>
  );
});
