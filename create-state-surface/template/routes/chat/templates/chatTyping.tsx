import { defineTemplate } from 'state-surface';

type ChatTypingProps = { text?: string };

const ChatTyping = ({ text }: ChatTypingProps) => (
  <div class="flex items-center gap-2 px-1 text-sm text-slate-500">
    <span class="flex gap-1">
      <span
        class="h-2 w-2 animate-bounce rounded-full bg-slate-400"
        style="animation-delay:0ms"
      />
      <span
        class="h-2 w-2 animate-bounce rounded-full bg-slate-400"
        style="animation-delay:150ms"
      />
      <span
        class="h-2 w-2 animate-bounce rounded-full bg-slate-400"
        style="animation-delay:300ms"
      />
    </span>
    <span>{text ?? 'Typing...'}</span>
  </div>
);

export default defineTemplate('chat:typing', ChatTyping);
