<template>
  <t-dialog :visible="true" header="项目 Recipe" width="760px" :footer="false" attach="body" @close="$emit('close')">
    <div class="project-recipe">
      <p>Recipe 是固定的可复用蓝图；推荐仅供审阅，当前不会自动应用 Skill、Capability 或素材清单。</p>
      <p v-if="error" role="alert">{{ error }}</p><p v-if="notice" role="status">{{ notice }}</p>
      <p>当前 Profile：{{ profileLabel }}</p>
      <p>当前 Recipe：{{ current?.binding ? `${current.binding.recipeKey} @ ${current.binding.recipeVersion}` : '未绑定' }} {{ current?.locked ? '· 已有 Stage 记录，绑定锁定' : '' }}</p>
      <label>选择兼容的 Active Recipe 精确版本<select v-model="selected"><option value="">请选择</option><option v-for="r in options" :key="r.key" :value="r.key">{{ r.label }} · {{ r.health.healthy ? '依赖正常' : '依赖异常' }}</option></select></label>
      <button :disabled="!selected || busy" @click="preview">预览绑定</button>
      <div v-if="previewData" class="preview">
        <p>{{ previewData.state === 'CAN_ALIGN_PROFILE' ? '需要明确确认 Profile 对齐' : '已匹配当前精确 Profile，可绑定' }}</p>
        <p>Profile：{{ previewData.profileBefore || '未持久绑定' }} → {{ previewData.profileAfter }}</p>
        <p>Skill 推荐 {{ previewData.recommendations.skills.length }} 项；Capability 推荐 {{ previewData.recommendations.capabilities.length }} 项；素材清单模板 {{ previewData.recommendations.assetPlanTemplate.length }} 项。</p>
        <ul><li v-for="s in previewData.recommendations.skills" :key="s.skillType">{{ s.skillType }} → {{ s.skillId }} @ {{ s.skillVersion }}</li></ul>
        <ul><li v-for="c in previewData.recommendations.capabilities" :key="c.roleKey">{{ c.roleKey }} → {{ c.capabilityId }}</li></ul>
        <ul><li v-for="a in previewData.recommendations.assetPlanTemplate" :key="a.assetKey">{{ a.name }} · {{ a.required ? '必需' : '可选' }} · {{ a.sourcePolicy === 'REAL_REQUIRED' ? '必须上传真实素材' : '允许 AI 生成' }}</li></ul>
        <label v-if="previewData.alignmentRequired"><input v-model="confirmAlignment" type="checkbox" />我确认同时建立 {{ previewData.profileAfter }} 的精确 Profile 绑定</label>
        <button :disabled="busy || (previewData.alignmentRequired && !confirmAlignment)" @click="bind">绑定精确 Recipe</button>
      </div>
      <button v-if="current?.binding && !current.locked" :disabled="busy" @click="unbind">移除 Recipe 绑定</button>
    </div>
  </t-dialog>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import axios from '@/utils/axios';
const props = defineProps<{ projectId: number }>();
defineEmits<{ close: [] }>();
const current = ref<any>(null), families = ref<any[]>([]), selected = ref(''), previewData = ref<any>(null), confirmAlignment = ref(false), error = ref(''), notice = ref(''), busy = ref(false);
const api = async (path: string, body: any) => (await axios.post(`/recipes/${path}`, body)).data;
const options = computed(() => families.value.flatMap(f => f.versions.filter((v: any) => v.status === 'ACTIVE' && v.health.healthy && (!current.value?.profile?.persisted || (current.value.profile.profileKey === v.definition.profileRef.profileKey && current.value.profile.version === v.definition.profileRef.profileVersion))).map((v: any) => ({ key: `${f.recipeKey}@${v.version}`, label: `${f.displayName} · ${f.recipeKey} @ ${v.version} · Profile ${v.definition.profileRef.profileKey}@${v.definition.profileRef.profileVersion}`, health: v.health }))));
const profileLabel = computed(() => current.value?.profile?.managed ? `${current.value.profile.profileKey} @ ${current.value.profile.version} (${current.value.profile.persisted ? '已持久绑定' : 'Legacy 只读'})` : '未绑定');
function fail(e: any) { error.value = e?.response?.data?.message || e?.message || 'Recipe 操作失败'; }
async function load() { try { const [state, rows] = await Promise.all([api('project/resolve', { projectId: props.projectId }), api('list', {})]); current.value = state; families.value = rows; error.value = ''; } catch(e) { fail(e); } }
watch(selected, () => { previewData.value = null; confirmAlignment.value = false; });
async function preview() { const split = selected.value.lastIndexOf('@'); if (split < 1) return; try { previewData.value = await api('project/preview-bind', { projectId: props.projectId, recipeKey: selected.value.slice(0, split), version: selected.value.slice(split + 1) }); error.value = ''; } catch(e) { previewData.value = null; fail(e); } }
async function bind() { if (!previewData.value) return; busy.value = true; try { await api('project/bind', { projectId: props.projectId, recipeKey: previewData.value.recipeKey, version: previewData.value.version, confirmProfileAlignment: confirmAlignment.value }); await load(); previewData.value = null; notice.value = `已绑定 ${current.value.binding.recipeKey} @ ${current.value.binding.recipeVersion}；Profile ${profileLabel.value}。推荐尚未应用。`; } catch(e) { fail(e); } finally { busy.value = false; } }
async function unbind() { if (!window.confirm('移除 Recipe 绑定？已建立的 Profile 绑定会保留。')) return; busy.value = true; try { await api('project/unbind', { projectId: props.projectId }); await load(); notice.value = 'Recipe 已移除；Profile 绑定保留。'; } catch(e) { fail(e); } finally { busy.value = false; } }
watch(() => props.projectId, () => { previewData.value = null; selected.value = ''; void load(); }, { immediate: true });
</script>
<style scoped>
.project-recipe{display:grid;gap:10px;max-height:65vh;overflow-y:auto;color:var(--td-text-color-primary)}.preview{border:1px solid var(--td-component-border);padding:10px;border-radius:6px}select{display:block;width:100%}button,select{color:var(--td-text-color-primary);background:var(--td-bg-color-container);border:1px solid var(--td-component-border);border-radius:4px;padding:7px}button{cursor:pointer}[role=alert]{color:var(--td-error-color)}[role=status]{color:var(--td-success-color)}
</style>
