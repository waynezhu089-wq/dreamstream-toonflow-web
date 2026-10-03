<template>
  <section class="proposal-review" aria-label="素材提案人工审查">
    <h2>待确认的素材提案</h2>
    <p class="muted">{{ changes.filter(item => item.operation === 'ADD').length }} 个新增身份 · {{ sufficiency?.existingReferenceCount || 0 }} 个已有身份引用。数量不是通过标准；请检查每个重要画面的生产归属。</p>
    <p v-if="relationStatus === 'NEEDS_REVIEW'" class="relation-warning">关系分析未完成。素材候选和 Coverage 已生成，可继续人工审核；共享视觉系统／连续形态需人工确认或重新分析。</p>
    <div v-if="review" class="sufficiency" :class="review.status === 'NEEDS_REVIEW' ? 'needs-review' : 'ready'">
      <strong>素材充分性：{{ review.status === 'READY' ? '待人工确认，已列需求有归属' : '需要人工审查' }}</strong>
      <p>{{ review.reason }}</p>
      <div v-for="item in review.requirements.filter(row => row.status === 'MISSING')" :key="item.requirementKey" class="missing-item">
        <span>待定：{{ item.label }}（{{ coverageLabel(item.coverageType) }}）· {{ item.note || '尚无明确生产归属' }}</span>
        <button type="button" @click="$emit('add-candidate', item.requirementKey)">加入当前 Proposal</button>
      </div>
    </div>
    <button type="button" class="quiet" @click="$emit('add-candidate', null)">＋ 补充候选</button>

    <div v-for="change in changes" :key="change.clientRef || change.canonicalKey" class="candidate">
      <template v-if="change.operation === 'ADD'">
        <strong>候选：{{ change.asset.name || '待命名' }}</strong>
        <div class="field-row">
          <label>名称<input v-model="change.asset.name" @input="$emit('dirty')" /></label>
          <label>类别<select v-model="change.asset.category" @change="$emit('dirty')"><option v-for="category in categories" :key="category">{{ category }}</option></select></label>
        </div>
        <div class="field-row">
          <label>子类型<select v-model="change.asset.assetKind" @change="$emit('dirty')"><option v-for="kind in assetKinds" :key="kind">{{ kind }}</option></select></label>
          <label>重要性<select v-model="change.asset.importance" @change="$emit('dirty')"><option value="CORE">核心</option><option value="SUPPORTING">辅助</option></select></label>
        </div>
        <label>描述<textarea v-model="change.asset.description" @input="$emit('dirty')" /></label>
        <label>来源<select v-model="change.asset.sourcePolicy" @change="$emit('dirty')"><option value="AI_ALLOWED">允许 AI 生成</option><option value="REAL_REQUIRED">必须上传真实素材</option></select></label>
        <p v-if="relations(change).shared" class="relation">共享视觉系统：{{ relations(change).shared }}</p>
        <p v-if="relations(change).continuity.length" class="relation">连续形态：{{ relations(change).continuity.join('、') }}</p>
      </template>
      <span v-else>{{ change.operation }} · {{ change.canonicalKey }}</span>
    </div>

    <div v-if="coverage.length" class="coverage-draft">
      <h3>视觉身份、场景与系统覆盖</h3>
      <p class="muted">这里显示人物、环境、材质系统等由谁承担；一个环境可以合理覆盖多个画面。</p>
      <div v-for="(item, index) in visualCoverage" :key="index" class="coverage-row">
        <label v-if="item.candidateRefs.some((ref: string) => ref.startsWith('manual_'))">视觉需求<input v-model="item.label" @input="$emit('dirty')" /></label>
        <span>{{ coverageLabel(item.coverageType) }} · {{ item.label }} — {{ coverageOwner(item) }}</span>
      </div>
      <h3>剧情事件与镜头局部</h3>
      <p class="muted">动作、一次性效果与构图目标可在分镜处理，不要求另建资产身份。</p>
      <p v-for="(item, index) in beatCoverage" :key="`${index}-${item.label}`" class="coverage-row">
        {{ item.label }} — {{ item.classification === 'COMPOSITION_MOTIF' ? '构图目标' : '镜头局部' }} · {{ item.note }}
      </p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { describeProposalRelations, reviewPendingSufficiency } from './skillProposal';

