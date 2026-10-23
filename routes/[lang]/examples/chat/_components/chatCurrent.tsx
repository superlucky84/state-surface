type ChatCurrentProps = { text?: string };

// Renders the bot message currently being streamed.
// Accumulate frames reach this client slot as `merge` ops; the browser folds them into the
// props, so this template receives the text merged so far and renders it directly.
const ChatCurrent = ({ text }: ChatCurrentProps) => (
  <div class="flex justify-start px-1">
    <div class="max-w-xs rounded-2xl rounded-bl-sm border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 shadow-sm lg:max-w-md">
      {text ?? ''}
      <span class="ml-0.5 inline-block animate-pulse">▋</span>
    </div>
  </div>
);

export default ChatCurrent;
