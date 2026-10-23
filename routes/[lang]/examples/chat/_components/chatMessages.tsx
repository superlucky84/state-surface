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
          ? 'max-w-xs rounded-2xl rounded-br-md bg-indigo-600 px-4 py-2.5 text-sm leading-6 text-white shadow-sm shadow-indigo-600/20 lg:max-w-md'
          : 'max-w-xs rounded-2xl rounded-bl-md bg-white px-4 py-2.5 text-sm leading-6 text-slate-800 shadow-xs ring-1 ring-slate-200 lg:max-w-md'
      }
    >
      {text}
    </div>
  </div>
);

const ChatMessages = ({ messages, welcomeText }: ChatMessagesProps) => (
  <div
    data-chat-scroll
    class="flex flex-1 flex-col gap-3 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50/80 p-4 shadow-inner shadow-slate-900/[0.03] sm:p-5"
  >
    {!messages || messages.length === 0 ? (
      <p class="m-auto text-center text-sm text-slate-400">
        {welcomeText ?? 'Send a message to start the conversation.'}
      </p>
    ) : (
      messages.map(m => <ChatMessage key={m.id} {...m} />)
    )}
  </div>
);

export default ChatMessages;
