import { mount, ref, mountCallback, updateCallback } from 'lithent';
import { cacheUpdate, state } from 'lithent/helper';
import { defineTemplate } from '../../../shared/templateRegistry.js';

type Message = { id: string; role: 'user' | 'bot'; text: string };

type ChatMessagesProps = {
  // Present → full reset of local history (initial load, language switch).
  // Absent  → keep existing local history and check for append.
  messages?: Message[];
  // Present → append this single message to local history.
  append?: Message;
  welcomeText?: string;
};

// Individual message — cacheUpdate skips diff when id/role/text are unchanged.
const ChatMessage = mount<Message>((_renew, props) => {
  return cacheUpdate(
    () => [props.id, props.role, props.text],
    () => (
      <div class={props.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
        <div
          class={
            props.role === 'user'
              ? 'max-w-xs rounded-2xl rounded-br-sm bg-slate-900 px-4 py-2.5 text-sm text-white lg:max-w-md'
              : 'max-w-xs rounded-2xl rounded-bl-sm border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 shadow-sm lg:max-w-md'
          }
        >
          {props.text}
        </div>
      </div>
    )
  );
});

const ChatMessages = mount<ChatMessagesProps>((renew, props) => {
  const containerRef = ref<HTMLDivElement>(null);

  // Client-owned history — the server never sends the full array again after
  // the initial load. It only sends append operations or a reset (messages:[]).
  const history = state<Message[]>(props.messages ?? [], renew);

  // Track the last appended message id to avoid double-appending the same message
  // (e.g. if the component re-renders for an unrelated reason).
  let lastAppendId: string | undefined;

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      const el = containerRef.value;
      if (el) el.scrollTop = el.scrollHeight;
    });
  };

  mountCallback(() => {
    scrollToBottom();
  });

  updateCallback(() => {
    if (props.messages !== undefined) {
      // Full reset: initial load or language switch
      history.value = [...props.messages];
    } else if (props.append?.id && props.append.id !== lastAppendId) {
      // Append: server sent a single new message
      lastAppendId = props.append.id;
      history.value = [...history.value, props.append];
    }
    scrollToBottom();
  });

  return () => (
    <div
      ref={containerRef}
      class="flex flex-1 flex-col gap-3 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-4"
    >
      {history.value.length === 0 ? (
        <p class="m-auto text-center text-sm text-slate-400">
          {props.welcomeText ?? 'Send a message to start the conversation.'}
        </p>
      ) : (
        history.value.map(m => <ChatMessage key={m.id} {...m} />)
      )}
    </div>
  );
});

export default defineTemplate('chat:messages', ChatMessages);