const props = defineProps<{ changes: any[]; coverage: any[]; sufficiency: any | null; existingAssets: any[]; relationStatus: 'READY' | 'NEEDS_REVIEW' }>();
defineEmits<{ (event: 'dirty'): void; (event: 'add-candidate', requirementKey: string | null): void }>();
const categories = ['CHAR','ACC','PROP','PRODUCT','LOC','BRAND','UI','FX'];
const assetKinds = ['HUMAN_CHARACTER','CREATURE','VEHICLE','PROP','ENVIRONMENT','MATERIAL_FX','CELESTIAL','BRAND_MARK','UI_REFERENCE','OTHER'];
const review = computed(() => reviewPendingSufficiency(props.sufficiency, props.coverage));
const visualCoverage = computed(() => props.coverage.filter(item => !['SHOT_LOCAL','COMPOSITION_MOTIF'].includes(item.classification)));
const beatCoverage = computed(() => props.coverage.filter(item => ['SHOT_LOCAL','COMPOSITION_MOTIF'].includes(item.classification)));
const relations = (change: any) => describeProposalRelations(change, props.changes, props.existingAssets);
const coverageLabel = (value: string) => ({PERSON:'人物',CREATURE:'生物',VEHICLE:'载具',SCENE:'场景',FX_MATERIAL:'视觉系统',BRAND:'品牌',COMPOSITION_GOAL:'构图',PROP:'道具',OTHER:'其他'} as Record<string,string>)[value] || value;
function coverageOwner(item: any) {
  const byRef = new Map(props.changes.filter(change => change.operation === 'ADD').map(change => [change.clientRef, change.asset.name]));
  const byKey = new Map(props.existingAssets.map(asset => [asset.canonicalKey, asset.name]));
  const names = [...item.candidateRefs.map((ref: string) => byRef.get(ref) || '待确认候选'),
    ...item.existingCanonicalKeys.map((key: string) => byKey.get(key) || '已有身份')];
  return names.length ? `由 ${[...new Set(names)].join('、')} 承担` : '尚无明确生产归属';
}
</script>

<style scoped>
.proposal-review{border-top:1px solid var(--td-component-border);padding-top:.8rem}
.proposal-review h2{margin:.2rem 0}.proposal-review h3{margin:1rem 0 .3rem}
.sufficiency{border-left:3px solid var(--td-warning-color);background:var(--td-bg-color-secondarycontainer);padding:.7rem .9rem;margin:.9rem 0}
.sufficiency.ready{border-left-color:var(--td-success-color)}.sufficiency p{margin:.25rem 0;font-size:.82rem}
.relation-warning{border-left:3px solid var(--td-warning-color);background:var(--td-bg-color-secondarycontainer);padding:.65rem .8rem;font-size:.82rem}
.missing-item{display:flex;align-items:center;justify-content:space-between;gap:.7rem;padding:.45rem 0;border-top:1px solid var(--td-component-border);font-size:.82rem}
.candidate{border-top:1px solid var(--td-component-border);padding:.9rem 0}.candidate strong{display:block;margin-bottom:.5rem}
.candidate label,.coverage-row label{display:block;font-size:.78rem;margin:.55rem 0}
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
.field-row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.8rem}.relation,.coverage-row{font-size:.82rem;line-height:1.5}
.coverage-draft{border-top:1px solid var(--td-component-border);margin:1rem 0;padding-top:.5rem}
.muted{color:var(--td-text-color-secondary);font-size:.81rem}
@media(max-width:700px){.field-row{grid-template-columns:1fr}.missing-item{align-items:flex-start;flex-direction:column}}
</style>
