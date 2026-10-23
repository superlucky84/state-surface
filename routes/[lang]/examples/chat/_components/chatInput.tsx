type ChatInputProps = {
  placeholder?: string;
  submitLabel?: string;
  lang?: string;
  hint?: string;
};

// The conversation history lives on the server (shared/chatHistory.server.ts); the input is a server
// slot re-rendered empty after each message, and its id lets the engine restore focus.
const ChatInput = ({ placeholder, submitLabel, lang, hint }: ChatInputProps) => (
  <form
    data-action="chat"
    data-pending-targets="chat:messages,chat:current,chat:typing"
    class="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"
  >
    <input type="hidden" name="lang" value={lang ?? 'en'} />
    <div class="flex gap-2">
      <input
        id="chat-message"
        name="message"
        type="text"
        placeholder={placeholder ?? 'Type a message...'}
        autocomplete="off"
        class="min-w-0 flex-1 rounded-full border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-xs outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/15"
      />
      <button
        type="submit"
        class="rounded-full bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-indigo-600/25 transition hover:bg-indigo-500"
      >
        {submitLabel ?? 'Send'}
      </button>
    </div>
    {hint && <p class="mt-2 px-2 text-xs text-slate-500">{hint}</p>}
  </form>
);

export default ChatInput;
