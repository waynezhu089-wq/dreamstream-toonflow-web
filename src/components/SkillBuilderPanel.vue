<template>
  <div class="skill-builder">
    <h3>{{ title }}</h3>
    <p v-if="mode === 'new'">用一段话描述你积累的方法。AI 会先整理成可检查的候选；保存前不会建立 Skill。</p>
    <p v-if="mode === 'derived'">根据当前镜头的 Prompt 提炼可复用方法。来源由当前镜头自动确定。</p>
    <p v-if="mode === 'improve' && hasDraft">已有 Draft 正在编辑，请先完成它；不会再创建一个新版本。</p>
    <label v-if="mode === 'new'">Skill 类型
      <select v-model="selectedType"><option v-for="item in skillTypes" :key="item" :value="item">{{ item }}</option></select>
    </label>
    <label v-if="mode === 'new'">名称（可选）<input v-model="preferredName" placeholder="科技产品电影感图片 Prompt" /></label>
    <label>告诉 Dream Stream，你希望这个 Skill 怎样工作
      <textarea v-model="instruction" rows="5" :placeholder="placeholder" />
    </label>
    <p v-if="error" role="alert" class="error">{{ error }}</p>
    <t-button :loading="busy" :disabled="mode === 'improve' && hasDraft" @click="generate">{{ mode === 'derived' ? 'AI 提炼当前 Prompt' : mode === 'improve' ? 'AI 预览改进' : mode === 'draft' ? 'AI 帮我完善当前 Draft' : 'AI 生成 Skill Draft' }}</t-button>
    <template v-if="preview">
      <p class="preview-note">AI 候选预览。刷新页面会丢失；只有下方确认保存才会写入。</p>
      <template v-if="mode === 'new' || mode === 'derived'">
        <label>名称 <input v-model="displayName" /></label>
        <label>简介 <input v-model="description" /></label>
        <p>将保存为 Skill ID：<strong>{{ actualSkillId }}</strong></p>
      </template>
      <template v-if="mode === 'improve'">
        <h4>字段级改动 · 逐项选择</h4>
        <div v-for="change in changes" :key="change.field" class="change-card">
          <label><input v-model="change.accepted" type="checkbox" />采用建议 · {{ labelFor(change.field) }}（{{ change.changeType }}）</label>
          <p>原内容：{{ display(change.before) }}</p><p>建议：{{ display(change.after) }}</p>
        </div>
        <p v-if="!changes.length">AI 未建议字段变化；不会创建空白的新版本。</p>
      </template>
      <template v-else>
        <h4>Skill Candidate</h4>
        <div v-for="field in visibleFields" :key="field.key" class="candidate-card">
          <strong>{{ field.label }}</strong>
          <p v-if="editingField !== field.key">{{ display(candidateContent[field.key]) || '未填写' }}</p>
          <textarea v-else :value="editText(candidateContent[field.key])" rows="3" @input="setField(field.key, field.array, $event)" />
          <t-button size="small" variant="text" @click="editingField = editingField === field.key ? '' : field.key">{{ editingField === field.key ? '完成' : '编辑' }}</t-button>
        </div>
        <details><summary>高级编辑结构</summary>
          <label v-for="field in fields" :key="`advanced-${field.key}`">{{ field.label }}
            <textarea :value="editText(candidateContent[field.key])" rows="2" @input="setField(field.key, field.array, $event)" />
          </label>
        </details>
      </template>
      <details><summary>Advanced · 工程信息</summary>
        <label v-if="mode === 'new' || mode === 'derived'">Skill ID（保存前可改）<input v-model.trim="skillIdOverride" /></label>
        <p>模型引用：{{ preview.modelReference }}</p>
        <p v-if="mode === 'derived'">来源 hash：{{ preview.sourceHash }}</p>
      </details>
      <t-button theme="primary" :loading="busy" :disabled="mode === 'improve' && (!changes.some(item => item.accepted) || hasDraft)" @click="save">
        {{ mode === 'draft' ? '应用到当前 Draft' : mode === 'improve' ? '创建 Draft V2' : '保存 Draft V1' }}
      </t-button>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import axios from "@/utils/axios";
