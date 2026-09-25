<template>
  <section class="ad-plan" aria-label="广告资产准备">
    <details><summary>本项目模型配置（可稍后设置）</summary><ModelPresets :project-id="Number(projectId)" /></details>
    <header class="heading">
      <div><h1>广告资产准备</h1><p>列出这条广告需要的素材，准备齐全后再进入广告制作。</p></div>
      <label class="unit">当前广告制作单元
        <select aria-label="当前广告制作单元" :value="scriptId ?? ''" :disabled="busy || !!editor" @change="changeUnit">
          <option value="" disabled>请选择制作单元</option>
          <option v-for="unit in units" :key="unit.id" :value="unit.id">{{ unit.name }}</option>
        </select>
      </label>
    </header>
    <details v-if="context" class="orchestrator-advanced"><summary>Advanced · Stage Orchestrator Inspector</summary><StageOrchestratorInspector :project-id="context.projectId" :script-id="context.scriptId" /></details>
    <p v-if="unitError" class="error" role="alert">{{ unitError }} <button @click="loadUnits">重新加载</button></p>
    <p v-if="!context">请选择这条广告的制作单元，再查看它自己的素材清单。</p>
    <template v-else>
      <div class="summary" aria-live="polite">
        <div>
          <h2 v-if="gate">必需素材 {{ required.length }} 项，已准备 {{ required.length - blockers.length }} 项，还缺 {{ blockers.length }} 项</h2>
          <h2 v-else>{{ loading ? '正在读取素材状态…' : '素材状态待检查' }}</h2>
          <p v-if="gate && !items.length">清单还是空的。请先添加这条广告需要的素材。</p>
          <p v-else-if="gate?.ready">素材已确认，可以进入广告制作。</p>
          <p v-else-if="gate?.prepared">必需素材已准备好，请确认后继续。</p>
          <ul v-if="blockers.length" class="blockers"><li v-for="item in blockers" :key="item.assetKey">{{ item.name }}：{{ itemStatus(item, gate) }}</li></ul>
        </div>
        <div class="actions">
          <button :disabled="loading || busy || !!editor" @click="refresh">刷新状态</button>
          <button class="primary" :disabled="!canConfirm || !!editor" @click="confirmAndContinue">{{ busy ? '正在处理…' : '确认资产准备完成，进入广告制作' }}</button>
        </div>
      </div>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <div class="list-heading"><h2>素材清单</h2><button :disabled="loading || busy || !gate || !!editor" @click="edit()">＋ 新增素材</button></div>
      <p class="hint">“必需”素材会影响是否可以开始制作；“可选”素材不会阻塞。状态以服务器最新检查结果为准。</p>
      <article v-for="item in items" :key="item.assetKey" class="plan-item" :aria-label="item.name">
        <div class="item-heading">
          <div><h3>{{ item.name }}</h3><span class="category">{{ item.category }}</span></div>
          <div class="tags"><span>{{ item.required ? '必需' : '可选' }}</span><span :class="{ real: item.sourcePolicy === 'REAL_REQUIRED' }">{{ policyLabel(item.sourcePolicy) }}</span><strong :class="{ ready: itemStatus(item, gate) === '已准备' }">{{ itemStatus(item, gate) }}</strong></div>
        </div>
        <p>当前绑定：<strong>{{ boundName(item) }}</strong></p>
        <p v-if="item.sourcePolicy === 'REAL_REQUIRED'" class="hint">请上传真实的 Logo、产品或界面素材。AI 生成图片不符合要求；已有素材也必须通过服务器的真实上传校验，旧素材可能需要重新上传。</p>
        <p v-else class="hint">可绑定这条广告已有的 AI 素材或上传素材，图片完成后才算准备好。</p>
        <div class="actions binding">
          <select :aria-label="`为${item.name}选择已有素材`" v-model="choices[item.assetKey]" :disabled="locked">
            <option :value="undefined" disabled>{{ item.sourcePolicy === 'REAL_REQUIRED' ? '选择已有素材（须校验真实来源）' : '选择当前单元已有素材' }}</option>
            <option v-for="asset in assets" :key="asset.id" :value="asset.id">{{ asset.name }}</option>
          </select>
          <button :disabled="locked || !choices[item.assetKey]" @click="bind(item.assetKey, choices[item.assetKey]!)">{{ item.sourcePolicy === 'REAL_REQUIRED' ? '校验来源并绑定' : '绑定素材' }}</button>
          <button v-if="item.assetId" :disabled="locked" @click="unbind(item.assetKey)">解除绑定</button>
          <label v-if="item.sourcePolicy === 'REAL_REQUIRED'" class="upload" :class="{ disabled: locked }">
            上传真实素材<input type="file" accept="image/*" :aria-label="`为${item.name}上传真实素材`" :disabled="locked" @change="uploadFile(item.assetKey, $event)" />
          </label>
          <button v-else :disabled="locked" @click="goGenerate">去资产生成</button>
          <button :disabled="locked" @click="edit(item)">编辑</button>
          <button class="danger" :disabled="locked" @click="deleteItem(item)">删除</button>
        </div>
      </article>
      <div v-if="editor" ref="editorPanel" class="editor" role="dialog" aria-modal="false" aria-label="编辑素材清单项">
        <form @submit.prevent="saveEditor">
          <h2>{{ editorTitle }}</h2>
          <label>素材名称<input v-model="editor.name" maxlength="256" required autofocus /></label>
          <label>类别<input v-model="editor.category" maxlength="128" required placeholder="例如：品牌、产品、角色、场景" /></label>
          <label class="checkbox"><input type="checkbox" v-model="editor.required" /> 这是开始制作前必须准备的素材</label>
          <label>素材来源<select v-model="editor.sourcePolicy"><option value="REAL_REQUIRED">必须上传真实素材</option><option value="AI_ALLOWED">允许AI生成</option></select></label>
          <p class="hint">修改来源要求后，已有绑定会重新交由服务器检查；不符合时请先解除绑定。</p>
          <div class="actions"><button type="submit" class="primary" :disabled="busy">保存素材</button><button type="button" :disabled="busy" @click="editor = null">取消</button></div>
        </form>
      </div>
    </template>
  </section>
