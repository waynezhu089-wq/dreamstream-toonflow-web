<template>
  <section class="director-inspection" aria-label="Director candidate inspection">
    <h2>Director Intelligence · 候选检查</h2>
    <p>仅只读结构检查；未确认，不影响当前素材、Prompt 或生成。</p>
    <button :disabled="busy" @click="inspect">{{ busy ? "正在读取…" : "读取候选结构" }}</button>
    <button :disabled="busy" @click="versions">读取已确认版本与历史</button><pre v-if="versionState">{{JSON.stringify(versionState,null,2)}}</pre>
    <p v-if="error" role="alert">{{ error }}</p>
    <template v-if="result">
      <p>{{ result.status }} · Creative v{{ result.sourceCreativeVersion }}</p>
      <p>未持久化 · 不影响生成</p>
      <pre>{{ JSON.stringify(result, null, 2) }}</pre>
    </template>
  </section>
</template>
<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from "vue";
import axios from "@/utils/axios";
const props = defineProps<{ projectId: number; scriptId: number }>();
const versionState=ref<any>(null);
const busy = ref(false),
  error = ref(""),
  result = ref<any>(null);
let generation = 0;
watch(
  () => [props.projectId, props.scriptId],
  () => {
    generation++;
    busy.value = false;
    error.value = "";
    result.value = null; versionState.value=null;
  },
);
onBeforeUnmount(() => generation++);
async function inspect() {
  if (busy.value) return;
  const token = generation;
  busy.value = true;
  error.value = "";
  try {
    const response: any = await axios.post("/v04/director/dry-run", { projectId: props.projectId, scriptId: props.scriptId });
    if (token === generation) result.value = response.data;
  } catch {
    if (token === generation) error.value = "候选结构读取失败，请检查项目状态后重试。";
  } finally {
    if (token === generation) busy.value = false;
  }
}
async function versions(){if(busy.value)return;const token=generation;busy.value=true;error.value="";try{const body={projectId:props.projectId,scriptId:props.scriptId};const [current,history]:any=await Promise.all([axios.post("/v04/director/current",body),axios.post("/v04/director/history",body)]);if(token===generation)versionState.value={current:current.data,history:history.data};}catch{if(token===generation)error.value="导演版本读取失败，请重试。";}finally{if(token===generation)busy.value=false;}}
</script>
<style scoped>
.director-inspection {
  padding: 1rem;
  border: 1px solid var(--td-component-border);
  border-radius: 8px;
}
.director-inspection p {
  color: var(--td-text-color-secondary);
}
pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  max-height: 65vh;
  overflow: auto;
}
</style>
