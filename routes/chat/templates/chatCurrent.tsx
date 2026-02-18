import { mount, updateCallback } from 'lithent';
import { defineTemplate } from '../../../shared/templateRegistry.js';

type ChatCurrentProps = { id?: string; delta?: string };

// Renders the bot message currently being streamed.
// Server sends delta (new chars only); component accumulates locally.
// Lives in its own slot (chat:current) so partial frames stay tiny.
const ChatCurrent = mount<ChatCurrentProps>((_renew, props) => {
  let accumulated = props.delta ?? '';

  updateCallback(() => {
    if (props.delta) {
      accumulated += props.delta;
    }
  });

  return () => (
    <div class="flex justify-start px-1">
      <div class="max-w-xs rounded-2xl rounded-bl-sm border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 shadow-sm lg:max-w-md">
        {accumulated}
        <span class="ml-0.5 inline-block animate-pulse">▋</span>
      </div>
    </div>
  );
});

export default defineTemplate('chat:current', ChatCurrent);
