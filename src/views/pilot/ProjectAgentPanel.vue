<template>
  <aside class="agent" aria-label="项目智能体">
    <header>
      <div><strong>Project Agent</strong><small>项目记忆持续保留</small></div>
      <span class="status">{{ busy ? "思考中" : "协作中" }}</span>
    </header>
    <p class="context">{{ stage }} · {{ selected ? `${selected.type} ${selected.key}` : "整个项目" }}</p>
    <div ref="feed" class="feed" role="log" aria-live="polite">
      <p v-if="!messages.length" class="empty">从创意到剪辑，和同一个项目伙伴讨论。建议不会自动改动生产内容。</p>
      <div v-for="m in messages" :key="m.id" class="bubble" :class="m.role">
        <small>{{ m.role === "user" ? "你" : "Project Agent" }}</small>
        <p>{{ m.content }}</p>
      </div>
    </div>
    <div v-if="error" class="error" role="alert">{{ error }}</div>
    <form class="composer" @submit.prevent="send">
      <textarea v-model="draft" rows="3" placeholder="描述想法、反馈或选中对象的修改方向…" @keydown.ctrl.enter.prevent="send" />
      <div class="compose-actions"><small>Ctrl + Enter 发送</small><button :disabled="busy || !draft.trim()">发送</button></div>
    </form>
  </aside>
</template>
<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from "vue";
import axios from "@/utils/axios";
type Message = { id: string; role: string; content: string };
const props = defineProps<{ projectId: number; scriptId: number; stage: string; routeName: string; selected: { type: "ASSET" | "SHOT" | "PROJECT"; key: string } | null }>();
const messages = ref<Message[]>([]), draft = ref(""), error = ref(""), busy = ref(false), feed = ref<HTMLElement | null>(null);
let generation = 0;
async function load() {
  const own = ++generation;
  try {
    const response: any = await axios.post("/v04/agent/history", { projectId: props.projectId, scriptId: props.scriptId });
    if (own === generation) messages.value = response.data.messages;
    await nextTick(); feed.value?.scrollTo({ top: feed.value.scrollHeight });
  } catch (e: any) { if (own === generation) error.value = e?.message || "对话读取失败"; }
}
async function send() {
  if (!draft.value.trim() || busy.value) return;
  const own = generation, content = draft.value.trim();
  draft.value = ""; error.value = ""; busy.value = true;
  const context = { projectId: props.projectId, scriptId: props.scriptId, currentStage: props.stage, currentRoute: props.routeName, selectedObject: props.selected };
  try {
    await axios.post("/v04/agent/chat", { context, message: content });
    if (own === generation) await load();
  } catch (e: any) { if (own === generation) { draft.value = content; error.value = e?.message || "消息未发送；请检查文本模型配置"; } }
  finally { busy.value = false; }
}
onMounted(load);
watch(() => [props.projectId, props.scriptId], load);
</script>
<style scoped>
.agent{height:100%;min-height:0;display:flex;flex-direction:column;border-left:1px solid var(--td-component-border);background:var(--td-bg-color-container);color:var(--td-text-color-primary)}
header{display:flex;align-items:center;justify-content:space-between;padding:1.25rem 1.2rem .75rem}header strong{font-size:1.05rem;letter-spacing:-.02em}header small{display:block;margin-top:.2rem;color:var(--td-text-color-secondary)}.status{font-size:.73rem;color:var(--td-brand-color);border:1px solid var(--td-component-border);padding:.25rem .55rem;border-radius:999px}.context{margin:0;padding:.35rem 1.2rem .8rem;color:var(--td-text-color-secondary);font-size:.77rem;border-bottom:1px solid var(--td-component-border)}
.feed{min-height:0;flex:1;overflow-y:auto;padding:1rem 1.2rem;scrollbar-width:thin}.empty{color:var(--td-text-color-secondary);line-height:1.6}.bubble{margin:0 0 1.25rem}.bubble small{color:var(--td-text-color-secondary);font-size:.73rem}.bubble p{white-space:pre-wrap;line-height:1.55;margin:.35rem 0}.bubble.user{background:var(--td-bg-color-secondarycontainer);border-radius:.75rem;padding:.75rem}.error{color:var(--td-error-color);padding:.5rem 1.2rem;font-size:.83rem}.composer{padding:1rem;border-top:1px solid var(--td-component-border)}textarea{box-sizing:border-box;width:100%;resize:vertical;min-height:5rem;border:1px solid var(--td-component-border);border-radius:.6rem;background:var(--td-bg-color-container);color:var(--td-text-color-primary);font:inherit;padding:.7rem}.compose-actions{display:flex;justify-content:space-between;align-items:center;margin-top:.5rem}.compose-actions small{color:var(--td-text-color-secondary)}button{border:0;background:var(--td-brand-color);color:#fff;border-radius:.4rem;padding:.5rem .9rem;cursor:pointer}button:disabled{opacity:.45;cursor:default}
</style>
