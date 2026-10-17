import s from './Badge.module.css';

// DC-23: a static/server component with CSS Modules (page CSS, never in the client graph).
export default function Badge({ id, text, live }: { id: string; text: string; live?: boolean }) {
  return (
    <span id={id} class={live ? `${s.badge} ${s.live}` : s.badge}>
      {text}
    </span>
  );
}
