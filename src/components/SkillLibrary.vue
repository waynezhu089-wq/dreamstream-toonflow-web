<template>
  <div class="skill-library">
    <div class="toolbar">
      <strong>Skill Library</strong>
      <t-button size="small" @click="mode = 'quick'">新建 Skill</t-button>
      <t-button size="small" variant="outline" @click="checkReverse">从参考图创建 Skill</t-button>
      <t-button size="small" variant="text" @click="refresh">刷新</t-button>
    </div>
    <details class="advanced-tools"><summary>Advanced · 工程工具</summary>
      <t-button size="small" variant="outline" @click="beginNew('new')">手动创建</t-button>
      <t-button size="small" variant="outline" @click="beginNew('derived')">从指定项目内容创建</t-button>
    </details>
    <p v-if="error" role="alert" class="error">{{ error }}</p>
    <p v-if="notice" role="status">{{ notice }}</p>
    <div class="columns">
      <div class="list">
        <div v-for="family in families" :key="family.skillId" class="family" :class="{ selected: family.skillId === selectedSkillId }" @click="selectFamily(family)">
          <strong>{{ family.displayName }}</strong>
          <small>{{ family.skillId }}</small>
          <span>{{ family.skillType }} · {{ family.versions[0]?.version ?? '—' }} · {{ family.versions[0]?.status ?? '无版本' }}</span>
          <span>来源 {{ family.versions[0]?.sourceType ?? '—' }} · 标签 {{ family.tags.join('、') || '无' }}</span>
          <small>更新 {{ time(family.updatedAt) }}</small>
        </div>
        <t-empty v-if="!families.length" description="还没有正式 Skill；可新建 Draft V1" />
      </div>
      <div class="detail">
        <SkillBuilderPanel v-if="mode === 'quick'" mode="new" @saved="onBuilderSaved" />
        <template v-else-if="mode === 'new' || mode === 'copy' || mode === 'derived'">
          <h3>{{ mode === 'new' ? '新建 Skill · Manual' : mode === 'copy' ? '复制为新 Skill · Draft V1' : '从指定来源提炼 Skill Draft' }}</h3>
          <label>Skill ID <input v-model.trim="familyForm.skillId" placeholder="image-prompt.tech-product-cinematic" /></label>
          <label>名称 <input v-model.trim="familyForm.displayName" placeholder="科技产品电影感图片 Prompt" /></label>
          <label>类型 <select v-model="familyForm.skillType" :disabled="mode === 'copy'"><option v-for="type in skillTypes" :key="type" :value="type">{{ type }}</option></select></label>
          <label>描述 <textarea v-model="familyForm.description" rows="2" /></label>
          <label>标签（逗号分隔） <input v-model="familyTags" /></label>
          <template v-if="mode === 'derived'">
            <p>只读取你明确指定的一份来源；项目名称、素材 ID 与路径只保存在来源记录中。生成后请人工编辑 Draft。</p>
            <label>项目 ID <input v-model.number="source.projectId" type="number" min="1" /></label>
            <label>制作单元 ID <input v-model.number="source.scriptId" type="number" min="1" /></label>
            <label>来源 <select v-model="source.sourceType"><option value="STORYBOARD_PROMPT">一个 Storyboard Prompt</option><option value="DIRECTOR_OUTPUT_SNAPSHOT">一份 Director 输出快照</option><option value="PRODUCTION_TEXT_RESULT">一份 Production 文本结果</option></select></label>
            <label>来源记录 ID <input v-model.number="source.sourceId" type="number" min="1" /></label>
          </template>
          <p v-if="mode === 'copy'">从 {{ selectedSkillId }} @ {{ selectedVersion }} 复制内容，新 Family 从 Draft V1 开始。</p>
          <div class="actions"><t-button :loading="busy" @click="createFromForm">保存 Draft V1</t-button><t-button variant="text" @click="mode = 'view'">取消</t-button></div>
        </template>
        <template v-else-if="mode === 'reverse'">
          <h3>从参考图创建 Skill</h3>
          <p>{{ reverseMessage }}</p>
          <p>需要经过已验证的 image → text Capability。当前不上传图片、不执行反推，也不会创建假 Draft。</p>
        </template>
        <template v-else-if="selectedSkillId && detail">
          <h3>{{ detail.family.displayName }}</h3>
          <p>{{ detail.family.skillId }} · {{ detail.family.skillType }} · {{ detail.family.description }}</p>
          <div class="actions">
            <label>版本 <select v-model="selectedVersion" @change="openVersion"><option v-for="version in detail.versions" :key="version.version" :value="version.version">{{ version.version }} · {{ version.status }}</option></select></label>
            <t-button size="small" variant="outline" @click="openVersion">查看</t-button>
          </div>
          <template v-if="versionDetail">
            <p>状态：{{ versionDetail.status }} · 来源：{{ versionDetail.sourceType }} · 更新：{{ time(versionDetail.updatedAt) }}</p>
            <t-button v-if="mode !== 'bindings' && versionDetail.status === 'DRAFT'" size="small" :loading="busy" @click="activate">人工激活 {{ selectedVersion }}</t-button>
            <SkillBuilderPanel v-if="mode !== 'bindings' && versionDetail.status === 'DRAFT'" mode="draft" :skill-type="detail.family.skillType" :skill-id="selectedSkillId" :version="selectedVersion" :base-content="versionDetail.content" @saved="onBuilderSaved" />
            <SkillBuilderPanel v-if="mode !== 'bindings' && versionDetail.status === 'ACTIVE'" mode="improve" :skill-type="detail.family.skillType" :skill-id="selectedSkillId" :version="selectedVersion" :base-content="versionDetail.content" :has-draft="hasDraft" @saved="onBuilderSaved" />
            <p v-if="mode !== 'bindings' && versionDetail.status === 'ACTIVE' && hasDraft">已有 {{ pendingDraft?.version }} 正在编辑。<t-button size="small" @click="continueDraft">继续编辑 {{ pendingDraft?.version }}</t-button></p>
            <details class="advanced-tools"><summary>Advanced · 版本、结构化编辑与 Bindings</summary>
              <div class="actions">
                <t-button size="small" variant="outline" :disabled="hasDraft" @click="createNextVersion">手动创建新版本</t-button>
                <t-button size="small" variant="outline" @click="beginNew('copy')">复制为新 Skill</t-button>
                <t-button size="small" variant="outline" @click="openBindings">手动 Bindings</t-button>
              </div>
            <template v-if="mode === 'bindings'">
              <h4>绑定当前 Skill</h4>
              <p>新绑定只能选择 ACTIVE 版本；旧项目的 DEPRECATED 精确引用仍可读取。Override-only 不复制 Skill 版本。</p>
              <label>Scope <select v-model="binding.scopeType"><option value="PROJECT">项目</option><option value="STAGE">制作阶段</option><option value="SHOT">单镜头</option></select></label>
              <label>项目 ID <input v-model.number="binding.projectId" type="number" min="1" /></label>
              <label v-if="binding.scopeType !== 'PROJECT'">制作单元 ID <input v-model.number="binding.scriptId" type="number" min="1" /></label>
              <label v-if="binding.scopeType === 'STAGE'">Stage Key <input v-model.trim="binding.stageKey" /></label>
              <label v-if="binding.scopeType === 'SHOT'">Storyboard ID <input v-model.number="binding.storyboardId" type="number" min="1" /></label>
              <label><input v-model="binding.overrideOnly" type="checkbox" />仅叠加 Override，不复制下层 Skill</label>
              <label>局部 Override <textarea v-model="binding.overrideText" rows="2" /></label>
              <p>Scope Key：{{ scopeKey }}</p>
              <t-button :loading="busy" :disabled="!binding.overrideOnly && versionDetail.status !== 'ACTIVE'" @click="saveCurrentBinding">保存绑定</t-button>
              <t-button variant="outline" :disabled="!validScope" @click="loadScopeBindings">查看当前范围绑定</t-button>
              <h4>当前范围绑定（含仅 Override）</h4>
              <div v-for="row in scopeBindings" :key="`${row.scopeType}:${row.scopeKey}:${row.skillType}`" class="binding-row">
                <span>{{ row.skillType }} · {{ row.scopeKey }} · {{ row.skillId ? `${row.skillId} @ ${row.skillVersion}` : '仅 Override' }}<br />{{ row.overrideText || '无局部 Override' }}</span>
                <t-button size="small" theme="danger" variant="text" @click="removeCurrentBinding(row)">解除</t-button>
              </div>
              <h4>已有精确绑定</h4>
              <div v-for="row in bindings" :key="`${row.scopeType}:${row.scopeKey}`" class="binding-row">
                <span>{{ row.scopeType }} · {{ row.scopeKey }} · {{ row.skillVersion }}<br />{{ row.overrideText || '无局部 Override' }}</span>
                <t-button size="small" theme="danger" variant="text" @click="removeCurrentBinding(row)">解除</t-button>
              </div>
            </template>
            <template v-else>
              <div class="actions">
                <t-button v-if="versionDetail.status === 'DRAFT'" size="small" :loading="busy" @click="saveDraft">保存 Draft</t-button>
                <t-button v-if="versionDetail.status === 'ACTIVE'" size="small" theme="warning" variant="outline" @click="deprecate">弃用版本</t-button>
                <t-button size="small" variant="outline" @click="previewRuntime">预览 Runtime Skill</t-button>
              </div>
              <p>Template：{{ versionDetail.templateId }}。只有 Draft 可编辑；Active 内容不可静默修改。</p>
              <details><summary>高级编辑结构</summary>
                <label>用途 <textarea v-model="content.purpose" rows="3" :disabled="versionDetail.status !== 'DRAFT'" /></label>
                <div v-for="field in commonFields" :key="field.key"><label>{{ field.label }}（每行一条）<textarea :value="(content[field.key] || []).join('\n')" rows="3" :disabled="versionDetail.status !== 'DRAFT'" @input="setLines(field.key, $event)" /></label></div>
                <template v-if="detail.family.skillType === 'IMAGE_PROMPT'">
                  <h4>IMAGE_PROMPT 专用结构</h4>
                  <label v-for="field in imageFields" :key="field.key">{{ field.label }}<textarea v-model="content[field.key]" rows="2" :disabled="versionDetail.status !== 'DRAFT'" /></label>
                </template>
              </details>
              <h4>Loader 实际提供的 Runtime Instruction</h4>
              <pre class="preview">{{ runtimePreview || '点击“预览 Runtime Skill”查看' }}</pre>
            </template>
            </details>
          </template>
        </template>
        <p v-else>选择一个 Skill，或新建 Draft V1。</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import axios from "@/utils/axios";
