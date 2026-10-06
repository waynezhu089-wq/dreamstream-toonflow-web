<template>
  <section class="director-card" aria-label="导演方向">
    <header>
      <h2>导演方向 · {{ accepted ? "当前导演版本 v" + accepted.directorVersion : "候选" }}</h2>
      <button :disabled="busy" @click="reload">刷新方向</button>
    </header>
    <p class="stale" v-if="accepted?.status === 'STALE'">影片创意或素材已变化，这版导演方向需要重新确认。</p>
    <p v-if="!shown">让 Project Agent 帮你整理整部影片的视觉方向，或在这里提出要求。</p>
    <template v-if="shown">
      <h3>整体视觉</h3>
      <p>{{ shown.projectBible.globalVisualDNA.artStyle || "尚待讨论" }} · {{ shown.projectBible.globalVisualDNA.atmosphere }}</p>
      <p>{{ shown.projectBible.globalVisualDNA.colorLanguage.join("、") }}；{{ shown.projectBible.globalVisualDNA.materialLanguage.join("、") }}</p>
      <h3>关键角色</h3>
      <div v-for="role in shown.projectBible.narrativeVisualRoles" :key="role.canonicalKey">
        <strong>{{ name(role.canonicalKey) }}</strong>
        <p>{{ role.narrativeFunction }} · {{ role.emotionalRead }}</p>
        <small>{{ role.requiredAudiencePerception.join("；") }}</small>
      </div>
      <h3>视觉变形与结尾</h3>
      <p v-for="edge in shown.projectBible.transformationLineage" :key="edge.from + edge.to">
        {{ name(edge.from) }} → {{ name(edge.to) }} ·
        {{ edge.relationType === "COMPOSITION_RESOLUTION" ? "构图匹配与溶解，真实标识不由 AI 重画" : "同一种物质的形态变化" }}
      </p>
      <h3>情绪进程</h3>
      <p>{{ shown.unitProjection.emotionalArc.map((b: any) => b.emotion || "待讨论").join(" → ") }}</p>
    </template>
    <template v-if="proposal">
      <p>本次方向仍是候选；已确认外观和真实素材始终优先。</p>
      <div v-if="proposal.diff?.length" class="director-diff">
        <strong>本次导演方向调整</strong>
        <p v-for="d in proposal.diff" :key="d.section">{{ describeChange(d) }}</p>
        <small>未列出的方向保持不变。</small>
      </div>
    </template>
    <label>
      告诉 Project Agent 怎样调整导演方向
      <textarea v-model="instruction" rows="2" placeholder="例如：鲸鱼不要太像怪兽，我希望敬畏感更强。" :disabled="busy" />
    </label>
    <button :disabled="busy" @click="propose">{{ phase === "PROPOSING" ? "正在准备导演方向…" : proposal ? "修改这版候选" : "准备导演方案" }}</button>
    <button v-if="proposal && proposal.status !== 'STALE' && !preview" :disabled="busy" @click="prepare">
      {{ phase === "PREVIEWING" ? "正在准备确认…" : "采用视觉方向" }}
    </button>
    <button v-if="proposal && !preview" :disabled="busy" @click="reject">放弃这版候选</button>
    <div v-if="preview" class="director-preview">
      <strong>采用前预览</strong>
      <p>{{ preview.diff.map((d: any) => d.label).join("、") || "视觉方向" }} 将形成新的导演版本。当前图片不会自动改变。</p>
      <button :disabled="busy" @click="confirm">{{ phase === "CONFIRMING" ? "正在确认…" : "确认采用" }}</button>
      <button :disabled="busy" @click="preview = null">返回讨论</button>
    </div>
    <button v-if="refreshPending" :disabled="busy" @click="reload">重试读取已确认版本</button>
    <p v-if="success" class="success" role="status">
      ✓ 当前导演版本。已采用这版导演方向，后续视觉设计可在下一阶段以它为基础，但当前图片不会自动改变。
    </p>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
  </section>
</template>
<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from "vue";
import axios from "@/utils/axios";
const props = defineProps<{ projectId: number; scriptId: number }>(),
  emit = defineEmits<{ (e: "accepted"): void }>();
const accepted = ref<any>(null),
  proposal = ref<any>(null),
  preview = ref<any>(null),
  names = ref<any[]>([]),
  instruction = ref(""),
  phase = ref("IDLE"),
  error = ref(""),
  success = ref(false);
let generation = 0,
  needsReload = false;
const refreshPending = ref(false),
  confirmCommand = ref<any>(null);
const busy = computed(() => phase.value !== "IDLE"),
  shown = computed(() => proposal.value || accepted.value),
  name = (key: string) => names.value.find((a) => a.canonicalKey === key)?.name || "素材";
