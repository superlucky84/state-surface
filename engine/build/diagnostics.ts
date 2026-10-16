/**
 * Build-time diagnostic with the original source location. Vite shows `loc` in the dev
 * overlay and fails production builds; the message already names `file:line:column`.
 */
export class SurfaceBuildError extends Error {
  readonly id?: string;
  readonly loc?: { file: string; line: number; column: number };
  readonly frame?: string;
  readonly plugin = 'state-surface';

  constructor(
    message: string,
    where: { file?: string; code?: string; offset?: number; hint?: string } = {}
  ) {
    const position =
      where.file && where.code !== undefined && where.offset !== undefined
        ? locate(where.code, where.offset)
        : undefined;
    const prefix = where.file
      ? `${where.file}${position ? `:${position.line}:${position.column + 1}` : ''}: `
      : '';
    super(`[state-surface] ${prefix}${message}${where.hint ? `\n  hint: ${where.hint}` : ''}`);
    this.name = 'SurfaceBuildError';
    this.id = where.file;
    if (where.file && position) {
      this.loc = { file: where.file, ...position };
      this.frame = codeFrame(where.code!, position.line);
    }
  }
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

function codeFrame(code: string, line: number) {
  const lines = code.split('\n');
  return lines
    .slice(Math.max(0, line - 2), line + 1)
    .map((text, i) => {
      const number = Math.max(1, line - 1) + i;
      return `${number === line ? '>' : ' '} ${String(number).padStart(4)} | ${text}`;
    })
    .join('\n');
}
