import type { Request, Response } from 'express';

export interface BeforeTransitionContext {
  name: string;
  body: Record<string, unknown>;
  req: Request;
  res: Response;
}

export interface AfterTransitionContext {
  name: string;
  req: Request;
  res: Response;
}

export interface TransitionHooks {
  onBeforeTransition?(
    ctx: BeforeTransitionContext
  ): Record<string, unknown> | Promise<Record<string, unknown>>;
  onAfterTransition?(ctx: AfterTransitionContext): void | Promise<void>;
}
