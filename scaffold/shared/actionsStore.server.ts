import type { SurfaceContext } from 'state-surface/server';

export type Comment = { id: string; body: string; at: number };
type Board = { comments: Comment[]; likes: number };

/**
 * Demo store for the actions example (comments and likes). The server keeps no slot state
 * between requests (DC-10); transitions and server components read this source instead. A
 * real app would use a database; this keeps a small in-memory map per session cookie.
 */
const sessions = new Map<string, Board>();
const MAX_SESSIONS = 500;
const MAX_COMMENTS = 20;
const COOKIE = 'actions_session';

function board(ctx: SurfaceContext, create: boolean): Board {
  let id = ctx.cookies.get(COOKIE);
  if (!id && create) {
    id = crypto.randomUUID();
    ctx.cookies.set(COOKIE, id, { httpOnly: true, maxAge: 60 * 60 * 24 });
  }
  if (!id) return { comments: [], likes: 0 };
  let entry = sessions.get(id);
  if (!entry) {
    if (!create) return { comments: [], likes: 0 };
    entry = { comments: [], likes: 0 };
    sessions.set(id, entry);
    if (sessions.size > MAX_SESSIONS) sessions.delete(sessions.keys().next().value!);
  }
  return entry;
}

export function readBoard(ctx: SurfaceContext): Board {
  const entry = board(ctx, false);
  return { comments: [...entry.comments], likes: entry.likes };
}

export function addComment(ctx: SurfaceContext, body: string): Comment[] {
  const entry = board(ctx, true);
  entry.comments = [...entry.comments, { id: crypto.randomUUID(), body, at: Date.now() }].slice(
    -MAX_COMMENTS
  );
  return [...entry.comments];
}

export function addLikes(ctx: SurfaceContext, delta: number): number {
  const entry = board(ctx, true);
  entry.likes += delta;
  return entry.likes;
}
