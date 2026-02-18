import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../../server/index.js';

describe('GET /chat — SSR initial render', () => {
  it('returns 200 with all chat surface anchors', async () => {
    const res = await request(app).get('/chat');

    expect(res.status).toBe(200);
    expect(res.text).toContain('name="chat:messages"');
    expect(res.text).toContain('name="chat:current"');
    expect(res.text).toContain('name="chat:typing"');
    expect(res.text).toContain('name="chat:input"');
    expect(res.text).toContain('name="page:header"');
  });

  it('SSR fills initial state — welcome text and input placeholder', async () => {
    const res = await request(app).get('/chat');

    expect(res.status).toBe(200);
    expect(res.text).toContain('Send a message to start the conversation');
    expect(res.text).toContain('Type a message...');
    // No history field in the form
    expect(res.text).not.toContain('name="history"');
  });

  it('GET /chat with lang=ko renders Korean content', async () => {
    const res = await request(app).get('/chat').set('Cookie', 'lang=ko');

    expect(res.status).toBe(200);
    expect(res.text).toContain('메시지를 보내');
    expect(res.text).toContain('메시지를 입력하세요');
  });
});

describe('POST /transition/chat — frame sequence', () => {
  it('empty message yields only done', async () => {
    const res = await request(app)
      .post('/transition/chat')
      .send({ message: '', lang: 'en' })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(200);
    const lines = res.text
      .trim()
      .split('\n')
      .map((l: string) => JSON.parse(l));

    expect(lines).toHaveLength(1);
    expect(lines[0].type).toBe('done');
  });

  it('server sends append operations — never the full history array', async () => {
    const res = await request(app)
      .post('/transition/chat')
      .send({ message: 'surface', lang: 'en' })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(200);
    const lines = res.text
      .trim()
      .split('\n')
      .map((l: string) => JSON.parse(l));

    // Full frame: chat:messages carries only { append: userMsg }, NOT { messages: [...] }
    const firstFrame = lines[0];
    expect(firstFrame.full).not.toBe(false);
    expect(firstFrame.states['chat:messages']).toHaveProperty('append');
    expect(firstFrame.states['chat:messages']).not.toHaveProperty('messages');
    expect(firstFrame.states['chat:messages'].append.role).toBe('user');
    expect(firstFrame.states['chat:messages'].append.text).toBe('surface');

    // Streaming partial frames: only chat:current (delta), no chat:messages
    const streamingFrames = lines.slice(1, -2);
    expect(streamingFrames.length).toBeGreaterThan(0);
    for (const frame of streamingFrames) {
      expect(frame.changed).toEqual(['chat:current']);
      expect(frame.states['chat:current']).toHaveProperty('delta');
      expect(frame.states['chat:current']).not.toHaveProperty('text');
      expect(frame.states).not.toHaveProperty('chat:messages');
    }

    // Final partial: append bot message, remove chat:current + chat:typing
    const finalPartial = lines[lines.length - 2];
    expect(finalPartial.full).toBe(false);
    expect(finalPartial.states['chat:messages']).toHaveProperty('append');
    expect(finalPartial.states['chat:messages']).not.toHaveProperty('messages');
    expect(finalPartial.states['chat:messages'].append.role).toBe('bot');
    expect(finalPartial.removed).toContain('chat:current');
    expect(finalPartial.removed).toContain('chat:typing');

    // No history field anywhere in the stream
    const allJson = res.text;
    expect(allJson).not.toContain('"history"');

    expect(lines[lines.length - 1].type).toBe('done');
  }, 30000);

  it('server does not receive or echo back history', async () => {
    // Send without history param — server should work fine
    const res = await request(app)
      .post('/transition/chat')
      .send({ message: 'action', lang: 'en' })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(200);
    const lines = res.text
      .trim()
      .split('\n')
      .map((l: string) => JSON.parse(l));

    // Full frame still has append (not messages array)
    expect(lines[0].states['chat:messages'].append.text).toBe('action');
  }, 30000);

  it('Korean language: typing and bot response in Korean', async () => {
    const res = await request(app)
      .post('/transition/chat')
      .send({ message: 'surface', lang: 'ko' })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(200);
    const lines = res.text
      .trim()
      .split('\n')
      .map((l: string) => JSON.parse(l));

    expect(lines[0].states['chat:typing'].text).toBe('입력 중...');

    const finalPartial = lines[lines.length - 2];
    expect(finalPartial.states['chat:messages'].append.text).toMatch(/[가-힣]/);
  }, 30000);
});
