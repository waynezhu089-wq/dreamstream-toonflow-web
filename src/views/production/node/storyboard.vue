<template>
  <t-card class="storyboard">
    <div class="titleBar dragHandle pr">
      <div class="title">{{ $t("workbench.production.node.storyboard.title") }}</div>
      <Handle :id="props.handleIds.target" type="target" :position="Position.Left" style="left: calc(-1 * var(--td-comp-paddingLR-xl))" />
      <Handle :id="props.handleIds.source" type="source" :position="Position.Right" style="right: calc(-1 * var(--td-comp-paddingLR-xl))" />
    </div>
    <div class="content">
      <t-empty v-if="!storyboard.length" style="margin-top: 16px"></t-empty>
      <t-checkbox-group v-model="selectedIds">
        <div class="frameGrid">
          <template v-for="(item, index) in storyboard" :key="item.id">
            <div class="frameItem" @mouseenter="setHoveredFrame(index)" @mouseleave="setHoveredFrame(null)">
              <div class="addBetween addBetween--left" :class="{ expanded: hoveredIndex === index }">
                <t-button
                  theme="primary"
                  variant="outline"
                  shape="circle"
                  @click.stop="editStoryboaryImage(item, [index > 0 ? storyboard[index - 1]?.src || '' : '', item.src || ''], index - 1)">
                  <template #icon><i-plus /></template>
                </t-button>
              </div>

              <div class="frameCard">
                <t-button v-if="project?.projectType === 'general_video' && project?.type === 'advertisement' && item.productionMode === 'REAL_AI_COMPOSITE' && item.primaryAssetId" size="small" :disabled="controlled && !props.imageProductionReady" @click.stop="compositeShot = item">背景 + 真实素材合成</t-button>
                <t-button v-if="project?.projectType === 'general_video' && project?.type === 'advertisement' && item.id && item.productionMode !== 'REAL_ASSET_DIRECT'" size="small" variant="outline" @click.stop="skillShot = item">图片 Prompt Skill</t-button>
                <div
                  class="frameImage"
                  :style="{
                    width: `${200 * gridScale}px`,
                    height: `${200 * gridScale}px`,
                  }">
                  <div class="ac frameCheckbox" :style="{ transform: `scale(${styleMaxSize})` }">
                    <t-checkbox :checked="selectedIds.includes(item.id!)" @click.stop :key="item?.id || index" :value="item.id" />
                    <t-tag class="frameTypeTag" :style="{ backgroundColor: tagColors[index % tagColors.length] }">
                      S{{ String(index + 1).padStart(2, "0") }}
                    </t-tag>
                  </div>

                  <t-image
                    v-if="item.src && (item.state === '已完成' || item.imageProvenance?.currentAttemptId)"
                    :src="item.src"
                    fit="contain"
                    class="frameImg"
                    @click="editStoryboaryImage(item, [item.src])">
                    <template #overlayContent>
                      <div class="imageToolsWrap show">
                        <ImageTools :style="{ transform: `scale(${styleMaxSize})` }" :src="item.src" position="br" />
                      </div>
                    </template>
                  </t-image>
                  <div v-if="item.imageProvenance && item.src" class="imageProvenance" :title="item.imageProvenance.staleReason || undefined">
                    {{ item.imageProvenance.freshness === 'STALE' ? 'STALE · 来源已变化，旧图片保留' : item.imageProvenance.freshness === 'LEGACY' ? 'LEGACY · 历史图片' : item.imageProvenance.freshness === 'CURRENT' ? 'CURRENT · 已核验' : '' }}{{ item.imageProvenance.producerType === 'MANUAL_ATTACH' ? ' · 手动附图' : '' }}
                  </div>
                  <div v-if="item.imageProvenance?.activeAttemptId" class="attemptProgress">正在生成新任务，旧图片保留…</div>
                  <div v-else-if="item.imageProvenance?.latestAttemptStatus === 'FAILED' && item.src" class="attemptProgress">最近一次重试失败，旧图片已保留</div>
                  <div v-else class="generatingPlaceholder" @click="editStoryboaryImage(item, [])">
                    <t-loading v-if="item.state === '生成中'" size="small" />
                    <t-tooltip v-else-if="item.state == '生成失败'" :content="item?.reason">
                      <span style="color: #ff4d4f">生成失败</span>
                    </t-tooltip>
                    <t-empty v-else size="small" :title="$t('workbench.production.node.storyboard.notGenerated')" />
                  </div>
                  <t-tooltip theme="primary" :content="$t('workbench.production.node.storyboard.deleteNode')">
                    <div class="remove ac" :style="{ transform: `scale(${styleMaxSize})` }" @click.stop="removeFn(item.id!)">
                      <i-delete theme="outline" size="18" fill="#fff" />
                    </div>
                  </t-tooltip>
                  <t-tooltip theme="primary" :content="$t('workbench.production.node.storyboard.editNode')">
                    <div class="editNode ac" :style="{ transform: `scale(${styleMaxSize})` }" @click.stop="editInfo(item)">
                      <i-edit theme="outline" size="18" fill="#fff" />
                    </div>
                  </t-tooltip>
                </div>
              </div>
              <div class="addBetween addBetween--right" :class="{ expanded: hoveredIndex === index }">
                <t-button
                  theme="primary"
                  variant="outline"
                  shape="circle"
                  @click.stop="
                    editStoryboaryImage(item, [item.src || '', index < (storyboard?.length ?? 0) - 1 ? storyboard[index + 1]?.src || '' : ''], index)
                  ">
                  <template #icon><i-plus /></template>
                </t-button>
              </div>
            </div>
          </template>
        </div>
      </t-checkbox-group>

      <div class="scaleControl">
        <span>{{ $t("workbench.production.node.storyboard.scaleRatio") }}</span>
        <t-input-number v-model="gridScale" :min="0.1" :max="3" :step="0.1" :decimal-places="1" size="small" style="width: 120px" />
      </div>
      <div class="ac" style="gap: 6px; margin-bottom: 6px; flex-wrap: wrap">
        <t-tag theme="primary" variant="light">{{ $t("workbench.production.node.storyboard.selectedCount", { count: selectedIds.length }) }}</t-tag>
        <t-button size="small" :disabled="!storyboard.length" theme="default" variant="outline" @click="selectedIds = []">
          {{ $t("workbench.production.node.storyboard.clearSelection") }}
        </t-button>
        <t-button size="small" :disabled="!storyboard.length" theme="default" variant="outline" @click="selectAll">
          {{ $t("workbench.production.node.storyboard.selectAll") }}
        </t-button>
        <t-button theme="danger" size="small" :disabled="!storyboard.length || !selectedIds.length" @click="handleDeleteSelected">批量删除</t-button>
      </div>
      <div class="ac" style="gap: 10px">
        <t-button block @click="previewAll" :disabled="!storyboard.length">{{ $t("workbench.production.node.storyboard.gridPreview") }}</t-button>
        <t-button block @click="batchGenerateImage" :disabled="!storyboard.length || !selectedIds.length || controlled && !props.imageProductionReady" :loading="generateLoading">
          {{ $t("workbench.production.node.storyboard.generateImage") }}
        </t-button>

        <!-- <t-button block @click="batchGenerateImage" :disabled="!storyboard.length" :loading="generateLoading">
          {{ $t("workbench.production.node.storyboard.batchGenerateImage") }}
        </t-button> -->
      </div>
    </div>
    <editImage v-model="visible" v-if="visible" :flowData="currentRow" type="storyboard" @save="save" />
    <t-dialog :visible="addVisible" attach="body" header="新增分镜语义" :footer="false" @close="addVisible = false">
      <div class="semantic-add" @wheel.stop @pointerdown.stop @mousedown.stop>
        <label>分组 <input v-model="addForm.track" /></label>
        <label>时长（秒） <input v-model.number="addForm.duration" type="number" min="0.1" step="0.1" /></label>
        <label>画面描述 <textarea v-model="addForm.videoDesc" /></label>
        <label>语义提示词 <textarea v-model="addForm.prompt" /></label>
        <label>图片生产方式 <select v-model="addForm.productionMode">
          <option value="">请选择</option><option value="REAL_ASSET_DIRECT">真实素材直用</option>
          <option value="AI_TEXT_TO_IMAGE">AI 文生图</option>
          <option value="AI_REFERENCE_GENERATE">参考图生成（当前未支持）</option>
          <option value="REAL_AI_COMPOSITE">真实素材合成</option>
        </select></label>
        <label>主素材 <select v-model.number="addForm.primaryAssetId"><option :value="null">无</option><option v-for="asset in props.assetsData" :key="asset.id" :value="asset.id">{{ asset.name }} (#{{ asset.id }})</option></select></label>
        <label>关联素材 ID（逗号分隔） <input v-model="addForm.linked" /></label>
        <label>参考素材 ID（逗号分隔） <input v-model="addForm.references" /></label>
        <p>Asset Group 引用当前尚未支持；新增镜头后须按工序重新审核，才能生成或附着图片。</p>
        <button @click="submitSemanticAdd">预览新增及顺序影响</button><button @click="addVisible = false">取消</button>
      </div>
    </t-dialog>
    <CompositeAttempt v-if="compositeShot && project?.id && episodesId" :project-id="Number(project.id)" :script-id="Number(episodesId)" :storyboard-id="compositeShot.id!" :primary-asset-id="compositeShot.primaryAssetId!" :capability-id="compositeShot.capabilityId" :semantic-prompt="compositeShot.prompt" :image-prompt="compositeShot.imagePrompt" @close="compositeShot = null" @completed="applyCompositeState" @pending="applyCompositeState" @reconcile="reconcileCompositeProvenance" />
    <ImagePromptSkill v-if="skillShot && project?.id && episodesId" :project-id="Number(project.id)" :script-id="Number(episodesId)" :storyboard-id="skillShot.id!" :semantic-prompt="skillShot.prompt ?? ''" :image-prompt="skillShot.imagePrompt" :prompt-skill-id="skillShot.promptSkillId" :prompt-skill-version="skillShot.promptSkillVersion" @close="skillShot = null" @applied="applySkillPrompt" />
    <t-image-viewer
      v-model:visible="previewVisible"
      v-if="previewVisible"
      :images="previewImages"
      :onClose="closePreview"
      :onDownload="downLoadImage"
      :imageScale="{ max: 10, min: 0.1 }" />
  </t-card>
</template>

<script setup lang="ts">
import { useLocalStorage } from "@vueuse/core";
import editImage from "../components/editImage/index.vue";
import CompositeAttempt from "../components/CompositeAttempt.vue";
import ImagePromptSkill from "../components/ImagePromptSkill.vue";
import { LoadingPlugin } from "tdesign-vue-next";
import { Handle, Position, type Edge } from "@vue-flow/core";
import axios from "@/utils/axios";
import type { AssetItem, Storyboard } from "../utils/flowBuilder";
import projectStore from "@/stores/project";
import productionAgentStore from "@/stores/productionAgent";
import { useStoryboardRevision } from "../revision/coordinator";
const { project } = storeToRefs(projectStore());
const { episodesId } = storeToRefs(productionAgentStore());

const props = defineProps<{
  id: string;
  handleIds: {
    target: string;
    source: string;
  };
  assetsData: AssetItem[];
  imageProductionReady?: boolean;
}>();

const storyboard = defineModel<Storyboard[]>({ required: true });
const revision = useStoryboardRevision();
const controlled = computed(() => revision.state.mode === "CONTROLLED_V2");
const semanticBlocked = computed(() => revision.state.mode !== "CONTROLLED_V2" && revision.state.mode !== "LEGACY");
function requireSemanticRoute() { if (!semanticBlocked.value) return true; window.$message.error("当前分镜语义编辑不可用，请检查 Production Profile 与审核配置"); return false; }
const addVisible = ref(false), addAfter = ref(-1);
const addForm = reactive({ track: "", duration: 3, prompt: "", videoDesc: "", productionMode: "",
  primaryAssetId: null as number | null, linked: "", references: "" });
function parseIds(value: string) {
  if (!value.trim()) return [];
  const result = value.split(",").map(part => Number(part.trim()));
  if (result.some(id => !Number.isSafeInteger(id) || id <= 0) || new Set(result).size !== result.length) throw new Error("素材 ID 必须是未重复的正整数");
  return result;
}
function submitSemanticAdd() {
  try {
    if (!Number.isFinite(addForm.duration) || addForm.duration <= 0 || !addForm.productionMode) throw new Error("请选择生产方式并填写正数时长");
    const linkedAssetIds = parseIds(addForm.linked), referenceAssetIds = parseIds(addForm.references);
    if (addForm.primaryAssetId && !linkedAssetIds.includes(addForm.primaryAssetId)) throw new Error("请将主素材加入关联素材");
    const clientRef = `shot${crypto.randomUUID().replace(/-/g, "")}`;
    const order = storyboard.value.filter(item => !!item.id).map(item => ({ storyboardId: item.id! } as { storyboardId?: number; clientRef?: string }));
    order.splice(addAfter.value + 1, 0, { clientRef });
    revision.open("MANUAL_ADD", [{ type: "ADD", clientRef, storyboard: {
      track: addForm.track, duration: addForm.duration, prompt: addForm.prompt, videoDesc: addForm.videoDesc,
      productionMode: addForm.productionMode, primaryAssetId: addForm.primaryAssetId,
      referenceAssetIds, referenceAssetGroupIds: [], linkedAssetIds,
    } }, { type: "REORDER", order }]);
    addVisible.value = false;
  } catch (error: any) { window.$message.error(error?.message || "新增分镜无效"); }
}
const compositeShot = ref<Storyboard | null>(null);
const skillShot = ref<Storyboard | null>(null);
function applyCompositeState(result: { id: number; src: string | null; state: string; reason: string }) {
  const row = storyboard.value.find(s => s.id === result.id);
  if (row) Object.assign(row, result);
}
function applySkillPrompt(result: Storyboard) {
  const row = storyboard.value.find(s => s.id === result.id);
  if (row) Object.assign(row, { imagePrompt: result.imagePrompt, promptSkillId: result.promptSkillId, promptSkillVersion: result.promptSkillVersion });
}
async function reconcileCompositeProvenance() {
  await productionAgentStore().getFlowData();
}
watch(() => [project.value?.id, episodesId.value], () => { compositeShot.value = null; skillShot.value = null; });

const visible = ref(false);
const previewVisible = ref(false);
const previewImages = ref<string[]>([]);
const gridScale = useLocalStorage("storyboardGridScale", 1);

const hoveredIndex = ref<number | null>(null);
const selectedIds = ref<number[]>([]);

function setHoveredFrame(index: number | null) {
  hoveredIndex.value = index;
}

function selectAll() {
  selectedIds.value = storyboard.value.map((s) => s.id!).filter(Boolean);
}
function handleDeleteSelected() {
  if (!requireSemanticRoute()) return;
  const dialog = DialogPlugin.confirm({
    header: $t("workbench.assets.confirmDeleteHeader"),
    body: $t("workbench.production.node.storyboard.confirmBatchDeleteBody", { index: selectedIds.value.length }),
    confirmBtn: $t("workbench.assets.deleteBtn"),
    cancelBtn: $t("workbench.assets.cancelBtn"),
    theme: "warning",
    onConfirm: async () => {
      try {
        if (!selectedIds.value.length) {
          dialog.destroy();
          return window.$message.error($t("workbench.production.node.storyboard.pleaseSelectImage"));
        }
        if (controlled.value) {
          revision.open("MANUAL_RETIRE", selectedIds.value.map(storyboardId => ({ type: "RETIRE", storyboardId })));
          dialog.destroy();
          return;
        }
        await axios.post("/production/storyboard/batchDelete", {
          ids: selectedIds.value,
          projectId: project.value?.id,
        });
        storyboard.value = storyboard.value.filter((i) => !selectedIds.value.includes(i.id!));
        selectedIds.value = [];
        window.$message.success($t("workbench.production.node.storyboard.deleteSuccess"));
      } catch (e) {
        window.$message.error((e as any)?.message || $t("workbench.production.node.storyboard.removeFailed"));
      } finally {
        dialog.destroy();
      }
    },
  });
}
const currentRow = ref<{
  flowId?: number | null;
  resultImages: { src: string; prompt: string }[];
  referanceImages: string[];
}>({
  flowId: null,
  resultImages: [],
  referanceImages: [],
});

const tagColors = ["#5bccb3", "#9c7cfc", "#fbbf24", "#5b9afc", "#e86b6b", "#7cb8fc", "#e8a855", "#34d399"];

function closePreview() {
  previewImages.value = [];
}
async function downLoadImage() {
  LoadingPlugin(true);
  const allIds = (storyboard.value ?? []).filter((s) => s.src).map((s) => s.id!);
  if (!allIds.length) {
    window.$message.warning($t("workbench.production.node.storyboard.noPreviewImages"));
    LoadingPlugin(false);
    return;
  }
  try {
    const res = await axios.post(
      "/production/storyboard/downPreviewImage",
      {
        storyboardIds: allIds,
      },
      { responseType: "blob" },
    );
    // 创建下载链接
    const url = URL.createObjectURL(res as unknown as Blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `storyboardImagePreview-${Date.now()}.png`;
    a.click();
    URL.revokeObjectURL(url);
  } catch {
    window.$message.error($t("workbench.production.node.storyboard.imageLoadFailed"));
  } finally {
    LoadingPlugin(false);
  }
}
async function previewAll() {
  LoadingPlugin(true);
  const allIds = (storyboard.value ?? []).filter((s) => s.src).map((s) => s.id!);
  if (!allIds.length) {
    window.$message.warning($t("workbench.production.node.storyboard.noPreviewImages"));
    LoadingPlugin(false);
    return;
  }
  try {
    const { data } = await axios.post("/production/storyboard/previewImage", {
      storyboardIds: allIds,
      projectId: project.value?.id,
    });
    previewImages.value = [data];
    previewVisible.value = true;
  } catch {
    window.$message.error($t("workbench.production.node.storyboard.imageLoadFailed"));
  } finally {
    LoadingPlugin(false);
  }
}
const currentRowStoryboardInfo = ref<{ id: number | null; insertAfterIndex: number | null }>({
  id: null,
  insertAfterIndex: null,
});
const styleMaxSize = computed(() => {
  if (gridScale.value <= 1) return gridScale.value;
  else 1;
});
const generateLoading = ref(false);
async function batchGenerateImage() {
  if (controlled.value && !props.imageProductionReady) return window.$message.warning("请先完成当前审核并开始图片生产工序");
  if (!selectedIds.value.length) return window.$message.warning("请先选择分镜面板");
  generateLoading.value = true;
  try {
    await productionAgentStore().batchGenerateStoryboard(selectedIds.value, true);
    window.$message.success($t("workbench.production.node.storyboard.batchGenerateSuccess"));
    selectedIds.value = [];
  } catch (e: any) {
    window.$message.error(e?.response?.data?.message || e?.message || $t("workbench.production.node.storyboard.batchGenerateFailed"));
  } finally {
    generateLoading.value = false;
  }
}
function editStoryboaryImage(item: Storyboard, images: string[], insertAfterIndex: number | null = null) {
  if (insertAfterIndex !== null && !requireSemanticRoute()) return;
  if (controlled.value && insertAfterIndex !== null) {
    addAfter.value = insertAfterIndex;
    addForm.track = String((item as any).track ?? ""); addForm.duration = 3; addForm.prompt = "";
    addForm.videoDesc = ""; addForm.productionMode = ""; addForm.primaryAssetId = null;
    addForm.linked = ""; addForm.references = ""; addVisible.value = true;
    return;
  }
  if (controlled.value && !props.imageProductionReady) { window.$message.warning("请先完成当前审核并开始图片生产工序"); return; }
  currentRowStoryboardInfo.value = {
    id: insertAfterIndex == null ? item?.id! : null,
    insertAfterIndex,
  };
  currentRow.value = {
    flowId: item?.flowId ?? null,
    resultImages: [],
    referanceImages: [],
  };

  if (currentRowStoryboardInfo.value.id) {
    let imagesPush: string[] = [];

    if (item.associateAssetsIds && item.associateAssetsIds.length > 0) {
      const assetsImages: string[] = [];
      for (const id of item.associateAssetsIds) {
        // 先查顶层 asset
        const asset = props.assetsData.find((a) => a.id === id);
        if (asset) {
          if (asset.src) assetsImages.push(asset.src);
          continue;
        }
        // 再查 derive
        for (const a of props.assetsData) {
          const derive = a.derive?.find((d) => d.id === id);
          if (derive) {
            if (derive.src) assetsImages.push(derive.src);
            break;
          }
        }
      }
      imagesPush = imagesPush.concat(assetsImages);
    }
    // if (item?.referenceIds && item.referenceIds.length > 0) {
    //   const referenImages = storyboard.value
    //     .filter((s) => item.referenceIds!.includes(s.id))
    //     .map((s) => s.src)
    //     .filter(Boolean) as string[];
    //   imagesPush = imagesPush.concat(referenImages);
    // }
    currentRow.value.referanceImages = imagesPush;
    currentRow.value.resultImages = [{ src: images.length ? images[0] : "", prompt: item.prompt ?? "" }];
  } else {
    currentRow.value.referanceImages = images.filter(Boolean);
  }
  visible.value = true;
}

async function save({ imageUrl, flowId }: { imageUrl: string; flowId: number }) {
  if (!imageUrl) return;

  const { id, insertAfterIndex } = currentRowStoryboardInfo.value;

  // 插入模式：在两张图之间新增一条分镜
  if (id === null && insertAfterIndex !== null) {
    if (controlled.value) throw new Error("受控分镜须先完成语义修订");
    const newFrame: Storyboard = {
      duration: 0,
      prompt: "",
      src: imageUrl,
      videoDesc: "",
      shouldGenerateImage: 1,
      state: "已完成",
    };
    const { data } = await axios.post("/production/storyboard/addStoryboard", {
      ...newFrame,
      projectId: project.value?.id,
      scriptId: episodesId.value,
      flowId,
    });

    storyboard.value.splice(insertAfterIndex + 1, 0, { ...newFrame, id: data.id!, flowId });
    productionAgentStore().setFlowData();
    return;
  }

  // 更新模式：更新对应分镜的 src
  try {
    const { data } = await axios.post("/production/storyboard/updateStoryboardUrl", {
      id,
      url: imageUrl,
      flowId,
      projectId: project.value?.id ? Number(project.value.id) : undefined,
      scriptId: episodesId.value,
    });
    if (data?.attemptId) {
      // The server owns the attached image and Attempt provenance.
      await productionAgentStore().getFlowData();
      return;
    }
    const target = storyboard.value.find((s) => s.id === id);
    if (target) {
      target.src = imageUrl;
      target.state = "已完成";
      target.flowId = flowId;
    }
  } catch (error: any) {
    if (project.value?.projectType === "general_video" && project.value?.type === "advertisement") {
      await productionAgentStore().getFlowData().catch(() => {});
    }
    window.$message.error(error?.response?.data?.data?.message || error?.message || "保存图片失败，旧图片已保留");
  }
}

async function removeFn(id: number) {
  if (!requireSemanticRoute()) return;
  const dialog = DialogPlugin.confirm({
    header: $t("workbench.assets.confirmDeleteHeader"),
    body: $t("workbench.production.node.storyboard.confirmDeleteBody"),
    confirmBtn: $t("workbench.assets.deleteBtn"),
    cancelBtn: $t("workbench.assets.cancelBtn"),
    theme: "warning",
    onConfirm: async () => {
      if (!id) {
        const index = storyboard.value.findIndex((s) => s.id === id);
        if (index !== -1) {
          storyboard.value.splice(index, 1);
        }
        dialog.destroy();
        return;
      }
      try {
        if (controlled.value) {
          revision.open("MANUAL_RETIRE", [{ type: "RETIRE", storyboardId: id }]);
          dialog.destroy();
          return;
        }
        await axios.post("/production/storyboard/removeFrame", {
          id,
          projectId: project.value?.id,
        });
        const index = storyboard.value.findIndex((s) => s.id === id);
        if (index !== -1) {
          storyboard.value.splice(index, 1);
        }
      } catch (e) {
        window.$message.error((e as any)?.message || $t("workbench.production.node.storyboard.removeFailed"));
      } finally {
        dialog.destroy();
      }
    },
  });
}

function editInfo(item: Storyboard) {
  if (!requireSemanticRoute()) return;
  const formData = reactive({
    prompt: item.prompt ?? "",
    videoDesc: item?.videoDesc ?? "",
  });

  const bodyVNode = () =>
    h("div", { class: "editInfoForm" }, [
      h("div", { class: "editInfoField" }, [
        h("label", { class: "editInfoLabel" }, $t("workbench.production.node.storyboard.prompt")),
        h(resolveComponent("t-textarea"), {
          value: formData.prompt,
          placeholder: $t("workbench.production.node.storyboard.promptPlaceholder"),
          autosize: { minRows: 3, maxRows: 6 },
          "onUpdate:value": (v: string) => (formData.prompt = v),
        }),
      ]),
      h("div", { class: "editInfoField" }, [
        h("label", { class: "editInfoLabel" }, $t("workbench.production.node.storyboard.videoDesc")),
        h(resolveComponent("t-textarea"), {
          value: formData.videoDesc,
          placeholder: $t("workbench.production.node.storyboard.videoDescPlaceholder"),
          autosize: { minRows: 3, maxRows: 6 },
          "onUpdate:value": (v: string) => (formData.videoDesc = v),
        }),
      ]),
    ]);

  const confirmDialog = DialogPlugin.confirm({
    header: $t("workbench.production.node.storyboard.editInfo"),
    body: bodyVNode,
    width: 480,
    confirmBtn: {
      content: $t("common.submit"),
      theme: "primary",
      loading: false,
    },
    onConfirm: async () => {
      confirmDialog.update({ confirmBtn: { content: $t("common.submitting"), loading: true } });
      try {
        if (controlled.value) {
          const patch: Record<string, unknown> = {};
          if (formData.prompt !== (item.prompt ?? "")) patch.prompt = formData.prompt;
          if (formData.videoDesc !== (item.videoDesc ?? "")) patch.videoDesc = formData.videoDesc;
          if (!Object.keys(patch).length) { confirmDialog.destroy(); return; }
          revision.open("MANUAL_EDIT", [{ type: "EDIT", storyboardId: item.id!, patch }]);
          confirmDialog.destroy();
          return;
        }
        await axios.post("/production/storyboard/editStoryboardInfo", {
          id: item.id,
          prompt: formData.prompt,
          videoDesc: formData.videoDesc,
        });
        item.prompt = formData.prompt;
        item.videoDesc = formData.videoDesc;
        window.$message.success($t("common.editSuccess"));
      } catch (e) {
        window.$message.error((e as any)?.message || $t("common.editFailed"));
      } finally {
        confirmDialog.update({ confirmBtn: { content: $t("common.submit"), loading: false } });
        if (!controlled.value) confirmDialog.destroy();
      }
    },
  });
}
</script>

<style lang="scss" scoped>
.storyboard {
  min-width: 500px;
  max-width: 100vw;
  user-select: text;
  cursor: default;

  .titleBar {
    cursor: grab;
    user-select: none;
  }
  .title {
    background-color: #000;
    width: fit-content;
    padding: 5px 10px;
    color: #fff;
    border-radius: 8px 0;
    font-size: 16px;
  }

  .content {
    margin-top: 12px;
  }

  .frameGrid {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 0;
  }

  .frameItem {
    position: relative;
    display: inline-flex;
    align-items: flex-start;
    margin: 4px;
  }

  .addBetween {
    position: absolute;
    z-index: 10;
    top: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    pointer-events: none;
    span {
      line-height: 1;
      white-space: nowrap;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    &.expanded {
      opacity: 1;
      pointer-events: auto;
    }
    &:hover {
      // background: var(--td-brand-color);
      // color: #fff;
      // transform: scale(1.15);
    }
    &--left {
      transform: translate(calc(-50% - 4px), -50%);
    }
    &--right {
      transform: translate(calc(50% + 4px), -50%);
      right: 0;
    }
  }

  .frameCard {
    display: flex;
    flex-direction: column;
    cursor: pointer;
    transition:
      transform 0.2s,
      box-shadow 0.2s;
  }

  .frameImage {
    position: relative;
    border-radius: 8px;
    overflow: hidden;
    flex-shrink: 0;
    transition: opacity 0.2s ease;
    &:hover {
      .remove,
      .editNode {
        opacity: 1;
      }
    }
    .remove {
      position: absolute;
      top: 3px;
      right: 3px;
      z-index: 9999;
      padding: 5px;
      border-radius: 10px;
      background-color: rgba(220, 50, 50, 0.7);
      cursor: pointer;
      opacity: 0;
      transform-origin: top right;
      &:hover {
        background-color: rgba(220, 50, 50, 1);
      }
    }
    .editNode {
      position: absolute;
      bottom: 3px;
      left: 3px;
      z-index: 9999;
      padding: 5px;
      border-radius: 10px;
      background-color: rgba(24, 144, 255, 0.7);
      cursor: pointer;
      transform-origin: bottom left;
      opacity: 0;
      &:hover {
        background-color: rgba(24, 144, 255, 1);
      }
    }
  }

  .generatingPlaceholder {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    background-color: var(--td-bg-color-container-hover, #f5f5f5);
    font-size: 12px;
  }

  .frameImg {
    width: 100%;
    height: 100%;
    object-fit: cover;
    .imageToolsWrap {
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.2s ease;
    }

    &:hover {
      .imageToolsWrap {
        opacity: 1;
        pointer-events: auto;
      }
    }
  }

  .imageProvenance, .attemptProgress {
    position: absolute;
    left: 4px;
    right: 4px;
    bottom: 4px;
    z-index: 4;
    padding: 2px 4px;
    border-radius: 3px;
    background: var(--td-bg-color-container);
    color: var(--td-text-color-primary);
    font-size: 11px;
    pointer-events: none;
  }
  .attemptProgress { bottom: 24px; }

  .frameCheckbox {
    position: absolute;
    left: 3px;
    top: 3px;
    z-index: 3;
    transform-origin: top left;
  }

  .frameTypeTag {
    color: #fff;
    font-size: 10px;
    font-weight: 600;
    border: none;
    z-index: 2;
    padding: 0 4px;
    line-height: 18px;
    border-radius: 3px;
  }

  .frameTag {
    position: absolute;
    right: 8px;
    bottom: 8px;
    color: #fff;
    font-size: 12px;
    font-weight: 600;
    border: none;
  }

  .scaleControl {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
    font-size: 13px;
    color: var(--td-text-color-primary, #333);
  }

  .frameInfo {
    margin-top: 6px;
    font-size: 12px;
    color: var(--td-text-color-primary, #333);
    line-height: 1.4;
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}
:deep(.t-image__wrapper) {
  background-color: transparent !important;
}
.editInfoForm {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 4px 0;
}

.editInfoField {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.editInfoLabel {
  font-size: 13px;
  color: var(--td-text-color-secondary);
}
.semantic-add{max-height:calc(100vh - 170px);overflow-y:auto;overscroll-behavior:contain;color:var(--td-text-color-primary)}
.semantic-add label{display:block;margin:9px 0}.semantic-add input,.semantic-add textarea,.semantic-add select{display:block;width:100%;padding:6px;color:var(--td-text-color-primary);background:var(--td-bg-color-container);border:1px solid var(--td-component-border)}
</style>
