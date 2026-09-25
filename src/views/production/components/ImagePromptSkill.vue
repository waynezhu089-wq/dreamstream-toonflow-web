<template>
  <t-dialog :visible="true" header="镜头图片 Prompt Skill" width="860px" :footer="false" attach="body" placement="center" dialog-class-name="image-prompt-skill-dialog" @close="$emit('close')">
    <div class="skill-dialog-panel" @wheel.stop @pointerdown.stop @mousedown.stop>
      <p v-if="error" role="alert" class="error">{{ error }}</p>
      <p v-if="notice" role="status">{{ notice }}</p>
      <section>
        <h3>Current IMAGE_PROMPT Skill</h3>
        <p v-if="resolved">{{ resolved.skillId }} @ {{ resolved.skillVersion }} · {{ resolved.skillStatus }}<br />来源：{{ resolved.resolvedFrom.scopeType }} · {{ resolved.resolvedFrom.scopeKey }}</p>
        <p v-else>当前镜头尚无 Skill 绑定。先从推荐中人工选择一个 ACTIVE 版本。</p>
        <template v-if="resolved">
          <details><summary>Why this Skill? · 查看继承路径与 Override Chain</summary>
            <div v-for="entry in resolved.resolutionTrace" :key="`${entry.scopeType}:${entry.scopeKey}`" class="trace">
              {{ entry.scopeType }} · {{ entry.scopeKey }}：{{ entry.skillId ? `${entry.skillId} @ ${entry.skillVersion}` : entry.kind }}
              <strong v-if="entry.selected">（最终选中）</strong><br />{{ entry.reason }}
            </div>
            <p>Override Chain（从低到高）</p>
            <ol><li v-for="item in resolved.overrideChain" :key="item.scopeKey">{{ item.scopeType }}：{{ item.text }}</li></ol>
          </details>
          <div v-if="upgradeVersion" class="upgrade">
            新版本 {{ upgradeVersion }} 已可用；当前精确引用仍保持 {{ resolved.skillVersion }}。
            <t-button size="small" @click="upgradeProject">人工升级项目绑定到 {{ upgradeVersion }}</t-button>
          </div>
        </template>
      </section>
      <section>
        <h3>Recommended</h3>
        <p v-if="recommendation.recommended">{{ recommendation.recommended.displayName }} @ {{ recommendation.recommended.skillVersion }}：{{ recommendation.recommended.reason }}
          <t-button size="small" variant="outline" @click="choose(recommendation.recommended)">选用</t-button>
        </p>
        <p v-else>暂无同类型 ACTIVE Skill。</p>
        <details v-if="recommendation.otherCompatibleSkills.length"><summary>Other Compatible Skills</summary>
          <p v-for="item in recommendation.otherCompatibleSkills" :key="`${item.skillId}:${item.skillVersion}`">{{ item.displayName }} @ {{ item.skillVersion }}：{{ item.reason }}
            <t-button size="small" variant="outline" @click="choose(item)">选用</t-button>
          </p>
        </details>
        <h4>Change Skill</h4>
        <label>精确版本 <select v-model="selectedExact"><option value="">请选择 ACTIVE Skill</option><option v-for="item in activeVersions" :key="`${item.skillId}:${item.version}`" :value="`${item.skillId}@${item.version}`">{{ item.displayName }} @ {{ item.version }}</option></select></label>
        <label>应用范围 <select v-model="selectionScope"><option value="SHOT">仅此镜头</option><option value="PROJECT">当前项目</option></select></label>
        <t-button size="small" :disabled="!selectedExact" :loading="busy" @click="saveSelection">使用此 Skill</t-button>
      </section>
      <section>
        <t-button variant="outline" @click="derivedOpen = !derivedOpen">沉淀当前 Prompt 为 Skill</t-button>
        <SkillBuilderPanel v-if="derivedOpen" mode="derived" skill-type="IMAGE_PROMPT" :project-id="projectId" :script-id="scriptId" :storyboard-id="storyboardId" @saved="onDerivedSaved" />
      </section>
      <section>
        <h3>Shot Override</h3>
        <p>只保存这一镜的改动要求；若从项目继承 V1，不在镜头里复制 V1。</p>
        <textarea v-model="shotOverride" rows="3" placeholder="更明亮、更自然，保持真实 UI 约束" />
        <t-button size="small" :loading="busy" @click="saveShotOverride">保存局部 Override</t-button>
      </section>
      <section>
        <h3>Compile Prompt</h3>
        <p>只有点击 Compile 才检查并使用文本模型。Compile 只生成预览，不修改镜头。</p>
        <t-button :disabled="!resolved" :loading="busy" @click="compile">Compile Prompt</t-button>
        <template v-if="preview">
          <p>Resolved Skill：{{ preview.resolvedSkill.skillId }} @ {{ preview.resolvedSkill.skillVersion }} · {{ preview.resolvedSkill.resolvedFrom.scopeType }}</p>
          <p>Override Chain：{{ preview.resolvedSkill.overrideChain.map((item: any) => `${item.scopeType}: ${item.text}`).join(' → ') || '无' }}</p>
          <div class="compare"><div><h4>Current Prompt</h4><pre>{{ preview.currentPrompt }}</pre></div><div><h4>New Complete Prompt</h4><pre>{{ preview.compiledPrompt }}</pre></div></div>
          <label><input v-model="applyConfirmed" type="checkbox" />我已核对完整新 Prompt 与真实素材约束，决定应用到这一镜</label>
          <t-button theme="primary" :disabled="!applyConfirmed" :loading="busy" @click="apply">应用到 Storyboard</t-button>
        </template>
      </section>
    </div>
  </t-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import axios from "@/utils/axios";
