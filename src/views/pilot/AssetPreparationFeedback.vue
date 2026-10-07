<template>
 <div class="preparation-feedback">
  <button :disabled="disabled || controller.state.busy" @click="controller.run(false)">一键准备全部资产</button>
  <button :disabled="disabled || controller.state.busy" @click="controller.run(true)">一键重新准备全部资产</button>
  <p v-if="controller.state.message" role="status" :class="{failure:['FAILED','REJECTED'].includes(controller.state.phase)}"><span v-if="controller.state.busy" class="spinner" />{{ controller.state.message }}</p>
  <button v-if="controller.state.code==='DIRECTOR_AB_NOT_READY' || controller.state.code==='DIRECTOR_SOURCE_STALE'" @click="$emit('recover-director')">审阅并重新确认导演方向</button>
  <template v-if="controller.state.phase==='UNCERTAIN'"><button :disabled="controller.state.busy" @click="controller.check()">检查本次提交状态</button><button :disabled="controller.state.busy" @click="controller.run(false,undefined,true)">重试同一提交</button></template>
  <details v-if="controller.state.code || controller.state.requestId"><summary>提交详情</summary><small>状态：{{ controller.state.phase }} · code：{{ controller.state.code || '—' }} · requestId：{{ controller.state.requestId || '—' }} · batchId：{{ controller.state.batchId || '—' }} · 服务：{{ controller.state.runtimeProtocol }} {{ controller.state.runtimeRevision }}</small></details>
 </div>
</template>
<script setup lang="ts">
defineProps<{controller:any;disabled?:boolean}>();defineEmits(['recover-director']);
</script>
<style scoped>
.preparation-feedback small{display:block;overflow-wrap:anywhere}
.preparation-feedback{display:flex;align-items:center;flex-wrap:wrap;gap:.5rem}.preparation-feedback p,.preparation-feedback details{flex-basis:100%;margin:.25rem 0;font-size:.82rem}.failure{color:var(--td-error-color)}button{border:1px solid var(--td-component-border);border-radius:6px;padding:.45rem .65rem;background:var(--td-bg-color-secondarycontainer);color:var(--td-text-color-primary);cursor:pointer}button:hover:not(:disabled){filter:brightness(1.12)}button:active:not(:disabled){transform:translateY(1px)}button:disabled{opacity:.55;cursor:default}.spinner{display:inline-block;width:.7em;height:.7em;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:spin 1s linear infinite;margin-right:.4rem}@keyframes spin{to{transform:rotate(360deg)}}
</style>
