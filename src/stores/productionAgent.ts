import axios from "@/utils/axios";
import { storyboardProductionFields } from "@/utils/storyboardProduction";
import projectStore from "@/stores/project";
import settingStore from "@/stores/setting";
import { useChat } from "@/utils/useChat";
import type { FlowData, Storyboard } from "@/views/production/utils/flowBuilder";
import type { ChatMessagesData } from "@tdesign-vue-next/chat";
import { useThrottleFn } from "@vueuse/core";
import { useStoryboardRevision } from "@/views/production/revision/coordinator";
import { semanticCandidate, semanticBaseline } from "@/views/production/revision/proposalPlan";

function makeProductionAgentStore(projectId: string) {
  return defineStore(`productionAgent-${projectId}`, () => {
    const isAdvertisement = computed(
      () => projectStore().project?.projectType === "general_video" && projectStore().project?.type === "advertisement",
    );
    const defMsg = computed<ChatMessagesData[]>(() => [
      {
        id: "welcome",
        role: "assistant",
        content: [
          {
            type: "text",
            status: "complete",
            data: isAdvertisement.value
              ? $t("workbench.production.chatBox.adWelcomeMessage")
              : $t("workbench.production.chatBox.welcomeMessage"),
          },
          {
            type: "suggestion",
            status: "complete",
            data: [
              {
                title: isAdvertisement.value
                  ? $t("workbench.production.chatBox.adStartPlanning")
                  : $t("workbench.production.chatBox.startMakingVideo"),
                prompt: isAdvertisement.value
                  ? $t("workbench.production.chatBox.adStartPlanningPrompt")
                  : $t("workbench.production.chatBox.startMakingVideoPrompt"),
              },
            ],
          },
        ],
      },
    ]);
    onMounted(() => {
      if (messages.value.length <= 0) messages.value = [...defMsg.value, ...messages.value];
    });

    const flowData = ref<FlowData>({
      script: "", // 剧本
      scriptPlan: "", //导演计划
      storyboardTable: "", //分镜表
      assets: [], // 衍生资产
      storyboard: [], //分镜面板
      workbench: {
        videoList: [],
      }, // 工作台数据
    });

    const episodesId = ref<number>();
    const unitGeneration = ref(0);
    type UnitToken = { projectId: number; scriptId: number; generation: number };
    const captureUnit = (): UnitToken | null => episodesId.value && episodesId.value > 0
      ? { projectId: Number(projectId), scriptId: episodesId.value, generation: unitGeneration.value } : null;
    const isCurrentUnit = (token: UnitToken | null): token is UnitToken => !!token &&
      token.projectId === Number(projectId) && token.scriptId === episodesId.value && token.generation === unitGeneration.value &&
      Number(projectStore().project?.id) === token.projectId;
    function socketUnit(payload: any): UnitToken | null {
      const token = captureUnit();
      return token && isCurrentUnit(token) && Number.isSafeInteger(payload?.projectId) && Number.isSafeInteger(payload?.scriptId) &&
        payload.projectId === token.projectId && payload.scriptId === token.scriptId ? token : null;
    }
    function invalidateUnit() {
      unitGeneration.value++;
      stopAssetsPolling();
      stopStoryboardPolling();
    }
    watch(episodesId, (next, previous) => { if (next !== previous) invalidateUnit(); }, { flush: "sync" });

    const { connected, messages, chat, stopGenerate, socket, status, reconnect, connect, disconnect } = useChat({
      url: `${settingStore().baseUrl}/socket/productionAgent`,
      auth: () => ({
        isolationKey: `${projectId}:productionAgent:${episodesId.value}`,
        projectId: projectId,
        scriptId: episodesId.value,
      }),
      manageLifecycle: false,
      autoConnect: false,
      xmlTags: [
        { tag: "script", keepInMessage: false },
        { tag: "scriptPlan", keepInMessage: false },
        { tag: "storyboardTable", keepInMessage: false },
        { tag: "storyboardItem", keepInMessage: false },
      ],
      onXmlTag: async (data) => {
        const { tag, value, children, attrs, status } = data;
        if (tag === "script") {
          flowData.value.script = value ?? "";
        } else if (tag === "scriptPlan") {
          flowData.value.scriptPlan = value ?? "";
        } else if (tag === "storyboardTable") {
          flowData.value.storyboardTable = value ?? "";
        }
        // else if (tag === "storyboardItem") {
        //   if (status === "complete") {
        //     const prompt = attrs.prompt ?? "";
        //     const duration = Number(attrs.duration) || 0;
        //     const track = attrs.track || "";
        //     const shouldGenerateImage =
        //       (typeof attrs.shouldGenerateImage == "boolean" && attrs.shouldGenerateImage) ||
        //       String(attrs.shouldGenerateImage).toLowerCase() == "true"
        //         ? 1
        //         : 0;

        //     const videoDesc = attrs?.videoDesc ?? "";
        //     const existingIndex = flowData.value.storyboard.findIndex(
        //       (s) => s.prompt == prompt && s.duration == duration && videoDesc == s.videoDesc,
        //     );
        //     if (existingIndex !== -1) {
        //       // 已存在则更新 content，保留 id
        //       flowData.value.storyboard[existingIndex].prompt = prompt;
        //     } else {
        //       // 不存在则追加新条目
        //       flowData.value.storyboard.push({
        //         prompt: prompt || "",
        //         duration: Number(duration) || 0,
        //         state: "未生成" as "未生成" | "生成中" | "已完成" | "生成失败",
        //         src: null,
        //         associateAssetsIds: JSON.parse(attrs.associateAssetsIds) || [],
        //         videoDesc: videoDesc,
        //         shouldGenerateImage: shouldGenerateImage,
        //       });
        //       await addStoryboardInfo([
        //         {
        //           prompt: prompt || "",
        //           duration: Number(duration) || 0,
        //           track: track || "",
        //           state: "未生成" as "未生成" | "生成中" | "已完成" | "生成失败",
        //           src: null,
        //           videoDesc,
        //           shouldGenerateImage,
        //           associateAssetsIds: JSON.parse(attrs.associateAssetsIds) || [],
        //         },
        //       ]);
        //     }
        //   }
        // }
        if (status == "complete") {
          throttledFn(captureUnit());
        }
      },
    });

    // 实际的节流方法
    const throttledFn = useThrottleFn(
      (scheduled: UnitToken | null) => {
        if (isCurrentUnit(scheduled)) void setFlowData(scheduled.scriptId, scheduled).catch(() => {});
      },
      500,
      true,
      true,
    );
    // 注册 getPlanData 事件（无需依赖组件生命周期）
    watch(
      socket,
      (s) => {
        if (s) {
          s.on("connect", () => {
            getHistory();
          });
          s.on("getFlowData", (_, callback) => {
            const returnData = JSON.parse(JSON.stringify(flowData.value));
            returnData.assets.forEach((item: any) => {
              delete item.prompt;
              delete item.flowId;
              delete item.src;
              if (item.derive && item.derive.length) {
                item.derive.forEach((deriveItem: any) => {
                  delete deriveItem.prompt;
                  delete deriveItem.flowId;
                  delete deriveItem.src;
                });
              }
            });
            returnData.storyboard.forEach((item: any) => {
              delete item.prompt;
              delete item.src;
              delete item.flowId;
            });
            callback(returnData);
          });
          s.on("addDeriveAsset", async (data, callback) => {
            const assets = flowData.value.assets.find((a) => a.id === data.assetsId);
            if (!assets) return callback({ success: false, message: $t("storyboard.assets.notExist") });
            const deriveAssetList = assets.derive || [];
            const item = deriveAssetList.find((d) => d.id === data.id);
            if (item) {
              if (!item) return callback({ success: false, message: $t("storyboard.assets.notDerivativeExist") });
              item.name = data.name;
              item.type = assets.type;
              callback({ success: true, message: $t("storyboard.assets.derivativeUpdateSuccess") });
            } else {
              deriveAssetList.push({
                assetsId: data.assetsId,
                id: data.id,
                name: data.name,
                type: assets.type,
                desc: data.describe,
                prompt: "",
                state: "未生成" as "未生成" | "生成中" | "已完成" | "生成失败",
                src: "",
              });
              callback({ success: true, message: $t("storyboard.assets.derivativeAddSuccess") });
            }
          });
          s.on("delDeriveAsset", async (data, callback) => {
            const assets = flowData.value.assets.find((a) => a.id === data.assetsId);
            if (!assets) return callback({ success: false, message: $t("storyboard.assets.notExist") });
            const deriveAssetList = assets.derive || [];
            const index = deriveAssetList.findIndex((d) => d.id === data.id);
            if (index === -1) return callback({ success: false, message: $t("storyboard.assets.notDerivativeExist") });
            deriveAssetList.splice(index, 1);
            callback({ success: true, message: $t("storyboard.assets.derivativeDelSuccess") });
          });
          s.on("generateDeriveAsset", async (data, callback) => {
            const assetsData = await batchGenerateAssets(data.ids);
            callback({ success: true, message: assetsData });
          });
          s.on("generateStoryboard", async (data, callback) => {
            const token = socketUnit(data);
            if (!token) return callback({ status: "CONTEXT_MISMATCH", applied: false });
            try {
              const storyData = await batchGenerateStoryboard(data.ids);
              const scopeChanged = !isCurrentUnit(token);
              callback({ success: true, applied: true, accepted: true, scopeChanged,
                message: scopeChanged ? "原制作单元的分镜生产请求已接收；当前界面已切换，未更新当前工作区" : storyData });
            } catch (error: any) {
              callback({ success: false, applied: false, error: error?.message || "分镜生产请求失败" });
            }
          });
          s.on("addStoryboard", async (data, callback) => {
            const token = socketUnit(data);
            if (!token) return callback({ status: "CONTEXT_MISMATCH", applied: false });
            const revision = useStoryboardRevision();
            if (revision.state.mode !== "LEGACY") {
              try {
                semanticCandidate(data);
                callback(revision.receiveProposal({ proposalId: data.proposalId, projectId: Number(data.projectId),
                  scriptId: Number(data.scriptId), kind: "ADD", candidate: data,
                  baseline: semanticBaseline(flowData.value.storyboard) }));
              } catch (error: any) { callback({ status: "INVALID_PROPOSAL", applied: false, error: error?.message }); }
              return;
            }
            const insertVal = {
              ...storyboardProductionFields(data),
              prompt: data.prompt || "",
              duration: Number(data.duration) || 0,
              track: data.track || "",
              state: "未生成" as "未生成" | "生成中" | "已完成" | "生成失败",
              src: null,
              videoDesc: data.videoDesc,
              shouldGenerateImage:
                (typeof data.shouldGenerateImage == "boolean" && data.shouldGenerateImage) || String(data.shouldGenerateImage).toLowerCase() == "true"
                  ? 1
                  : 0,
              associateAssetsIds: data.associateAssetsIds || [],
            };
            try {
              const result = await addStoryboardInfo([insertVal], token);
              if (!result.dispatched) return callback({ status: "CONTEXT_MISMATCH", applied: false });
              if (!isCurrentUnit(token)) return callback({ success: true, applied: true, scopeChanged: true,
                message: "已应用到原制作单元；当前界面已切换，未更新当前工作区" });
              if (!Array.isArray(result.data) || !result.data.length) throw new Error("新增分镜未返回有效记录");
              flowData.value.storyboard.push({ ...insertVal, ...result.data[0] });
              throttledFn(token);
              callback({ success: true, applied: true, message: $t("storyboard.assets.derivativeAddSuccess") });
            } catch (error: any) {
              callback({ success: false, applied: false, error: error?.message || "新增分镜失败" });
            }
          });
          s.on("replaceStoryboard", async (payload: { items: any[] }, callback) => {
            const token = socketUnit(payload);
            if (!token) return callback({ status: "CONTEXT_MISMATCH", applied: false });
            const revision = useStoryboardRevision();
            if (revision.state.mode !== "LEGACY") {
              try {
                if (!Array.isArray(payload.items) || !payload.items.length) throw new Error("整套替换提案不能为空");
                payload.items.forEach(semanticCandidate);
                callback(revision.receiveProposal({ proposalId: (payload as any).proposalId,
                  projectId: Number((payload as any).projectId), scriptId: Number((payload as any).scriptId),
                  kind: "REPLACE", candidate: payload.items,
                  baseline: semanticBaseline(flowData.value.storyboard) }));
              } catch (error: any) { callback({ status: "INVALID_PROPOSAL", applied: false, error: error?.message }); }
              return;
            }
            try {
              const { data } = await axios.post("/production/storyboard/replaceStoryboard", {
                scriptId: token.scriptId,
                projectId: token.projectId,
                data: payload.items,
              });
              if (isCurrentUnit(token)) {
                flowData.value.storyboard = data;
                try { await setFlowData(token.scriptId, token); }
                catch (saveError: any) {
                  return callback?.({ success: true, applied: true, scopeChanged: !isCurrentUnit(token),
                    workspaceSyncError: saveError?.message || "工作区保存失败",
                    message: "原制作单元的分镜替换已应用；工作区保存失败，请刷新核对", data });
                }
              }
              const scopeChanged = !isCurrentUnit(token);
              callback?.({ success: true, applied: true, scopeChanged,
                message: scopeChanged ? "已应用到原制作单元；当前界面已切换，未更新当前工作区" : `已替换为 ${data.length} 条分镜`, data });
            } catch (e: any) {
              callback?.({ success: false, applied: false, error: e?.message || "整套替换分镜失败" });
            }
          });
        }
      },
      { immediate: true },
    );

    async function setFlowData(scriptId?: number, scheduled: UnitToken | null = captureUnit()) {
      if (!isCurrentUnit(scheduled) || (scriptId && scriptId !== scheduled.scriptId)) return;
      try {
        await axios.post("/production/saveFlowData", {
          projectId: scheduled.projectId,
          data: JSON.parse(JSON.stringify(flowData.value)),
          episodesId: scheduled.scriptId,
        });
      } catch (error: any) {
        if (isCurrentUnit(scheduled)) window.$message.error(error?.message || "工作区保存失败，分镜语义修订须经人工确认");
        throw error;
      }
    }

    async function getFlowData() {
      const token = captureUnit();
      if (!token) return;
      const { data } = await axios.post("/production/getFlowData", {
        projectId: token.projectId,
        episodesId: token.scriptId,
      });
      if (isCurrentUnit(token)) flowData.value = data;
    }
    async function batchGenerateStoryboard(allIds: number[], compulsory: boolean = false) {
      const token = captureUnit();
      if (!token) return;
      try {
        const { data } = await axios.post("/production/storyboard/batchGenerateImage", {
          scriptId: token.scriptId,
          projectId: token.projectId,
          storyboardIds: allIds,
          concurrentCount: settingStore().otherSetting.assetsBatchGenereateSize,
          compulsory,
        });
        if (data && isCurrentUnit(token)) {
          if (flowData.value.storyboard.length === 0) {
            flowData.value.storyboard = data;
            return data;
          } else {
            flowData.value.storyboard.forEach((item) => {
              const findData = data.find((i: any) => i.id == item.id);
              if (findData) {
                item.state = findData.state;
                if (!findData.attemptId || findData.src) item.src = findData.src;
                if (findData.attemptId) item.imageProvenance = { ...(item.imageProvenance ?? {
                  freshness: item.src ? "LEGACY" : "NONE", currentAttemptId: null, producerType: null, producerRef: null,
                  sourceHash: null, staleCode: null, staleReason: null, latestAttemptStatus: null,
                }), activeAttemptId: findData.attemptId, latestAttemptStatus: "RUNNING" };
              }
            });
          }
        }
        return data;
      } catch (e) {
        throw e;
      }
    }
    async function batchGenerateAssets(allIds: number[]) {
      const token = captureUnit();
      if (!token) return;
      flowData.value.assets.forEach((asset) => {
        if (asset.derive) {
          asset.derive.forEach((derive) => {
            if (allIds.includes(derive.id)) {
              derive.state = "生成中" as "未生成" | "生成中" | "已完成" | "生成失败";
            }
          });
        }
      });
      try {
        const { data } = await axios.post("/production/assets/batchGenerateAssetsImage", {
          assetIds: allIds,
          projectId: token.projectId,
          scriptId: token.scriptId,
          concurrentCount: settingStore().otherSetting.assetsBatchGenereateSize,
        });
        if (data && isCurrentUnit(token)) {
          data.forEach((record: { id: number; state: "未生成" | "生成中" | "已完成" | "生成失败"; src: string }) => {
            flowData.value.assets.forEach((asset) => {
              if (asset.derive) {
                asset.derive.forEach((derive) => {
                  if (derive.id === record.id) {
                    derive.state = record.state;
                    derive.src = record.src;
                  }
                });
              }
            });
          });
        }
        return data;
      } catch (e) {}
    }
    const assetsNotStateImageIds = computed(() => {
      const ids: number[] = [];
      flowData.value.assets.forEach((asset) => {
        if (asset.derive) {
          asset.derive.forEach((derive) => {
            if (derive.state == ("生成中" as "未生成" | "生成中" | "已完成" | "生成失败")) {
              ids.push(derive.id);
            }
          });
        }
      });
      return ids;
    });
    const storyboardNotStateImageIds = computed(() => {
      const ids: number[] = [];
      flowData.value.storyboard.forEach((asset) => {
        if (asset.state == "生成中" && asset.id) {
          ids.push(asset.id);
        }
      });
      return ids;
    });
    // ---- 资产图片轮询 ----
    let assetsPollingTimer: number | null = null;
    let assetsPollingInFlight = false;

    async function pollAssetsImages() {
      const token = captureUnit();
      if (!token) return;
      const ids = assetsNotStateImageIds.value;
      if (ids.length === 0 || assetsPollingInFlight) return;
      assetsPollingInFlight = true;
      try {
        const { data } = await axios.post("/production/assets/pollingImage", {
          ids: ids,
        });
        if (!isCurrentUnit(token) || !data || data.length === 0) return;
        const records = data as Array<{ id: number; state: string; src?: string; errorReason?: string; prompt?: string }>;
        records.forEach((record) => {
          flowData.value.assets.forEach((asset) => {
            if (!asset.derive) return;
            asset.derive.forEach((derive) => {
              if (derive.id === record.id) {
                derive.state = record.state as "未生成" | "生成中" | "已完成" | "生成失败";
                if (record.src) derive.src = record.src;
                derive.errorReason = record?.errorReason ?? "";
                derive.prompt = record?.prompt ?? "";
              }
            });
          });
        });
      } catch (e) {
        console.error("[assetsPolling] error", e);
      } finally {
        assetsPollingInFlight = false;
      }
    }

    function startAssetsPolling() {
      if (assetsPollingTimer) return;
      assetsPollingTimer = window.setInterval(async () => {
        if (assetsNotStateImageIds.value.length === 0) {
          stopAssetsPolling();
          return;
        }
        await pollAssetsImages();
      }, 5000);
      // 立即执行一次
      pollAssetsImages();
    }

    function stopAssetsPolling() {
      if (assetsPollingTimer) {
        clearInterval(assetsPollingTimer);
        assetsPollingTimer = null;
      }
    }

    watch(
      () => assetsNotStateImageIds.value,
      (ids) => {
        if (ids.length > 0) {
          startAssetsPolling();
        } else {
          stopAssetsPolling();
        }
      },
    );

    // ---- 分镜图片轮询 ----
    let storyboardPollingTimer: number | null = null;
    let storyboardPollingInFlight = false;

    async function pollStoryboardImages() {
      const token = captureUnit();
      if (!token) return;
      const ids = storyboardNotStateImageIds.value;
      if (ids.length === 0 || storyboardPollingInFlight) return;
      storyboardPollingInFlight = true;
      try {
        const { data } = await axios.post("/production/storyboard/pollingImage", {
          ids: ids,
        });
        if (!isCurrentUnit(token) || !data || data.length === 0) return;
        const records = data as Array<{ id: number; state: string; src?: string; reason?: string }>;
        // Polling omits Attempt provenance. Refresh once for this terminal batch
        // while the local shot still records the active controlled attempt.
        const refreshAttemptProvenance = records.some((record) => record.state !== "生成中" &&
          flowData.value.storyboard.some((item) => item.id === record.id && !!item.imageProvenance?.activeAttemptId));
        records.forEach((record) => {
          const item = flowData.value.storyboard.find((s) => s.id === record.id);
          if (item) {
            item.state = record.state as "未生成" | "生成中" | "已完成" | "生成失败";
            if (record.src) item.src = record.src;
            item.reason = record?.reason ?? "";
          }
        });
        if (refreshAttemptProvenance) await getFlowData();
      } catch (e) {
        console.error("[storyboardPolling] error", e);
      } finally {
        storyboardPollingInFlight = false;
      }
    }

    function startStoryboardPolling() {
      if (storyboardPollingTimer) return;
      storyboardPollingTimer = window.setInterval(async () => {
        if (storyboardNotStateImageIds.value.length === 0) {
          stopStoryboardPolling();
          return;
        }
        await pollStoryboardImages();
      }, 5000);
      // 立即执行一次
      pollStoryboardImages();
    }

    function stopStoryboardPolling() {
      if (storyboardPollingTimer) {
        clearInterval(storyboardPollingTimer);
        storyboardPollingTimer = null;
      }
    }

    watch(
      () => storyboardNotStateImageIds.value,
      (ids) => {
        if (ids.length > 0) {
          startStoryboardPolling();
        } else {
          stopStoryboardPolling();
        }
      },
    );

    function updateContext() {
      if (episodesId.value! < 0) return;
      const ctx = {
        isolationKey: `${projectId}:productionAgent:${episodesId.value}`,
        projectId: projectId,
        scriptId: episodesId.value,
      };
      if (!connected.value) connect();
      socket.value!.emit("updateContext", ctx);
    }
    async function addStoryboardInfo(items: any[], token: UnitToken) {
      if (!isCurrentUnit(token)) return { dispatched: false, data: null, current: false };
      const { data } = await axios.post("/production/storyboard/batchAddStoryboardInfo", {
        scriptId: token.scriptId,
        data: items,
        projectId: token.projectId,
      });
      return { dispatched: true, data, current: isCurrentUnit(token) };
    }

    const loadingHistory = ref(false);
    async function getHistory() {
      const token = captureUnit();
      if (!token) return;
      loadingHistory.value = true;
      const { data } = await axios.post(`/agents/getMemory`, {
        projectId: token.projectId,
        episodesId: token.scriptId,
        agentType: "productionAgent",
      });
      if (isCurrentUnit(token)) messages.value = [...defMsg.value, ...data];
      if (isCurrentUnit(token)) loadingHistory.value = false;
    }

    const thinkLevel = ref(0);

    function updateThinkConfig(value: number) {
      thinkLevel.value = value;
      if (socket.value) {
        socket.value.emit("updateThinkConfig", { think: value > 0, thinlLevel: value });
      }
    }

    return {
      connected,
      messages,
      chat,
      stopGenerate,
      socket,
      status,
      flowData,
      setFlowData,
      getFlowData,
      episodesId,
      unitGeneration,
      captureUnit,
      isCurrentUnit,
      invalidateUnit,
      stopAssetsPolling,
      stopStoryboardPolling,
      updateContext,
      getHistory,
      loadingHistory,
      batchGenerateStoryboard,
      reconnect,
      thinkLevel,
      updateThinkConfig,
    };
  });
}

const storeMap = new Map<string, ReturnType<typeof makeProductionAgentStore>>();

function createProductionAgentStore(projectId: string) {
  if (!storeMap.has(projectId)) {
    storeMap.set(projectId, makeProductionAgentStore(projectId));
  }
  return storeMap.get(projectId)!;
}

export default function useProductionAgentStore() {
  const id = projectStore().project?.id;
  if (!id) throw new Error("No project selected");
  return createProductionAgentStore(id)();
}
