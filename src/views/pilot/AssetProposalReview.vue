<template>
  <section class="proposal-review" aria-label="素材提案人工审查">
    <header class="review-heading"><div><h2>Asset Bible Proposal</h2><p class="muted">先看全局，再按需审查候选与覆盖；此处不会自动写入正式素材。</p></div>
      <button type="button" @click="$emit('add-candidate', null)">＋ 补充候选</button></header>
    <div class="overview" aria-label="提案概览">
      <span>{{ addChanges.length }} 个新增资产</span><span>{{ referencedExisting.length }} 个已有身份引用</span>
      <span :class="{ alert: missing.length }">{{ missing.length }} 个未覆盖</span>
      <span :class="{ alert: relationStatus === 'NEEDS_REVIEW' }">关系 {{ relationStatus === 'READY' ? '已分析' : '待人工复核' }}</span>
      <span :class="{ alert: review?.status !== 'READY' }">充分性 {{ review?.status === 'READY' ? '待人工确认' : '需要复核' }}</span>
    </div>
    <p v-if="relationStatus === 'NEEDS_REVIEW'" class="relation-warning">关系分析未完成；共享视觉系统与连续形态需人工确认或重新分析。</p>
    <div v-if="review" class="sufficiency" :class="review.status === 'NEEDS_REVIEW' ? 'needs-review' : 'ready'">
      <strong>素材充分性 · {{ review.status === 'READY' ? '已列需求有归属，待人工确认' : '需要人工审查' }}</strong>
      <p>{{ review.reason }}</p>
    </div>
    <div v-if="missing.length" class="missing-grid"><article v-for="item in missing" :key="item.requirementKey" class="missing-item">
      <strong>待定 · {{ item.label }}</strong><p>{{ coverageLabel(item.coverageType) }} · {{ item.note || '尚无明确生产归属' }}</p>
      <button type="button" @click="$emit('add-candidate', item.requirementKey)">加入当前 Proposal</button>
      <div v-if="addChanges.length" class="link-row"><select v-model="linkChoices[item.requirementKey]" :aria-label="`为 ${item.label} 选择已有候选`">
        <option value="">选择已有候选…</option><option v-for="change in addChanges" :key="change.clientRef" :value="change.clientRef">{{ change.asset.name || '待命名候选' }}</option>
      </select><button type="button" :disabled="!linkChoices[item.requirementKey]" @click="$emit('link-candidate', item.requirementKey, linkChoices[item.requirementKey])">关联候选</button></div>
    </article></div>

    <section v-for="group in groups" v-show="group.changes.length || group.existing.length" :key="group.key" class="asset-group">
      <h3>{{ group.title }} <small>{{ group.changes.length + group.existing.length }}</small></h3>
      <div class="asset-grid">
        <button v-for="change in group.changes" :key="change.clientRef" type="button" class="asset-card"
          :class="{ selected: selectedRef === change.clientRef }" @click="selectedRef = change.clientRef">
          <span class="card-top"><strong>{{ change.asset.name || '待命名候选' }}</strong><small>NEW</small></span>
          <span class="card-meta"><span>{{ assetKindLabel(change.asset.assetKind) }}</span><span>{{ change.asset.importance === 'CORE' ? '核心' : '辅助' }}</span><span>{{ change.asset.sourcePolicy === 'REAL_REQUIRED' ? 'REAL' : 'AI' }}</span></span>
          <span class="card-description">{{ change.asset.description || '尚无描述；点击补充' }}</span>
          <span class="card-foot">{{ isCovered(change) ? '已列入覆盖' : '待检查覆盖' }}<span v-if="relations(change).shared"> · 视觉系统：{{ relations(change).shared }}</span><span v-if="relations(change).continuity.length"> · 连续形态 {{ relations(change).continuity.length }}</span><span v-if="manifestations(change).length"> · {{ manifestations(change).length }} 个关联形态</span></span>
        </button>
        <article v-for="asset in group.existing" :key="asset.canonicalKey" class="asset-card existing-card">
          <span class="card-top"><strong>{{ asset.name }}</strong><small>EXISTING</small></span>
          <span class="card-meta"><span>{{ assetKindLabel(asset.assetKind) }}</span><span>{{ asset.sourcePolicy === 'REAL_REQUIRED' ? 'REAL' : 'AI' }}</span></span>
          <span class="card-description">{{ asset.canonicalKey }} · {{ referenceConfirmed(asset.canonicalKey) ? 'Asset Bible 参考已确认' : '已有身份引用' }}</span>
          <span class="card-foot">{{ assetPlan?.some((item: any) => item.assetKey === asset.canonicalKey && item.assetId) ? 'Production 已绑定' : 'Production 未绑定' }} · 真实品牌／UI 不作 AI 重绘</span>
        </article>
      </div>
    </section>
    <section v-if="selectedChange" class="detail" aria-label="候选详情">
      <header><div><h3>{{ selectedChange.asset.name || '待命名候选' }} · 详情</h3><p class="muted">编辑后需要重新预览，确认前不会写入 Asset Bible。</p></div><button type="button" @click="selectedRef = null">收起详情</button></header>
      <div class="field-row"><label>名称<input v-model="selectedChange.asset.name" @input="$emit('dirty')" /></label>
        <label>类别<select v-model="selectedChange.asset.category" @change="$emit('dirty')"><option v-for="category in categories" :key="category" :value="category">{{ category }}</option></select></label></div>
      <div class="field-row"><label>子类型<select v-model="selectedChange.asset.assetKind" @change="$emit('dirty')"><option v-for="kind in assetKinds" :key="kind" :value="kind">{{ assetKindLabel(kind) }}</option></select></label>
        <label>重要性<select v-model="selectedChange.asset.importance" @change="$emit('dirty')"><option value="CORE">核心</option><option value="SUPPORTING">辅助</option></select></label></div>
      <label>完整描述<textarea v-model="selectedChange.asset.description" @input="$emit('dirty')" /></label>
      <label>Prompt 草案<textarea v-model="selectedChange.asset.prompt" @input="$emit('dirty')" /></label>
      <label>来源<select v-model="selectedChange.asset.sourcePolicy" @change="$emit('dirty')"><option value="AI_ALLOWED">允许 AI 生成</option><option value="REAL_REQUIRED">必须上传真实素材</option></select></label>
      <p v-if="relations(selectedChange).shared" class="relation">共享视觉系统：{{ relations(selectedChange).shared }}</p>
      <p v-if="relations(selectedChange).continuity.length" class="relation">连续形态：{{ relations(selectedChange).continuity.join(' → ') }}</p>
      <p v-if="manifestations(selectedChange).length" class="relation">关联形态：{{ manifestations(selectedChange).join(' → ') }}</p>
    </section>
    <p v-for="change in otherChanges" :key="change.canonicalKey" class="muted">{{ change.operation }} · {{ change.canonicalKey }}（详情请在上方素材身份编辑区查看）</p>

    <section v-if="coverage.length" class="coverage-draft">
      <h3>Coverage Review</h3><p class="muted">身份与场景由素材承担；剧情动作与构图目标留给 Storyboard。</p>
      <div class="coverage-summary"><div v-for="summary in coverageSummary" :key="summary.key"><strong>{{ summary.title }}</strong><span>{{ summary.documented }} / {{ summary.total }}</span></div></div>
      <button type="button" @click="showAllCoverage = !showAllCoverage">{{ showAllCoverage ? '收起正常覆盖' : `查看全部正常覆盖（${visualCoverage.length}）` }}</button>
      <div v-if="showAllCoverage" class="coverage-list"><div v-for="(item, index) in visualCoverage" :key="index" class="coverage-row">
        <label v-if="item.candidateRefs.some((ref: string) => ref.startsWith('manual_'))">视觉需求<input v-model="item.label" @input="$emit('dirty')" /></label>
        <span>{{ coverageLabel(item.coverageType) }} · {{ item.label }} — {{ coverageOwner(item) }}</span></div></div>
      <div class="beat-summary"><strong>{{ beatCoverage.length }} 个剧情事件／构图目标将在 Storyboard 阶段处理</strong>
        <button type="button" @click="showBeats = !showBeats">{{ showBeats ? '收起' : '展开查看' }}</button></div>
      <div v-if="showBeats" class="coverage-list"><p v-for="(item, index) in beatCoverage" :key="`${index}-${item.label}`" class="coverage-row">
        {{ item.label }} · {{ item.classification === 'COMPOSITION_MOTIF' ? '构图目标' : '镜头局部' }}<span v-if="item.note"> — {{ item.note }}</span></p></div>
    </section>
    <section v-if="preview" class="preview-review"><h3>Preview · 待人工确认</h3>
      <p class="muted">{{ addChanges.length }} 个新增 · {{ referencedExisting.length }} 个已有引用 · {{ missing.length }} 个未覆盖。预览不等于应用。</p>
      <div class="duplicate-summary"><strong>重复身份检查</strong><span>{{ possibleDuplicates.length ? `发现 ${possibleDuplicates.length} 个可能重复` : '未发现同名候选' }}</span>
        <button v-if="possibleDuplicates.length" type="button" @click="showDuplicates = !showDuplicates">{{ showDuplicates ? '收起' : '查看' }}</button></div>
      <p v-for="item in showDuplicates ? possibleDuplicates : []" :key="item.clientRef" class="muted">{{ candidateName(item.clientRef) }}：{{ item.possibleMatches.join('、') }}。不会自动合并。</p>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { describeProposalRelations, reviewPendingSufficiency } from './skillProposal';

