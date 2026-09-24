import { toRaw } from "vue";

export function cloneSkillContent<T>(value: T): T {
  return JSON.parse(JSON.stringify(toRaw(value)));
}

export type SkillFieldChange = { field: string; changeType: "ADDED" | "MODIFIED" | "REMOVED"; before: unknown; after: unknown; accepted: boolean };

export function mergeAcceptedSkillChanges<T extends Record<string, unknown>>(base: T, changes: SkillFieldChange[]): T {
  const result = cloneSkillContent(base);
  for (const change of changes) if (change.accepted) (result as Record<string, unknown>)[change.field] = cloneSkillContent(change.after);
  return result;
}