import SkillBuilderPanel from "@/components/SkillBuilderPanel.vue";
import { cloneSkillContent } from "@/utils/skillContent";

type Family = { skillId: string; displayName: string; skillType: string; description: string; tags: string[]; updatedAt: number; versions: { version: string; status: string; sourceType: string }[] };
const skillTypes = ["CONCEPT_CREATIVE", "SCRIPT", "DIRECTOR", "STORYBOARD", "IMAGE_PROMPT", "VIDEO_PROMPT", "CONTINUITY", "EDIT_PACING", "AUDIO_MUSIC", "SUPERVISOR", "QC", "DISTRIBUTION"];
const commonFields = [{ key: "inputs", label: "输入" }, { key: "rules", label: "规则" }, { key: "outputRequirements", label: "输出要求" }, { key: "prohibitions", label: "禁止事项" }, { key: "applicableScenes", label: "适用场景" }, { key: "tags", label: "内容标签" }];
const imageFields = [{ key: "subject", label: "主体" }, { key: "composition", label: "构图" }, { key: "cameraLens", label: "镜头 / 焦段" }, { key: "lighting", label: "光线" }, { key: "color", label: "色彩" }, { key: "material", label: "材质" }, { key: "spatialRelationship", label: "空间关系" }, { key: "style", label: "风格" }, { key: "detailDensity", label: "细节密度" }, { key: "background", label: "背景" }, { key: "motion", label: "动态" }, { key: "negativeConstraints", label: "负面约束" }];
const families = ref<Family[]>([]), detail = ref<any>(null), versionDetail = ref<any>(null), bindings = ref<any[]>([]), scopeBindings = ref<any[]>([]);
const selectedSkillId = ref(""), selectedVersion = ref(""), runtimePreview = ref(""), content = ref<any>({});
const mode = ref<"view" | "quick" | "new" | "copy" | "derived" | "reverse" | "bindings">("view");
const busy = ref(false), error = ref(""), notice = ref(""), reverseMessage = ref("");
const familyForm = reactive({ skillId: "", displayName: "", skillType: "IMAGE_PROMPT", description: "" }), familyTags = ref("");
const source = reactive({ projectId: 0, scriptId: 0, sourceType: "STORYBOARD_PROMPT", sourceId: 0 });
const binding = reactive({ scopeType: "PROJECT", projectId: 0, scriptId: 0, storyboardId: 0, stageKey: "image-prompt", overrideOnly: false, overrideText: "" });
const scopeKey = computed(() => binding.scopeType === "PROJECT" ? `project:${binding.projectId}` : binding.scopeType === "STAGE" ? `project:${binding.projectId}:script:${binding.scriptId}:stage:${binding.stageKey}` : `project:${binding.projectId}:script:${binding.scriptId}:storyboard:${binding.storyboardId}`);
const validScope = computed(() => binding.projectId > 0 && (binding.scopeType === "PROJECT" || (binding.scriptId > 0 && (binding.scopeType === "STAGE" ? !!binding.stageKey : binding.storyboardId > 0))));
const pendingDraft = computed(() => detail.value?.versions.find((row: any) => row.status === "DRAFT") ?? null);
const hasDraft = computed(() => Boolean(pendingDraft.value));
const api = async (path: string, body: any = {}) => (await axios.post(`/skills/${path}`, body)).data;
const time = (value: number) => value ? new Date(Number(value)).toLocaleString() : "—";
function showError(value: any) { error.value = value?.response?.data?.message || value?.message || "Skill 操作失败"; }
async function refresh() { try { families.value = await api("list"); } catch (e) { showError(e); } }
async function selectFamily(family: Family) {
  selectedSkillId.value = family.skillId; selectedVersion.value = family.versions[0]?.version || ""; mode.value = "view";
  try { detail.value = await api("get", { skillId: family.skillId }); await openVersion(); } catch (e) { showError(e); }
}
async function openVersion() {
  versionDetail.value = detail.value?.versions.find((row: any) => row.version === selectedVersion.value) ?? null;
  content.value = versionDetail.value ? cloneSkillContent(versionDetail.value.content) : {};
  runtimePreview.value = "";
}
function beginNew(next: "new" | "copy" | "derived") {
  mode.value = next; error.value = ""; notice.value = "";
  familyForm.skillId = ""; familyForm.displayName = ""; familyForm.description = ""; familyForm.skillType = next === "copy" ? detail.value?.family.skillType || "IMAGE_PROMPT" : "IMAGE_PROMPT";
  familyTags.value = "";
}
function familyValue() { return { ...familyForm, tags: familyTags.value.split(/[,，]/).map(v => v.trim()).filter(Boolean) }; }
async function createFromForm() {
  busy.value = true; error.value = "";
  try {
    let result: any;
    if (mode.value === "copy") result = await api("builder/copy", { sourceSkillId: selectedSkillId.value, sourceVersion: selectedVersion.value, family: familyValue() });
    else if (mode.value === "derived") result = await api("builder/project-derived", { family: familyValue(), ...source });
    else { const templates = await api("templates"); result = await api("builder/quick-save", { family: familyValue(), candidateContent: templates[familyForm.skillType].content, sourceMetadata: { builder: "MANUAL_ADVANCED" } }); }
    await refresh(); await selectFamily(families.value.find(f => f.skillId === result.family.skillId)!);
    notice.value = `${result.version.version} Draft 已保存；请填写结构、预览并人工激活。`;
  } catch (e) { showError(e); } finally { busy.value = false; }
}
function setLines(field: string, event: Event) { content.value[field] = (event.target as HTMLTextAreaElement).value.split("\n").map(v => v.trim()).filter(Boolean); }
async function saveDraft() { busy.value = true; error.value = ""; try { versionDetail.value = await api("version/edit", { skillId: selectedSkillId.value, version: selectedVersion.value, content: cloneSkillContent(content.value) }); await refresh(); notice.value = "Draft 已保存"; } catch (e) { showError(e); } finally { busy.value = false; } }
async function activate() { busy.value = true; error.value = ""; try { await saveDraft(); if (error.value) return; await api("version/activate", { skillId: selectedSkillId.value, version: selectedVersion.value }); await refresh(); detail.value = await api("get", { skillId: selectedSkillId.value }); await openVersion(); notice.value = `${selectedVersion.value} 已激活`; } catch (e) { showError(e); } finally { busy.value = false; } }
async function deprecate() { if (!window.confirm("弃用后不能创建新绑定；历史精确绑定仍可继续使用。确认？")) return; try { await api("version/deprecate", { skillId: selectedSkillId.value, version: selectedVersion.value }); await refresh(); detail.value = await api("get", { skillId: selectedSkillId.value }); await openVersion(); } catch (e) { showError(e); } }
async function createNextVersion() { try { const value = await api("version/create", { skillId: selectedSkillId.value, sourceVersion: selectedVersion.value }); await refresh(); detail.value = await api("get", { skillId: selectedSkillId.value }); selectedVersion.value = value.version; mode.value = "view"; await openVersion(); notice.value = `${value.version} Draft 已创建，旧绑定保持原版本。`; } catch (e) { showError(e); } }
async function continueDraft() { if (!pendingDraft.value) return; selectedVersion.value = pendingDraft.value.version; mode.value = "view"; await openVersion(); }
async function onBuilderSaved(value: any) {
  await refresh();
  const skillId = value.family?.skillId || value.skillId || selectedSkillId.value;
  const family = families.value.find(item => item.skillId === skillId);
  if (family) await selectFamily(family);
  if (value.version?.version) { selectedVersion.value = value.version.version; await openVersion(); }
  else if (value.version && typeof value.version === "string") { selectedVersion.value = value.version; await openVersion(); }
  notice.value = "候选已按你的确认保存为 Draft；激活仍需你决定。";
}
async function previewRuntime() { try { runtimePreview.value = (await api("version/preview", { skillId: selectedSkillId.value, version: selectedVersion.value })).runtimeInstruction; } catch (e) { showError(e); } }
async function openBindings() { mode.value = "bindings"; try { bindings.value = await api("binding/list", { skillId: selectedSkillId.value }); } catch (e) { showError(e); } }
async function loadScopeBindings() { if (!validScope.value) return; try { scopeBindings.value = await api("binding/list", { scopeType: binding.scopeType, scopeKey: scopeKey.value }); } catch (e) { showError(e); } }
async function saveCurrentBinding() { busy.value = true; error.value = ""; try { await api("binding/save", { scopeType: binding.scopeType, scopeKey: scopeKey.value, skillType: detail.value.family.skillType, skillId: binding.overrideOnly ? null : selectedSkillId.value, skillVersion: binding.overrideOnly ? null : selectedVersion.value, overrideText: binding.overrideText.trim() || null }); await openBindings(); await loadScopeBindings(); notice.value = "绑定已保存；历史项目版本不会自动升级。"; } catch (e) { showError(e); } finally { busy.value = false; } }
async function removeCurrentBinding(row: any) { try { await api("binding/remove", { scopeType: row.scopeType, scopeKey: row.scopeKey, skillType: row.skillType }); await openBindings(); if (validScope.value) await loadScopeBindings(); } catch (e) { showError(e); } }
async function checkReverse() { mode.value = "reverse"; error.value = ""; try { reverseMessage.value = (await api("builder/reverse-compatibility")).message; } catch (e) { showError(e); } }
onMounted(refresh);
</script>

