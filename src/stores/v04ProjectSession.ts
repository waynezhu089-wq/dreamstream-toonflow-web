import { defineStore } from "pinia";
import { ref } from "vue";
import axios from "@/utils/axios";

export type StudioSelection = { type: "ASSET" | "SHOT" | "PROJECT"; key: string } | null;
const savedScopeKey = "v04PilotScope";

export const useV04ProjectSession = defineStore("v04ProjectSession", () => {
  const state = ref<any>(null);
  const projects = ref<any[]>([]);
  const selected = ref<StudioSelection>(null);
  let generation = 0;

  const scope = () => state.value ? { projectId: Number(state.value.project.id), scriptId: Number(state.value.creative.scriptId) } : null;
  const isCurrent = (projectId: number, scriptId: number, token = generation) =>
    token === generation && scope()?.projectId === projectId && scope()?.scriptId === scriptId;

  async function loadProjects() {
    const response: any = await axios.post("/v04/projects", {});
    projects.value = response.data;
    return projects.value;
  }
  async function open(projectId: number, scriptId: number) {
    if (!Number.isSafeInteger(projectId) || !Number.isSafeInteger(scriptId) || projectId < 1 || scriptId < 1)
      throw new Error("项目或制作单元无效");
    const token = ++generation;
    const previous = scope();
    if (previous?.projectId !== projectId || previous?.scriptId !== scriptId) selected.value = null;
    const response: any = await axios.post("/v04/project/read", { projectId, scriptId });
    if (token !== generation) return null;
    state.value = response.data;
    sessionStorage.setItem(savedScopeKey, JSON.stringify({ projectId, scriptId }));
    return state.value;
  }
  async function reload() {
    const current = scope();
    return current ? open(current.projectId, current.scriptId) : null;
  }
  async function restore() {
    const raw = sessionStorage.getItem(savedScopeKey);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      return await open(Number(parsed.projectId), Number(parsed.scriptId));
    } catch {
      sessionStorage.removeItem(savedScopeKey);
      return null;
    }
  }
  function leave() { generation++; state.value = null; selected.value = null; }
  return { state, projects, selected, scope, isCurrent, loadProjects, open, reload, restore, leave };
});
