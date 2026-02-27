import { defineTemplate } from '../../../engine/shared/templateRegistry.js';

type ChatCurrentProps = { text?: string };

// Renders the bot message currently being streamed.
// The runtime accumulates text in activeStates via accumulate frames —
// this template receives the already-merged text and renders it directly.
const ChatCurrent = ({ text }: ChatCurrentProps) => (
  <div class="flex justify-start px-1">
    <div class="max-w-xs rounded-2xl rounded-bl-sm border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 shadow-sm lg:max-w-md">
      {text ?? ''}
      <span class="ml-0.5 inline-block animate-pulse">▋</span>
    </div>
  </div>
);

export default defineTemplate('chat:current', ChatCurrent);