const props = defineProps<{ changes: any[]; coverage: any[]; sufficiency: any | null; existingAssets: any[];
  relationStatus: 'READY' | 'NEEDS_REVIEW'; mergeSuggestions?: any[]; references?: any[]; assetPlan?: any[]; preview?: any | null }>();
defineEmits<{ (event: 'dirty'): void; (event: 'add-candidate', requirementKey: string | null): void;
  (event: 'link-candidate', requirementKey: string, clientRef: string): void }>();
const categories = ['CHAR','ACC','PROP','PRODUCT','LOC','BRAND','UI','FX'];
const assetKinds = ['HUMAN_CHARACTER','CREATURE','VEHICLE','PROP','ENVIRONMENT','MATERIAL_FX','CELESTIAL','BRAND_MARK','UI_REFERENCE','OTHER'];
const kindLabels: Record<string, string> = { HUMAN_CHARACTER:'人物',CREATURE:'生物',VEHICLE:'载具',PROP:'道具',ENVIRONMENT:'场景',
  MATERIAL_FX:'FX / 材质',CELESTIAL:'天体 / 目标',BRAND_MARK:'品牌标识',UI_REFERENCE:'界面参考',OTHER:'其他' };
const assetKindLabel = (kind: string) => kindLabels[kind] || kind;
const selectedRef = ref<string | null>(null);
const showAllCoverage = ref(false), showBeats = ref(false), showDuplicates = ref(false);
const linkChoices = reactive<Record<string,string>>({});
const addChanges = computed(() => props.changes.filter(item => item.operation === 'ADD'));
const otherChanges = computed(() => props.changes.filter(item => item.operation !== 'ADD'));
const selectedChange = computed(() => addChanges.value.find(item => item.clientRef === selectedRef.value));
const review = computed(() => reviewPendingSufficiency(props.sufficiency, props.coverage));
const missing = computed(() => review.value?.requirements.filter((row: any) => row.status === 'MISSING') || []);
const referencedExisting = computed(() => {
  const keys = new Set<string>([...(props.mergeSuggestions || []).map(item => item.existingCanonicalKey),
    ...props.coverage.flatMap(item => item.existingCanonicalKeys || [])]);
  return props.existingAssets.filter(asset => keys.has(asset.canonicalKey));
});
const groupKey = (kind: string) => ['HUMAN_CHARACTER','CREATURE','VEHICLE','PROP'].includes(kind) ? 'subjects'
  : ['ENVIRONMENT','CELESTIAL'].includes(kind) ? 'spaces' : 'systems';
