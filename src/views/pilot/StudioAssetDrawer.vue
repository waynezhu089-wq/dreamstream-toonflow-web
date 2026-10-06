<template>
  <aside v-if="item" class="drawer" aria-label="素材详情" :style="{ width: `${width}px` }">
    <div class="drawer-handle" role="separator" aria-label="调整素材详情宽度" aria-orientation="vertical" :aria-valuenow="Math.round(width)" tabindex="0" @pointerdown="resize.pointerdown" @pointermove="resize.pointermove" @pointerup="resize.pointerup" @pointercancel="resize.pointercancel" @keydown="resize.keydown" @dblclick="resize.reset" />
    <header><div><small>{{ item.kind }}</small><h2>{{ item.asset.name }}</h2></div><button type="button" aria-label="关闭素材详情" @click="$emit('close')">×</button></header>
    <p class="status">{{ item.status }}</p>
    <p>{{ item.asset.description || '当前素材还没有详细描述。' }}</p>
    <div v-if="imageUrl || item.outputPath" class="visual"><p>当前版本</p><img :src="imageUrl || item.outputPath" :alt="item.asset.name" role="button" tabindex="0" :aria-label="`查看${item.asset.name}当前版本`" @click="openMain" @keydown.enter="openMain" /></div>
    <div v-else class="placeholder">{{ item.placeholder }}</div>
    <p v-if="item.refs.length" class="reference">已确认真实参考：{{ item.refs.map((ref:any)=>ref.originalName).join('、') }}</p>
    <p v-if="real" class="reference">真实参考 · AI 不重绘</p>
    <p v-if="item.asset.ownerKey || item.asset.variantOf || item.asset.sharedVisualSystemKey" class="muted">关联：{{ [item.asset.ownerKey,item.asset.variantOf,item.asset.sharedVisualSystemKey].filter(Boolean).join(' · ') }}</p>
    <p v-if="item.asset.relatedKeys?.length" class="muted">关联素材：{{ item.asset.relatedKeys.join('、') }}</p>
    <p v-if="item.status==='需要处理'" class="warning">这项素材需要你检查；详细原因可在专业模式查看。</p>
    <StudioReferenceGallery :images="referenceImages" @open="openReference" />
    <p v-if="referencesPending" role="status">其他参考正在准备中…</p>
    <div class="actions"><button type="button" @click="$emit('modify')">让 Agent 修改</button><button v-if="!real" type="button" @click="$emit('request-image','所需多视角')">让 Agent 准备多视角</button><button type="button" @click="$emit('professional')">查看更多</button></div>
  </aside>
</template>
<script setup lang="ts">
import { computed, watch } from 'vue';
import { isRealReference } from './studioPresentation';
import StudioReferenceGallery from './StudioReferenceGallery.vue';
import {useStudioImageReview,type StudioReviewImage} from './studioImageReview';
import { drawerBounds } from './studioLayout';
import { useResizablePane } from './useResizablePane';
const props = defineProps<{ item: any | null; imageUrl?: string | null; referenceImages?:StudioReviewImage[]; width: number }>();
const emit = defineEmits<{(e:'close'):void;(e:'modify'):void;(e:'regenerate'):void;(e:'prepare-confirmed'):void;(e:'request-image',label:string):void;(e:'draft-image',purpose?:string):void;(e:'select-purpose',purpose:string):void;(e:'professional'):void;(e:'width-change',value:number):void}>();
const images=useStudioImageReview();
const referenceImages=computed(()=>props.referenceImages||[]);
const referencesPending=computed(()=>Object.values(props.item?.referenceJobs||{}).some((job:any)=>job&&['QUEUED','RUNNING'].includes(job.status)));
function openMain(){const src=props.imageUrl||props.item?.outputPath;if(src)images?.open(`asset-current:${props.item.asset.canonicalKey}`,[{id:'current',src,label:props.item.asset.name+' · 当前版本'}]);}
function openReference(index:number){emit('select-purpose',referenceImages.value[index]?.id||'');images?.open(`references:${props.item.asset.canonicalKey}`,referenceImages.value,index);}
const currentWidth = computed({get:()=>props.width,set:value=>emit('width-change',value)});
const resize = useResizablePane({value:currentWidth,defaultValue:440,axis:'x',reverse:true,step:16,
  bounds:()=>drawerBounds(window.innerWidth),measure:event=>window.innerWidth-event.clientX-19});
watch(()=>props.item,()=>resize.cancel());
const real = computed(() => props.item ? isRealReference(props.item.asset) : false);
</script>
<style scoped>
.drawer{position:fixed;z-index:70;right:1.2rem;top:5rem;bottom:1.2rem;max-width:min(65vw,calc(100vw - 2.4rem));overflow:auto;box-sizing:border-box;padding:1.4rem;background:var(--td-bg-color-container);color:var(--td-text-color-primary);border:1px solid var(--td-component-border);box-shadow:0 18px 60px #0007;border-radius:14px}.drawer-handle{position:absolute;left:0;top:0;bottom:0;width:8px;cursor:col-resize;touch-action:none;border-left:2px solid transparent}.drawer-handle:hover,.drawer-handle:focus-visible{border-left-color:var(--td-brand-color);outline:none}
.draft-summary{margin:1rem 0;padding:1rem;border:1px solid var(--td-component-border);border-radius:9px;background:var(--td-bg-color-secondarycontainer)}.draft-summary p{font-size:.8rem;line-height:1.5}.draft-summary small{color:var(--td-text-color-secondary)}
.draft-notes{font-size:.78rem;color:var(--td-text-color-secondary)}.draft-notes summary{cursor:pointer}.draft-notes p{margin:.35rem 0}
header{display:flex;justify-content:space-between;align-items:start;gap:1rem}header h2{margin:.2rem 0}header small,.muted{color:var(--td-text-color-secondary)}button{cursor:pointer;border:1px solid var(--td-component-border);border-radius:7px;background:var(--td-bg-color-secondarycontainer);color:inherit;padding:.5rem .7rem}button:hover{border-color:var(--td-brand-color)}button:active{transform:translateY(1px)}.status,.reference{color:var(--td-brand-color);font-size:.86rem}.visual img{display:block;width:100%;max-height:280px;object-fit:contain;border-radius:9px;cursor:zoom-in}.placeholder{min-height:170px;display:grid;place-items:center;border:1px dashed var(--td-component-border);border-radius:10px;color:var(--td-text-color-secondary)}.warning{color:var(--td-warning-color)}.actions{display:flex;flex-wrap:wrap;gap:.5rem;margin-top:1.5rem}
</style>