</template>
<script setup lang="ts">
import ModelPresets from "@/components/ModelPresets.vue";
import StageOrchestratorInspector from "@/components/StageOrchestratorInspector.vue";
import { computed, ref, watch, nextTick, onScopeDispose } from "vue";
import { useRoute, useRouter } from "vue-router";
import axios from "@/utils/axios";
import { currentAdvertisementUnit, selectAdvertisementUnit, unitId } from "@/utils/advertisementUnit";
import { useAdvertisementPlan, itemStatus, policyLabel, editable, type PlanItem, type Context } from "./useAdvertisementPlan";
const props = defineProps<{ projectId: number }>();
const route = useRoute(), router = useRouter();
const units = ref<{ id: number; name: string }[]>([]), unitError = ref("");
const scriptId = computed(() => currentAdvertisementUnit(props.projectId, route.query.scriptId));
const context = computed<Context | null>(() => unitId(props.projectId) && scriptId.value && units.value.some(unit => unit.id === scriptId.value) ? { projectId: props.projectId, scriptId: scriptId.value } : null);
const { items, gate, assets, loading, busy, error, canConfirm, required, blockers, refresh, saveItem, remove, bind, unbind, upload, confirm } = useAdvertisementPlan(context, (url, body) => axios.post(url, body));
const editor = ref<PlanItem | null>(null), choices = ref<Record<string, number | undefined>>({});
const editorPanel = ref<HTMLElement | null>(null);
const editorTitle = computed(() => items.value.some(row => row.assetKey === editor.value?.assetKey) ? "编辑素材" : "新增素材");
const locked = computed(() => loading.value || busy.value || !!editor.value || !gate.value);
let unitRequest = 0;
onScopeDispose(() => { ++unitRequest; });
async function loadUnits() {
  const request = ++unitRequest, projectId = props.projectId; units.value = []; unitError.value = "";
  try {
    const { data } = await axios.post("/script/getScrptApi", { projectId });
    if (request !== unitRequest || projectId !== props.projectId) return;
    units.value = data;
    if (!scriptId.value && route.query.scriptId === undefined && data.length === 1) {
      selectAdvertisementUnit(projectId, data[0].id);
      await router.replace({ path: "/assets", query: { scriptId: String(data[0].id) } });
    }
  } catch (e: any) { if (request === unitRequest) unitError.value = e?.message || "读取制作单元失败，请重试。"; }
}
watch(() => props.projectId, loadUnits, { immediate: true });
watch(context, () => { editor.value = null; choices.value = {}; }, { flush: "sync" });
function changeUnit(event: Event) {
  const id = unitId((event.target as HTMLSelectElement).value);
  if (!id) return;
  selectAdvertisementUnit(props.projectId, id);
  void router.replace({ path: "/assets", query: { scriptId: String(id) } });
}
async function edit(item?: PlanItem) {
  editor.value = item ? editable(item) : { assetKey: crypto.randomUUID(), name: "", category: "", required: true, sourcePolicy: "REAL_REQUIRED", assetId: null };
  await nextTick();
  editorPanel.value?.scrollIntoView?.({ block: "center", behavior: "smooth" });
  editorPanel.value?.querySelector("input")?.focus();
}
async function saveEditor() { if (editor.value && await saveItem(editor.value)) editor.value = null; }
async function deleteItem(item: PlanItem) { if (window.confirm(`从素材清单中删除“${item.name}”？已上传的素材不会删除。`)) await remove(item.assetKey); }
function boundName(item: PlanItem) { return item.assetId ? assets.value.find(asset => asset.id === item.assetId)?.name ?? "原绑定素材已不可用" : "尚未绑定"; }
async function uploadFile(key: string, event: Event) {
  const input = event.target as HTMLInputElement, file = input.files?.[0]; input.value = "";
  if (file) await upload(key, file);
}
function goGenerate() { void router.push({ path: "/cornerScape", query: { scriptId: String(scriptId.value) } }); }
async function confirmAndContinue() {
  const ctx = await confirm();
  if (ctx) { selectAdvertisementUnit(ctx.projectId, ctx.scriptId); await router.push({ path: "/production", query: { scriptId: String(ctx.scriptId) } }); }
}
</script>
<style scoped>
.ad-plan { padding: 24px; color: var(--td-text-color-primary, #203047); overflow: auto; height: 100%; box-sizing: border-box; }
h1,h2,h3,p { margin: 0 0 12px; } h1 { font-size: 24px; } h2 { font-size: 18px; } h3 { font-size: 17px; display: inline; margin-right: 12px; }
.heading,.summary,.list-heading,.item-heading { display: flex; justify-content: space-between; gap: 20px; flex-wrap: wrap; align-items: center; }
.heading { margin-bottom: 20px; }.summary { background: var(--td-bg-color-secondarycontainer, #eef4fb); padding: 20px; border-radius: 12px; margin-bottom: 24px; }
.plan-item { border: 1px solid var(--td-component-border, #dce3eb); border-radius: 10px; padding: 18px; margin-top: 14px; }.item-heading { margin-bottom: 14px; }
.actions,.tags { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }.tags span,.tags strong { padding: 4px 8px; border-radius: 4px; background: var(--td-bg-color-secondarycontainer, #f1f4f8); font-size: 13px; }.tags .real { color: #946100; }.tags .ready { color: #16835e; }
.hint,.category,.heading p { color: var(--td-text-color-secondary, #5f6b7a); font-size: 14px; line-height: 1.6; }.error { color: #b83232; background: #fff0ef; padding: 12px; border-radius: 6px; }.blockers { margin: 8px 0 0; padding-left: 20px; color: #a45c10; }
button,.upload { border: 1px solid var(--td-component-border, #c9d2df); border-radius: 6px; padding: 9px 13px; background: var(--td-bg-color-container, #fff); color: inherit; cursor: pointer; font: inherit; font-size: 14px; }.primary,.upload { background: #245bd8; border-color: #245bd8; color: white; }.danger { color: #b83232; }button:disabled,.disabled { opacity: .5; cursor: not-allowed; }
input,select { font: inherit; color: inherit; background: var(--td-bg-color-container, #fff); border: 1px solid var(--td-component-border, #c9d2df); border-radius: 6px; padding: 9px; max-width: 100%; box-sizing: border-box; }select { min-width: 190px; }.unit { display: grid; gap: 8px; font-size: 14px; }.upload { position: relative; }.upload input { position: absolute; inset: 0; width: 100%; opacity: 0; cursor: pointer; }
.editor { margin-top: 18px; padding: 22px; border: 2px solid #245bd8; border-radius: 10px; max-width: 640px; }.editor label { display: grid; gap: 8px; margin-bottom: 16px; }.editor .checkbox { display: flex; align-items: center; }.binding { margin-top: 14px; }button:focus-visible,input:focus-visible,select:focus-visible { outline: 2px solid #245bd8; outline-offset: 2px; }
</style>