const groups = computed(() => [
  { key:'subjects',title:'核心主体' },{ key:'spaces',title:'场景与空间' },{ key:'systems',title:'视觉系统与品牌' },
].map(group => ({ ...group, changes:addChanges.value.filter(change => groupKey(change.asset.assetKind) === group.key),
  existing:referencedExisting.value.filter(asset => groupKey(asset.assetKind) === group.key) })));
const visualCoverage = computed(() => props.coverage.filter(item => !['SHOT_LOCAL','COMPOSITION_MOTIF'].includes(item.classification)));
const beatCoverage = computed(() => props.coverage.filter(item => ['SHOT_LOCAL','COMPOSITION_MOTIF'].includes(item.classification)));
const relations = (change: any) => describeProposalRelations(change, props.changes, props.existingAssets);
const manifestations = (change: any) => addChanges.value.filter(item => item.sharedVisualSystemClientRef === change.clientRef).map(item => item.asset.name);
const isCovered = (change: any) => props.coverage.some(item => item.candidateRefs?.includes(change.clientRef));
const referenceConfirmed = (key: string) => (props.references || []).some(item => item.targetKey === key &&
  ['ASSET_BIBLE','BIND_SELECTED_ASSET'].includes(item.targetType));
const coverageLabel = (value: string) => ({PERSON:'人物',CREATURE:'生物',VEHICLE:'载具',SCENE:'场景',FX_MATERIAL:'视觉系统',BRAND:'品牌',COMPOSITION_GOAL:'构图',PROP:'道具',OTHER:'其他'} as Record<string,string>)[value] || value;
const coverageSummary = computed(() => [
  { key:'identity',title:'资产身份',items:props.coverage.filter(row => ['CANONICAL_ASSET','VARIANT'].includes(row.classification) && row.coverageType !== 'BRAND') },
  { key:'scene',title:'场景',items:props.coverage.filter(row => row.classification === 'SCENE_ANCHOR') },
  { key:'system',title:'视觉系统',items:props.coverage.filter(row => row.classification === 'VISUAL_SYSTEM') },
  { key:'brand',title:'品牌',items:props.coverage.filter(row => row.coverageType === 'BRAND' && row.classification === 'CANONICAL_ASSET') },
  { key:'shot',title:'剧情 / Shot-local',items:props.coverage.filter(row => row.classification === 'SHOT_LOCAL') },
  { key:'composition',title:'构图目标',items:props.coverage.filter(row => row.classification === 'COMPOSITION_MOTIF') },
].map(group => ({ key:group.key,title:group.title,total:group.items.length,
  documented:group.items.filter(row => ['SHOT_LOCAL','COMPOSITION_MOTIF'].includes(row.classification) || row.candidateRefs?.length || row.existingCanonicalKeys?.length).length })));
