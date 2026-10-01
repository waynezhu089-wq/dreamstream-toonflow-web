<template>
  <section class="model-presets" aria-label="模型预设">
    <h2>{{ projectId ? '本项目模型配置' : '模型预设' }}</h2>
    <p>广告前半段无需模型。生成时才检查对应模型；配置供应商不会自动发起生成。</p>
    <p>优先使用项目单项配置，其次广告默认预设，最后系统默认。空项表示继续继承。</p>
    <button @click="configureVendor">配置模型供应商</button>
    <p v-if="message" role="status">{{ message }}</p>
    <p v-if="error" role="alert">{{ error }} <button @click="load">重试</button></p>
    <fieldset :disabled="busy || loading">
      <label>选择预设
        <select aria-label="选择预设" v-model="selected" @change="selectPreset">
          <option value="">新建预设</option><option v-for="p in presets" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
      </label>
      <template v-if="!projectId">
        <label>预设名称 <input aria-label="预设名称" v-model="name" maxlength="100" /></label>
        <div v-for="s in slots" :key="s.key" class="slot">
          <label>{{ s.label }} <select :aria-label="s.label" v-model="draft[s.key]">
            <option value="">留空</option><option v-for="o in optionsFor(s.key, draft[s.key])" :key="o.value" :value="o.value">{{ o.label }}</option>
          </select></label>
        </div>
        <button @click="savePreset">保存整套预设</button>
        <button @click="newPreset">新建预设</button>
        <hr />
        <label>广告默认预设 <select aria-label="广告默认预设" v-model="adDefault"><option value="">不指定</option><option v-for="p in presets" :key="p.id" :value="p.id">{{ p.name }}</option></select></label>
        <label>系统默认预设 <select aria-label="系统默认预设" v-model="systemDefault"><option value="">不指定</option><option v-for="p in presets" :key="p.id" :value="p.id">{{ p.name }}</option></select></label>
        <button @click="saveDefaults">保存默认预设</button>
      </template>
      <template v-else>
        <button :disabled="!selected" @click="applyPreset">应用整个预设</button>
        <p>应用整套预设会替换本项目四个槽位；之后仍可逐项修改。</p>
        <div v-for="s in slots" :key="s.key" class="slot">
          <label>{{ s.label }} <select :aria-label="s.label" v-model="draft[s.key]">
            <option value="">继承默认配置</option><option v-for="o in optionsFor(s.key, draft[s.key])" :key="o.value" :value="o.value">{{ o.label }}</option>
          </select></label>
          <button @click="saveSlot(s.key)">保存{{ s.label }}</button>
          <small>当前：{{ modelLabel(effective[s.key]) }}（{{ sourceLabel(sources[s.key]) }}）</small>
        </div>
      </template>
    </fieldset>
  </section>
