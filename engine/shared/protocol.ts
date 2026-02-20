// ── Types ──

export type StateFrameState = {
  type: 'state';
  states: Record<string, any>;
  full?: boolean;
  accumulate?: boolean;
  changed?: string[];
  removed?: string[];
};

export type StateFrameError = {
  type: 'error';
  message?: string;
  template?: string;
  data?: any;
};

export type StateFrameDone = {
  type: 'done';
};

export type StateFrame = StateFrameState | StateFrameError | StateFrameDone;

// ── Validation ──

export type ValidationResult =
  | { valid: true }
  | { valid: false; reason: string };

export function validateStateFrame(frame: unknown): ValidationResult {
  if (typeof frame !== 'object' || frame === null) {
    return { valid: false, reason: 'Frame must be a non-null object' };
  }

  const f = frame as Record<string, unknown>;

  if (!('type' in f)) {
    return { valid: false, reason: 'Frame must have a "type" field' };
  }

  if (f.type === 'done') {
    return { valid: true };
  }

  if (f.type === 'error') {
    return { valid: true };
  }

  if (f.type === 'state') {
    return validateStateFrameState(f);
  }

  return { valid: false, reason: `Unknown frame type: "${String(f.type)}"` };
}

function validateStateFrameState(f: Record<string, unknown>): ValidationResult {
  // states is required and must be an object
  if (typeof f.states !== 'object' || f.states === null || Array.isArray(f.states)) {
    return { valid: false, reason: '"states" must be a non-null object' };
  }

  const accumulate = f.accumulate;

  // Accumulate frame: removed is not allowed
  if (accumulate === true) {
    if (f.removed !== undefined) {
      return { valid: false, reason: 'Accumulate frame must not include "removed"' };
    }
    return { valid: true };
  }

  const states = f.states as Record<string, unknown>;
  const full = f.full;
  const changed = f.changed as string[] | undefined;
  const removed = f.removed as string[] | undefined;

  // If full !== false, treat as full — ignore changed/removed
  if (full !== false) {
    return { valid: true };
  }

  // full === false: partial frame rules
  if (changed !== undefined && !Array.isArray(changed)) {
    return { valid: false, reason: '"changed" must be an array when present' };
  }

  if (removed !== undefined && !Array.isArray(removed)) {
    return { valid: false, reason: '"removed" must be an array when present' };
  }

  const hasChanged = Array.isArray(changed) && changed.length > 0;
  const hasRemoved = Array.isArray(removed) && removed.length > 0;

  // At least one of changed or removed is required
  if (!hasChanged && !hasRemoved) {
    return {
      valid: false,
      reason: 'Partial frame (full:false) requires at least one of "changed" or "removed"',
    };
  }

  // changed keys must exist in states
  if (hasChanged) {
    for (const key of changed!) {
      if (!(key in states)) {
        return {
          valid: false,
          reason: `"changed" key "${key}" must exist in "states"`,
        };
      }
    }
  }

  // removed keys must NOT exist in states
  if (hasRemoved) {
    for (const key of removed!) {
      if (key in states) {
        return {
          valid: false,
          reason: `"removed" key "${key}" must NOT exist in "states"`,
        };
      }
    }
  }

  // A key cannot appear in both changed and removed
  if (hasChanged && hasRemoved) {
    const changedSet = new Set(changed!);
    for (const key of removed!) {
      if (changedSet.has(key)) {
        return {
          valid: false,
          reason: `Key "${key}" cannot appear in both "changed" and "removed"`,
        };
      }
    }
  }

  return { valid: true };
}

// ── Accumulate Merge ──

function mergeAccumulateSlot(existing: any, incoming: any): any {
  if (existing === undefined || existing === null) return incoming;
  if (typeof existing !== 'object' || typeof incoming !== 'object') return incoming;

  const result: Record<string, any> = { ...existing };
  for (const [k, v] of Object.entries(incoming as Record<string, any>)) {
    const e = existing[k];
    if (Array.isArray(e) && Array.isArray(v)) {
      result[k] = [...e, ...v];
    } else if (typeof e === 'string' && typeof v === 'string') {
      result[k] = e + v;
    } else {
      result[k] = v;
    }
  }
  return result;
}

// ── Apply Logic ──

export function applyFrame(
  activeStates: Record<string, any>,
  frame: StateFrameState
): Record<string, any> {
  // Accumulate frame: merge delta into existing slot state
  if (frame.accumulate === true) {
    const next = { ...activeStates };
    for (const [key, incoming] of Object.entries(frame.states)) {
      next[key] = mergeAccumulateSlot(next[key], incoming);
    }
    return next;
  }

  if (frame.full !== false) {
    // Full frame: replace entirely
    return { ...frame.states };
  }

  // Partial frame: removed first, then changed merge
  const next = { ...activeStates, ...frame.states };
  if (frame.removed) {
    for (const key of frame.removed) {
      delete next[key];
    }
  }
  return next;
}
