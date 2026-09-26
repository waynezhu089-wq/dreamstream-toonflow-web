<template>
  <t-dialog
    :visible="true"
    header="背景 + 真实素材合成"
    width="820px"
    :footer="false"
    attach="body"
    placement="center"
    dialog-class-name="composite-dialog"
    @close="$emit('close')">
    <div class="composite-panel" @wheel.stop @pointerdown.stop @mousedown.stop>
      <p>先生成不含真实界面的背景，再人工确认屏幕四角，将已绑定的真实素材透视合成。只有最终合成图才算镜头完成。</p>
      <label>背景描述（不要描述或要求生成真实 UI）<textarea v-model="prompt" rows="4" :disabled="busy" /></label>
      <div class="parameters">
        <label>宽度<input v-model.number="width" type="number" min="256" max="2048" step="16" :disabled="busy" /></label>
        <label>高度<input v-model.number="height" type="number" min="256" max="2048" step="16" :disabled="busy" /></label>
        <label>种子<input v-model.number="seed" type="number" min="0" step="1" :disabled="busy" /></label>
      </div>
      <t-button :disabled="busy || !prompt.trim()" @click="start">{{ attempt ? '重新生成背景（新尝试）' : '生成背景' }}</t-button>
      <p v-if="busy">{{ attempt?.status === 'COMPOSITING' ? '正在合成真实素材…' : '正在处理，请稍候…' }}</p>
      <t-button v-if="busy && !pending" theme="default" @click="restart">尝试已中断？重新创建背景</t-button>
      <p v-if="error" role="alert" class="error">{{ error }}</p>
      <p v-if="attempt?.error" role="alert" class="error">{{ attempt.errorCode }}：{{ attempt.error }}</p>
      <template v-if="attempt?.backgroundUrl">
        <p>背景图（尚不是最终输出）。坐标按原图 {{ attempt.width }} × {{ attempt.height }} 像素填写。</p>
        <svg class="preview" :viewBox="`0 0 ${attempt.width} ${attempt.height}`" aria-label="背景与屏幕四角预览">
          <image :href="attempt.backgroundUrl" :width="attempt.width" :height="attempt.height" />
          <polygon v-if="hasQuad" :points="points" fill="rgba(0,180,255,.15)" stroke="#00b4ff" stroke-width="2" />
        </svg>
        <fieldset :disabled="busy || attempt.status !== 'AWAITING_QUAD'">
          <legend>屏幕四角（顺时针）</legend>
          <div v-for="corner in corners" :key="corner.key" class="parameters">
            <span>{{ corner.label }}</span>
            <label>X<input v-model.number="quad[corner.key].x" type="number" min="0" :max="attempt.width - 1" @input="confirmed = false" /></label>
            <label>Y<input v-model.number="quad[corner.key].y" type="number" min="0" :max="attempt.height - 1" @input="confirmed = false" /></label>
          </div>
          <label><input v-model="confirmed" type="checkbox" />我已检查预览，确认四角对应手机屏幕，且真实素材将覆盖整个屏幕区域</label>
        </fieldset>
        <t-button :disabled="busy || !confirmed || !hasQuad || attempt.status !== 'AWAITING_QUAD'" @click="finish">合成真实素材</t-button>
      </template>
      <template v-if="attempt?.status === 'COMPLETED' && attempt.finalUrl">
        <p>最终合成图（真实屏幕内容来自主素材 #{{ attempt.primaryAssetId }}）</p>
        <img class="preview" :src="attempt.finalUrl" alt="最终合成图" />
      </template>
    </div>
  </t-dialog>
