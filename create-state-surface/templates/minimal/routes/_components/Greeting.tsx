import s from './Greeting.module.css';

/** Template of the `home:greeting` server slot: its props are the slot state. */
export default function Greeting({ name }: { name: string }) {
  return (
    <p class={`${s.greeting} text-lg`}>
      Hello, <strong>{name}</strong>!
    </p>
  );
}
