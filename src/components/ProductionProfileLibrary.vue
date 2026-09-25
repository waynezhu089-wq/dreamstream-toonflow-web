<template>
  <section class="profile-library" aria-label="Production Profiles">
    <p>Production Profile 定义工序与 Gate。项目绑定精确版本，不会自动升级。</p>
    <button @click="load">刷新</button>
    <p v-if="error" role="alert" class="error">{{ error }}</p>
    <div v-for="family in families" :key="family.profileKey" class="family">
      <h3>{{ family.displayName }} <small>{{ family.profileKey }}</small></h3>
      <p>{{ family.description }}</p>
      <button v-for="version in family.versions" :key="version.version" @click="select(family.profileKey, version.version)">
        {{ version.version }} · {{ version.status }}
      </button>
      <details v-if="!family.versions.length"><summary>Advanced · 创建首个 Draft v1</summary>
        <label>Definition JSON<textarea v-model="firstDefinitionText" rows="12" spellcheck="false" /></label>
        <button @click="createFirstDraft(family.profileKey)">创建 Draft v1</button>
      </details>
    </div>
    <template v-if="selected">
      <h3>{{ selected.family.displayName }} · {{ selectedVersion }}</h3>
      <p>状态：{{ current?.status }}</p>
      <h4>工序</h4>
      <ol><li v-for="stage in orderedStages" :key="stage.stageKey">{{ stage.displayName }} <small>({{ stage.stageKey }})</small> · {{ stage.required ? '必需' : '可选' }} · 入口 Gate: {{ stage.entryGateKey || '无' }} · 出口 Gate: {{ stage.exitGateKey || '无' }}</li></ol>
      <h4>前进依赖</h4>
      <ul><li v-for="edge in current?.definition.transitions || []" :key="`${edge.fromStageKey}-${edge.toStageKey}`">{{ edge.fromStageKey }} → {{ edge.toStageKey }}</li></ul>
      <details><summary>Advanced · Profile 版本管理</summary>
        <p>只编辑 Draft；激活后定义固定。创建新版本可复制当前定义。</p>
        <button @click="createDraft">从此版本创建 Draft</button>
        <template v-if="current?.status === 'DRAFT'">
          <label>Definition JSON<textarea v-model="definitionText" rows="16" spellcheck="false" /></label>
          <button @click="saveDraft">保存 Draft</button>
          <button @click="activate">激活此版本</button>
        </template>
        <button v-if="current?.status === 'ACTIVE'" @click="deprecate">弃用此版本</button>
      </details>
    </template>
    <details><summary>Advanced · 创建 Profile Family</summary>
      <label>Profile Key<input v-model.trim="newKey" placeholder="例如 knowledge-video" /></label>
      <label>名称<input v-model.trim="newName" /></label>
      <label>说明<input v-model.trim="newDescription" /></label>
      <button @click="createFamily">创建 Family</button>
      <p>新 Family 建立后，在 Advanced 中创建 Draft 并填写 Definition JSON。</p>
    </details>
  </section>
</template>
<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import axios from "@/utils/axios";
type Stage = { stageKey: string; displayName: string; required: boolean; uiOrder: number; entryGateKey: string | null; exitGateKey: string | null };
type Version = { version: string; status: string; definition: { stages: Stage[]; transitions: { fromStageKey: string; toStageKey: string }[] } };
type Family = { profileKey: string; displayName: string; description: string; versions: Version[] };
const families = ref<Family[]>([]), selected = ref<{ family: Family; versions: Version[] } | null>(null), selectedVersion = ref(""), definitionText = ref(""), error = ref("");
const newKey = ref(""), newName = ref(""), newDescription = ref("");
const firstDefinitionText = ref(JSON.stringify({ schemaVersion: 1, initialStageKey: "concept", stages: [{ stageKey: "concept", displayName: "Concept", description: "", required: true, allowSkip: false, uiOrder: 10, entryGateKey: null, exitGateKey: null }], transitions: [] }, null, 2));
const current = computed(() => selected.value?.versions.find(v => v.version === selectedVersion.value));
const orderedStages = computed(() => [...(current.value?.definition.stages || [])].sort((a, b) => a.uiOrder - b.uiOrder));
const post = async (path: string, body: unknown = {}) => (await axios.post(`/productionProfiles/${path}`, body)).data;
function fail(value: any) { error.value = value?.response?.data?.message || value?.message || "Profile 操作失败"; }
async function load() { try { families.value = await post("list"); error.value = ""; if (selected.value) await select(selected.value.family.profileKey, selectedVersion.value); } catch (e) { fail(e); } }
async function select(profileKey: string, version: string) {
  try { selected.value = await post("get", { profileKey, version }); selectedVersion.value = version; definitionText.value = JSON.stringify(current.value?.definition, null, 2); error.value = ""; }
  catch (e) { fail(e); }
}
async function createFamily() {
  try { await post("family/create", { profileKey: newKey.value, displayName: newName.value, description: newDescription.value }); await load(); newKey.value = ""; newName.value = ""; newDescription.value = ""; }
  catch (e) { fail(e); }
}
async function createDraft() {
  if (!selected.value) return;
  try { const created = await post("version/create", { profileKey: selected.value.family.profileKey, sourceVersion: current.value?.version }); await load(); await select(selected.value!.family.profileKey, created.version); }
  catch (e) { fail(e); }
}
async function createFirstDraft(profileKey: string) {
  try { const created = await post("version/create", { profileKey, definition: JSON.parse(firstDefinitionText.value) }); await load(); await select(profileKey, created.version); }
  catch (e) { fail(e); }
}
async function saveDraft() {
  if (!selected.value || !current.value) return;
  try { await post("version/edit", { profileKey: selected.value.family.profileKey, version: current.value.version, definition: JSON.parse(definitionText.value) }); await load(); }
  catch (e) { fail(e); }
}
async function activate() {
  if (!selected.value || !current.value || !window.confirm(`激活 ${selected.value.family.profileKey} ${current.value.version}？旧 Active 版本将被弃用。`)) return;
  try { await post("version/activate", { profileKey: selected.value.family.profileKey, version: current.value.version }); await load(); }
  catch (e) { fail(e); }
}
async function deprecate() {
  if (!selected.value || !current.value || !window.confirm(`弃用 ${selected.value.family.profileKey} ${current.value.version}？历史项目仍保留精确版本。`)) return;
  try { await post("version/deprecate", { profileKey: selected.value.family.profileKey, version: current.value.version }); await load(); }
  catch (e) { fail(e); }
}
onMounted(load);
</script>
<style scoped>
.profile-library{height:100%;overflow:auto;padding:12px;color:var(--td-text-color-primary)}.family{border:1px solid var(--td-component-border);border-radius:8px;padding:10px;margin:12px 0}.family h3{margin:0}small{color:var(--td-text-color-secondary)}button,input,textarea{color:var(--td-text-color-primary);background:var(--td-bg-color-container);border:1px solid var(--td-component-border);border-radius:4px;padding:7px;margin:4px}button{cursor:pointer}label{display:block;margin:10px 0}input,textarea{display:block;width:100%;box-sizing:border-box}details{border:1px solid var(--td-component-border);padding:10px;margin:12px 0}summary{cursor:pointer}.error{color:var(--td-error-color)}
</style>
