<template>
  <Teleport to="body">
    <div v-if="image" class="studio-lightbox" role="dialog" aria-modal="true" :aria-label="image.label" tabindex="-1" ref="dialog" @keydown="keyDown">
      <header><span>{{ image.label }} · {{ index + 1 }} / {{ images.length }}</span><div><button @click="fit">适应窗口</button><button @click="actual">100%</button><button aria-label="关闭大图" @click="$emit('close')">×</button></div></header>
      <div ref="viewport" class="lightbox-viewport" @wheel.prevent="zoom" @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up" @click.self="backgroundClick">
        <img :key="image.id" :src="image.src" :alt="image.label" draggable="false" :style="{width: imageWidth+'px',height:'auto',transform:`translate(${pan.x}px,${pan.y}px) scale(${scale})`}" @load="loaded" />
      </div>
      <footer><button aria-label="上一张图片" :disabled="index===0" @click="change(index-1)">←</button><span role="status">{{ Math.round(scale * fitScale * 100) }}%</span><button aria-label="下一张图片" :disabled="index===images.length-1" @click="change(index+1)">→</button></footer>
    </div>
  </Teleport>
</template>
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue';
import type { StudioReviewImage } from './studioImageReview';
const props=defineProps<{images:StudioReviewImage[];index:number}>();
const emit=defineEmits<{(e:'close'):void;(e:'change',index:number):void}>();
const image=computed(()=>props.images[props.index]),dialog=ref<HTMLElement|null>(null),viewport=ref<HTMLElement|null>(null);
const scale=ref(1),natural=reactive({width:1,height:1}),fitScale=ref(1),pan=reactive({x:0,y:0});
const imageWidth=computed(()=>natural.width*fitScale.value);
let drag:{id:number;x:number;y:number;px:number;py:number}|null=null,previous:HTMLElement|null=null,oldOverflow='',ignoreBackdropUntil=0;
function fit(){const v=viewport.value;fitScale.value=Math.min(1,(v?.clientWidth||window.innerWidth)*.94/natural.width,(v?.clientHeight||window.innerHeight*.8)*.94/natural.height);scale.value=1;pan.x=pan.y=0;}
function actual(){fit();scale.value=1/fitScale.value;}
function loaded(event:Event){const img=event.target as HTMLImageElement;natural.width=img.naturalWidth||1;natural.height=img.naturalHeight||1;fit();}
function change(index:number){if(index>=0&&index<props.images.length){drag=null;scale.value=1;pan.x=pan.y=0;emit('change',index);}}
function zoom(event:WheelEvent){scale.value=Math.max(.15,Math.min(10,scale.value*(event.deltaY<0?1.15:1/1.15)));}
function down(event:PointerEvent){if(event.button!==0||event.target===viewport.value)return;drag={id:event.pointerId,x:event.clientX,y:event.clientY,px:pan.x,py:pan.y};viewport.value?.setPointerCapture(event.pointerId);event.preventDefault();}
function move(event:PointerEvent){if(drag?.id===event.pointerId){pan.x=drag.px+event.clientX-drag.x;pan.y=drag.py+event.clientY-drag.y;if(Math.abs(event.clientX-drag.x)+Math.abs(event.clientY-drag.y)>3)ignoreBackdropUntil=Date.now()+500;}}
function up(){drag=null;}
function backgroundClick(){if(Date.now()>ignoreBackdropUntil)emit('close');}
function keyDown(event:KeyboardEvent){if(event.key==='Escape'){event.preventDefault();emit('close');}else if(event.key==='ArrowLeft'){event.preventDefault();change(props.index-1);}else if(event.key==='ArrowRight'){event.preventDefault();change(props.index+1);}else if(event.key==='Tab'){const buttons=[...(dialog.value?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')||[])];if(!buttons.length)return;const at=buttons.indexOf(document.activeElement as HTMLButtonElement);if(event.shiftKey&&at<=0){event.preventDefault();buttons.at(-1)?.focus();}else if(!event.shiftKey&&(at<0||at===buttons.length-1)){event.preventDefault();buttons[0]?.focus();}}}
function release(){document.body.style.overflow=oldOverflow;previous?.focus();previous=null;drag=null;}
watch(()=>!!image.value,async(open,wasOpen)=>{if(open&&!wasOpen){previous=document.activeElement as HTMLElement;oldOverflow=document.body.style.overflow;document.body.style.overflow='hidden';await nextTick();dialog.value?.focus();}else if(!open&&wasOpen)release();},{immediate:true});
onBeforeUnmount(()=>{if(image.value)release();});
</script>
<style scoped>
.studio-lightbox{position:fixed;inset:0;z-index:2000;background:#101217f5;color:#eee;display:flex;flex-direction:column;outline:0}.studio-lightbox header,.studio-lightbox footer{flex:none;display:flex;justify-content:space-between;align-items:center;padding:.7rem 1rem;gap:1rem}.studio-lightbox header div{display:flex;gap:.5rem}.studio-lightbox footer{justify-content:center}.lightbox-viewport{flex:1;min-height:0;overflow:hidden;display:flex;align-items:center;justify-content:center;touch-action:none}.lightbox-viewport img{display:block;flex:none;max-width:none;max-height:none;transform-origin:center;cursor:grab;user-select:none}.lightbox-viewport img:active{cursor:grabbing}button{border:1px solid #707581;border-radius:6px;background:#262932;color:inherit;padding:.4rem .65rem;cursor:pointer}button:hover{background:#393d49}button:active{transform:translateY(1px)}button:disabled{opacity:.4;cursor:default}
</style>
