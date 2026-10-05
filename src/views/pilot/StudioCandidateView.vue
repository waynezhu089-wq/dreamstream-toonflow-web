<template>
 <article class="image-candidate" :data-candidate-id="candidate.id" aria-label="图片版本">
  <strong>{{ candidate.assetName || '素材' }} · {{ pending ? '正在准备新版本' : '图片版本' }}</strong>
  <p v-if="pending" role="status"><span class="studio-spinner" aria-hidden="true" />{{ candidate.status==='QUEUED'?'等待生成':'正在生成' }} · {{ elapsed }} · 当前版本未替换</p>
  <button v-if="src" class="candidate-image" type="button" aria-label="查看图片版本" @click="$emit('open')"><img :src="src" :alt="candidate.assetName || '图片版本'" /></button>
  <p v-if="candidate.status==='FAILED'" class="failure" role="alert">图片未完成，当前版本仍保留。可以让 Agent 重新准备。</p>
  <p v-if="candidate.status==='STALE'" class="warning">素材已变化，这张图片仅保留作历史参考。</p>
  <p v-if="candidate.status==='SUCCEEDED'" class="completion" role="status">✓ 新版本已完成<span v-if="candidate.completedAt"> · {{ duration }}</span></p>
  <p v-if="candidate.decision==='ACCEPTED'" class="success" role="status">✓ {{ candidate.current?'当前版本':'已采用此版本（历史保留）' }}</p>
  <p v-else-if="candidate.decision==='REJECTED'" class="completion">✓ 已放弃</p>
  <div v-if="candidate.status==='SUCCEEDED' && candidate.decision!=='REJECTED'" class="candidate-actions">
   <button v-if="candidate.decision!=='ACCEPTED' && !preview" :disabled="busy || action.phase==='WORKING'" :data-phase="rejecting?'IDLE':action.phase" @click="$emit('preview')"><span v-if="action.phase==='WORKING'&&!rejecting" class="studio-spinner" aria-hidden="true" />{{ action.phase==='WORKING'&&!rejecting?action.label:'采用' }}</button>
   <button :disabled="busy" @click="$emit('continue')">继续修改</button>
   <button v-if="candidate.decision!=='ACCEPTED' && !preview" :disabled="busy || action.phase==='WORKING'" :data-phase="rejecting?action.phase:'IDLE'" @click="$emit('reject')"><span v-if="rejecting&&action.phase==='WORKING'" class="studio-spinner" aria-hidden="true" />{{ rejecting&&action.phase==='WORKING'?action.label:'不要' }}</button>
  </div>
  <div v-if="preview" class="candidate-confirm" role="status"><p>将把这张图作为{{ candidate.assetName || '素材' }}的当前版本。旧版本仍保留。</p><button :disabled="busy || action.phase==='WORKING'" :data-phase="action.phase" @click="$emit('accept')"><span v-if="action.phase==='WORKING'" class="studio-spinner" aria-hidden="true" />{{ action.phase==='WORKING'?action.label:'确认采用' }}</button><button :disabled="busy" @click="$emit('cancel')">取消</button></div>
  <p v-if="action.phase==='FAILURE'" class="failure" role="alert">⚠ {{ action.error }}</p>
  <p v-else-if="action.phase==='SUCCESS' && !preview && candidate.decision!=='ACCEPTED'" class="success" role="status">✓ {{ action.label }}</p>
 </article>
</template>
<script setup lang="ts">
import {computed} from 'vue';import {formatStudioElapsed} from './studioTurnPresentation';import type {StudioActionState} from './studioActionFeedback';
const props=defineProps<{candidate:any;src?:string;preview?:any;busy:boolean;action:StudioActionState;now:number}>();
defineEmits<{(e:'preview'):void;(e:'accept'):void;(e:'cancel'):void;(e:'continue'):void;(e:'reject'):void;(e:'open'):void}>();
const pending=computed(()=>['QUEUED','RUNNING'].includes(props.candidate.status));
const rejecting=computed(()=>actionLabelIsReject(props.action.label));
function actionLabelIsReject(label:string){return label==='正在处理…'||label==='已放弃';}
const elapsed=computed(()=>formatStudioElapsed(props.now-(props.candidate.startedAt||props.candidate.createdAt||props.now)));
const duration=computed(()=>formatStudioElapsed(props.candidate.completedAt-(props.candidate.startedAt||props.candidate.createdAt||props.candidate.completedAt)));
</script>
<style scoped>
.image-candidate{padding:.8rem 0;margin:.6rem 0;min-width:0}.image-candidate strong{font-size:.85rem}.candidate-image{border:0;background:transparent;padding:0;display:block;max-width:100%;margin:.6rem 0;cursor:zoom-in}.candidate-image img{display:block;max-width:100%;max-height:440px;width:auto;height:auto;object-fit:contain}.candidate-actions,.candidate-confirm{display:flex;flex-wrap:wrap;gap:.45rem;align-items:center}.candidate-confirm p{width:100%;line-height:1.5}.image-candidate button:not(.candidate-image){border:1px solid var(--td-component-border);border-radius:5px;background:var(--td-bg-color-secondarycontainer);color:inherit;padding:.4rem .65rem;cursor:pointer}.image-candidate button:hover{border-color:var(--td-brand-color)}.image-candidate button:active{transform:translateY(1px)}.image-candidate button:disabled{opacity:.5;cursor:default}.completion,.image-candidate small{color:var(--td-text-color-secondary);font-size:.8rem}.success{color:var(--td-success-color)}.failure{color:var(--td-error-color)}.warning{color:var(--td-warning-color)}button[data-phase=WORKING]{color:var(--td-brand-color);background:color-mix(in srgb,var(--td-brand-color) 10%,var(--td-bg-color-container))}.studio-spinner{display:inline-block;width:.7em;height:.7em;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:studio-spin 1s linear infinite;margin-right:.4rem}@keyframes studio-spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.studio-spinner{animation:none}}
</style>
