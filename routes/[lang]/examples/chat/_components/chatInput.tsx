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
    class="rounded-xl border border-slate-200 bg-white px-4 py-4 shadow-sm"
  >
    <input type="hidden" name="lang" value={lang ?? 'en'} />
    <div class="flex gap-2">
      <input
        id="chat-message"
        name="message"
        type="text"
        placeholder={placeholder ?? 'Type a message...'}
        autocomplete="off"
        class="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
      />
      <button
        type="submit"
        class="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
      >
        {submitLabel ?? 'Send'}
      </button>
    </div>
    {hint && <p class="mt-2 text-xs text-slate-500">{hint}</p>}
  </form>
);

export default ChatInput;