const possibleDuplicates = computed(() => (props.preview?.suggestions || []).filter((item: any) => item.possibleMatches?.length));
const candidateName = (clientRef: string) => addChanges.value.find(item => item.clientRef === clientRef)?.asset.name || '候选素材';
function coverageOwner(item: any) {
  const byRef = new Map(props.changes.filter(change => change.operation === 'ADD').map(change => [change.clientRef, change.asset.name]));
  const byKey = new Map(props.existingAssets.map(asset => [asset.canonicalKey, asset.name]));
  const names = [...item.candidateRefs.map((ref: string) => byRef.get(ref) || '待确认候选'),
    ...item.existingCanonicalKeys.map((key: string) => byKey.get(key) || '已有身份')];
  return names.length ? `由 ${[...new Set(names)].join('、')} 承担` : '尚无明确生产归属';
}
</script>

<style scoped>
.proposal-review{border-top:1px solid var(--td-component-border);padding-top:1rem;color:var(--td-text-color-primary)}
.review-heading,.detail header{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem}
.proposal-review h2{margin:.1rem 0}.proposal-review h3{margin:1.3rem 0 .65rem;font-size:.96rem}
.proposal-review h3 small{font-size:.72rem;color:var(--td-text-color-secondary);font-weight:400}
.overview{display:flex;flex-wrap:wrap;gap:.45rem;margin:1rem 0}.overview span,.card-meta span{border:1px solid var(--td-component-border);border-radius:.25rem;padding:.25rem .5rem;background:var(--td-bg-color-secondarycontainer);font-size:.73rem}
.overview .alert{border-color:var(--td-warning-color);color:var(--td-warning-color)}
.sufficiency{border-left:3px solid var(--td-warning-color);background:var(--td-bg-color-secondarycontainer);padding:.55rem .8rem;margin:.9rem 0;font-size:.8rem}
.sufficiency.ready{border-left-color:var(--td-success-color)}.sufficiency p{margin:.2rem 0}
.relation-warning{border-left:3px solid var(--td-warning-color);background:var(--td-bg-color-secondarycontainer);padding:.65rem .8rem;font-size:.82rem}
.missing-grid,.asset-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:.7rem}
.missing-item,.asset-card,.detail,.duplicate-summary{border:1px solid var(--td-component-border);border-radius:.4rem;background:var(--td-bg-color-container);padding:.8rem}
.missing-item{border-left:3px solid var(--td-warning-color);font-size:.8rem}.missing-item p{color:var(--td-text-color-secondary)}
.link-row{display:flex;align-items:end;gap:.4rem}.link-row select{min-width:0;flex:1}.link-row button{white-space:nowrap}
.asset-group{margin:1.2rem 0}.asset-card{display:flex;flex-direction:column;gap:.6rem;min-height:10rem;text-align:left;color:var(--td-text-color-primary);font:inherit}
button.asset-card:hover,button.asset-card.selected{border-color:var(--td-brand-color);background:var(--td-bg-color-secondarycontainer)}
.card-top{display:flex;justify-content:space-between;align-items:baseline;gap:.5rem}.card-top strong{font-size:.9rem}.card-top small{color:var(--td-text-color-secondary);font-size:.67rem;letter-spacing:.05em}
.card-meta{display:flex;flex-wrap:wrap;gap:.3rem}.card-description{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;line-height:1.5;font-size:.81rem;color:var(--td-text-color-secondary)}
.card-foot{margin-top:auto;font-size:.73rem;color:var(--td-text-color-secondary)}.existing-card{border-left:3px solid var(--td-success-color)}
.detail{margin:1.2rem 0}.detail h3{margin:.1rem 0}.detail label,.coverage-row label{display:block;font-size:.78rem;margin:.55rem 0}.relation{font-size:.8rem;color:var(--td-text-color-secondary)}
.proposal-review button:not(.asset-card){border:1px solid var(--td-component-border);border-radius:.35rem;background:var(--td-bg-color-container);color:var(--td-text-color-primary);padding:.45rem .65rem;cursor:pointer;font:inherit;font-size:.77rem}
.proposal-review button:not(.asset-card):hover:not(:disabled){border-color:var(--td-brand-color)}.proposal-review button:disabled{opacity:.5;cursor:not-allowed}
.proposal-review input,.proposal-review select,.proposal-review textarea{
  display:block;box-sizing:border-box;width:100%;margin-top:.45rem;padding:.65rem .75rem;
  border:1px solid var(--td-component-border);border-radius:.4rem;
  background:var(--td-bg-color-container);color:var(--td-text-color-primary);
  caret-color:var(--td-brand-color);font:inherit;font-weight:400;
  transition:border-color .12s ease,background-color .12s ease;
}
.proposal-review input::placeholder,.proposal-review textarea::placeholder{color:var(--td-text-color-placeholder)}
.proposal-review :is(input,select,textarea):hover{border-color:var(--td-brand-color);background:var(--td-bg-color-secondarycontainer)}
.proposal-review :is(input,select,textarea):focus{outline:2px solid var(--td-brand-color);outline-offset:1px;border-color:var(--td-brand-color)}
.proposal-review select option{background:var(--td-bg-color-container);color:var(--td-text-color-primary)}
.proposal-review textarea{min-height:6rem;line-height:1.6;resize:vertical}
.field-row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.8rem}.coverage-row{font-size:.82rem;line-height:1.5}
.coverage-draft,.preview-review{border-top:1px solid var(--td-component-border);margin:1.3rem 0;padding-top:.5rem}
.coverage-summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(8rem,1fr));gap:.5rem;margin:.8rem 0}
.coverage-summary div{display:flex;flex-direction:column;gap:.3rem;border:1px solid var(--td-component-border);border-radius:.3rem;padding:.55rem;background:var(--td-bg-color-container);font-size:.76rem}
.coverage-summary span{color:var(--td-text-color-secondary)}.coverage-list{padding:.4rem 0}.coverage-row{border-bottom:1px solid var(--td-component-border);padding:.4rem 0}
.beat-summary,.duplicate-summary{display:flex;align-items:center;justify-content:space-between;gap:.6rem;margin:.8rem 0;font-size:.8rem}.duplicate-summary{padding:.55rem .7rem}.duplicate-summary span{color:var(--td-text-color-secondary)}
.muted{color:var(--td-text-color-secondary);font-size:.81rem}
@media(max-width:700px){.field-row{grid-template-columns:1fr}.review-heading,.detail header,.beat-summary{flex-direction:column}.missing-grid,.asset-grid{grid-template-columns:1fr}}
</style>
