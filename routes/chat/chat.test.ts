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
    expect(res.text).not.toContain('name="history"');
  });

  it('GET /chat with lang=ko renders Korean content', async () => {
    const res = await request(app).get('/chat').set('Cookie', 'lang=ko');

    expect(res.status).toBe(200);
    expect(res.text).toContain('메시지를 보내');
    expect(res.text).toContain('메시지를 입력하세요');
  });
});

describe('POST /transition/chat — accumulate frame sequence', () => {
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

  it('server sends accumulate frames — user message appended via accumulate', async () => {
    const res = await request(app)
      .post('/transition/chat')
      .send({ message: 'surface', lang: 'en' })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(200);
    const lines = res.text
      .trim()
      .split('\n')
      .map((l: string) => JSON.parse(l));

    // Frame 0: full frame — initializes chat:current to empty, shows typing indicator
    const firstFrame = lines[0];
    expect(firstFrame.full).not.toBe(false);
    expect(firstFrame.accumulate).not.toBe(true);
    expect(firstFrame.states['chat:current']).toEqual({ text: '' });
    expect(firstFrame.states['chat:typing']).toBeDefined();

    // Frame 1: accumulate — appends user message to chat:messages.messages[]
    const userAccumulate = lines[1];
    expect(userAccumulate.accumulate).toBe(true);
    expect(userAccumulate.states['chat:messages'].messages).toHaveLength(1);
    expect(userAccumulate.states['chat:messages'].messages[0].role).toBe('user');
    expect(userAccumulate.states['chat:messages'].messages[0].text).toBe('surface');

    // Streaming frames: accumulate with chat:current.text (delta chars)
    const streamingFrames = lines.slice(2, -3);
    expect(streamingFrames.length).toBeGreaterThan(0);
    for (const frame of streamingFrames) {
      expect(frame.accumulate).toBe(true);
      expect(frame.states['chat:current']).toHaveProperty('text');
      expect(typeof frame.states['chat:current'].text).toBe('string');
    }

    // Second-to-last state frame: accumulate bot message into chat:messages
    const botAccumulate = lines[lines.length - 3];
    expect(botAccumulate.accumulate).toBe(true);
    expect(botAccumulate.states['chat:messages'].messages).toHaveLength(1);
    expect(botAccumulate.states['chat:messages'].messages[0].role).toBe('bot');

    // Partial remove: clears chat:current and chat:typing
    const removeFrame = lines[lines.length - 2];
    expect(removeFrame.full).toBe(false);
    expect(removeFrame.removed).toContain('chat:current');
    expect(removeFrame.removed).toContain('chat:typing');

    expect(lines[lines.length - 1].type).toBe('done');
  }, 30000);

  it('server does not receive or echo back history — stateless server', async () => {
    const res = await request(app)
      .post('/transition/chat')
      .send({ message: 'action', lang: 'en' })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(200);
    const lines = res.text
      .trim()
      .split('\n')
      .map((l: string) => JSON.parse(l));

    // User message appended via accumulate (frame 1)
    expect(lines[1].accumulate).toBe(true);
    expect(lines[1].states['chat:messages'].messages[0].text).toBe('action');
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

    // Full frame contains Korean typing indicator
    expect(lines[0].states['chat:typing'].text).toBe('입력 중...');

    // Bot accumulate frame contains Korean text
    const botAccumulate = lines[lines.length - 3];
    expect(botAccumulate.accumulate).toBe(true);
    expect(botAccumulate.states['chat:messages'].messages[0].text).toMatch(/[가-힣]/);
  }, 30000);
});
