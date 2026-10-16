import type { SurfaceContext } from 'state-surface/server';

export type Message = { id: string; role: 'user' | 'bot'; text: string };

/**
 * Demo conversation store. The server is stateless per request (DC-10): every transition
 * starts from an empty slot state and reads what it needs from a server source. A real app
 * would use a database; this demo keeps a small in-memory map keyed by a session cookie.
 */
const sessions = new Map<string, Message[]>();
const MAX_SESSIONS = 500;
const MAX_MESSAGES = 50;
const COOKIE = 'chat_session';

function sessionId(ctx: SurfaceContext, create: boolean) {
  let id = ctx.cookies.get(COOKIE);
  if (!id && create) {
    id = crypto.randomUUID();
    ctx.cookies.set(COOKIE, id, { httpOnly: true, maxAge: 60 * 60 * 24 });
  }
  return id;
}

export function readHistory(ctx: SurfaceContext): Message[] {
  const id = sessionId(ctx, false);
  return id ? [...(sessions.get(id) ?? [])] : [];
}

/** Append a message (setting the session cookie on first use) and return the history. */
export function appendMessage(ctx: SurfaceContext, message: Message): Message[] {
  const id = sessionId(ctx, true)!;
  const history = [...(sessions.get(id) ?? []), message].slice(-MAX_MESSAGES);
  sessions.delete(id);
  sessions.set(id, history);
  if (sessions.size > MAX_SESSIONS) sessions.delete(sessions.keys().next().value!);
  return [...history];
}
