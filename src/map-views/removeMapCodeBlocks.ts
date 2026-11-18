const blankLine = /^[ \t]*$/;
const literalBlockDelimiters = [
  { open: /^ {0,3}<!\[CDATA\[/, close: /\]\]>/ },
  { open: /^ {0,3}<\?/, close: /\?>/ },
  { open: /^ {0,3}<![A-Z]/i, close: />/ },
  { open: /^ {0,3}<\/?[a-z][\w-]*(?=[ \t/>]|$)/i, close: blankLine },
];

type CommentEnd = "-->" | "%%";

function findOpenComment(line: string, end?: CommentEnd): CommentEnd | undefined {
  const commentStarts = /<!--|%%/g;
  let offset = 0;
  while (true) {
    if (end) {
      const closing = line.indexOf(end, offset);
      if (closing === -1) return end;
      offset = closing + end.length;
    }
    commentStarts.lastIndex = offset;
    const opening = commentStarts.exec(line);
    if (!opening) return undefined;
    end = opening[0] === "<!--" ? "-->" : "%%";
    offset = commentStarts.lastIndex;
  }
}

function hasMapId(source: string, mapId: string): boolean {
  try {
    const config: unknown = JSON.parse(source);
    return config !== null && typeof config === "object" && !Array.isArray(config)
      && Object.prototype.hasOwnProperty.call(config, "mapId")
      && (config as { mapId: unknown }).mapId === mapId;
  } catch {
    return false;
  }
}

export function removeMapCodeBlocks(document: string, mapId: string): string {
  if (!mapId) return document;

  const lines = /([^\r\n]*)(?:\r\n|[\r\n]|$)/g;
  const start = document.startsWith("\uFEFF") ? 1 : 0;
  lines.lastIndex = start;

  let fence: { marker: string; start: number; bodyStart: number; isMap: boolean } | undefined;
  let literalEnd: RegExp | undefined;
  let commentEnd: CommentEnd | undefined;
  let listIndent = 0;
  let preservedFrom = 0;
  const preserved: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = lines.exec(document)) && match[0]) {
    const line = match[1]!;
    if (literalEnd) {
      if (literalEnd.test(line)) literalEnd = undefined;
      continue;
    }
    if (commentEnd) {
      commentEnd = findOpenComment(line, commentEnd);
      continue;
    }
    if (listIndent) {
      const indent = /^[ \t]*/.exec(line)![0];
      if (indent.length >= listIndent || indent.includes("\t") || blankLine.test(line)) continue;
      listIndent = 0;
    }

    const delimiter = /^( {0,3})(`{3,}|~{3,})([^\r\n]*)$/.exec(line);
    if (fence) {
      if (!delimiter) continue;
      const [, indent, marker, info] = delimiter;
      if (marker![0] !== fence.marker[0] || marker!.length < fence.marker.length || !blankLine.test(info!)) continue;

      // Keep the closing line's line ending and every byte outside the block.
      if (!indent && fence.isMap && hasMapId(document.slice(fence.bodyStart, match.index), mapId)) {
        preserved.push(document.slice(preservedFrom, fence.start));
        preservedFrom = match.index + line.length;
      }
      fence = undefined;
      continue;
    }

    if (match.index === start && /^---[ \t]*$/.test(line)) {
      literalEnd = /^---[ \t]*$/;
      continue;
    }

    if (delimiter) {
      const [, indent, marker, info] = delimiter;
      if (marker![0] === "`" && info!.includes("`")) continue;
      fence = {
        marker: marker!,
        start: match.index,
        bodyStart: lines.lastIndex,
        // Track indented fences as context and restrict edits to standalone fences.
        isMap: !indent && /^[ \t]*dnd-map[ \t]*$/.test(info!),
      };
      continue;
    }

    // A fence on a list marker line is opaque through its indented continuation.
    const listMarker = /^ {0,3}(?:[-+*]|\d{1,9}[.)])[ \t]+(?=`{3,}|~{3,})/.exec(line);
    if (listMarker) {
      listIndent = listMarker[0].length;
      continue;
    }

    const rawTag = /^ {0,3}<(pre|script|style|textarea)(?=[ \t/>]|$)/i.exec(line);
    if (rawTag) {
      const close = new RegExp(`</${rawTag[1]}[ \\t]*>`, "i");
      if (!close.test(line)) literalEnd = close;
      continue;
    }

    commentEnd = findOpenComment(line);
    if (commentEnd) continue;

    const literal = literalBlockDelimiters.find(({ open }) => open.test(line));
    if (literal && !literal.close.test(line)) literalEnd = literal.close;
  }

  preserved.push(document.slice(preservedFrom));
  return preserved.join("");
}
