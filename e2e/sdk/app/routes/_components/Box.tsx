export default function Box({ text, crash = false }: { text: string; crash?: boolean }) {
  return (
    <p class="box" {...(crash ? { 'data-crash': '' } : {})}>
      {text}
    </p>
  );
}
