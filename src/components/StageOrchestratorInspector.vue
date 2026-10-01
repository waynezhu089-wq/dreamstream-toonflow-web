<template>
  <section class="inspector" aria-label="Stage Orchestrator Inspector">
    <h2>Stage Orchestrator Inspector</h2>
    <p class="note">001A Inspector 目前不替代现有 Production Flow，也不作为现有生成接口硬 Gate。</p>
    <p v-if="error" role="alert" class="error">{{ error }}</p>
    <template v-if="state">
      <p v-if="state.profile">当前 Profile：<strong>{{ state.profile.profileKey }} @ {{ state.profile.version }}</strong> · {{ state.profile.status }} · {{ state.profile.source }} <span v-if="!state.profile.persisted">（尚未持久绑定）</span></p>
      <p v-else>当前项目尚未由 Production Profile 管理。</p>
      <button v-if="state.profile?.source === 'LEGACY_ADAPTER' && !state.profile.persisted" :disabled="busy" @click="adopt">Adopt 当前精确版本</button>
      <button :disabled="busy" @click="load">刷新 Stage 状态</button>
      <p v-if="state.readyStages?.length">可开始：{{ state.readyStages.join('、') }}</p>
      <article v-for="stage in state.stages || []" :key="stage.stageKey" class="stage">
        <h3>{{ stage.displayName }} <small>{{ stage.stageKey }}</small></h3>
        <p>{{ stage.persistentState }} · {{ stage.availability }} · {{ stage.required ? '必需' : '可选' }}</p>
        <p>前置：{{ stage.predecessorKeys.length ? stage.predecessorKeys.join('、') : '无' }}；下一步：{{ stage.nextStageKeys.length ? stage.nextStageKeys.join('、') : '无' }}</p>
        <p>入口 Gate：{{ gateLabel(stage.entryGate) }}；出口 Gate：{{ gateLabel(stage.exitGate) }}</p>
        <p v-for="blocker in stage.blockerReasons" :key="blocker" class="blocker">{{ blocker }}</p>
        <button v-if="stage.availability === 'READY'" :disabled="busy" @click="act('start', stage.stageKey)">开始</button>
        <button v-if="stage.persistentState === 'IN_PROGRESS'" :disabled="busy || !stage.exitGate.pass" @click="act('complete', stage.stageKey)">完成</button>
        <button v-if="stage.allowSkip && (stage.availability === 'READY' || stage.persistentState === 'IN_PROGRESS')" :disabled="busy" @click="skip(stage.stageKey)">跳过</button>
      </article>
    </template>
  </section>
</template>
<script setup lang="ts">
import { ref, watch } from "vue";
import axios from "@/utils/axios";
const props = defineProps<{ projectId: number; scriptId: number }>();
const state = ref<any>(null), busy = ref(false), error = ref("");
let epoch = 0;
const scope = () => ({ projectId: props.projectId, scriptId: props.scriptId });
const post = async (path: string, body: unknown) => (await axios.post(path, body)).data;
function fail(value: any) { error.value = value?.response?.data?.message || value?.message || "Stage 操作失败"; }
function gateLabel(gate: any) { return gate.code === "NO_GATE" ? "无" : `${gate.pass ? '通过' : '阻塞'} (${gate.code})${gate.reason ? `：${gate.reason}` : ''}`; }
async function load() {
  const current = ++epoch, context = scope();
  try { const result = await post("/stageOrchestrator/read", context); if (current === epoch) { state.value = result; error.value = ""; } }
  catch (e) { if (current === epoch) fail(e); }
}
async function act(action: "start" | "complete" | "skip", stageKey: string, reason: string | null = null) {
  busy.value = true;
  try { await post(`/stageOrchestrator/${action}`, { ...scope(), stageKey, actorType: "HUMAN", reason }); await load(); }
  catch (e) { fail(e); } finally { busy.value = false; }
}
function skip(stageKey: string) { const reason = window.prompt("跳过原因（进行中的工序必填）")?.trim(); if (reason === undefined) return; void act("skip", stageKey, reason || null); }
async function adopt() {
  busy.value = true;
  try { await post("/productionProfiles/adopt-legacy", { projectId: props.projectId }); await load(); }
  catch (e) { fail(e); } finally { busy.value = false; }
}
watch(() => [props.projectId, props.scriptId], () => { state.value = null; void load(); }, { immediate: true });
</script>
<style scoped>
.inspector{padding:12px;color:var(--td-text-color-primary)}.note{background:var(--td-bg-color-secondarycontainer);padding:10px}.stage{border:1px solid var(--td-component-border);border-radius:8px;padding:12px;margin:10px 0}.stage h3{margin:0}.stage p{margin:6px 0}small{color:var(--td-text-color-secondary)}button{color:var(--td-text-color-primary);background:var(--td-bg-color-container);border:1px solid var(--td-component-border);border-radius:4px;padding:7px;cursor:pointer;margin-right:8px}button:disabled{opacity:.5;cursor:not-allowed}.blocker,.error{color:var(--td-error-color)}
</style>
