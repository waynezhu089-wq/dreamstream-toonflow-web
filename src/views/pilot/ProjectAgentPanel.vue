<template>
  <aside class="agent" :class="{ 'studio-agent': studioMode }" aria-label="项目智能体">
    <header>
      <div><strong>Project Agent</strong><small>同一个项目，对话持续保留</small></div>
      <span class="status">{{ busy ? "思考中" : "协作中" }}</span>
    </header>
    <p class="context">{{ studioMode ? scopeLabel || '正在讨论：整个项目' : `${stage} · ${selected ? `${selected.type} ${selected.key}` : '整个项目'}` }}</p>
    <details v-if="creativeMode && studioMode" class="more-actions"><summary>更多创意操作</summary><div class="quick-actions"><button :disabled="busy" @click="suggest('brief')">提出 Brief 修改</button><button :disabled="busy" @click="suggest('treatment')">生成 Treatment 提案</button><button :disabled="busy" @click="suggest('script')">生成 Script 提案</button></div></details>
    <div v-else-if="creativeMode" class="quick-actions"><button :disabled="busy" @click="suggest('brief')">提出 Brief 修改</button><button :disabled="busy" @click="suggest('treatment')">生成 Treatment 提案</button><button :disabled="busy" @click="suggest('script')">生成 Script 提案</button></div>
    <div ref="feed" class="feed" role="log" aria-live="polite">
      <p v-if="!messages.length" class="empty">先聊创意。讨论和图片会跟随这个项目；Agent 的建议不会直接改动正式内容。</p>
      <div v-for="m in messages" :key="m.id" class="turn" :class="[m.role, m.phase || 'complete']">
        <small class="turn-label">{{ m.role === "user" ? "你" : "Project Agent" }}</small>
        <div v-if="m.phase === 'thinking' || m.phase === 'analyzing' || m.phase === 'checking'" class="turn-progress" role="status"><span class="thinking-dots" aria-hidden="true"><i></i><i></i><i></i></span>{{ m.phase === 'checking' ? '正在检查消息状态…' : m.phase === 'analyzing' ? '正在分析图片…' : 'Project Agent 正在思考…' }}</div>
        <div v-if="m.phase === 'answering'" class="turn-progress" role="status">正在整理回答…</div>
        <div v-if="m.error" class="turn-error" role="alert"><span>{{ m.error }}</span><div class="turn-actions"><button v-if="m.visionConfigurable" type="button" @click="showVisionSettings=true">配置视觉模型</button><button v-if="m.retryable" type="button" :disabled="busy" @click="retryRequest(m.requestId!)">重试</button><button v-if="m.checkable" type="button" :disabled="busy" @click="checkStatus(m.requestId!)">检查状态</button></div></div>
        <p v-if="m.role === 'user'" class="user-content">{{ m.content }}</p>
        <MdPreview v-else-if="m.content && !['thinking','analyzing','checking'].includes(m.phase || '')" class="agent-content" :theme="markdownTheme" :modelValue="m.content" preview-only preview-theme="github" />
        <div v-if="studioMode && studioActionFor(m)" class="studio-proposal"><strong>建议修改 · {{ studioActionFor(m).action.summary }}</strong><p>{{ studioActionFor(m).action.rationale }}</p><small>提案尚未应用；预览和人工确认后才会改变正式内容。</small><div v-if="!studioActionFor(m).handled" class="turn-actions"><button type="button" :disabled="busy" @click="acceptStudioAction(m)">接受修改并预览</button><button type="button" @click="focusComposer">继续调整</button><button type="button" @click="$emit('studio-professional')">专业精修 ↗</button></div><small v-else>已送入受控预览</small></div>
        <div v-for="a in m.attachments || []" :key="a.id" class="attachment">
          <img v-if="imageUrls[a.id]" :src="imageUrls[a.id]" :alt="a.name" />
          <span>{{ a.name }} · 对话参考</span>
          <small v-if="a.references?.length" class="accepted">已确认：{{ a.references.map(r => referenceLabel(r.targetType)).join("、") }}</small>
          <div class="reference-actions"><select v-model="referenceChoices[a.id]" :aria-label="`图片 ${a.name} 的用途`"><option value="">选择图片用途…</option><option value="PROJECT_REFERENCE">加入项目参考</option><option value="ASSET_BIBLE">加入素材圣经参考</option><option v-if="selected?.type === 'ASSET'" value="BIND_SELECTED_ASSET">关联选中素材作参考</option><option v-if="selected?.type === 'ASSET'" value="PRODUCTION_ASSET">上传为选中素材的正式图片</option><option v-if="selected?.type === 'SHOT'" value="SHOT_REFERENCE">用作选中镜头参考</option></select><button :disabled="busy || !referenceChoices[a.id]" @click="previewReference(a.id)">预览</button></div>
        </div>
        <div v-if="m.role === 'user' && m.attachments?.length && !m.id.startsWith('local-user:')" class="vision-actions"><small v-if="!visionConfigured">图片已保存为对话参考；视觉模型未配置，暂时无法分析。</small><button v-if="!visionConfigured" type="button" @click="showVisionSettings=true">配置视觉模型</button><button type="button" :disabled="busy || !visionConfigured" @click="reanalyze(m.id)">重新分析这条消息</button></div>
      </div>
    </div>
    <div v-if="referencePreview" class="confirm-reference"><strong>确认图片用途</strong><p>{{ referencePreview.notice }}</p><button :disabled="busy" @click="applyReference">确认</button><button class="quiet" @click="referencePreview=null">取消</button></div>
    <div v-if="error" class="error" role="alert">{{ error }}</div>
    <form class="composer" @submit.prevent="send" @dragover.prevent @drop.prevent="onDrop">
      <textarea ref="composerInput" v-model="draft" rows="3" placeholder="和项目 Agent 讨论创意，或拖入图片…" @keydown.ctrl.enter.prevent="send" />
      <div v-if="pendingImages.length" class="pending-images"><span v-for="(file,i) in pendingImages" :key="`${file.name}-${i}`">{{ file.name }} <button type="button" :aria-label="`移除 ${file.name}`" @click="pendingImages.splice(i,1)">×</button></span></div>
      <div class="compose-actions"><label class="attach" for="project-agent-image">＋ 图片<input id="project-agent-image" type="file" accept="image/png,image/jpeg,image/webp" multiple @change="onFiles" /></label><small>Ctrl + Enter</small><button :disabled="busy || (!draft.trim() && !pendingImages.length)">发送</button></div>
    </form>
    <t-dialog :visible="showVisionSettings" attach="body" width="680px" header="配置视觉分析模型" :footer="false" @close="closeVisionSettings"><ModelPresets :project-id="projectId" /><button type="button" @click="closeVisionSettings">完成并返回对话</button></t-dialog>
  </aside>