</template>
<script setup lang="ts">
import { ref, watch } from 'vue';
import axios from '@/utils/axios';
import settingStore from '@/stores/setting';
import projectStore from '@/stores/project';
type Slot = 'text' | 'image' | 'video' | 'tts';
type Models = Record<Slot, string>;
interface Preset { id: string; name: string; slots: Record<Slot, string | null> }
interface Option { value: string; label: string; type: Slot }
const props = defineProps<{ projectId?: number }>();
const slots: { key: Slot; label: string }[] = [{ key: 'text', label: '文本模型' }, { key: 'image', label: '图片模型' }, { key: 'video', label: '视频模型' }, { key: 'tts', label: '音频/TTS模型' }];
const empty = (): Models => ({ text: '', image: '', video: '', tts: '' });
const presets = ref<Preset[]>([]), options = ref<Option[]>([]);
const selected = ref(''), name = ref(''), draft = ref(empty()), effective = ref(empty()), sources = ref<Record<string,string>>({});
const adDefault = ref(''), systemDefault = ref(''), loading = ref(false), busy = ref(false), error = ref(''), message = ref('');
let epoch = 0;
const strings = (v: any): Models => Object.fromEntries(slots.map(s => [s.key, v?.[s.key] || ''])) as Models;
function optionsFor(slot: Slot, value: string) {
  const list = options.value.filter(o => o.type === slot);
  return value && !list.some(o => o.value === value) ? [...list, { value, label: '原配置（当前不可用）', type: slot }] : list;
}
const modelLabel = (value: string) => !value ? '未配置' : options.value.find(o => o.value === value)?.label || '原配置（当前不可用）';
const sourceLabel = (v: string | undefined) => ({ project: '项目覆盖', profile: '广告默认', system: '系统默认', none: '未配置' }[v || 'none'] || '未配置');
function configureVendor() { const s = settingStore(); s.activeMenu = 'vendorConfig'; s.showSetting = true; }
function selectPreset() { const p = presets.value.find(p => p.id === selected.value); if (!props.projectId) { name.value = p?.name || ''; draft.value = strings(p?.slots); } }
function newPreset() { selected.value = ''; selectPreset(); }
function acceptResolution(data: any) {
  draft.value = strings(data.overrides); effective.value = strings(data.models); sources.value = data.sources;
  const store = projectStore();
  if (Number(store.project?.id) === props.projectId && store.project) { store.project.imageModel = data.models.image || ''; store.project.videoModel = data.models.video || ''; }
}
async function load() {
  const ticket = ++epoch, projectId = props.projectId;
  loading.value = true; busy.value = false; error.value = ''; message.value = ''; draft.value = empty(); effective.value = empty();
  try {
    const { data } = await axios.post('/modelSelect/presets/list', {});
    if (ticket !== epoch) return;
    presets.value = data.presets; options.value = data.options;
    adDefault.value = data.scopes.find((s: any) => s.scope === 'profile:advertisement')?.presetId || '';
    systemDefault.value = data.scopes.find((s: any) => s.scope === 'system')?.presetId || '';
    if (projectId) { const { data: resolved } = await axios.post('/modelSelect/presets/resolve', { projectId }); if (ticket === epoch) acceptResolution(resolved); }
  } catch (e: any) { if (ticket === epoch) error.value = e?.message || '无法读取模型配置'; }
  finally { if (ticket === epoch) loading.value = false; }
}
async function act(fn: () => Promise<any>) {
  if (busy.value || loading.value) return;
  const ticket = epoch; busy.value = true; error.value = ''; message.value = '';
  try { const result = await fn(); if (ticket !== epoch) return; if (props.projectId) acceptResolution(result.data); message.value = '已保存'; }
  catch (e: any) { if (ticket === epoch) error.value = e?.message || '保存失败'; }
  finally { if (ticket === epoch) busy.value = false; }
}
async function savePreset() {
  if (!name.value.trim()) { error.value = '请填写预设名称'; return; }
  const payload = { ...(selected.value ? { id: selected.value } : {}), name: name.value.trim(), slots: Object.fromEntries(slots.map(s => [s.key, draft.value[s.key] || null])) };
  await act(async () => { const response = await axios.post('/modelSelect/presets/save', payload); const p = response.data; presets.value = [...presets.value.filter(x => x.id !== p.id), p]; selected.value = p.id; return response; });
}
async function saveDefaults() { await act(async () => { await axios.post('/modelSelect/presets/default', { scope: 'profile:advertisement', presetId: adDefault.value || null }); return axios.post('/modelSelect/presets/default', { scope: 'system', presetId: systemDefault.value || null }); }); }
async function applyPreset() { const projectId = props.projectId, presetId = selected.value; await act(() => axios.post('/modelSelect/presets/project', { projectId, presetId })); }
async function saveSlot(slot: Slot) { const projectId = props.projectId, value = draft.value[slot] || null; await act(() => axios.post('/modelSelect/presets/project', { projectId, slots: { [slot]: value } })); }
watch(() => props.projectId, () => { selected.value = ''; load(); }, { immediate: true });
</script>
<style scoped>
.model-presets { padding: 16px; color: var(--td-text-color-primary); }
fieldset { border: 0; padding: 0; display: grid; gap: 14px; }
label { display: flex; gap: 10px; align-items: center; }
select, input { padding: 8px; min-width: 180px; max-width: 100%; color: inherit; background: var(--td-bg-color-container); border: 1px solid var(--td-component-border); border-radius: 4px; }
button { padding: 7px 12px; cursor: pointer; color: inherit; background: var(--td-bg-color-container); border: 1px solid var(--td-component-border); border-radius: 4px; }
button:disabled { opacity: .5; cursor: default; }
.slot { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
small { display: block; }
[role=alert] { color: var(--td-error-color); }
</style>
