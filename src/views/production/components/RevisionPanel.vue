<template>
  <div class="revision-entry" v-if="revision.state.mode === 'CONTROLLED_V2'">
    <button v-if="revision.state.proposal" @click="openProposal">Agent 分镜提案待人工确认</button>
    <span v-if="revision.state.proposal" class="hint">仅保留在当前浏览器会话；尚未应用，刷新可能丢失。</span>
    <button v-if="revision.state.proposal" @click="revision.discardProposal()">丢弃提案</button>
    <button v-if="revision.state.draft && !revision.state.dialogOpen" @click="revision.state.dialogOpen = true">继续未提交的修订草稿</button>
    <span v-if="revision.state.status === 'APPLIED'">修订已应用，已从服务器刷新。代次：{{ revision.state.applied?.epochAfter ?? revision.state.applied?.revisionEpoch ?? '请查看工序状态' }}；新增镜头映射：{{ show(revision.state.applied?.clientRefToId) }}</span>
    <button v-if="revision.state.status === 'REFRESH_PENDING'" @click="revision.refreshApplied()">修订已应用，重试刷新</button>
  </div>
  <p v-else-if="revision.state.mode === 'CONFIG_BLOCKED'" class="revision-error">Semantic V2 审核配置不可用：{{ revision.state.error }}</p>
  <t-dialog :visible="revision.state.dialogOpen" attach="body" width="900px" header="分镜语义修订预览" :footer="false" @close="revision.close()">
    <div class="revision-dialog" @wheel.stop @pointerdown.stop @mousedown.stop>
      <p>制作单元：{{ revision.state.scope?.projectId }} / {{ revision.state.scope?.scriptId }}；来源：{{ revision.state.draft?.origin }}</p>
      <p>变更：{{ revision.state.draft?.operations.map(item => item.type).join(' → ') }}</p>
      <p v-if="revision.state.draft?.operations.some(item => item.clientRef)">新增镜头临时引用：{{ revision.state.draft?.operations.filter(item => item.clientRef).map(item => item.clientRef).join('、') }}</p>
      <p v-if="revision.state.error" class="revision-error" role="alert">{{ revision.state.error }}</p>
      <button :disabled="revision.state.status === 'PREVIEWING' || revision.state.status === 'CONFIRMING'" @click="revision.previewDraft(!!revision.state.preview)">
        {{ revision.state.preview ? '重新预览（新修订 ID）' : '读取服务器影响预览' }}
      </button>
      <template v-if="revision.state.preview">
        <p>当前代次：{{ revision.state.preview.baseRevisionEpoch }}；预览哈希：{{ revision.state.preview.previewHash }}</p>
        <p>服务器当前语义哈希：{{ revision.state.preview.sourceTargetHash }}；拟议语义哈希：{{ revision.state.preview.proposedSemanticHash }}</p>
        <h4>拟议分镜语义</h4><pre>{{ show(revision.state.preview.proposedSemantic) }}</pre>
        <h4>工序变化</h4><pre>{{ show(revision.state.preview.stageTransitions) }}</pre>
        <h4>受影响的运行任务</h4><pre>{{ show(revision.state.preview.affectedActiveAttempts) }}</pre>
        <h4>现有产物影响与保留</h4><pre>{{ show(revision.state.preview.outputImpact) }}</pre>
        <p v-if="revision.state.preview.warnings?.length" class="revision-error">{{ show(revision.state.preview.warnings) }}</p>
        <label>修订原因 <textarea v-model="revision.state.humanReason" maxlength="2000" /></label>
        <button :disabled="revision.state.status !== 'PREVIEWED' || !revision.state.humanReason.trim()" @click="revision.confirm()">人工确认并应用</button>
      </template>
      <button :disabled="revision.state.status === 'CONFIRMING'" @click="revision.close()">关闭预览，保留草稿</button>
    </div>
  </t-dialog>
</template>
<script setup lang="ts">
import { useStoryboardRevision } from "@/views/production/revision/coordinator";
import { proposalOperations, semanticBaseline } from "@/views/production/revision/proposalPlan";
import type { Storyboard } from "@/views/production/utils/flowBuilder";
const props = defineProps<{ storyboard: Storyboard[] }>();
const revision = useStoryboardRevision();
const show = (value: unknown) => JSON.stringify(value ?? [], null, 2);
function openProposal() {
  const proposal = revision.state.proposal;
  if (!proposal) return;
  try {
    if (proposal.baseline !== undefined && proposal.baseline !== semanticBaseline(props.storyboard))
      throw new Error("提案接收后分镜已变化，请丢弃并重新生成提案，不能静默重建目标");
    const operations = proposalOperations(proposal.kind, proposal.candidate,
      props.storyboard.map(item => item.id).filter((id): id is number => !!id));
    revision.open(`AGENT_${proposal.kind}`, operations);
  } catch (error: any) { window.$message.error(error?.message || "Agent 提案无效"); }
}
</script>
<style scoped>
.revision-entry{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px;background:var(--td-bg-color-container);color:var(--td-text-color-primary)}
.revision-dialog{max-height:calc(100vh - 170px);overflow-y:auto;overscroll-behavior:contain;color:var(--td-text-color-primary)}
.revision-dialog pre{white-space:pre-wrap;overflow-wrap:anywhere;background:var(--td-bg-color-secondarycontainer);padding:10px;border:1px solid var(--td-component-border)}
.revision-dialog textarea{display:block;width:100%;min-height:80px;color:var(--td-text-color-primary);background:var(--td-bg-color-container)}
.revision-error{color:var(--td-error-color)}.hint{color:var(--td-text-color-secondary)}button{cursor:pointer}
</style>