import { cloneSkillContent, mergeAcceptedSkillChanges, type SkillFieldChange } from "@/utils/skillContent";

const props = defineProps<{ mode: "new" | "draft" | "improve" | "derived"; skillType?: string; skillId?: string; version?: string; baseContent?: Record<string, unknown>; projectId?: number; scriptId?: number; storyboardId?: number; hasDraft?: boolean }>();
const emit = defineEmits<{ saved: [value: any] }>();
const skillTypes = ["CONCEPT_CREATIVE", "SCRIPT", "DIRECTOR", "STORYBOARD", "IMAGE_PROMPT", "VIDEO_PROMPT", "CONTINUITY", "EDIT_PACING", "AUDIO_MUSIC", "SUPERVISOR", "QC", "DISTRIBUTION"];
const common: { key: string; label: string; array?: boolean }[] = [{ key: "purpose", label: "用途" }, { key: "inputs", label: "输入", array: true }, { key: "rules", label: "核心规则", array: true }, { key: "outputRequirements", label: "输出要求", array: true }, { key: "prohibitions", label: "禁止事项", array: true }, { key: "applicableScenes", label: "适用场景", array: true }, { key: "tags", label: "内容标签", array: true }];
const image: { key: string; label: string; array?: boolean }[] = [{ key: "subject", label: "主体" }, { key: "composition", label: "构图" }, { key: "cameraLens", label: "镜头 / 焦段" }, { key: "lighting", label: "光线" }, { key: "color", label: "色彩" }, { key: "material", label: "材质" }, { key: "spatialRelationship", label: "空间关系" }, { key: "style", label: "风格" }, { key: "detailDensity", label: "细节密度" }, { key: "background", label: "背景" }, { key: "motion", label: "动态" }, { key: "negativeConstraints", label: "负面约束" }];
const selectedType = ref(props.skillType || "IMAGE_PROMPT"), preferredName = ref(""), instruction = ref(""), preview = ref<any>(null), candidateContent = ref<Record<string, any>>({}), changes = ref<SkillFieldChange[]>([]);
const displayName = ref(""), description = ref(""), tags = ref<string[]>([]), skillIdOverride = ref(""), editingField = ref(""), busy = ref(false), error = ref("");
const fields = computed(() => selectedType.value === "IMAGE_PROMPT" ? [...common, ...image] : common);
const visibleFields = computed(() => fields.value.filter(field => { const value = candidateContent.value[field.key]; return Array.isArray(value) ? value.length > 0 : Boolean(String(value ?? "").trim()); }));
const actualSkillId = computed(() => skillIdOverride.value || preview.value?.skillId || "");
const title = computed(() => props.mode === "new" ? "新建 Skill" : props.mode === "draft" ? "AI 帮我完善当前 Draft" : props.mode === "improve" ? "改进这个 Skill" : "沉淀当前 Prompt 为 Skill");
const placeholder = computed(() => props.mode === "improve" ? "整体不要这么暗；保持电影感，增加自然环境光。" : "主体突出，真实摄影和电影感；真实 UI、Logo 和产品文字不能由 AI 重画。" );
const api = async (path: string, body: any) => (await axios.post(`/skills/${path}`, body)).data;
function display(value: unknown) { return Array.isArray(value) ? value.join("；") : String(value ?? ""); }
function editText(value: unknown) { return Array.isArray(value) ? value.join("\n") : String(value ?? ""); }
function labelFor(key: string) { return fields.value.find(field => field.key === key)?.label || key; }
function setField(key: string, array: boolean | undefined, event: Event) { const text = (event.target as HTMLTextAreaElement).value; candidateContent.value[key] = array ? text.split("\n").map(value => value.trim()).filter(Boolean) : text; }
function reset() { preview.value = null; candidateContent.value = {}; changes.value = []; error.value = ""; editingField.value = ""; }
async function generate() {
  if (busy.value || props.mode === "improve" && props.hasDraft) return;
  busy.value = true; reset();
  try {
    const context = props.projectId ? { projectId: props.projectId } : {};
    const body = props.mode === "new" ? { skillType: selectedType.value, displayName: preferredName.value || undefined, instruction: instruction.value, ...context }
      : props.mode === "derived" ? { projectId: props.projectId, scriptId: props.scriptId, storyboardId: props.storyboardId, skillType: "IMAGE_PROMPT", instruction: instruction.value || undefined }
      : { skillId: props.skillId, version: props.version, instruction: instruction.value, ...context };
    const route = props.mode === "new" ? "builder/quick-preview" : props.mode === "draft" ? "builder/draft-preview" : props.mode === "improve" ? "builder/improve-preview" : "builder/project-derived-preview";
    const result = await api(route, body);
    preview.value = result; candidateContent.value = cloneSkillContent(result.candidateContent); changes.value = cloneSkillContent(result.changes || []);
    displayName.value = result.displayName || preferredName.value; description.value = result.description || ""; tags.value = result.tags || []; skillIdOverride.value = "";
  } catch (value: any) { error.value = value?.response?.data?.message || value?.message || "生成候选失败"; }
  finally { busy.value = false; }
}
async function save() {
  if (!preview.value || busy.value) return;
  busy.value = true; error.value = "";
  try {
    let result: any;
    if (props.mode === "new" || props.mode === "derived") {
      const family = { skillId: actualSkillId.value, displayName: displayName.value, skillType: selectedType.value, description: description.value, tags: tags.value };
      result = props.mode === "new" ? await api("builder/quick-save", { family, candidateContent: cloneSkillContent(candidateContent.value), sourceMetadata: { modelReference: preview.value.modelReference } })
        : await api("builder/project-derived-save", { projectId: props.projectId, scriptId: props.scriptId, storyboardId: props.storyboardId, expectedSourceHash: preview.value.sourceHash, family, candidateContent: cloneSkillContent(candidateContent.value), modelReference: preview.value.modelReference });
    } else if (props.mode === "draft") result = await api("version/edit", { skillId: props.skillId, version: props.version, content: cloneSkillContent(candidateContent.value) });
    else result = await api("version/create", { skillId: props.skillId, sourceVersion: props.version, content: mergeAcceptedSkillChanges(props.baseContent || {}, changes.value) });
    emit("saved", result);
    reset();
  } catch (value: any) { error.value = value?.response?.data?.message || value?.message || "保存失败"; }
  finally { busy.value = false; }
}
watch(() => [props.mode, props.skillId, props.version, props.projectId, props.scriptId, props.storyboardId], reset);
watch(selectedType, reset);
</script>

<style scoped>
.skill-builder { display: grid; gap: 12px; padding: 8px; color: var(--td-text-color-primary); }.skill-builder label { display: block; }.skill-builder input:not([type=checkbox]),.skill-builder textarea,.skill-builder select { display: block; width: 100%; box-sizing: border-box; margin-top: 5px; color: var(--td-text-color-primary); background: var(--td-bg-color-container); border: 1px solid var(--td-component-border); }
.candidate-card,.change-card { border: 1px solid var(--td-component-border); border-radius: 8px; padding: 10px; }.candidate-card p,.change-card p { white-space: pre-wrap; margin: 8px 0; }.preview-note { background: var(--td-bg-color-secondarycontainer); color: var(--td-text-color-primary); padding: 8px; }.error { color: var(--td-error-color); }
details { border: 1px solid var(--td-component-border); padding: 8px; } details label { margin: 10px 0; }
</style>
