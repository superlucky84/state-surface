type ErrorProps = { message?: string };

/** `system:error` content: a toast (the slot host is fixed to the bottom of the viewport). */
const ErrorPanel = ({ message }: ErrorProps) => (
  <div
    role="alert"
    class="pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-xl border border-rose-200 bg-white/95 px-4 py-3 text-sm text-rose-900 shadow-lg shadow-rose-900/10 backdrop-blur"
  >
    <span
      aria-hidden="true"
      class="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-rose-500 text-xs font-bold text-white"
    >
      !
    </span>
    <p class="min-w-0 break-words">
      <strong class="font-semibold">Error: </strong>
      {message ?? 'Unknown'}
    </p>
  </div>
);

export default ErrorPanel;
