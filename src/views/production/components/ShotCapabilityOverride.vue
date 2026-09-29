<template>
  <t-dialog :visible="true" header="镜头图片 Capability" attach="body" :footer="false" @close="$emit('close')">
    <div class="shot-capability" @pointerdown.stop @mousedown.stop @wheel.stop @click.stop>
      <p>仅设置当前 AI 文生图镜头的执行能力，不修改分镜语义或审核状态。</p>
      <p v-if="error" role="alert">{{ error }}</p>
      <label>精确 Capability
        <select v-model="selected" :disabled="busy">
          <option value="">继承 Recipe / 系统默认（清除镜头覆盖）</option>
          <option v-for="option in versions" :key="option.capabilityId" :value="option.capabilityId">{{ option.capabilityId }}</option>
        </select>
      </label>
      <p>当前镜头覆盖：{{ capabilityId || '无' }}</p>
      <t-button :loading="busy" @click="save">保存</t-button>
      <t-button variant="outline" @click="$emit('close')">取消</t-button>
    </div>
  </t-dialog>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import axios from "@/utils/axios";

const props = defineProps<{ projectId: number; scriptId: number; storyboardId: number; capabilityId?: string | null }>();
const emit = defineEmits<{ close: []; applied: [] }>();
const selected = ref(props.capabilityId ?? ""), busy = ref(false), error = ref("");
const versions = ref<{ capabilityId: string }[]>([]);
watch(() => props.capabilityId, value => { selected.value = value ?? ""; });

onMounted(async () => {
  try {
    const { data } = await axios.post("/capabilities/list", {});
    versions.value = (data as { versions: { capabilityId: string; status: string }[] }[])
      .flatMap(family => family.versions).filter(version => version.status === "VERIFIED");
  } catch (cause: any) { error.value = cause?.response?.data?.message || "无法读取 Capability 列表"; }
});

async function save() {
  if (busy.value) return;
  const scope = { projectId: props.projectId, scriptId: props.scriptId, storyboardId: props.storyboardId };
  busy.value = true; error.value = "";
  try {
    await axios.post("/storyboardCapability", { ...scope, capabilityId: selected.value || null });
    if (scope.projectId === props.projectId && scope.scriptId === props.scriptId && scope.storyboardId === props.storyboardId) emit("applied");
  } catch (cause: any) { error.value = cause?.response?.data?.message || "保存镜头 Capability 失败"; }
  finally { busy.value = false; }
}
</script>

<style scoped>
.shot-capability { display: grid; gap: 12px; max-height: 70vh; overflow-y: auto; color: var(--td-text-color-primary); }
.shot-capability label { display: grid; gap: 6px; }
.shot-capability select { width: 100%; background: var(--td-bg-color-container); color: var(--td-text-color-primary); border: 1px solid var(--td-component-border); padding: 6px; }
.shot-capability [role="alert"] { color: var(--td-error-color); }
</style>