</template>
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { MdPreview } from "md-editor-v3";
import axios from "@/utils/axios";
import settingStore from "@/stores/setting";
import ModelPresets from "@/components/ModelPresets.vue";
import { useV04ProposalWorkspace } from "@/stores/v04ProposalWorkspace";
type Attachment = { id: string; name: string; mimeType: string; references?: { targetType: string }[] };
type Phase = "thinking" | "analyzing" | "answering" | "checking" | "failed" | "uncertain" | "complete";
type Message = { id: string; role: string; content: string; createTime?: number; attachments?: Attachment[]; phase?: Phase; requestId?: string; actionId?: string; relatedUserMessageId?: string; error?: string; retryable?: boolean; checkable?: boolean; visionConfigurable?: boolean };
type Submission = { id: string; generation: number; startedAt: number; content: string; files: File[]; ctx: ReturnType<typeof context>; attachmentIds: string[]; baselineIds: Set<string>; chatDispatched: boolean; optionalDraft?: any; knownFailure?: string; persistedUserMessageId?: string };
type Target = "brief" | "treatment" | "script";
const props = defineProps<{ projectId: number; scriptId: number; stage: string; routeName: string; selected: { type: "ASSET" | "SHOT" | "PROJECT"; key: string } | null; creativeMode?: boolean; studioMode?: boolean; scopeLabel?: string; acceptStudioProposal?: (action: any) => Promise<void> }>();
const emit = defineEmits<{ (e: "creative-candidate", value: { target: Target; sourceVersion: number; candidate: { proposedText: string; reason: string; proposedTargetDuration: number | null } }): void; (e: "production-asset-applied"): void; (e: "studio-professional"): void }>();
const proposalWorkspace = useV04ProposalWorkspace();
const { themeSetting } = storeToRefs(settingStore());
const markdownTheme = computed<"light" | "dark">(() => themeSetting.value.mode === "auto" ? (document.documentElement.getAttribute("theme-mode") === "dark" ? "dark" : "light") : themeSetting.value.mode);
const historyMessages = ref<Message[]>([]), localMessages = ref<Message[]>([]);
const messages = computed(() => [...historyMessages.value.flatMap((m, index): Message[] => {
  if (m.role === "user" && m.attachments?.length && historyMessages.value[index + 1]?.role !== "assistant" && !visionConfigured.value)
    return [m, { id: `vision-missing:${m.id}`, role: "assistant", content: "", phase: "failed", error: "当前项目尚未配置视觉模型，因此图片已保存，但我还不能分析它。", visionConfigurable: true }];
  return [m];
}), ...localMessages.value]);
const draft = ref(""), error = ref(""), busy = ref(false), feed = ref<HTMLElement | null>(null), composerInput = ref<HTMLTextAreaElement | null>(null);
function focusComposer() { composerInput.value?.focus(); }
defineExpose({ focusComposer });
function studioActionFor(m: Message) { return proposalWorkspace.current().studioActions[m.actionId || m.id]; }
async function acceptStudioAction(m: Message) {
  const entry = studioActionFor(m);
  if (!entry || entry.handled || !props.acceptStudioProposal || busy.value) return;
  busy.value = true; error.value = "";
  try { await props.acceptStudioProposal(entry.action); entry.handled = true; }
  catch (e: any) { error.value = e?.message || "受控提案预览失败"; }
  finally { busy.value = false; }
}
const pendingImages = ref<File[]>([]), imageUrls = ref<Record<string,string>>({}), referenceChoices = ref<Record<string,string>>({}), referencePreview = ref<any>(null);
const visionConfigured = ref(true), showVisionSettings = ref(false);
const submissions = new Map<string, Submission>();
let generation = 0, historyGeneration = 0;
function context() { return { projectId: props.projectId, scriptId: props.scriptId, currentStage: props.stage, currentRoute: props.routeName, selectedObject: props.selected }; }
function clearImages() { for (const url of Object.values(imageUrls.value)) URL.revokeObjectURL(url); imageUrls.value = {}; }
function scrollToLatest() { void nextTick(() => feed.value?.scrollTo({ top: feed.value.scrollHeight })); }
function visionError(data: any) { return `${data.reply || "图片分析失败"}${data.errorCode ? ` 错误代码：${String(data.errorCode).replace(/^PILOT_/, "")}` : ""}${data.errorId ? `；诊断编号：${data.errorId}` : ""}`; }
function localAgent(requestId: string) { return localMessages.value.find(m => m.id === `local-agent:${requestId}`); }
function removeLocalUser(requestId: string) {
  const localImages = localMessages.value.find(m => m.id === `local-user:${requestId}`)?.attachments || [];
  for (const image of localImages) { if (imageUrls.value[image.id]) URL.revokeObjectURL(imageUrls.value[image.id]); delete imageUrls.value[image.id]; }
  localMessages.value = localMessages.value.filter(m => m.id !== `local-user:${requestId}`);
}
function removeLocal(requestId: string) {
  removeLocalUser(requestId);
  localMessages.value = localMessages.value.filter(m => m.requestId !== requestId);
  submissions.delete(requestId);
}
async function load(showError = true): Promise<Message[] | null> {
  const own = generation, call = ++historyGeneration, projectId = props.projectId;
  try {
    const response: any = await axios.post("/v04/agent/history", { projectId, scriptId: props.scriptId });
    if (own !== generation || call !== historyGeneration) return null;
    historyMessages.value = response.data.messages;
    visionConfigured.value = response.data.visionConfigured !== false;
    const attachments = historyMessages.value.flatMap(m => m.attachments || []);
    await Promise.all(attachments.map(async a => {
      if (imageUrls.value[a.id]) return;
      try {
        const blob: Blob = await axios.get(`/v04/agent/image/${projectId}/${a.id}`, { responseType: "blob" });
        if (own === generation && call === historyGeneration) imageUrls.value[a.id] = URL.createObjectURL(blob);
      } catch { /* Keep the message even if an image cannot be read. */ }
    }));
    if (own === generation && call === historyGeneration) { scrollToLatest(); return historyMessages.value; }
    return null;
  } catch (e: any) { if (showError && own === generation && call === historyGeneration) error.value = e?.message || "对话读取失败"; return null; }
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
async function finishStudioResponse(request: Submission, response: any) {
  if (request.generation !== generation) return;
  const agent = localAgent(request.id);
  if (response.data.mode === "PROPOSE_CHANGE" && response.data.actionProposal && response.data.assistantMessageId)
    proposalWorkspace.putStudioAction(response.data.assistantMessageId, response.data.actionProposal,
      `${request.ctx.projectId}:${request.ctx.scriptId}`);
  if (agent) { agent.phase = "answering"; agent.content = response.data.reply; agent.actionId = response.data.assistantMessageId; agent.error = undefined; agent.retryable = false; agent.checkable = false; }
  scrollToLatest();
  if (await load(false)) removeLocal(request.id);
  else if (agent && request.generation === generation) agent.phase = "complete";
}
async function showStudioTerminal(request: Submission, failure: any) {
  const agent = localAgent(request.id);
  request.persistedUserMessageId = failure.userMessageId;
  request.knownFailure = failure.message || "消息已保存，但 Project Agent 本次回答失败。";
  if (agent) {
    agent.phase = "failed"; agent.content = ""; agent.error = request.knownFailure;
    agent.relatedUserMessageId = failure.userMessageId;
    agent.retryable = failure.retryAllowed === true; agent.checkable = false;
  }
  const history = await load(false);
  if (history?.some(m => m.id === failure.userMessageId)) removeLocalUser(request.id);
  scrollToLatest();
}
async function submit(request: Submission) {
  const own = request.generation;
  try {
    for (let i = request.attachmentIds.length; i < request.files.length; i++) {
      const file = request.files[i];
      const response: any = await axios.post("/v04/agent/image/upload", { context: request.ctx, name: file.name, dataUrl: await asDataUrl(file) });
      request.attachmentIds.push(response.data.id);
    }
    if (own !== generation) return;
    request.chatDispatched = true;
    const studioTurn = props.studioMode && request.files.length === 0;
    const response: any = await axios.post(studioTurn ? "/v04/agent/studio-turn" : "/v04/agent/chat", studioTurn
      ? { context: request.ctx, message: request.content, ...(request.optionalDraft ? { optionalDraft: request.optionalDraft } : {}) }
      : { context: request.ctx, message: request.content, attachmentIds: request.attachmentIds });
    if (own !== generation) return;
    const agent = localAgent(request.id);
    if (response.data.status === "VISION_MODEL_REQUIRED" || response.data.status === "VISION_ANALYSIS_FAILED") {
      if (agent) { agent.phase = "failed"; agent.error = visionError(response.data); agent.relatedUserMessageId = response.data.userMessageId; agent.visionConfigurable = response.data.errorCode !== "PILOT_VISION_SCHEMA_FAILED"; agent.checkable = false; }
      request.knownFailure = visionError(response.data);
      const history = await load(false);
      if (history) {
        if (response.data.status === "VISION_MODEL_REQUIRED") removeLocal(request.id);
        else removeLocalUser(request.id);
      }
      return;
    }
    if (studioTurn) await finishStudioResponse(request, response);
    else {
      if (agent) { agent.phase = "answering"; agent.content = response.data.reply; agent.error = undefined; }
      scrollToLatest();
      if (await load(false)) removeLocal(request.id);
      else if (agent) agent.phase = "complete";
    }
  } catch (e: any) {
    if (own !== generation) return;
    if (props.studioMode && request.files.length === 0 && e?.terminal === true && typeof e?.userMessageId === "string") {
      await showStudioTerminal(request, e);
      return;
    }
    const agent = localAgent(request.id);
    if (agent) {
      const persisted = ["PILOT_IMAGE_MODEL_UNSUPPORTED", "PILOT_AGENT_MODEL_FAILED"].includes(e?.code);
      request.knownFailure = persisted ? (e?.message || "模型未能完成回复") : undefined;
      const safeRetry = !request.chatDispatched || ["PILOT_INPUT_INVALID", "PILOT_UNIT_REQUIRED", "PILOT_FORBIDDEN"].includes(e?.code);
      agent.phase = request.chatDispatched && !persisted && !safeRetry ? "uncertain" : "failed";
      agent.content = "";
      agent.error = `${e?.message || "连接或处理失败"}${agent.phase === "uncertain" ? "。结果尚不确定，请先检查状态，避免重复发送。" : ""}`;
      agent.retryable = safeRetry;
      agent.checkable = request.chatDispatched;
      scrollToLatest();
    }
  } finally { if (own === generation) busy.value = false; }
}
async function send() {
  if ((!draft.value.trim() && !pendingImages.value.length) || busy.value) return;
  const id = crypto.randomUUID(), content = draft.value.trim(), files = [...pendingImages.value];
  const visual = props.studioMode && props.selected?.type === "ASSET" ? proposalWorkspace.current().visualSpecProposals[props.selected.key] : null;
  const request: Submission = { id, generation, startedAt: Date.now(), content, files, ctx: context(), attachmentIds: [], baselineIds: new Set(historyMessages.value.map(m => m.id)), chatDispatched: false,
    optionalDraft: visual ? { sourceAssetRevision: visual.sourceAssetRevision, spec: visual.spec } : undefined };
  submissions.set(id, request);
  const attachments = files.map((file, i) => {
    const imageId = `local-image:${id}:${i}`;
    imageUrls.value[imageId] = URL.createObjectURL(file);
    return { id: imageId, name: file.name, mimeType: file.type };
  });
  localMessages.value.push(
    { id: `local-user:${id}`, role: "user", content: content || "[图片参考]", attachments, requestId: id },
    { id: `local-agent:${id}`, role: "assistant", content: "", phase: files.length ? "analyzing" : "thinking", requestId: id },
  );
  draft.value = ""; pendingImages.value = []; error.value = ""; busy.value = true; scrollToLatest();
  await submit(request);
}
async function retryRequest(requestId: string) {
  const request = submissions.get(requestId), agent = localAgent(requestId);
  if (!request || !agent?.retryable || busy.value) return;
  if (request.persistedUserMessageId) {
    const own = request.generation;
    agent.phase = "thinking"; agent.content = ""; agent.error = undefined; agent.retryable = false; agent.checkable = false;
    busy.value = true; scrollToLatest();
    try {
      const response: any = await axios.post("/v04/agent/studio-turn/retry", { context: request.ctx,
        userMessageId: request.persistedUserMessageId,
        ...(request.optionalDraft ? { optionalDraft: request.optionalDraft } : {}) });
      if (own === generation) await finishStudioResponse(request, response);
    } catch (e: any) {
      if (own !== generation) return;
      if (e?.terminal === true && e?.userMessageId === request.persistedUserMessageId) await showStudioTerminal(request, e);
      else {
        agent.phase = "uncertain";
        agent.error = e?.code === "PILOT_STUDIO_ALREADY_ANSWERED" ? "原消息已有回复，请刷新对话。" : `${e?.message || "连接或处理失败"}。结果尚不确定，请先检查状态，避免重复发送。`;
        agent.checkable = true;
      }
    } finally { if (own === generation) { busy.value = false; scrollToLatest(); } }
    return;
  }
  request.chatDispatched = false;
  request.knownFailure = undefined;
  agent.phase = request.files.length ? "analyzing" : "thinking"; agent.content = ""; agent.error = undefined; agent.retryable = false; agent.checkable = false; agent.visionConfigurable = false;
  busy.value = true; scrollToLatest(); await submit(request);
}
async function checkStatus(requestId: string) {
  const request = submissions.get(requestId), agent = localAgent(requestId);
  if (!request || !agent || busy.value) return;
  busy.value = true; agent.phase = "checking"; agent.error = undefined;
  try {
    const history = await load(false);
    if (!history) { agent.phase = request.knownFailure ? "failed" : "uncertain"; agent.error = request.knownFailure ? `${request.knownFailure}；暂时无法读取服务器对话。` : "暂时无法读取服务器对话，请稍后再检查；不要重复发送。"; return; }
    const matchingUserIndexes = history.flatMap((m, index) => !request.baselineIds.has(m.id) && m.role === "user" && m.content === (request.content || "[图片参考]") && Number(m.createTime) >= request.startedAt - 1000 && request.attachmentIds.every(id => m.attachments?.some(a => a.id === id)) ? [index] : []);
    if (matchingUserIndexes.length === 1) {
      const userIndex = matchingUserIndexes[0];
      removeLocalUser(requestId);
      if (history[userIndex + 1]?.role === "assistant") { removeLocal(requestId); return; }
      agent.phase = "failed"; agent.error = request.knownFailure ? `${request.knownFailure}；消息已保留在对话中。` : "服务器已收到这条消息，但尚未看到完整回复。请稍后检查状态，避免重复发送。";
    } else { agent.phase = "uncertain"; agent.error = matchingUserIndexes.length > 1 ? "服务器记录中有多条相同消息，暂时无法确认哪条对应本次请求；请勿重复发送。" : "历史中尚未找到这条消息；原请求可能仍在处理。请稍后再检查，不要重复发送。"; }
    agent.retryable = false; agent.checkable = true;
  } finally { busy.value = false; scrollToLatest(); }
}
function closeVisionSettings() { showVisionSettings.value = false; void load(false); }
async function reanalyze(userMessageId: string) {
  if (busy.value || !visionConfigured.value) return;
  const own = generation, placeholderId = `local-reanalysis:${userMessageId}`;
  localMessages.value = localMessages.value.filter(m => m.id !== placeholderId && m.relatedUserMessageId !== userMessageId);
  localMessages.value.push({ id: placeholderId, role: "assistant", content: "", phase: "analyzing" });
  busy.value = true; scrollToLatest();
  try {
    const response: any = await axios.post("/v04/agent/reanalyze", { context: context(), userMessageId });
    if (own !== generation) return;
    const agent = localMessages.value.find(m => m.id === placeholderId);
    if (response.data.status !== "ANSWERED") { if (agent) { agent.phase = "failed"; agent.error = visionError(response.data); agent.visionConfigurable = response.data.errorCode !== "PILOT_VISION_SCHEMA_FAILED"; } return; }
    if (agent) { agent.phase = "answering"; agent.content = response.data.reply; }
    if (await load(false)) localMessages.value = localMessages.value.filter(m => m.id !== placeholderId);
    else if (agent) agent.phase = "complete";
  } catch (e: any) {
    if (own !== generation) return;
    const agent = localMessages.value.find(m => m.id === placeholderId);
    if (agent) { agent.phase = "uncertain"; agent.error = `${e?.message || "重新分析未完成"}。结果可能仍在处理；请先查看最新对话，避免重复请求。`; }
  } finally { if (own === generation) busy.value = false; scrollToLatest(); }
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
onMounted(() => { void load(); });
watch(() => [props.projectId, props.scriptId], () => { generation++; historyGeneration++; clearImages(); historyMessages.value = []; localMessages.value = []; submissions.clear(); busy.value = false; referencePreview.value = null; showVisionSettings.value = false; void load(); });
onBeforeUnmount(() => { generation++; clearImages(); });
</script>
<style scoped>
.agent{--user-ink:color-mix(in srgb,#779dce 72%,var(--td-text-color-primary));--agent-ink:color-mix(in srgb,#a792c1 72%,var(--td-text-color-primary));height:100%;min-height:0;display:flex;flex-direction:column;border-left:1px solid var(--td-component-border);background:var(--td-bg-color-container);color:var(--td-text-color-primary)}
header{display:flex;align-items:center;justify-content:space-between;padding:1.25rem 1.2rem .75rem}header strong{font-size:1.05rem;letter-spacing:-.02em}header small{display:block;margin-top:.2rem;color:var(--td-text-color-secondary)}.status{font-size:.73rem;color:var(--td-brand-color);border:1px solid var(--td-component-border);padding:.25rem .55rem;border-radius:999px}.context{margin:0;padding:.35rem 1.2rem .8rem;color:var(--td-text-color-secondary);font-size:.77rem;border-bottom:1px solid var(--td-component-border)}
.feed{min-height:0;flex:1;overflow-y:auto;padding:1rem 1.2rem;scrollbar-width:thin}.empty{color:var(--td-text-color-secondary);line-height:1.6}
.turn{margin:0 0 1.2rem}.turn-label{display:block;font-size:.72rem;font-weight:700;letter-spacing:.01em}.turn.user{box-sizing:border-box;width:fit-content;max-width:92%;margin-left:auto;padding:.65rem .8rem;border:1px solid color-mix(in srgb,var(--user-ink) 30%,var(--td-component-border));border-radius:.6rem;background:color-mix(in srgb,var(--user-ink) 9%,var(--td-bg-color-container))}.turn.user .turn-label{color:var(--user-ink)}.user-content{white-space:pre-wrap;line-height:1.55;margin:.35rem 0 0}
.turn.assistant{margin-top:1.55rem;padding:1rem 0 .15rem .85rem;border-top:1px solid color-mix(in srgb,var(--agent-ink) 22%,var(--td-component-border));border-left:2px solid color-mix(in srgb,var(--agent-ink) 42%,var(--td-component-border))}.turn.assistant .turn-label{color:var(--agent-ink)}.agent-content{margin-top:.55rem;background:transparent;color:var(--td-text-color-primary)}.agent-content :deep(.md-editor-preview-wrapper){padding:0;background:transparent}.agent-content :deep(.md-editor-preview){color:var(--td-text-color-primary)}.agent-content :deep(h1),.agent-content :deep(h2),.agent-content :deep(h3){line-height:1.35;margin:1.15em 0 .45em}.agent-content :deep(h1){font-size:1.2rem}.agent-content :deep(h2){font-size:1.08rem}.agent-content :deep(h3){font-size:.98rem}.agent-content :deep(p){line-height:1.65}
.turn-progress{display:flex;align-items:center;gap:.5rem;margin-top:.5rem;color:var(--td-text-color-secondary);font-size:.83rem}.thinking-dots{display:inline-flex;align-items:center;gap:3px}.thinking-dots i{width:4px;height:4px;border-radius:50%;background:currentColor;animation:agent-pulse 1.2s ease-in-out infinite}.thinking-dots i:nth-child(2){animation-delay:.16s}.thinking-dots i:nth-child(3){animation-delay:.32s}@keyframes agent-pulse{0%,70%,100%{opacity:.32}35%{opacity:1}}@media(prefers-reduced-motion:reduce){.thinking-dots i{animation:none}}
.turn-error{margin-top:.6rem;color:var(--td-error-color);font-size:.82rem;line-height:1.5}.turn-actions{display:flex;gap:.45rem;margin-top:.5rem}.turn-actions button{background:transparent;color:var(--td-text-color-primary);border:1px solid var(--td-component-border);font-size:.73rem;padding:.3rem .55rem}.error{color:var(--td-error-color);padding:.5rem 1.2rem;font-size:.83rem}.composer{padding:1rem;border-top:1px solid var(--td-component-border)}textarea{box-sizing:border-box;width:100%;resize:vertical;min-height:5rem;border:1px solid var(--td-component-border);border-radius:.6rem;background:var(--td-bg-color-container);color:var(--td-text-color-primary);font:inherit;padding:.7rem}.compose-actions{display:flex;justify-content:space-between;align-items:center;margin-top:.5rem}.compose-actions small{color:var(--td-text-color-secondary)}button{border:0;background:var(--td-brand-color);color:#fff;border-radius:.4rem;padding:.5rem .9rem;cursor:pointer}button:disabled{opacity:.45;cursor:default}
.quick-actions{display:flex;flex-wrap:wrap;gap:.35rem;padding:.8rem 1.2rem;border-bottom:1px solid var(--td-component-border)}.quick-actions button,.reference-actions button,.confirm-reference button{background:var(--td-bg-color-secondarycontainer);color:var(--td-text-color-primary);border:1px solid var(--td-component-border);border-radius:.35rem;padding:.3rem .45rem;cursor:pointer;font-size:.72rem}
.attachment{margin:.5rem 0;padding:.35rem 0;border-top:1px solid var(--td-component-border)}.attachment img{display:block;max-width:100%;max-height:12rem;object-fit:contain;border-radius:.35rem;margin:.35rem 0}.attachment span,.attachment small{display:block;font-size:.72rem}.attachment .accepted{color:var(--td-success-color)}.reference-actions{display:flex;gap:.3rem;margin-top:.4rem}.reference-actions select{min-width:0;flex:1;background:var(--td-bg-color-container);color:var(--td-text-color-primary);border:1px solid var(--td-component-border);border-radius:.3rem;font-size:.72rem}
.vision-actions{display:flex;flex-wrap:wrap;align-items:center;gap:.45rem;margin-top:.5rem}.vision-actions small{width:100%;color:var(--td-text-color-secondary);line-height:1.45}.vision-actions button{background:transparent;color:var(--td-text-color-primary);border:1px solid var(--td-component-border);font-size:.72rem;padding:.3rem .5rem}
.confirm-reference{padding:.7rem 1.2rem;border-top:1px solid var(--td-component-border);font-size:.79rem}.confirm-reference p{color:var(--td-text-color-secondary);line-height:1.45}.confirm-reference button{margin-right:.4rem}.attach{font-size:.78rem;cursor:pointer;color:var(--td-brand-color)}.attach input{display:none}.pending-images{display:flex;flex-wrap:wrap;gap:.3rem;margin-top:.4rem}.pending-images span{font-size:.7rem;background:var(--td-bg-color-secondarycontainer);border-radius:.3rem;padding:.25rem}.pending-images button{background:none;border:0;color:var(--td-text-color-primary);cursor:pointer}
.agent{min-width:0}.composer{flex-shrink:0;min-height:0}.composer textarea{height:86px;min-height:80px;max-height:min(250px,38vh)}.more-actions{padding:.25rem 1.2rem;border-bottom:1px solid var(--td-component-border);color:var(--td-text-color-secondary);font-size:.75rem}.more-actions summary{cursor:pointer;padding:.25rem 0}.more-actions .quick-actions{padding:.5rem 0;border:0}.studio-proposal{margin:.85rem 0 .3rem;padding:.7rem .8rem;border:1px solid var(--td-component-border);border-radius:.5rem;background:var(--td-bg-color-secondarycontainer);font-size:.82rem}.studio-proposal strong{display:block;color:var(--td-text-color-primary)}.studio-proposal p{line-height:1.5;margin:.45rem 0}.studio-proposal small{color:var(--td-text-color-secondary)}.studio-proposal .turn-actions{flex-wrap:wrap}.studio-proposal button{background:var(--td-bg-color-container);color:var(--td-text-color-primary);border:1px solid var(--td-component-border);font-size:.73rem;padding:.35rem .55rem}
.agent.studio-agent header{padding:.55rem .9rem .35rem}.agent.studio-agent header small{display:none}.agent.studio-agent .context{padding:.25rem .9rem .45rem}.agent.studio-agent .more-actions{padding:.15rem .9rem}.agent.studio-agent .feed{padding:.6rem .9rem}.agent.studio-agent .composer{padding:.6rem .9rem}.agent.studio-agent .composer textarea{height:80px}
</style>
