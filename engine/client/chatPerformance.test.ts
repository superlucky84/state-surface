/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { registerTemplate } from '../shared/templateRegistry.js';
import { createLithentBridge } from './lithentBridge.js';
import chatMessagesTemplate from '../../routes/chat/templates/chatMessages.js';

type Message = { id: string; role: 'user' | 'bot'; text: string };

type MutationSummary = {
  addedNodes: number;
  removedNodes: number;
  attributeMutations: number;
  characterDataMutations: number;
  removedMessageTexts: string[];
};

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
): Promise<MutationSummary> {
  const records: MutationRecord[] = [];
  const observer = new MutationObserver(next => records.push(...next));
  observer.observe(target, {
    childList: true,
    subtree: true,
    attributes: true,
    characterData: true,
  });

  await run();
  await Promise.resolve();
  observer.disconnect();

  const summary: MutationSummary = {
    addedNodes: 0,
    removedNodes: 0,
    attributeMutations: 0,
    characterDataMutations: 0,
    removedMessageTexts: [],
  };

  for (const record of records) {
    if (record.type === 'childList') {
      summary.addedNodes += record.addedNodes.length;
      summary.removedNodes += record.removedNodes.length;
      for (const node of record.removedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (!node.matches('div.max-w-xs')) continue;
        summary.removedMessageTexts.push(node.textContent ?? '');
      }
      continue;
    }
    if (record.type === 'attributes') {
      summary.attributeMutations += 1;
      continue;
    }
    if (record.type === 'characterData') {
      summary.characterDataMutations += 1;
    }
  }

  return summary;
}

describe('chat performance: 100+ messages + cacheUpdate skip', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    registerTemplate(chatMessagesTemplate.name, chatMessagesTemplate.template);
  });

  it('append on 120-message history keeps old message DOM nodes intact', async () => {
    const anchor = document.createElement('h-state');
    anchor.setAttribute('name', 'chat:messages');
    document.body.appendChild(anchor);

    const bridge = createLithentBridge();
    const initialMessages = buildMessages(120);
    bridge.renderTemplate('chat:messages', { messages: initialMessages }, anchor);

    const before = collectBubbles(anchor);
    expect(before).toHaveLength(120);
    expect(before.map(node => node.textContent)).toEqual(initialMessages.map(m => m.text));

    const appended: Message = { id: 'm-121', role: 'bot', text: 'message-121' };
    const mutations = await captureMutations(anchor, () => {
      bridge.updateTemplate('chat:messages', { append: appended }, anchor);
    });

    const after = collectBubbles(anchor);
    const afterTexts = after.map(node => node.textContent);

    expect(after).toHaveLength(121);
    expect(afterTexts.slice(0, 120)).toEqual(initialMessages.map(m => m.text));
    expect(afterTexts[120]).toBe(appended.text);
    expect(mutations.addedNodes).toBeGreaterThan(0);
    expect(mutations.removedMessageTexts).toEqual([]);
    expect(mutations.characterDataMutations).toBe(0);
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
    for (const message of initialMessages) {
      expect(afterByText.get(message.text)).toBe(beforeByText.get(message.text));
    }
    expect(mutations.addedNodes).toBe(0);
    expect(mutations.removedNodes).toBe(0);
    expect(mutations.attributeMutations).toBe(0);
    expect(mutations.characterDataMutations).toBe(0);
  });
});
