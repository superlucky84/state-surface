export default function ErrorMessage({ message }: { message?: string }) {
  return message ? <p role="alert">{message}</p> : null;
}
