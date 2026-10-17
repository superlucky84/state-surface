/** Content of the `system:error` slot: the message of a failed transition. */
export default function ErrorMessage({ message }: { message?: string }) {
  return (
    <p class="mx-auto max-w-xl rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-800">
      {message ?? 'Something went wrong.'}
    </p>
  );
}
