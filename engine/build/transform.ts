import MagicString from 'magic-string';
import type { SurfaceAnalyzer } from './app.js';

export const ISLAND_LOCAL = '__SurfaceIsland';
const ISLAND_IMPORT = `import { Island as ${ISLAND_LOCAL} } from 'state-surface/internal/island';\n`;

/**
 * Call-site transform (DESIGN 3장). Lithent runs components while JSX is evaluated, so
 * directive islands and Slot children become `<__SurfaceIsland __ssComponent={C} …>`
 * descriptors and the engine decides when the component runs. Attributes stay in place,
 * so only tag names change and the source map stays precise.
 */
export async function transformSurface(code: string, file: string, analyzer: SurfaceAnalyzer) {
  const analysis = await analyzer.module(file, code);
  if (!analysis) return null;
  for (const element of analysis.elements)
    await analyzer.checkElement(element.local, element.binding, file, code, element.offset);
  if (!analysis.islands.length) return null;

  const output = new MagicString(code);
  let descriptors = 0;
  for (const use of analysis.islands) {
    const target = await analyzer.resolveBinding(use.binding, file, code, use.offset);
    await analyzer.checkUse(use, target, file, code);
    const id = JSON.stringify(analyzer.componentId(target, use.binding));
    if (use.kind === 'slot-component') {
      output.appendLeft(use.nameEnd, ` __ssComponentId={${id}}`);
      continue;
    }
    descriptors++;
    output.overwrite(
      use.nameStart,
      use.nameEnd,
      `${ISLAND_LOCAL} __ssComponent={${use.local}} __ssId={${id}}`
    );
    if (use.closeStart !== undefined) output.overwrite(use.closeStart, use.closeEnd!, ISLAND_LOCAL);
  }
  if (descriptors) output.prepend(ISLAND_IMPORT);
  return {
    code: output.toString(),
    map: output.generateMap({ hires: true, source: file, includeContent: true }),
  };
}
