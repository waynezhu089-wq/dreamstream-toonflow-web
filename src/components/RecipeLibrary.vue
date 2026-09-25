<template>
  <section class="recipe-library" aria-label="Recipe Library">
    <p>Recipe 是精确版本的可复用制作蓝图。推荐仅供审阅，不会自动应用到项目生产。</p>
    <button @click="load">刷新</button>
    <p v-if="error" role="alert">{{ error }}</p>
    <div v-for="family in families" :key="family.recipeKey" class="card">
      <h3>{{ family.displayName }} <small>{{ family.recipeKey }}</small></h3>
      <p>{{ family.description }} · {{ family.tags.join('、') }}</p>
      <button v-for="version in family.versions" :key="version.version" @click="select(family.recipeKey, version.version)">{{ version.version }} · {{ version.status }} · {{ version.health.healthy ? '依赖正常' : '依赖异常' }}</button>
      <button v-if="!family.versions.length" @click="newDraft(family.recipeKey)">创建 Draft v1</button>
    </div>
    <template v-if="selected">
      <div class="card">
        <h3>{{ selected.family.displayName }} · {{ selectedVersion }}</h3>
        <p>状态：{{ current?.status }}；Profile：{{ current?.definition.profileRef.profileKey }} @ {{ current?.definition.profileRef.profileVersion }}</p>
        <p>依赖：{{ current?.health.healthy ? '正常' : current?.health.issues.join('、') }}</p>
        <p>Skill 推荐 {{ current?.definition.skillRefs.length }} 项；Capability 推荐 {{ current?.definition.capabilityRefs.length }} 项；素材清单模板 {{ current?.definition.assetPlanTemplate.length }} 项。</p>
        <ul><li v-for="ref in current?.definition.skillRefs" :key="ref.skillType">{{ ref.skillType }} → {{ ref.skillId }} @ {{ ref.skillVersion }}</li></ul>
        <ul><li v-for="ref in current?.definition.capabilityRefs" :key="ref.roleKey">{{ ref.roleKey }} → {{ ref.capabilityId }} {{ ref.stageKey ? `(${ref.stageKey})` : '' }}</li></ul>
        <ul><li v-for="item in current?.definition.assetPlanTemplate" :key="item.assetKey">{{ item.name }} · {{ item.category }} · {{ item.required ? '必需' : '可选' }} · {{ item.sourcePolicy === 'REAL_REQUIRED' ? '必须上传真实素材' : '允许 AI 生成' }}</li></ul>
        <button @click="newDraft(selected.family.recipeKey, selectedVersion)">以此版本创建新 Draft</button>
        <button v-if="current?.status === 'DRAFT'" @click="activate">激活 Draft</button>
        <button v-if="current?.status === 'ACTIVE'" @click="deprecate">弃用 Active</button>
      </div>
      <div v-if="current?.status === 'DRAFT'" class="card">
        <h4>Draft Builder</h4>
        <label>精确 Production Profile
          <select v-model="draft.profileRef.profileKey" @change="draft.profileRef.profileVersion = ''"><option value="">请选择</option><option v-for="p in profiles" :key="p.profileKey" :value="p.profileKey">{{ p.displayName }}</option></select>
          <select v-model="draft.profileRef.profileVersion"><option value="">精确版本</option><option v-for="v in profileOptions" :key="v.version" :value="v.version">{{ v.version }} · {{ v.status }}</option></select>
        </label>
        <h4>Skill 推荐</h4>
        <div v-for="(ref, i) in draft.skillRefs" :key="i" class="row"><select v-model="ref.skillType"><option v-for="t in skillTypes" :key="t" :value="t">{{ t }}</option></select><select :value="`${ref.skillId}@${ref.skillVersion}`" @change="setSkill(i, $event)"><option value="@">选择精确 Active Skill</option><option v-for="s in skillOptions(ref.skillType)" :key="`${s.skillId}@${s.version}`" :value="`${s.skillId}@${s.version}`">{{ s.label }}</option></select><button @click="draft.skillRefs.splice(i, 1)">移除</button></div>
        <button @click="draft.skillRefs.push({ skillType: 'IMAGE_PROMPT', skillId: '', skillVersion: '' })">添加 Skill</button>
        <h4>Capability 推荐</h4>
        <div v-for="(ref, i) in draft.capabilityRefs" :key="i" class="row"><input v-model.trim="ref.roleKey" placeholder="roleKey，例如 storyboard-image.default" /><select v-model="ref.stageKey"><option value="">不限 Stage</option><option v-for="s in stageOptions" :key="s.stageKey" :value="s.stageKey">{{ s.displayName }}</option></select><select v-model="ref.capabilityId"><option value="">选择 VERIFIED Capability</option><option v-for="c in capabilityOptions" :key="c.capabilityId" :value="c.capabilityId">{{ c.capabilityId }}</option></select><button @click="draft.capabilityRefs.splice(i, 1)">移除</button></div>
        <button @click="draft.capabilityRefs.push({ roleKey: '', stageKey: '', capabilityId: '' })">添加 Capability</button>
        <h4>素材清单模板</h4>
        <div v-for="(item, i) in draft.assetPlanTemplate" :key="i" class="row"><input v-model.trim="item.assetKey" placeholder="assetKey" /><input v-model.trim="item.name" placeholder="素材名称" /><input v-model.trim="item.category" placeholder="类别" /><label><input v-model="item.required" type="checkbox" />必需</label><select v-model="item.sourcePolicy"><option value="REAL_REQUIRED">必须上传真实素材</option><option value="AI_ALLOWED">允许 AI 生成</option></select><button @click="draft.assetPlanTemplate.splice(i, 1)">移除</button></div>
        <button @click="draft.assetPlanTemplate.push({ assetKey: '', name: '', category: '', required: true, sourcePolicy: 'REAL_REQUIRED' })">添加素材要求</button>
        <h4>复用说明</h4><textarea v-model="notesText" rows="4" placeholder="每行一条建议" />
        <button @click="saveDraft">保存 Draft</button>
        <details><summary>Advanced · Definition JSON</summary><textarea v-model="advancedJson" rows="14" spellcheck="false" /><button @click="applyAdvanced">载入 JSON 到 Draft Builder</button></details>
      </div>
    </template>
    <details class="card"><summary>创建 Recipe Family</summary><label>Recipe Key<input v-model.trim="newKey" placeholder="例如 mv.lyric-cinematic" /></label><label>名称<input v-model.trim="newName" /></label><label>说明<input v-model.trim="newDescription" /></label><label>标签（逗号分隔）<input v-model="newTags" /></label><button @click="createFamily">创建</button></details>
  </section>
