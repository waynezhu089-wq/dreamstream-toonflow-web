<template>
  <aside class="agent" aria-label="项目智能体">
    <header>
      <div><strong>Project Agent</strong><small>同一个项目，对话持续保留</small></div>
      <span class="status">{{ busy ? "思考中" : "协作中" }}</span>
    </header>
    <p class="context">{{ stage }} · {{ selected ? `${selected.type} ${selected.key}` : "整个项目" }}</p>
    <div v-if="creativeMode" class="quick-actions"><button :disabled="busy" @click="suggest('brief')">提出 Brief 修改</button><button :disabled="busy" @click="suggest('treatment')">生成 Treatment 提案</button><button :disabled="busy" @click="suggest('script')">生成 Script 提案</button></div>
    <div ref="feed" class="feed" role="log" aria-live="polite">
      <p v-if="!messages.length" class="empty">先聊创意。讨论和图片会跟随这个项目；Agent 的建议不会直接改动正式内容。</p>
      <div v-for="m in messages" :key="m.id" class="bubble" :class="m.role">
        <small>{{ m.role === "user" ? "你" : "Project Agent" }}</small>
        <p>{{ m.content }}</p>
        <div v-for="a in m.attachments || []" :key="a.id" class="attachment">
          <img v-if="imageUrls[a.id]" :src="imageUrls[a.id]" :alt="a.name" />
          <span>{{ a.name }} · 对话参考</span>
          <small v-if="a.references?.length">已确认：{{ a.references.map(r => referenceLabel(r.targetType)).join("、") }}</small>
          <div class="reference-actions"><select v-model="referenceChoices[a.id]" :aria-label="`图片 ${a.name} 的用途`"><option value="">选择图片用途…</option><option value="PROJECT_REFERENCE">加入项目参考</option><option value="ASSET_BIBLE">加入素材圣经参考</option><option v-if="selected?.type === 'ASSET'" value="BIND_SELECTED_ASSET">关联选中素材作参考</option><option v-if="selected?.type === 'ASSET'" value="PRODUCTION_ASSET">上传为选中素材的正式图片</option><option v-if="selected?.type === 'SHOT'" value="SHOT_REFERENCE">用作选中镜头参考</option></select><button :disabled="busy || !referenceChoices[a.id]" @click="previewReference(a.id)">预览</button></div>
        </div>
      </div>
    </div>
    <div v-if="referencePreview" class="confirm-reference"><strong>确认图片用途</strong><p>{{ referencePreview.notice }}</p><button :disabled="busy" @click="applyReference">确认</button><button class="quiet" @click="referencePreview=null">取消</button></div>
    <div v-if="error" class="error" role="alert">{{ error }}</div>
    <form class="composer" @submit.prevent="send" @dragover.prevent @drop.prevent="onDrop">
      <textarea v-model="draft" rows="3" placeholder="和项目 Agent 讨论创意，或拖入图片…" @keydown.ctrl.enter.prevent="send" />
      <div v-if="pendingImages.length" class="pending-images"><span v-for="(file,i) in pendingImages" :key="`${file.name}-${i}`">{{ file.name }} <button type="button" :aria-label="`移除 ${file.name}`" @click="pendingImages.splice(i,1)">×</button></span></div>
      <div class="compose-actions"><label class="attach" for="project-agent-image">＋ 图片<input id="project-agent-image" type="file" accept="image/png,image/jpeg,image/webp" multiple @change="onFiles" /></label><small>Ctrl + Enter</small><button :disabled="busy || (!draft.trim() && !pendingImages.length)">发送</button></div>
    </form>
  </aside>
