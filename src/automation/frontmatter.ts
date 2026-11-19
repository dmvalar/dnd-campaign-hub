import { isMap, isNode, parseDocument } from "yaml";

/** Preserve authored YAML comments, BOM, line endings and body during relationship changes. */
export function updateAuthoringFrontmatter(content: string, update: (fields: Record<string, unknown>) => Record<string, unknown>): string {
  const opening = /^(\uFEFF?---[ \t]*(\r?\n))/.exec(content);
  if (!opening) throw new Error("Note has no YAML frontmatter");
  const rest = content.slice(opening[0].length);
  const closing = /^---[ \t]*(?:\r?\n|$)/m.exec(rest);
  if (!closing) throw new Error("Note has no closing frontmatter delimiter");
  const yaml = rest.slice(0, closing.index);
  const document = parseDocument(yaml, { uniqueKeys: true });
  if (document.errors.length || !isMap(document.contents)) throw new Error("Note frontmatter must be a valid YAML mapping");
  const original = document.toJS() as Record<string, unknown>;
  const next = update(structuredClone(original));
  let changed = false;
  for (const key of new Set([...Object.keys(original), ...Object.keys(next)])) {
    if (JSON.stringify(original[key]) === JSON.stringify(next[key])) continue;
    changed = true;
    if (next[key] === undefined) document.delete(key);
    else {
      const previous = document.get(key, true);
      const replacement = document.createNode(next[key]);
      if (isNode(previous) && isNode(replacement)) {
        replacement.comment = previous.comment;
        replacement.commentBefore = previous.commentBefore;
        replacement.spaceBefore = previous.spaceBefore;
      }
      document.set(key, replacement);
    }
  }
  if (!changed) return content;
  const eol = opening[2]!;
  return opening[0] + document.toString({ lineWidth: 0 }).replace(/\r?\n/g, eol) + rest.slice(closing.index);
}
