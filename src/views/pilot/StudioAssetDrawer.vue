<template>
  <aside v-if="item" class="drawer" aria-label="素材详情">
    <header><div><small>{{ item.kind }}</small><h2>{{ item.asset.name }}</h2></div><button type="button" aria-label="关闭素材详情" @click="$emit('close')">×</button></header>
    <p class="status">{{ item.status }}</p>
    <p>{{ item.asset.description || '当前素材还没有详细描述。' }}</p>
    <div v-if="imageUrl || item.outputPath" class="visual"><img :src="imageUrl || item.outputPath" :alt="item.asset.name" /></div>
    <div v-else class="placeholder">{{ item.placeholder }}</div>
    <p v-if="item.refs.length" class="reference">已确认真实参考：{{ item.refs.map((ref:any)=>ref.originalName).join('、') }}</p>
    <p v-if="real" class="reference">真实参考 · AI 不重绘</p>
    <p v-if="item.asset.ownerKey || item.asset.variantOf || item.asset.sharedVisualSystemKey" class="muted">关联：{{ [item.asset.ownerKey,item.asset.variantOf,item.asset.sharedVisualSystemKey].filter(Boolean).join(' · ') }}</p>
    <p v-if="item.asset.relatedKeys?.length" class="muted">关联素材：{{ item.asset.relatedKeys.join('、') }}</p>
    <p v-if="item.status==='需要处理'" class="warning">当前视觉草案或已确认版本需要单独审查。</p>
    <div class="actions"><button type="button" @click="$emit('modify')">让 Agent 修改</button><button v-if="!real" type="button" @click="$emit('regenerate')">重新生成视觉草案</button><button type="button" @click="$emit('professional')">进入专业精修</button></div>
  </aside>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import { isRealReference } from './studioPresentation';
const props = defineProps<{ item: any | null; imageUrl?: string | null }>();
defineEmits<{(e:'close'):void;(e:'modify'):void;(e:'regenerate'):void;(e:'professional'):void}>();
const real = computed(() => props.item ? isRealReference(props.item.asset) : false);
</script>
<style scoped>
.drawer{position:fixed;z-index:70;right:1.2rem;top:5rem;bottom:1.2rem;width:min(420px,calc(100vw - 2.4rem));overflow:auto;box-sizing:border-box;padding:1.4rem;background:var(--td-bg-color-container);color:var(--td-text-color-primary);border:1px solid var(--td-component-border);box-shadow:0 18px 60px #0007;border-radius:14px}
header{display:flex;justify-content:space-between;align-items:start;gap:1rem}header h2{margin:.2rem 0}header small,.muted{color:var(--td-text-color-secondary)}button{cursor:pointer;border:1px solid var(--td-component-border);border-radius:7px;background:var(--td-bg-color-secondarycontainer);color:inherit;padding:.5rem .7rem}button:hover{border-color:var(--td-brand-color)}.status,.reference{color:var(--td-brand-color);font-size:.86rem}.visual img{display:block;width:100%;max-height:280px;object-fit:contain;border-radius:9px}.placeholder{min-height:170px;display:grid;place-items:center;border:1px dashed var(--td-component-border);border-radius:10px;color:var(--td-text-color-secondary)}.warning{color:var(--td-warning-color)}.actions{display:flex;flex-wrap:wrap;gap:.5rem;margin-top:1.5rem}
</style>