import SkillBuilderPanel from "@/components/SkillBuilderPanel.vue";
const props = defineProps<{ projectId: number; scriptId: number; storyboardId: number; currentPrompt: string; promptSkillId?: string | null; promptSkillVersion?: string | null }>();
const emit = defineEmits<{ close: []; applied: [value: any] }>();
type Choice = { skillId: string; skillVersion: string; displayName: string; reason: string };
const resolved = ref<any>(null), preview = ref<any>(null), error = ref(""), notice = ref(""), busy = ref(false);
const recommendation = ref<{ recommended: Choice | null; otherCompatibleSkills: Choice[] }>({ recommended: null, otherCompatibleSkills: [] });
const families = ref<any[]>([]), shotOverride = ref(""), selectedExact = ref(""), selectionScope = ref<"SHOT" | "PROJECT">("SHOT"), applyConfirmed = ref(false);
const derivedOpen = ref(false);
const api = async (path: string, body: any = {}) => (await axios.post(`/skills/${path}`, body)).data;
const scope = () => ({ projectId: props.projectId, scriptId: props.scriptId, storyboardId: props.storyboardId });
const shotKey = () => `project:${props.projectId}:script:${props.scriptId}:storyboard:${props.storyboardId}`;
const activeVersions = computed(() => families.value.flatMap(f => f.skillType === "IMAGE_PROMPT" ? f.versions.filter((v: any) => v.status === "ACTIVE").map((v: any) => ({ skillId: f.skillId, displayName: f.displayName, version: v.version })) : []));
const upgradeVersion = computed(() => resolved.value?.resolvedFrom.scopeType === "PROJECT" && resolved.value?.skillStatus === "DEPRECATED"
  ? activeVersions.value.find(v => v.skillId === resolved.value.skillId && v.version !== resolved.value.skillVersion)?.version : null);