</template>
<script setup lang="ts">
import { computed, ref, watch, onUnmounted } from "vue";
import axios from "@/utils/axios";
const props = defineProps<{ projectId: number; scriptId: number; storyboardId: number; primaryAssetId: number; capabilityId?: string | null }>();
const emit = defineEmits<{ close: []; completed: [value: { id: number; src: string; state: string; reason: string }]; pending: [value: { id: number; src: null; state: string; reason: string }] }>();
type Corner = "topLeft" | "topRight" | "bottomRight" | "bottomLeft";
const corners: { key: Corner; label: string }[] = [{ key: "topLeft", label: "左上" }, { key: "topRight", label: "右上" }, { key: "bottomRight", label: "右下" }, { key: "bottomLeft", label: "左下" }];
const emptyQuad = () => Object.fromEntries(corners.map(c => [c.key, { x: null as number | null, y: null as number | null }])) as Record<Corner, { x: number | null; y: number | null }>;
const quad = ref(emptyQuad()), confirmed = ref(false), attempt = ref<any>(null), pending = ref(false), error = ref("");
const prompt = ref("书桌近景，英文阅读材料和笔，一部竖立且略带透视角度的手机，完整可见的空白深色屏幕，冷色侧光。屏幕不包含文字、按钮、Logo 或界面，不被手指遮挡。");
const width = ref(576), height = ref(1024), seed = ref(1);
const busy = computed(() => pending.value || ["BACKGROUND_GENERATING", "BACKGROUND_RUNNING", "COMPOSITING"].includes(attempt.value?.status));
const hasQuad = computed(() => corners.every(c => Number.isFinite(quad.value[c.key].x) && Number.isFinite(quad.value[c.key].y)));
const points = computed(() => corners.map(c => `${quad.value[c.key].x},${quad.value[c.key].y}`).join(" "));
let generation = 0, timer: ReturnType<typeof setTimeout> | undefined;
const scope = () => ({ projectId: props.projectId, scriptId: props.scriptId, storyboardId: props.storyboardId });
function accept(value: any) {
  if (value?.id !== attempt.value?.id) { quad.value = emptyQuad(); confirmed.value = false; }
  attempt.value = value;
  if (value?.screenQuad) quad.value = value.screenQuad;
  if (value?.status === "COMPLETED") emit("completed", { id: props.storyboardId, src: value.finalUrl, state: "已完成", reason: "" });
  else if (value) emit("pending", { id: props.storyboardId, src: null, state: value.status === "FAILED" ? "生成失败" : value.status === "AWAITING_QUAD" ? "未生成" : "生成中", reason: value.error || "背景与真实素材尚未完成合成" });
}
async function read(epoch: number) {
  try {
    const response = await axios.post("/production/storyboard/composite/read", scope());
    if (epoch !== generation) return;
    accept(response.data);
    if (busy.value) timer = setTimeout(() => read(epoch), 1500);
  } catch (e: any) { if (epoch === generation) error.value = e.message || "读取合成状态失败"; }
}
async function start() {
  const epoch = generation; pending.value = true; error.value = "";
  try {
    const response = await axios.post("/production/storyboard/composite/start", { ...scope(), primaryAssetId: props.primaryAssetId, backgroundCapabilityId: props.capabilityId || "comfy.z-image-turbo.txt2img.v1", prompt: prompt.value, width: width.value, height: height.value, seed: seed.value });
    if (epoch !== generation) return;
    quad.value = emptyQuad(); confirmed.value = false; accept(response.data);
    timer = setTimeout(() => read(epoch), 1500);
  } catch (e: any) { if (epoch === generation) error.value = e?.response?.data?.message || e.message || "背景生成失败"; }
  finally { if (epoch === generation) pending.value = false; }
}
function restart() {
  if (window.confirm("将创建新的背景尝试，并使旧尝试无法覆盖结果。确认重新开始？")) void start();
}
async function finish() {
  const epoch = generation; pending.value = true; error.value = "";
  try {
    const response = await axios.post("/production/storyboard/composite/finish", { ...scope(), attemptId: attempt.value.id, screenQuad: quad.value, confirmed: confirmed.value });
    if (epoch === generation) accept(response.data);
  } catch (e: any) { if (epoch === generation) error.value = e?.response?.data?.message || e.message || "真实素材合成失败"; }
  finally { if (epoch === generation) pending.value = false; }
}
watch(() => [props.projectId, props.scriptId, props.storyboardId], () => {
  generation++; clearTimeout(timer); attempt.value = null; quad.value = emptyQuad(); confirmed.value = false; pending.value = false; error.value = "";
  void read(generation);
}, { immediate: true });
onUnmounted(() => { generation++; clearTimeout(timer); });
</script>
<style>
.composite-dialog { max-width: calc(100vw - 32px); max-height: calc(100vh - 96px); max-height: calc(100dvh - 96px); display: flex; flex-direction: column; }
.composite-dialog .t-dialog__header { flex: none; }
.composite-dialog .t-dialog__body { min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
</style>
<style scoped>
.composite-panel { padding: 8px; color: var(--td-text-color-primary); }
label { display: block; margin: 8px 0; } textarea { display: block; width: 100%; box-sizing: border-box; }
textarea,input[type="number"] { color: var(--td-text-color-primary); background: var(--td-bg-color-container); border: 1px solid var(--td-component-border); }
.parameters { display: flex; flex-wrap: wrap; gap: 16px; align-items: center; } input[type="number"] { width: 110px; margin-left: 8px; }
.preview { display: block; max-height: 460px; max-width: 100%; margin: 12px auto; }
svg.preview { width: 100%; height: 460px; } .error { color: var(--td-error-color); }
</style>
