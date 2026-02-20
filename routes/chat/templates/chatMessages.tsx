import { defineTemplate } from '../../../shared/templateRegistry.js';

type Message = { id: string; role: 'user' | 'bot'; text: string };

type ChatMessagesProps = {
  messages?: Message[];
  welcomeText?: string;
};

const ChatMessage = ({ id, role, text }: Message) => (
  <div key={id} class={role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
    <div
      class={
        role === 'user'
          ? 'max-w-xs rounded-2xl rounded-br-sm bg-slate-900 px-4 py-2.5 text-sm text-white lg:max-w-md'
          : 'max-w-xs rounded-2xl rounded-bl-sm border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 shadow-sm lg:max-w-md'
      }
    >
      {text}
    </div>
  </div>
);

const ChatMessages = ({ messages, welcomeText }: ChatMessagesProps) => (
  <div class="flex flex-1 flex-col gap-3 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-4">
    {!messages || messages.length === 0 ? (
      <p class="m-auto text-center text-sm text-slate-400">
        {welcomeText ?? 'Send a message to start the conversation.'}
      </p>
    ) : (
      messages.map(m => <ChatMessage key={m.id} {...m} />)
    )}
  </div>
);

export default defineTemplate('chat:messages', ChatMessages);
