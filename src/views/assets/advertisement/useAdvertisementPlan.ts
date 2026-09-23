import { computed, onScopeDispose, ref, watch, type Ref } from "vue";
export interface Context { projectId: number; scriptId: number }
export interface PlanItem {
  assetKey: string; name: string; category: string; required: boolean;
  sourcePolicy: "REAL_REQUIRED" | "AI_ALLOWED"; assetId: number | null;
  bindingValid?: boolean; bindingIssue?: string | null;
}
export interface Gate extends Context {
  prepared: boolean; ready: boolean; confirmed: boolean;
  planItems: (PlanItem & { ready: boolean; issue: string | null })[];
}
export type Post = (url: string, body: any) => Promise<{ data: any }>;
export const policyLabel = (policy: PlanItem["sourcePolicy"]) => policy === "REAL_REQUIRED" ? "必须上传真实素材" : "允许AI生成";
export function itemStatus(item: PlanItem, gate: Gate | null) {
  if (!item.assetId) return "未绑定";
  const state = gate?.planItems.find(row => row.assetKey === item.assetKey);
  if (state?.issue === "ASSET_PLAN_REAL_SOURCE_REQUIRED" || item.bindingIssue === "ASSET_PLAN_REAL_SOURCE_REQUIRED") return "来源不符合";
  if (state?.issue === "ASSET_PLAN_ASSET_SCOPE_MISMATCH" || item.bindingIssue === "ASSET_PLAN_ASSET_SCOPE_MISMATCH") return "绑定已失效";
  return state?.ready === true ? "已准备" : "未完成";
}
export const editable = (item: PlanItem): PlanItem => ({ assetKey: item.assetKey, name: item.name.trim(), category: item.category.trim(), required: item.required, sourcePolicy: item.sourcePolicy, assetId: item.assetId });
export function useAdvertisementPlan(context: Ref<Context | null>, post: Post) {
  const items = ref<PlanItem[]>([]), gate = ref<Gate | null>(null);
  const assets = ref<{ id: number; name: string }[]>([]);
  const loading = ref(false), busy = ref(false), error = ref("");
  let epoch = 0, reads = 0;
  const active = (token: number) => token === epoch;
  const message = (e: any) => String(e?.response?.data?.message || e?.message || "操作失败，请重试。").replace(/REAL_REQUIRED/g, "真实素材").replace(/AI_ALLOWED/g, "允许 AI 的素材");
  const canConfirm = computed(() => !!context.value && !loading.value && !busy.value && gate.value?.prepared === true);
  const required = computed(() => gate.value?.planItems.filter(item => item.required) ?? []);
  const blockers = computed(() => required.value.filter(item => !item.ready));
  async function reload(token = epoch) {
    const ctx = context.value && { ...context.value }, request = ++reads;
    if (!ctx) return false;
    loading.value = true; gate.value = null;
    try {
      const [plan, state, units] = await Promise.all([
        post("/project/advertisement/assetPlan/read", ctx),
        post("/project/advertisement/getWorkflowState", ctx),
        post("/script/getScrptApi", { projectId: ctx.projectId }),
      ]);
      if (!active(token) || request !== reads) return false;
      if (plan.data.projectId !== ctx.projectId || plan.data.scriptId !== ctx.scriptId || state.data.projectId !== ctx.projectId || state.data.scriptId !== ctx.scriptId) throw new Error("制作单元已变化，请重新选择。");
      const unit = units.data.find((unit: any) => unit.id === ctx.scriptId);
      if (!unit) throw new Error("当前制作单元不存在，请重新选择。");
      items.value = plan.data.items; gate.value = state.data;
      assets.value = unit.relatedAssets ?? [];
      return true;
    } catch (e) { if (active(token) && request === reads) { error.value = message(e); gate.value = null; } return false; }
    finally { if (active(token) && request === reads) loading.value = false; }
  }
  async function refresh() { if (busy.value) return; error.value = ""; await reload(); }
  async function mutate(work: (ctx: Context, token: number) => Promise<void>) {
    if (!context.value || busy.value || loading.value || !gate.value) return false;
    const token = epoch, ctx = { ...context.value }; busy.value = true; gate.value = null; error.value = "";
    let success = false;
    try { await work(ctx, token); success = true; }
    catch (e) { if (active(token)) error.value = message(e); }
    if (active(token)) { await reload(token); if (active(token)) busy.value = false; }
    return active(token) && success;
  }
  async function saveItem(item: PlanItem) {
    if (!item.name.trim() || !item.category.trim()) { error.value = "请填写素材名称和类别。"; return false; }
    const next = items.value.some(row => row.assetKey === item.assetKey)
      ? items.value.map(row => editable(row.assetKey === item.assetKey ? item : row)) : [...items.value.map(editable), editable(item)];
    return mutate(async ctx => { await post("/project/advertisement/assetPlan/save", { ...ctx, items: next }); });
  }
  const remove = (key: string) => mutate(async ctx => { await post("/project/advertisement/assetPlan/save", { ...ctx, items: items.value.filter(row => row.assetKey !== key).map(editable) }); });
  const bind = (assetKey: string, assetId: number) => mutate(async ctx => { await post("/project/advertisement/assetPlan/bind", { ...ctx, assetKey, assetId }); });
  const unbind = (assetKey: string) => mutate(async ctx => { await post("/project/advertisement/assetPlan/unbind", { ...ctx, assetKey }); });
  async function upload(assetKey: string, file: File) {
    return mutate(async (ctx, token) => {
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("读取文件失败，请重新选择。")); reader.readAsDataURL(file);
      });
      if (!active(token)) return;
      const { data } = await post("/assets/uploadClip", { ...ctx, name: file.name, type: "tool", base64Data });
      if (!active(token)) return;
      try { await post("/project/advertisement/assetPlan/bind", { ...ctx, assetKey, assetId: data.id }); }
      catch (e) { throw new Error(`素材已上传，但未绑定：${message(e)}。可在已有素材中重新选择。`); }
    });
  }
  async function confirm() {
    if (!canConfirm.value || !context.value) return null;
    const ctx = { ...context.value }, token = epoch; busy.value = true; error.value = "";
    try {
      const { data } = await post("/project/advertisement/confirmAssetPreparation", { ...ctx, confirmed: true });
      if (!active(token)) return null;
      if (data.projectId !== ctx.projectId || data.scriptId !== ctx.scriptId) throw new Error("制作单元已变化，请刷新状态。");
      gate.value = data;
      if (data.ready !== true) throw new Error("素材状态已变化，请补齐当前缺少的必需素材后再确认。");
      return ctx;
    } catch (e) { if (active(token)) { error.value = message(e); await reload(token); } return null; }
    finally { if (active(token)) busy.value = false; }
  }
  watch(context, () => { ++epoch; ++reads; items.value = []; assets.value = []; gate.value = null; busy.value = false; error.value = ""; loading.value = false; if (context.value) void reload(); }, { immediate: true, flush: "sync" });
  onScopeDispose(() => { ++epoch; ++reads; });
  return { items, gate, assets, loading, busy, error, canConfirm, required, blockers, refresh, saveItem, remove, bind, unbind, upload, confirm };
}
