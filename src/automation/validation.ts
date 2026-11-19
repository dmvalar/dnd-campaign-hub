export function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

interface StringOptions { optional?: boolean; maxLength?: number }
export function string(value: unknown, label: string, options: StringOptions & { optional: true }): string | undefined;
export function string(value: unknown, label: string, options?: StringOptions & { optional?: false }): string;
export function string(value: unknown, label: string, options: StringOptions = {}): string | undefined {
  if (value === undefined && options.optional) return undefined;
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a nonempty string`);
  if (value.length > (options.maxLength ?? 100_000)) throw new Error(`${label} is too long`);
  return value;
}

interface NumberOptions { optional?: boolean; integer?: boolean; min?: number; max?: number }
export function finiteNumber(value: unknown, label: string, options: NumberOptions & { optional: true }): number | undefined;
export function finiteNumber(value: unknown, label: string, options?: NumberOptions & { optional?: false }): number;
export function finiteNumber(value: unknown, label: string, options: NumberOptions = {}): number | undefined {
  if (value === undefined && options.optional) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)
    || (options.integer && !Number.isSafeInteger(value))
    || (options.min !== undefined && value < options.min)
    || (options.max !== undefined && value > options.max)) throw new Error(`${label} must be a valid${options.integer ? " integer" : " number"}${options.min !== undefined ? ` >= ${options.min}` : ""}${options.max !== undefined ? ` <= ${options.max}` : ""}`);
  return value;
}

export function boolean(value: unknown, label: string, defaultValue = false): boolean {
  if (value === undefined) return defaultValue;
  if (typeof value !== "boolean") throw new Error(`${label} must be true or false`);
  return value;
}

export function assertKeys(value: Record<string, unknown>, allowed: readonly string[], label: string): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) throw new Error(`${label}: unknown field "${key}"`);
  }
}

export function safeName(value: unknown, label = "name"): string {
  const name = string(value, label, { maxLength: 120 }).trim();
  if (/[\\/:*?"<>|\[\]#^\x00-\x1f]/.test(name) || /[. ]$/.test(name)
    || name === "." || name === ".." || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) {
    throw new Error(`${label} contains characters or a name unsuitable for a note filename`);
  }
  return name;
}

/** Vault-relative paths only; never resolve arbitrary local files or URLs. */
export function vaultPath(value: unknown, label = "path"): string {
  const path = string(value, label, { maxLength: 1024 });
  if (path !== path.trim() || path.startsWith("/") || path.includes("\\")
    || /[:*?"<>|\x00-\x1f]/.test(path) || path.split("/").some(part => !part || part === "." || part === ".." || /[. ]$/.test(part))) {
    throw new Error(`${label} must be a normalized vault-relative path`);
  }
  return path;
}

export function within(path: string, folder: string): boolean {
  return path === folder || path.startsWith(`${folder}/`);
}

export function identifier(value: unknown, label: string): string {
  const id = string(value, label, { maxLength: 100 });
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(id)) throw new Error(`${label} must contain letters, digits, underscores or hyphens`);
  return id;
}