function showError(value: any) { error.value = value?.response?.data?.message || value?.message || "Skill 操作失败"; }
async function load() {
  error.value = ""; notice.value = ""; preview.value = null; applyConfirmed.value = false;
  try { families.value = await api("list"); recommendation.value = await api("recommend", { skillType: "IMAGE_PROMPT" }); }
  catch (e) { showError(e); return; }
  try { resolved.value = await api("resolve", { ...scope(), skillType: "IMAGE_PROMPT", profileKey: "advertisement" }); }
  catch (e: any) { resolved.value = null; if (e?.response?.data?.data?.reason !== "SKILL_RESOLUTION_FAILED") showError(e); }
  try { const rows = await api("binding/list", { scopeType: "SHOT", scopeKey: shotKey() }); shotOverride.value = rows.find((row: any) => row.skillType === "IMAGE_PROMPT")?.overrideText || ""; }
  catch (e) { showError(e); }
  selectedExact.value = resolved.value ? `${resolved.value.skillId}@${resolved.value.skillVersion}` : "";
}
function choose(item: Choice) { selectedExact.value = `${item.skillId}@${item.skillVersion}`; }
async function saveSelection() {
  const at = selectedExact.value.lastIndexOf("@"); if (at < 1) return;
  busy.value = true; error.value = "";
  try { await api("binding/save", { scopeType: selectionScope.value, scopeKey: selectionScope.value === "PROJECT" ? `project:${props.projectId}` : shotKey(), skillType: "IMAGE_PROMPT", skillId: selectedExact.value.slice(0, at), skillVersion: selectedExact.value.slice(at + 1), overrideText: selectionScope.value === "SHOT" ? shotOverride.value.trim() || null : null }); await load(); notice.value = "精确 Skill 绑定已保存。"; }
  catch (e) { showError(e); } finally { busy.value = false; }
}
async function saveShotOverride() {
  busy.value = true; error.value = "";
  try {
    const shotBinding = resolved.value?.resolutionTrace.find((row: any) => row.scopeType === "SHOT");
    if (!shotOverride.value.trim() && !shotBinding?.skillId) { await api("binding/remove", { scopeType: "SHOT", scopeKey: shotKey(), skillType: "IMAGE_PROMPT" }); }
    else await api("binding/save", { scopeType: "SHOT", scopeKey: shotKey(), skillType: "IMAGE_PROMPT", skillId: shotBinding?.skillId ?? null, skillVersion: shotBinding?.skillVersion ?? null, overrideText: shotOverride.value.trim() || null });
    await load(); notice.value = "镜头 Override 已保存。";
  } catch (e) { showError(e); } finally { busy.value = false; }
}
async function upgradeProject() {
  if (!upgradeVersion.value || !resolved.value) return;
  const targetVersion = upgradeVersion.value;
  busy.value = true; error.value = "";
  try { await api("binding/save", { scopeType: "PROJECT", scopeKey: `project:${props.projectId}`, skillType: "IMAGE_PROMPT", skillId: resolved.value.skillId, skillVersion: targetVersion, overrideText: null }); await load(); notice.value = `项目绑定已人工升级到 ${targetVersion}。`; }
  catch (e) { showError(e); } finally { busy.value = false; }
}
async function compile() {
  busy.value = true; error.value = ""; preview.value = null; applyConfirmed.value = false;
  try { preview.value = await api("compile", scope()); }
  catch (e) { showError(e); } finally { busy.value = false; }
}
async function apply() {
  if (!preview.value || !applyConfirmed.value) return;
  busy.value = true; error.value = "";
  try { const result = await api("compile/apply", { compileId: preview.value.compileId, ...scope() }); emit("applied", result.storyboard); await load(); notice.value = "完整 Prompt 已应用；镜头图片状态按现有分镜修改规则更新。"; }
  catch (e) { showError(e); } finally { busy.value = false; }
}
async function onDerivedSaved(value: any) { derivedOpen.value = false; await load(); notice.value = `${value.family.displayName} 已保存为 Draft V1；需要人工激活后才可绑定。`; }
watch(() => [props.projectId, props.scriptId, props.storyboardId], () => { derivedOpen.value = false; void load(); }, { immediate: true });
</script>

<style>
.image-prompt-skill-dialog { max-width: calc(100vw - 32px); max-height: calc(100dvh - 96px); display: flex; flex-direction: column; }
.image-prompt-skill-dialog .t-dialog__header { flex: none; }
.image-prompt-skill-dialog .t-dialog__body { min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
</style>
<style scoped>
.skill-dialog-panel { padding: 8px; color: var(--td-text-color-primary); } section { border-bottom: 1px solid var(--td-component-border); padding: 8px 0 16px; }
label { display: block; margin: 10px 0; } textarea,select { display: block; width: 100%; box-sizing: border-box; color: var(--td-text-color-primary); background: var(--td-bg-color-container); border: 1px solid var(--td-component-border); }
.trace { padding: 6px; border-bottom: 1px solid var(--td-component-border); } .upgrade { padding: 8px; background: var(--td-bg-color-secondarycontainer); color: var(--td-text-color-primary); border-left: 3px solid var(--td-warning-color); }
.compare { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }.compare pre { white-space: pre-wrap; max-height: 280px; overflow: auto; background: var(--td-bg-color-secondarycontainer); color: var(--td-text-color-primary); padding: 8px; }
.error { color: var(--td-error-color); } @media (max-width: 650px) { .compare { grid-template-columns: 1fr; } }
</style>
