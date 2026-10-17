import { defineServerComponent } from 'state-surface/server';

// Deferred server component: `load` sees the island request (cookies, env) of the runtime.
export default defineServerComponent({
  load: (props: { label: string }, ctx) => ({
    label: props.label,
    runtime: String(ctx.env.RUNTIME ?? 'unknown'),
    cookie: ctx.cookies.get('lang') ?? '',
  }),
  render: (data: { label: string; runtime: string; cookie: string }) => (
    <p class="deferred">{`${data.label}@${data.runtime}:${data.cookie}`}</p>
  ),
});