</template>
<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import axios from "@/utils/axios";
type Definition = { schemaVersion: 1; profileRef: { profileKey: string; profileVersion: string }; skillRefs: { skillType: string; skillId: string; skillVersion: string }[]; capabilityRefs: { roleKey: string; stageKey?: string; capabilityId: string }[]; assetPlanTemplate: { assetKey: string; name: string; category: string; required: boolean; sourcePolicy: 'REAL_REQUIRED' | 'AI_ALLOWED' }[]; notes: string[] };
const blank = (): Definition => ({ schemaVersion: 1, profileRef: { profileKey: '', profileVersion: '' }, skillRefs: [], capabilityRefs: [], assetPlanTemplate: [], notes: [] });
const skillTypes = ['CONCEPT_CREATIVE','SCRIPT','DIRECTOR','STORYBOARD','IMAGE_PROMPT','VIDEO_PROMPT','CONTINUITY','EDIT_PACING','AUDIO_MUSIC','SUPERVISOR','QC','DISTRIBUTION'];
const families = ref<any[]>([]), profiles = ref<any[]>([]), skills = ref<any[]>([]), capabilities = ref<any[]>([]);
const selected = ref<any>(null), selectedVersion = ref(''), draft = ref<Definition>(blank()), notesText = ref(''), advancedJson = ref(''), error = ref('');
const newKey = ref(''), newName = ref(''), newDescription = ref(''), newTags = ref('');
const current = computed(() => selected.value?.versions.find((v: any) => v.version === selectedVersion.value));
const profileOptions = computed(() => profiles.value.find(p => p.profileKey === draft.value.profileRef.profileKey)?.versions.filter((v: any) => v.status === 'ACTIVE') || []);
const stageOptions = computed(() => profileOptions.value.find((v: any) => v.version === draft.value.profileRef.profileVersion)?.definition.stages || []);
const capabilityOptions = computed(() => capabilities.value.flatMap(c => c.versions.filter((v: any) => v.status === 'VERIFIED')));
const post = async (path: string, body: any = {}) => (await axios.post(`/recipes/${path}`, body)).data;
const fail = (e: any) => { error.value = e?.response?.data?.message || e?.message || 'Recipe 操作失败'; };
async function load() { try { const [r,p,s,c] = await Promise.all([post('list'), axios.post('/productionProfiles/list'), axios.post('/skills/list'), axios.post('/capabilities/list')]); families.value = r; profiles.value = p.data; skills.value = s.data; capabilities.value = c.data; error.value = ''; } catch(e) { fail(e); } }
async function select(recipeKey: string, version: string) { try { selected.value = await post('get', { recipeKey, version }); selectedVersion.value = version; draft.value = JSON.parse(JSON.stringify(current.value.definition)); notesText.value = draft.value.notes.join('\n'); advancedJson.value = JSON.stringify(draft.value, null, 2); error.value = ''; } catch(e) { fail(e); } }
async function createFamily() { try { await post('family/create', { recipeKey: newKey.value, displayName: newName.value, description: newDescription.value, tags: newTags.value.split(',').map(x => x.trim()).filter(Boolean) }); await load(); newKey.value = newName.value = newDescription.value = newTags.value = ''; } catch(e) { fail(e); } }
async function newDraft(recipeKey: string, sourceVersion?: string) { try { const first = profiles.value.flatMap(p => p.versions.filter((v: any) => v.status === 'ACTIVE').map((v: any) => ({ profileKey: p.profileKey, profileVersion: v.version })))[0]; if (!sourceVersion && !first) throw new Error('请先激活一个 Production Profile'); const initial = blank(); if (first) initial.profileRef = first; const body = sourceVersion ? { recipeKey, sourceVersion } : { recipeKey, definition: initial }; const created = await post('version/create', body); await load(); await select(recipeKey, created.version); } catch(e) { fail(e); } }
function skillOptions(type: string) { return skills.value.filter(s => s.skillType === type).flatMap(s => s.versions.filter((v: any) => v.status === 'ACTIVE').map((v: any) => ({ skillId: s.skillId, version: v.version, label: `${s.displayName} @ ${v.version}` }))); }
function setSkill(index: number, event: Event) { const value = (event.target as HTMLSelectElement).value; const split = value.lastIndexOf('@'); draft.value.skillRefs[index].skillId = value.slice(0, split); draft.value.skillRefs[index].skillVersion = value.slice(split + 1); }
function normalized() { return { ...draft.value, capabilityRefs: draft.value.capabilityRefs.map(({ stageKey, ...rest }) => stageKey ? { ...rest, stageKey } : rest), notes: notesText.value.split('\n').map(s => s.trim()).filter(Boolean) }; }
async function saveDraft() { if (!selected.value) return; try { await post('version/edit', { recipeKey: selected.value.family.recipeKey, version: selectedVersion.value, definition: normalized() }); await load(); await select(selected.value.family.recipeKey, selectedVersion.value); } catch(e) { fail(e); } }
function applyAdvanced() { try { draft.value = JSON.parse(advancedJson.value) as Definition; notesText.value = draft.value.notes.join('\n'); error.value = ''; } catch(e) { fail(e); } }
async function activate() { if (!selected.value || !window.confirm(`激活 ${selected.value.family.recipeKey} ${selectedVersion.value}？旧 Active 将弃用。`)) return; try { await post('version/activate', { recipeKey: selected.value.family.recipeKey, version: selectedVersion.value }); await load(); await select(selected.value.family.recipeKey, selectedVersion.value); } catch(e) { fail(e); } }
async function deprecate() { if (!selected.value || !window.confirm('弃用此 Recipe Version？历史绑定仍可读取。')) return; try { await post('version/deprecate', { recipeKey: selected.value.family.recipeKey, version: selectedVersion.value }); await load(); await select(selected.value.family.recipeKey, selectedVersion.value); } catch(e) { fail(e); } }
onMounted(load);
</script>
<style scoped>
.recipe-library{height:100%;overflow:auto;padding:12px;color:var(--td-text-color-primary)}.card{border:1px solid var(--td-component-border);border-radius:8px;padding:12px;margin:12px 0}.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:8px 0}button,input,select,textarea{color:var(--td-text-color-primary);background:var(--td-bg-color-container);border:1px solid var(--td-component-border);border-radius:4px;padding:7px;margin:4px}button{cursor:pointer}label{display:block;margin:8px 0}textarea{width:100%;box-sizing:border-box}small{color:var(--td-text-color-secondary)}[role=alert]{color:var(--td-error-color)}
</style>
