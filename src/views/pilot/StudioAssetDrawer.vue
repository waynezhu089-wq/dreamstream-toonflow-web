<template>
  <aside v-if="item" class="drawer" aria-label="素材详情" :style="{ width: `${width}px` }">
    <div class="drawer-handle" role="separator" aria-label="调整素材详情宽度" aria-orientation="vertical" :aria-valuenow="Math.round(width)" tabindex="0" @pointerdown="resize.pointerdown" @pointermove="resize.pointermove" @pointerup="resize.pointerup" @pointercancel="resize.pointercancel" @keydown="resize.keydown" @dblclick="resize.reset" />
    <header><div><small>{{ item.kind }}</small><h2>{{ item.asset.name }}</h2></div><button type="button" aria-label="关闭素材详情" @click="$emit('close')">×</button></header>
    <p class="status">{{ item.status }}</p>
    <p>{{ item.asset.description || '当前素材还没有详细描述。' }}</p>
    <div v-if="imageUrl || item.outputPath" class="visual"><img :src="imageUrl || item.outputPath" :alt="item.asset.name" /></div>
    <div v-else class="placeholder">{{ item.placeholder }}</div>
    <p v-if="item.refs.length" class="reference">已确认真实参考：{{ item.refs.map((ref:any)=>ref.originalName).join('、') }}</p>
    <p v-if="real" class="reference">真实参考 · AI 不重绘</p>
    <p v-if="item.asset.ownerKey || item.asset.variantOf || item.asset.sharedVisualSystemKey" class="muted">关联：{{ [item.asset.ownerKey,item.asset.variantOf,item.asset.sharedVisualSystemKey].filter(Boolean).join(' · ') }}</p>
    <p v-if="item.asset.relatedKeys?.length" class="muted">关联素材：{{ item.asset.relatedKeys.join('、') }}</p>
    <section v-if="item.draftPackage" class="draft-summary"><strong>Studio 文本草案</strong>
      <p>{{ item.draftPackage.visualSpecDraft?.visualIdentitySummary || '正在准备视觉描述…' }}</p>
      <p>生成意图：{{ item.draftPackage.generationIntent || '待确定' }} · Prompt：{{ item.draftPackage.draftPromptIR ? '草案已准备' : '待编译' }}</p>
      <p>图片执行器：{{ draftImageStatus(item.imageJob) || (item.draftPackage.stage === 'WAITING_IMAGE_EXECUTOR' ? '等待生成' : '尚未执行') }}</p>
      <p v-if="item.imageJob?.executionPurpose==='SUBJECT_MAIN_PREVIEW'">本次图片：Z-Image 人物主视图 · 非三视图</p>
      <p v-if="item.imageJob?.errorMessage" class="warning">{{ item.imageJob.errorMessage }}（{{ item.imageJob.errorCode }}）</p>
      <p v-if="item.draftPackage.error" class="warning">{{ item.draftPackage.error.message }}</p>
      <details v-if="draftNotes.length" class="draft-notes"><summary>AI 草案提示（{{ draftNotes.length }}）</summary><p v-for="(note,index) in draftNotes" :key="index">{{ note }}</p></details>
      <small>草案不是已确认 Visual Spec 或正式 Prompt Build。</small>
    </section>
    <p v-if="item.status==='需要处理'" class="warning">当前视觉草案或已确认版本需要单独审查。</p>
    <div class="actions"><button type="button" @click="$emit('modify')">让 Agent 修改</button><button v-if="!real && item.confirmedSpec && item.draftPackage?.stage!=='WAITING_IMAGE_EXECUTOR'" type="button" @click="$emit('prepare-confirmed')">准备已确认视觉规格（不调用模型）</button><button v-if="!real && item.draftPackage?.stage==='WAITING_IMAGE_EXECUTOR'" type="button" @click="$emit('draft-image')">{{ item.imageJob ? '重新生成草图' : '生成草图' }}</button><button v-if="!real" type="button" @click="$emit('regenerate')">重新生成视觉草案</button><button type="button" @click="$emit('professional')">进入专业精修</button></div>
  </aside>
</template>
<script setup lang="ts">
import { computed, watch } from 'vue';
import { isRealReference } from './studioPresentation';
import { studioDraftDiagnostics } from './studioDraftDiagnostics';
import { draftImageStatus } from './studioDraftImageView';
import { drawerBounds } from './studioLayout';
import { useResizablePane } from './useResizablePane';
const props = defineProps<{ item: any | null; imageUrl?: string | null; width: number }>();
const emit = defineEmits<{(e:'close'):void;(e:'modify'):void;(e:'regenerate'):void;(e:'prepare-confirmed'):void;(e:'draft-image'):void;(e:'professional'):void;(e:'width-change',value:number):void}>();
const currentWidth = computed({get:()=>props.width,set:value=>emit('width-change',value)});
const resize = useResizablePane({value:currentWidth,defaultValue:440,axis:'x',reverse:true,step:16,
  bounds:()=>drawerBounds(window.innerWidth),measure:event=>window.innerWidth-event.clientX-19});
watch(()=>props.item,()=>resize.cancel());
const real = computed(() => props.item ? isRealReference(props.item.asset) : false);
const draftNotes = computed(() => {
  if (!props.item?.draftPackage) return [];
  const draft = studioDraftDiagnostics(props.item.draftPackage);
  return [
    ...draft.info.map((warning: any) => `已自动整理输入格式：${warning.path || '视觉描述'}`),
    ...draft.advisory.map((warning: any) => typeof warning === 'string'
      ? `预览后可补充：${warning}` : `视觉细节可优化：${warning.path || '描述'}`),
  ];
});
</script>
<style scoped>
.drawer{position:fixed;z-index:70;right:1.2rem;top:5rem;bottom:1.2rem;max-width:min(65vw,calc(100vw - 2.4rem));overflow:auto;box-sizing:border-box;padding:1.4rem;background:var(--td-bg-color-container);color:var(--td-text-color-primary);border:1px solid var(--td-component-border);box-shadow:0 18px 60px #0007;border-radius:14px}.drawer-handle{position:absolute;left:0;top:0;bottom:0;width:8px;cursor:col-resize;touch-action:none;border-left:2px solid transparent}.drawer-handle:hover,.drawer-handle:focus-visible{border-left-color:var(--td-brand-color);outline:none}
.draft-summary{margin:1rem 0;padding:1rem;border:1px solid var(--td-component-border);border-radius:9px;background:var(--td-bg-color-secondarycontainer)}.draft-summary p{font-size:.8rem;line-height:1.5}.draft-summary small{color:var(--td-text-color-secondary)}
.draft-notes{font-size:.78rem;color:var(--td-text-color-secondary)}.draft-notes summary{cursor:pointer}.draft-notes p{margin:.35rem 0}
header{display:flex;justify-content:space-between;align-items:start;gap:1rem}header h2{margin:.2rem 0}header small,.muted{color:var(--td-text-color-secondary)}button{cursor:pointer;border:1px solid var(--td-component-border);border-radius:7px;background:var(--td-bg-color-secondarycontainer);color:inherit;padding:.5rem .7rem}button:hover{border-color:var(--td-brand-color)}.status,.reference{color:var(--td-brand-color);font-size:.86rem}.visual img{display:block;width:100%;max-height:280px;object-fit:contain;border-radius:9px}.placeholder{min-height:170px;display:grid;place-items:center;border:1px dashed var(--td-component-border);border-radius:10px;color:var(--td-text-color-secondary)}.warning{color:var(--td-warning-color)}.actions{display:flex;flex-wrap:wrap;gap:.5rem;margin-top:1.5rem}
</style>
