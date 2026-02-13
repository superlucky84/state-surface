import { readdir } from 'node:fs/promises';
import path from 'node:path';

const MODULE_EXTS = new Set(['.ts', '.tsx', '.js', '.mjs']);

export async function listFiles(dir: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(full)));
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
  return files;
}

export function isModuleFile(file: string): boolean {
  if (file.endsWith('.d.ts')) return false;
  if (file.includes('.test.')) return false;
  const ext = path.extname(file);
  return MODULE_EXTS.has(ext);
}

export function hasSegment(file: string, segment: string): boolean {
  return file.split(/[/\\]/).includes(segment);
}