</template>
<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import axios from "@/utils/axios";
type Attachment = { id: string; name: string; mimeType: string; references?: { targetType: string }[] };
type Message = { id: string; role: string; content: string; attachments?: Attachment[] };
type Target = "brief" | "treatment" | "script";
const props = defineProps<{ projectId: number; scriptId: number; stage: string; routeName: string; selected: { type: "ASSET" | "SHOT" | "PROJECT"; key: string } | null; creativeMode?: boolean }>();
const emit = defineEmits<{ (e: "creative-candidate", value: { target: Target; sourceVersion: number; candidate: { proposedText: string; reason: string } }): void; (e: "production-asset-applied"): void }>();
const messages = ref<Message[]>([]), draft = ref(""), error = ref(""), busy = ref(false), feed = ref<HTMLElement | null>(null);
const pendingImages = ref<File[]>([]), imageUrls = ref<Record<string,string>>({}), referenceChoices = ref<Record<string,string>>({}), referencePreview = ref<any>(null);
let generation = 0;
function context() { return { projectId: props.projectId, scriptId: props.scriptId, currentStage: props.stage, currentRoute: props.routeName, selectedObject: props.selected }; }
function clearImages() { for (const url of Object.values(imageUrls.value)) URL.revokeObjectURL(url); imageUrls.value = {}; }
async function load() {
  const own = ++generation;
  try {
    const response: any = await axios.post("/v04/agent/history", { projectId: props.projectId, scriptId: props.scriptId });
    if (own !== generation) return;
    messages.value = response.data.messages;
    const attachments = messages.value.flatMap(m => m.attachments || []);
    await Promise.all(attachments.map(async a => {
      if (imageUrls.value[a.id]) return;
      try {
        const blob: Blob = await axios.get(`/v04/agent/image/${props.projectId}/${a.id}`, { responseType: "blob" });
        if (own === generation) imageUrls.value[a.id] = URL.createObjectURL(blob);
      } catch { /* Keep the message even if an image cannot be read. */ }
    }));
    await nextTick(); if (own === generation) feed.value?.scrollTo({ top: feed.value.scrollHeight });
  } catch (e: any) { if (own === generation) error.value = e?.message || "对话读取失败"; }
}
function addFiles(files: FileList | File[]) {
  for (const file of Array.from(files)) {
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 8 * 1024 * 1024) { error.value = "只支持 8 MB 以内的 PNG、JPEG、WebP 图片"; continue; }
    if (pendingImages.value.length >= 4) { error.value = "一次最多发送四张图片"; break; }
    pendingImages.value.push(file);
  }
}
function onFiles(event: Event) { const input = event.target as HTMLInputElement; if (input.files) addFiles(input.files); input.value = ""; }
function onDrop(event: DragEvent) { if (event.dataTransfer?.files) addFiles(event.dataTransfer.files); }
function asDataUrl(file: File): Promise<string> { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file); }); }
async function send() {
  if ((!draft.value.trim() && !pendingImages.value.length) || busy.value) return;
  const own = generation, content = draft.value.trim(), files = [...pendingImages.value], ctx = context();
  error.value = ""; busy.value = true;
  try {
    const attachmentIds: string[] = [];
    for (const file of files) {
      const response: any = await axios.post("/v04/agent/image/upload", { context: ctx, name: file.name, dataUrl: await asDataUrl(file) });
      attachmentIds.push(response.data.id);
    }
    await axios.post("/v04/agent/chat", { context: ctx, message: content, attachmentIds });
    if (own === generation) { draft.value = ""; pendingImages.value = []; await load(); }
  } catch (e: any) { if (own === generation) { if (["PILOT_IMAGE_MODEL_UNSUPPORTED","PILOT_AGENT_MODEL_FAILED"].includes(e?.code)) { draft.value = ""; pendingImages.value = []; } error.value = e?.message || "消息处理失败"; await load(); } }
  finally { busy.value = false; }
}
async function suggest(target: Target) {
  if (busy.value || !window.confirm("生成创意提案会调用当前项目配置的文本模型，可能产生费用。继续吗？")) return;
  const own = generation; busy.value = true; error.value = "";
  try { const response: any = await axios.post("/v04/agent/creative-proposal", { projectId: props.projectId, scriptId: props.scriptId, target, instruction: draft.value.trim() }); if (own === generation) emit("creative-candidate", response.data); }
  catch (e: any) { if (own === generation) error.value = e?.message || "提案生成失败"; }
  finally { busy.value = false; }
}
const referenceLabel = (value: string) => ({ PROJECT_REFERENCE: "项目参考", ASSET_BIBLE: "素材圣经参考", BIND_SELECTED_ASSET: "素材参考", SHOT_REFERENCE: "镜头参考", PRODUCTION_ASSET: "正式素材" } as Record<string,string>)[value] || value;
async function previewReference(attachmentId: string) {
  const targetType = referenceChoices.value[attachmentId];
  const targetKey = ["BIND_SELECTED_ASSET", "PRODUCTION_ASSET", "SHOT_REFERENCE"].includes(targetType) ? props.selected?.key ?? null : targetType === "ASSET_BIBLE" && props.selected?.type === "ASSET" ? props.selected.key : null;
  busy.value = true; error.value = "";
  try { const response: any = await axios.post("/v04/agent/reference/preview", { context: context(), attachmentId, targetType, targetKey }); referencePreview.value = { ...response.data, context: context(), attachmentId, targetType, targetKey }; }
  catch (e: any) { error.value = e?.message || "图片用途预览失败"; }
  finally { busy.value = false; }
}
async function applyReference() {
  if (!referencePreview.value || busy.value) return;
  busy.value = true; error.value = "";
  try { const p = referencePreview.value; await axios.post("/v04/agent/reference/apply", { context: p.context, attachmentId: p.attachmentId, targetType: p.targetType, targetKey: p.targetKey, previewHash: p.previewHash }); referencePreview.value = null; await load(); if (p.targetType === "PRODUCTION_ASSET") emit("production-asset-applied"); }
  catch (e: any) { error.value = e?.message || "图片用途确认失败"; }
  finally { busy.value = false; }
}
onMounted(load);
watch(() => props.projectId, () => { clearImages(); messages.value = []; referencePreview.value = null; load(); });
onBeforeUnmount(clearImages);
</script>
<style scoped>
.agent{height:100%;min-height:0;display:flex;flex-direction:column;border-left:1px solid var(--td-component-border);background:var(--td-bg-color-container);color:var(--td-text-color-primary)}
header{display:flex;align-items:center;justify-content:space-between;padding:1.25rem 1.2rem .75rem}header strong{font-size:1.05rem;letter-spacing:-.02em}header small{display:block;margin-top:.2rem;color:var(--td-text-color-secondary)}.status{font-size:.73rem;color:var(--td-brand-color);border:1px solid var(--td-component-border);padding:.25rem .55rem;border-radius:999px}.context{margin:0;padding:.35rem 1.2rem .8rem;color:var(--td-text-color-secondary);font-size:.77rem;border-bottom:1px solid var(--td-component-border)}
.feed{min-height:0;flex:1;overflow-y:auto;padding:1rem 1.2rem;scrollbar-width:thin}.empty{color:var(--td-text-color-secondary);line-height:1.6}.bubble{margin:0 0 1.25rem}.bubble small{color:var(--td-text-color-secondary);font-size:.73rem}.bubble p{white-space:pre-wrap;line-height:1.55;margin:.35rem 0}.bubble.user{background:var(--td-bg-color-secondarycontainer);border-radius:.75rem;padding:.75rem}.error{color:var(--td-error-color);padding:.5rem 1.2rem;font-size:.83rem}.composer{padding:1rem;border-top:1px solid var(--td-component-border)}textarea{box-sizing:border-box;width:100%;resize:vertical;min-height:5rem;border:1px solid var(--td-component-border);border-radius:.6rem;background:var(--td-bg-color-container);color:var(--td-text-color-primary);font:inherit;padding:.7rem}.compose-actions{display:flex;justify-content:space-between;align-items:center;margin-top:.5rem}.compose-actions small{color:var(--td-text-color-secondary)}button{border:0;background:var(--td-brand-color);color:#fff;border-radius:.4rem;padding:.5rem .9rem;cursor:pointer}button:disabled{opacity:.45;cursor:default}
.quick-actions{display:flex;flex-wrap:wrap;gap:.35rem;padding:.8rem 1.2rem;border-bottom:1px solid var(--td-component-border)}.quick-actions button,.reference-actions button,.confirm-reference button{background:var(--td-bg-color-secondarycontainer);color:var(--td-text-color-primary);border:1px solid var(--td-component-border);border-radius:.35rem;padding:.3rem .45rem;cursor:pointer;font-size:.72rem}
.attachment{margin:.5rem 0;padding:.35rem 0;border-top:1px solid var(--td-component-border)}.attachment img{display:block;max-width:100%;max-height:12rem;object-fit:contain;border-radius:.35rem;margin:.35rem 0}.attachment span,.attachment small{display:block;font-size:.72rem}.reference-actions{display:flex;gap:.3rem;margin-top:.4rem}.reference-actions select{min-width:0;flex:1;background:var(--td-bg-color-container);color:var(--td-text-color-primary);border:1px solid var(--td-component-border);border-radius:.3rem;font-size:.72rem}
.confirm-reference{padding:.7rem 1.2rem;border-top:1px solid var(--td-component-border);font-size:.79rem}.confirm-reference p{color:var(--td-text-color-secondary);line-height:1.45}.confirm-reference button{margin-right:.4rem}.attach{font-size:.78rem;cursor:pointer;color:var(--td-brand-color)}.attach input{display:none}.pending-images{display:flex;flex-wrap:wrap;gap:.3rem;margin-top:.4rem}.pending-images span{font-size:.7rem;background:var(--td-bg-color-secondarycontainer);border-radius:.3rem;padding:.25rem}.pending-images button{background:none;border:0;color:var(--td-text-color-primary);cursor:pointer}
</style>