const scope = () => ({ projectId: props.projectId, scriptId: props.scriptId });
async function run(next: string, action: (token: number) => Promise<void>) {
  if (busy.value) return;
  const token = generation;
  phase.value = next;
  error.value = "";
  success.value = false;
  try {
    await action(token);
  } catch (e: any) {
    if (token === generation) error.value = e?.message || "导演方向操作未完成，请重试；当前图片未改变。";
  } finally {
    if (token === generation) {
      phase.value = "IDLE";
      if (needsReload) {
        needsReload = false;
        void reload();
      }
    }
  }
}
async function load(token: number) {
  const r: any = await axios.post("/v04/director/current", scope());
  if (token !== generation) return;
  accepted.value = r.data?.accepted || null;
  proposal.value = r.data?.proposal || null;
  names.value = r.data?.assetNames || [];
}
async function reload() {
  if (busy.value) {
    needsReload = true;
    return;
  }
  await run("READING", async (token) => {
    await load(token);
    if (token === generation) refreshPending.value = false;
  });
}
async function propose() {
  await run("PROPOSING", async (token) => {
    const r: any = await axios.post("/v04/director/propose", {
      ...scope(),
      userInstruction: instruction.value || "帮我整理整部影片的导演视觉方向",
      ...(proposal.value && proposal.value.status !== "STALE" ? { baseProposalId: proposal.value.id } : {}),
      ...(accepted.value?.status === "CURRENT" ? { baseDirectorVersion: accepted.value.directorVersion } : {}),
    });
    if (token !== generation) return;
    proposal.value = r.data;
    preview.value = null;
    instruction.value = "";
  });
}
async function prepare() {
  await run("PREVIEWING", async (token) => {
    const r: any = await axios.post("/v04/director/preview", { ...scope(), proposalId: proposal.value.id });
    if (token === generation) {
      preview.value = r.data;
      confirmCommand.value = { ...scope(), proposalId: proposal.value.id, previewHash: r.data.previewHash };
    }
  });
}
async function confirm() {
  await run("CONFIRMING", async (token) => {
    const body = confirmCommand.value;
    await axios.post("/v04/director/confirm", body);
    if (token !== generation) return;
    preview.value = null;
    proposal.value = null;
    confirmCommand.value = null;
    refreshPending.value = true;
    await load(token);
    if (token === generation) {
      refreshPending.value = false;
      success.value = true;
      emit("accepted");
    }
  });
}
async function reject() {
  await run("REJECTING", async (token) => {
    await axios.post("/v04/director/reject", { ...scope(), proposalId: proposal.value.id });
    if (token !== generation) return;
    preview.value = null;
    await load(token);
  });
}
function describeChange(d: any) {
  if (d.section === "narrativeVisualRoles")
    return d.after
      .filter((r: any) => JSON.stringify(d.before?.find((b: any) => b.canonicalKey === r.canonicalKey) || null) !== JSON.stringify(r))
      .map((r: any) => {
        const b = d.before?.find((b: any) => b.canonicalKey === r.canonicalKey);
        const field =
          ["emotionalRead", "narrativeFunction", "requiredAudiencePerception", "forbiddenInterpretations"].find(
            (k) => JSON.stringify(b?.[k]) !== JSON.stringify(r[k]),
          ) || "emotionalRead";
        const text = (v: any) => (Array.isArray(v) ? v.join("、") : v || "尚待讨论");
        return name(r.canonicalKey) + "：" + text(b?.[field]) + " → " + text(r[field]);
      })
      .join("；");
  if (d.section === "emotionalArc")
    return d.label + "：" + (d.before || []).map((b: any) => b.emotion).join(" → ") + " → " + d.after.map((b: any) => b.emotion).join(" → ");
  return d.label + " 已调整";
}
watch(
  () => [props.projectId, props.scriptId],
  () => {
    generation++;
    needsReload = false;
    refreshPending.value = false;
    confirmCommand.value = null;
    accepted.value = null;
    proposal.value = null;
    preview.value = null;
    names.value = [];
    instruction.value = "";
    phase.value = "IDLE";
    error.value = "";
    success.value = false;
    void reload();
  },
  { immediate: true },
);
onBeforeUnmount(() => generation++);
defineExpose({ reload });
</script>
<style scoped>
.director-card {
  padding: 0.75rem 0;
  border-top: 1px solid var(--td-component-border);
  font-size: 0.82rem;
}
.director-card header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.director-card h2 {
  font-size: 1rem;
}
.director-card h3 {
  font-size: 0.86rem;
  margin: 0.8rem 0 0.4rem;
}
.director-card p {
  line-height: 1.6;
}
.director-card small {
  color: var(--td-text-color-secondary);
}
textarea {
  display: block;
  width: 100%;
  box-sizing: border-box;
  background: var(--td-bg-color-container);
  color: var(--td-text-color-primary);
  border: 1px solid var(--td-component-border);
  margin: 0.4rem 0;
}
button {
  background: var(--td-bg-color-container);
  color: var(--td-text-color-primary);
  border: 1px solid var(--td-component-border);
  padding: 0.35rem 0.6rem;
  margin: 0.25rem;
  cursor: pointer;
}
button:hover:not(:disabled) {
  border-color: var(--td-brand-color);
  background: var(--td-bg-color-container-hover);
}
button:active:not(:disabled) {
  transform: translateY(1px);
}
button:disabled {
  opacity: 0.6;
  cursor: wait;
}
.director-preview,
.director-diff {
  padding: 0.6rem;
  border: 1px solid var(--td-component-border);
}
.success {
  color: var(--td-success-color);
}
.error {
  color: var(--td-error-color);
}
.stale {
  color: var(--td-warning-color);
}
</style>
