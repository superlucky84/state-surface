/** A server slot with a media element, re-rendered by `remorph` (stage 9 morph check). */
export default function Player({ n }: { n: number }) {
  return (
    <div class="player">
      <audio src="/assets/silence.wav" preload="none" />
      <video muted playsinline preload="none" />
      <p class="turn">{String(n)}</p>
    </div>
  );
}
