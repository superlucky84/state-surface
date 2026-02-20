/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { registerTemplate } from '../shared/templateRegistry.js';
import { createLithentBridge } from './lithentBridge.js';
import chatMessagesTemplate from '../../routes/chat/templates/chatMessages.js';

type Message = { id: string; role: 'user' | 'bot'; text: string };

function buildMessages(count: number): Message[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `m-${i + 1}`,
    role: i % 2 === 0 ? 'user' : 'bot',
    text: `message-${i + 1}`,
  }));
}

function cloneMessages(messages: Message[]): Message[] {
  return messages.map(m => ({ ...m }));
}

function collectBubbles(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('div.max-w-xs'));
}

function mapByText(nodes: HTMLElement[]): Map<string, HTMLElement> {
  return new Map(nodes.map(node => [node.textContent ?? '', node]));
}

async function captureMutations(
  target: HTMLElement,
  run: () => void | Promise<void>
): Promise<{ addedNodes: number; removedNodes: number; characterDataMutations: number; removedMessageTexts: string[] }> {
  const records: MutationRecord[] = [];
  const observer = new MutationObserver(next => records.push(...next));
  observer.observe(target, { childList: true, subtree: true, attributes: true, characterData: true });

  await run();
  await Promise.resolve();
  observer.disconnect();

  let addedNodes = 0;
  let removedNodes = 0;
  let characterDataMutations = 0;
  const removedMessageTexts: string[] = [];

  for (const record of records) {
    if (record.type === 'childList') {
      addedNodes += record.addedNodes.length;
      removedNodes += record.removedNodes.length;
      for (const node of record.removedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (!node.matches('div.max-w-xs')) continue;
        removedMessageTexts.push(node.textContent ?? '');
      }
    } else if (record.type === 'characterData') {
      characterDataMutations += 1;
    }
  }

  return { addedNodes, removedNodes, characterDataMutations, removedMessageTexts };
}

describe('chat performance: 100+ messages with pure function template', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    registerTemplate(chatMessagesTemplate.name, chatMessagesTemplate.template);
  });

  it('renders 120 messages correctly', () => {
    const anchor = document.createElement('h-state');
    anchor.setAttribute('name', 'chat:messages');
    document.body.appendChild(anchor);

    const bridge = createLithentBridge();
    const initialMessages = buildMessages(120);
    bridge.renderTemplate('chat:messages', { messages: initialMessages }, anchor);

    const bubbles = collectBubbles(anchor);
    expect(bubbles).toHaveLength(120);
    expect(bubbles.map(n => n.textContent)).toEqual(initialMessages.map(m => m.text));
  });

  it('updating with one more message adds exactly one DOM node and keeps all previous intact', async () => {
    const anchor = document.createElement('h-state');
    anchor.setAttribute('name', 'chat:messages');
    document.body.appendChild(anchor);

    const bridge = createLithentBridge();
    const initialMessages = buildMessages(120);
    bridge.renderTemplate('chat:messages', { messages: initialMessages }, anchor);

    const before = collectBubbles(anchor);
    expect(before).toHaveLength(120);

    const appended: Message = { id: 'm-121', role: 'bot', text: 'message-121' };
    // Runtime accumulates messages[] and passes merged array to updateTemplate
    const allMessages = [...initialMessages, appended];

    const mutations = await captureMutations(anchor, () => {
      bridge.updateTemplate('chat:messages', { messages: allMessages }, anchor);
    });

    const after = collectBubbles(anchor);
    expect(after).toHaveLength(121);
    expect(after[120].textContent).toBe(appended.text);
    expect(mutations.removedMessageTexts).toEqual([]);
  });

  it('no-op refresh with identical message contents causes zero DOM mutations', async () => {
    const anchor = document.createElement('h-state');
    anchor.setAttribute('name', 'chat:messages');
    document.body.appendChild(anchor);

    const bridge = createLithentBridge();
    const initialMessages = buildMessages(120);
    bridge.renderTemplate('chat:messages', { messages: initialMessages }, anchor);

    const before = collectBubbles(anchor);
    const beforeByText = mapByText(before);
    expect(before).toHaveLength(120);

    const sameContentNewRefs = cloneMessages(initialMessages);
    const mutations = await captureMutations(anchor, () => {
      bridge.updateTemplate('chat:messages', { messages: sameContentNewRefs }, anchor);
    });

    const after = collectBubbles(anchor);
    const afterByText = mapByText(after);

    expect(after).toHaveLength(120);
    // DOM nodes for each message must be the same reference (no remount)
    for (const message of initialMessages) {
      expect(afterByText.get(message.text)).toBe(beforeByText.get(message.text));
    }
    expect(mutations.addedNodes).toBe(0);
    expect(mutations.removedNodes).toBe(0);
  });
});
