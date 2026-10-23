import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createDemo, surfaceHeaders } from '../../../../testing/server.js';
import { decodeFrames } from '../../../../engine/shared/ndjson.js';
import type { PatchFrame, WireFrame } from '../../../../engine/shared/protocol.js';

let app: any;
beforeAll(async () => {
  ({ server: app } = await createDemo());
});

describe('GET /{lang}/examples/chat — SSR initial render', () => {
  it('returns 200 with all chat surface anchors', async () => {
    const res = await request(app).get('/en/examples/chat');

    expect(res.status).toBe(200);
    expect(res.text).toContain('name="chat:messages"');
    expect(res.text).toContain('name="chat:current"');
    expect(res.text).toContain('name="chat:typing"');
    expect(res.text).toContain('name="chat:input"');
    expect(res.text).toContain('name="page:header"');
  });

  it('SSR fills initial state — welcome text and input placeholder', async () => {
    const res = await request(app).get('/en/examples/chat');

    expect(res.status).toBe(200);
    expect(res.text).toContain('Send a message to start the conversation');
    expect(res.text).toContain('Type a message...');
    expect(res.text).not.toContain('name="history"');
  });

  it('GET /ko/examples/chat renders Korean content from the path language', async () => {
    const res = await request(app).get('/ko/examples/chat');

    expect(res.status).toBe(200);
    expect(res.text).toContain('메시지를 보내');
    expect(res.text).toContain('메시지를 입력하세요');
    // The form sends the page language to the transition.
    expect(res.text).toMatch(/<input[^>]*name="lang"[^>]*value="ko"/);
  });
});

const send = (body: Record<string, unknown>, cookie?: string) => {
  const req = request(app).post('/transition/chat').set(surfaceHeaders('[lang]/examples/chat'));
  if (cookie) req.set('Cookie', cookie);
  return req.send(body).set('Content-Type', 'application/json');
};
const patches = (text: string) =>
  decodeFrames<WireFrame>(text).filter((f): f is PatchFrame => f.type === 'patch');

describe('POST /transition/chat — server history, client merge streaming', () => {
  it('empty message is an empty success (done only)', async () => {
    const res = await send({ message: '', lang: 'en' });
    expect(res.status).toBe(200);
    expect(decodeFrames(res.text)).toEqual([{ type: 'done' }]);
  });

  it('streams the reply as merge ops into the client slot and stores it on the server', async () => {
    const res = await send({ message: 'surface', lang: 'en' });
    expect(res.status).toBe(200);
    const cookie = res.headers['set-cookie']?.[0]?.split(';')[0];
    expect(cookie).toMatch(/^chat_session=/);
    const [first, ...rest] = patches(res.text);

    // Reset patch: history (server html) with the user message, empty bubble (client props).
    expect(first.reset).toBe(true);
    const history = first.ops.find(op => op.slot === 'chat:messages' && 'html' in op) as {
      html: string;
    };
    expect(history.html).toContain('surface');
    expect(first.ops).toContainEqual({ slot: 'chat:current', props: { text: '' } });
    expect(first.ops.some(op => op.slot === 'chat:typing' && 'html' in op)).toBe(true);

    // Token stream: merge ops carrying only the new characters.
    const merges = rest.flatMap(patch => patch.ops).filter(op => 'merge' in op);
    expect(merges.length).toBeGreaterThan(0);
    const text = merges
      .map(op => (op as unknown as { merge: { text: string } }).merge.text)
      .join('');
    expect(text).toContain('A Surface is a TSX page function');

    // Final patch: re-rendered history with the bot reply, bubble and typing removed.
    const last = rest.at(-1)!;
    expect(last.ops).toContainEqual({ slot: 'chat:current', remove: true });
    expect(last.ops).toContainEqual({ slot: 'chat:typing', remove: true });
    expect((last.ops.find(op => op.slot === 'chat:messages') as { html: string }).html).toContain(
      'A Surface is a TSX page function'
    );
    expect(decodeFrames(res.text).at(-1)).toEqual({ type: 'done' });

    // The next request and a reload read the same history from the server.
    const next = await send({ message: 'action', lang: 'en' }, cookie);
    const nextHistory = patches(next.text)[0].ops.find(op => op.slot === 'chat:messages') as {
      html: string;
    };
    expect(nextHistory.html).toContain('A Surface is a TSX page function');
    const page = await request(app).get('/en/examples/chat').set('Cookie', cookie!);
    expect(page.text).toContain('A Surface is a TSX page function');
  }, 30000);

  it('Korean language: typing and bot response in Korean', async () => {
    const res = await send({ message: 'surface', lang: 'ko' });
    const all = patches(res.text);
    expect(
      (all[0].ops.find(op => op.slot === 'chat:typing' && 'html' in op) as { html: string }).html
    ).toContain('입력 중...');
    const text = all
      .flatMap(patch => patch.ops)
      .filter(op => 'merge' in op)
      .map(op => (op as unknown as { merge: { text: string } }).merge.text)
      .join('');
    expect(text).toMatch(/[가-힣]/);
  }, 30000);

  it('falls back to English without a lang param (the lang cookie is not read)', async () => {
    const res = await send({ message: 'surface' }, 'lang=ko');
    const all = patches(res.text);
    expect(
      (all[0].ops.find(op => op.slot === 'chat:typing' && 'html' in op) as { html: string }).html
    ).toContain('Typing...');
    const text = all
      .flatMap(patch => patch.ops)
      .filter(op => 'merge' in op)
      .map(op => (op as unknown as { merge: { text: string } }).merge.text)
      .join('');
    expect(text).toContain('A Surface is a TSX page function');
  }, 30000);
});
