import { reactive } from "vue";

const selected = reactive<Record<number, number>>({});
export function unitId(value: unknown): number | null {
  if (Array.isArray(value) || value === null || value === undefined || value === "") return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
export function currentAdvertisementUnit(projectId: unknown, query?: unknown): number | null {
  const project = unitId(projectId);
  if (!project) return null;
  return query === undefined ? selected[project] ?? null : unitId(query);
}
export function selectAdvertisementUnit(projectId: unknown, scriptId: unknown) {
  const project = unitId(projectId), script = unitId(scriptId);
  if (project && script) selected[project] = script;
}
export function advertisementLocation(path: string, projectId: unknown, query?: unknown) {
  const scriptId = currentAdvertisementUnit(projectId, query);
  return { path, query: scriptId ? { scriptId: String(scriptId) } : {} };
}