<style scoped>
.skill-library { min-width: 0; height: 100%; display: flex; flex-direction: column; gap: 12px; color: var(--td-text-color-primary); }
.toolbar,.actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.columns { display: grid; grid-template-columns: minmax(220px, 32%) minmax(0, 1fr); gap: 16px; flex: 1; min-height: 0; }
.list,.detail { overflow-y: auto; min-height: 0; padding: 8px; }
.family { border: 1px solid var(--td-component-border); border-radius: 8px; padding: 10px; margin-bottom: 8px; cursor: pointer; display: grid; gap: 4px; }
.family.selected { border-color: var(--td-brand-color); } .family small,.family span { color: var(--td-text-color-secondary); }
.detail label { display: block; margin: 10px 0; } .detail input:not([type=checkbox]),.detail select,.detail textarea { display: block; width: 100%; box-sizing: border-box; margin-top: 4px; color: var(--td-text-color-primary); background: var(--td-bg-color-container); border: 1px solid var(--td-component-border); }
.detail input[type=checkbox] { margin-right: 6px; }.preview { white-space: pre-wrap; max-height: 300px; overflow: auto; background: var(--td-bg-color-secondarycontainer); color: var(--td-text-color-primary); padding: 12px; }
.binding-row { border-bottom: 1px solid var(--td-component-border); padding: 8px 0; display: flex; justify-content: space-between; gap: 8px; } .error { color: var(--td-error-color); }
</style>
