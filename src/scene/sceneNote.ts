import { parseYaml, stringifyYaml } from "obsidian";

interface SceneDetails {
  name: string;
  adventure: string;
  campaign: string;
  world: string;
  act: number | string;
  scene_number: number;
  duration: string;
  scene_type: string;
  difficulty: string;
}

export function readSceneNote(content: string) {
  const opening = /^(\uFEFF?---[ \t]*(\r?\n))/.exec(content);
  if (!opening) throw new Error("Scene note has no YAML frontmatter.");

  const rest = content.slice(opening[0].length);
  const closing = /^---[ \t]*(?:\r?\n|$)/m.exec(rest);
  if (!closing) throw new Error("Scene note has no closing frontmatter delimiter.");

  const frontmatter: unknown = parseYaml(rest.slice(0, closing.index));
  if (!frontmatter || typeof frontmatter !== "object" || Array.isArray(frontmatter)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(frontmatter))) {
    throw new Error("Scene frontmatter must be a YAML mapping.");
  }

  return {
    frontmatter: frontmatter as Record<string, unknown>,
    opening: opening[0],
    closing: closing[0],
    eol: opening[2]!,
    body: rest.slice(closing.index + closing[0].length),
  };
}

function capitalized(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function durationLine(duration: unknown, type: string, difficulty: unknown) {
  return `**Duration:** ${duration} | **Type:** ${type} | **Difficulty:** ${difficulty}`;
}

function actLine(act: unknown, adventure: unknown) {
  return `**Act:** ${act} | **Adventure:** [[${adventure}]]`;
}

function updateGeneratedOverview(
  body: string, current: Record<string, unknown>, next: SceneDetails, originalTitle: string,
) {
  const lines = body.split(/(\r?\n)/);
  const title = lines.findIndex((line, index) => index % 2 === 0 && line.trim() !== "");
  if (title < 0) return body;

  const filenameHeading = /^Scene \d+ - (.+)$/.exec(originalTitle);
  const number = current.scene_number ?? /^Scene (\d+) - /.exec(originalTitle)?.[1];
  const generatedHeadings = [filenameHeading?.[1] ?? originalTitle, current.name]
    .filter((name): name is string => typeof name === "string")
    .map(name => `# Scene ${number}: ${name}`);
  if (!generatedHeadings.includes(lines[title]!)) return body;

  lines[title] = `# Scene ${next.scene_number}: ${next.name}`;
  const duration = lines.findIndex((line, index) => index > title && index % 2 === 0 && line.trim() !== "");
  const oldType = current.scene_type ?? current.type;
  if (duration !== -1 && typeof oldType === "string") {
    const expected = [oldType, capitalized(oldType)];
    const typeStyle = expected.findIndex(type => lines[duration]!.trimEnd() === durationLine(current.duration, type, current.difficulty));
    if (typeStyle !== -1) {
      const nextType = typeStyle === 0 ? next.scene_type : capitalized(next.scene_type);
      const trailing = lines[duration]!.match(/[ \t]*$/)?.[0] ?? "";
      lines[duration] = durationLine(next.duration, nextType, next.difficulty) + trailing;
      if (lines[duration + 2] === actLine(current.act, current.adventure)) {
        lines[duration + 2] = actLine(next.act, next.adventure);
      }
    }
  }
  return lines.join("");
}

export function updateSceneNote(
  content: string, details: SceneDetails, originalTitle: string,
  getEncounterFields: (current: Record<string, unknown>) => Record<string, unknown>,
) {
  const note = readSceneNote(content);
  const { name, ...fields } = details;
  const updated: Record<string, unknown> = { ...note.frontmatter, ...fields, ...getEncounterFields(note.frontmatter) };
  if (Object.prototype.hasOwnProperty.call(note.frontmatter, "name")) updated.name = name;
  const yaml = stringifyYaml(updated).replace(/\r?\n/g, note.eol);
  const separator = yaml.endsWith(note.eol) ? "" : note.eol;
  const body = updateGeneratedOverview(note.body, note.frontmatter, details, originalTitle);
  return `${note.opening}${yaml}${separator}${note.closing}${body}`;
}
