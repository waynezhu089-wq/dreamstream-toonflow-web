<template>
  <t-dialog :visible="true" header="项目图片 Prompt Skill" width="620px" :footer="false" attach="body" @close="$emit('close')">
    <div class="project-skill-picker">
      <p>为当前广告项目选择一套已激活的方法。以后仍可在单镜头覆盖。</p>
      <p v-if="error" role="alert">{{ error }}</p><p v-if="notice" role="status">{{ notice }}</p>
      <p>当前：{{ currentLabel }}</p>
      <label>选择 Skill
        <select v-model="selected"><option value="">请选择</option><option v-for="item in options" :key="`${item.skillId}@${item.version}`" :value="`${item.skillId}@${item.version}`">{{ item.displayName }} · {{ item.version }}</option></select>
      </label>
      <t-button theme="primary" :disabled="!selected" :loading="busy" @click="save">使用这个 Skill</t-button>
    </div>
  </t-dialog>
</template>
<script setup lang="ts">
import { computed, ref, watch } from "vue";
import axios from "@/utils/axios";
const props = defineProps<{ projectId: number }>();
defineEmits<{ close: [] }>();
const families = ref<any[]>([]), current = ref<any>(null), selected = ref(""), error = ref(""), notice = ref(""), busy = ref(false);
const options = computed(() => families.value.flatMap(family => family.skillType === "IMAGE_PROMPT" ? family.versions.filter((version: any) => version.status === "ACTIVE").map((version: any) => ({ skillId: family.skillId, displayName: family.displayName, version: version.version })) : []));
const currentLabel = computed(() => current.value ? `${families.value.find(item => item.skillId === current.value.skillId)?.displayName || current.value.skillId} · ${current.value.skillVersion}` : "未设置");
const api = async (path: string, body: any) => (await axios.post(`/skills/${path}`, body)).data;
async function load() { error.value = ""; try { families.value = await api("list", {}); const rows = await api("binding/list", { scopeType: "PROJECT", scopeKey: `project:${props.projectId}` }); current.value = rows.find((row: any) => row.skillType === "IMAGE_PROMPT" && row.skillId) || null; selected.value = current.value ? `${current.value.skillId}@${current.value.skillVersion}` : ""; } catch (value: any) { error.value = value?.response?.data?.message || value?.message || "读取失败"; } }
async function save() { const index = selected.value.lastIndexOf("@"); if (index < 1) return; busy.value = true; error.value = ""; try { await api("binding/save", { scopeType: "PROJECT", scopeKey: `project:${props.projectId}`, skillType: "IMAGE_PROMPT", skillId: selected.value.slice(0, index), skillVersion: selected.value.slice(index + 1), overrideText: null }); await load(); notice.value = "项目 Skill 已保存。"; } catch (value: any) { error.value = value?.response?.data?.message || value?.message || "保存失败"; } finally { busy.value = false; } }
watch(() => props.projectId, () => { void load(); }, { immediate: true });
</script>
<style scoped>.project-skill-picker { display: grid; gap: 12px; color: var(--td-text-color-primary); }.project-skill-picker select { display: block; width: 100%; margin-top: 5px; color: var(--td-text-color-primary); background: var(--td-bg-color-container); border: 1px solid var(--td-component-border); }.project-skill-picker [role=alert] { color: var(--td-error-color); }.project-skill-picker [role=status] { border-left: 3px solid var(--td-success-color); padding-left: 8px; }</style>
