import type { SurfaceContext } from 'state-surface/server';
import { Slot } from 'state-surface';
import Layout from '../../layouts/Layout.js';
import ChatMessages from './chat/_components/chatMessages.js';
import ChatCurrent from './chat/_components/chatCurrent.js';
import ChatTyping from './chat/_components/chatTyping.js';
import ChatInput from './chat/_components/chatInput.js';
import { getLang } from '../../shared/i18n.js';
import { chatContent } from '../../shared/content.js';
import { chatScroll } from '../../client/plugins/chatScroll.js';
import { readHistory } from '../../shared/chatHistory.server.js';

export const plugins = [chatScroll];

/**
 * chat:messages fills the remaining height and scrolls; typing and input sit below it. The
 * history comes from the server store, so a reload shows the same conversation.
 */
export default async function Page(ctx: SurfaceContext) {
  const content = chatContent(getLang(ctx));
  const messages = readHistory(ctx);
  return (
    <Layout header={content['page:header']} variant="chat">
      <main class="flex min-h-0 w-full max-w-2xl flex-1 flex-col gap-2 self-center pb-4 pt-4 md:pt-6">
        <Slot
          name="chat:messages"
          mode="server"
          style="flex:1;min-height:0;display:flex;flex-direction:column"
        >
          <ChatMessages {...content['chat:messages']} messages={messages} />
        </Slot>
        <Slot name="chat:current" client:load component={ChatCurrent} />
        <Slot name="chat:typing" mode="server" component={ChatTyping} />
        <Slot name="chat:input" mode="server">
          <ChatInput {...content['chat:input']} />
        </Slot>
      </main>
    </Layout>
  );
}
