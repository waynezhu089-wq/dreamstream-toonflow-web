<template>
  <section class="recovery" v-if="state?.profile && state.profile.definition?.schemaVersion !== 1">
    <strong>生产工序恢复</strong> <button :disabled="busy" @click="load">刷新</button>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <article v-for="stage in state.stages || []" :key="stage.stageKey">
      <span>{{ stage.displayName }}：{{ stage.persistentState }} / {{ stage.availability }}</span>
      <span v-if="stage.entryGate && !stage.entryGate.pass">{{ stage.entryGate.reason }}</span>
      <span v-if="stage.exitGate && !stage.exitGate.pass">{{ stage.exitGate.reason }}</span>
      <button v-if="stage.availability === 'READY'" :disabled="busy" @click="act('start', stage.stageKey)">开始</button>
      <button v-if="stage.persistentState === 'IN_PROGRESS'" :disabled="busy || !stage.exitGate?.pass" @click="act('complete', stage.stageKey)">完成</button>
      <button v-if="stage.allowSkip && (stage.availability === 'READY' || stage.persistentState === 'IN_PROGRESS')" :disabled="busy" @click="skip(stage.stageKey)">跳过</button>
    </article>
  </section>
</template>
<script setup lang="ts">
import { ref, watch } from "vue";
import axios from "@/utils/axios";
const props = defineProps<{ projectId: number; scriptId: number; generation: number }>();
const emit = defineEmits<{ ready: [value: boolean] }>();
const state = ref<any>(null), busy = ref(false), error = ref("");
let request = 0;
const context = () => ({ projectId: props.projectId, scriptId: props.scriptId, generation: props.generation });
const same = (ctx: ReturnType<typeof context>) => ctx.projectId === props.projectId && ctx.scriptId === props.scriptId && ctx.generation === props.generation;
const post = async (path: string, body: unknown) => (await axios.post(path, body)).data;
async function load() {
  const id = ++request, ctx = context();
  try {
    const result = await post("/stageOrchestrator/read", { projectId: ctx.projectId, scriptId: ctx.scriptId });
    if (id !== request || !same(ctx)) return;
    state.value = result; error.value = "";
    emit("ready", result.stages?.some((stage: any) => stage.stageKey === "image-production" && stage.persistentState === "IN_PROGRESS") ?? false);
  } catch (value: any) { if (id === request && same(ctx)) { error.value = value?.message || "工序状态读取失败"; emit("ready", false); } }
}
async function act(action: "start" | "complete" | "skip", stageKey: string, reason: string | null = null) {
  const ctx = context(); busy.value = true;
  try {
    await post(`/stageOrchestrator/${action}`, { projectId: ctx.projectId, scriptId: ctx.scriptId, stageKey, actorType: "HUMAN", reason });
    if (same(ctx)) await load();
  } catch (value: any) { if (same(ctx)) { error.value = value?.message || "工序操作失败"; await load(); } }
  finally { if (same(ctx)) busy.value = false; }
}
function skip(stageKey: string) { const reason = window.prompt("跳过原因（进行中的工序必填）"); if (reason !== null) void act("skip", stageKey, reason.trim() || null); }
watch(() => [props.projectId, props.scriptId, props.generation], () => { ++request; state.value = null; emit("ready", false); void load(); }, { immediate: true });
defineExpose({ load });
</script>
<style scoped>
.recovery{max-height:300px;overflow-y:auto;padding:8px;color:var(--td-text-color-primary);background:var(--td-bg-color-container);border:1px solid var(--td-component-border)}
.recovery article{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:5px 0}.error{color:var(--td-error-color)}button{color:var(--td-text-color-primary);background:var(--td-bg-color-secondarycontainer);border:1px solid var(--td-component-border);cursor:pointer}
</style>
