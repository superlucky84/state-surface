import { readFile } from 'node:fs/promises';

/**
 * Build-time diagnostic with the original source location. Vite shows `loc` in the dev
 * overlay and fails production builds; the message already names `file:line:column`.
 */
export class SurfaceBuildError extends Error {
  /** The message without location and hint (kept to relocate it, e.g. MDX → source). */
  readonly reason: string;
  readonly hint?: string;
  readonly id?: string;
  readonly loc?: { file: string; line: number; column: number };
  readonly frame?: string;
  readonly plugin = 'state-surface';

  constructor(
    message: string,
    where: {
      file?: string;
      code?: string;
      offset?: number;
      /** 1-based line and column, e.g. from a stack frame (needs `code` for the frame). */
      line?: number;
      column?: number;
      hint?: string;
    } = {}
  ) {
    const offset =
      where.offset ??
      (where.code !== undefined && where.line !== undefined
        ? offsetOf(where.code, where.line, where.column ?? 1)
        : undefined);
    const position =
      where.file && where.code !== undefined && offset !== undefined
        ? locate(where.code, offset)
        : undefined;
    const prefix = where.file
      ? `${where.file}${position ? `:${position.line}:${position.column + 1}` : ''}: `
      : '';
    super(`[state-surface] ${prefix}${message}${where.hint ? `\n  hint: ${where.hint}` : ''}`);
    this.name = 'SurfaceBuildError';
    this.reason = message;
    this.hint = where.hint;
    this.id = where.file;
    if (where.file && position) {
      this.loc = { file: where.file, ...position };
      this.frame = codeFrame(where.code!, position.line, position.column);
    }
  }
}

function offsetOf(code: string, line: number, column: number) {
  let offset = 0;
  for (let current = 1; current < line; current++) {
    const next = code.indexOf('\n', offset);
    if (next < 0) break;
    offset = next + 1;
  }
  return offset + Math.max(0, column - 1);
}

export function locate(code: string, offset: number) {
  let line = 1;
  let start = 0;
  for (let i = 0; i < offset && i < code.length; i++)
    if (code.charCodeAt(i) === 10) {
      line++;
      start = i + 1;
    }
  return { line, column: offset - start };
}

function codeFrame(code: string, line: number, column: number) {
  const lines = code.split('\n');
  return lines
    .slice(Math.max(0, line - 2), line + 1)
    .flatMap((text, i) => {
      const number = Math.max(1, line - 1) + i;
      const row = `${number === line ? '>' : ' '} ${String(number).padStart(4)} | ${text}`;
      if (number !== line) return [row];
      // The caret keeps tabs so it lines up under the source column.
      const indent = text.slice(0, column).replace(/[^\t]/g, ' ');
      return [row, `       | ${indent}^`];
    })
    .join('\n');
}

/**
 * Location for file-level rules (route collisions, duplicate names): the module's default
 * export, or its first line.
 */
export async function atDefaultExport(file: string) {
  const code = await readFile(file, 'utf8').catch(() => undefined);
  if (code === undefined) return { file };
  const match = /^export\s+default\b/m.exec(code);
  return { file, code, offset: match?.index ?? 0 };
}
