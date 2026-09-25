<template>
  <t-dialog :visible="visible" header="Advanced · Supervisor Review" width="860px" :footer="false" attach="body" placement="center" dialog-class-name="supervisor-review-dialog" @close="$emit('close')">
    <section class="supervisor-inspector" @wheel.stop @mousedown.stop @pointerdown.stop>
      <p>当前制作单元：{{ projectId }} / {{ scriptId }} <button :disabled="busy" @click="load">刷新当前内容</button></p>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <p v-if="loading">正在读取当前分镜与审核记录…</p>
      <template v-if="target && gate">
        <h3>{{ target.review.displayName }}</h3>
        <p>审核目标：{{ target.target.targetAdapterKey }} · {{ target.target.targetType }} · {{ target.target.summary }}</p>
        <p>分镜版本：<code :title="target.target.targetHash">{{ target.target.targetHash.slice(0, 12) }}</code>；控制上下文：<code :title="target.controlContextHash">{{ target.controlContextHash.slice(0, 12) }}</code></p>
        <p>Production Profile：{{ target.profile.profileKey }} @ {{ target.profile.profileVersion }}；Recipe：{{ target.recipe ? `${target.recipe.recipeKey} @ ${target.recipe.recipeVersion}` : '未绑定' }}</p>
        <p>当前决定：{{ gate.effectiveDecision || '尚无有效人工决定' }}；Gate：<strong :class="gate.pass ? 'pass' : 'error'">{{ gate.code }}</strong><span v-if="gate.reason"> · {{ gate.reason }}</span></p>
        <p v-if="gate.staleCount" class="warning">已有 {{ gate.staleCount }} 条过期审核记录，不能用于当前 Gate。</p>
        <div class="actions">
          <button :disabled="busy || loading" @click="pass">人工确认 PASS</button>
          <button :disabled="busy || loading" @click="showRevise = !showRevise">填写 REVISE</button>
        </div>
        <div v-if="showRevise" class="editor">
          <h4>退回修改</h4>
          <label>审核摘要 <textarea v-model="summary" maxlength="4000" /></label>
          <article v-for="(issue, index) in issues" :key="index" class="issue">
            <label>严重程度 <select v-model="issue.severity"><option value="BLOCKER">阻塞</option><option value="WARNING">警告</option><option value="INFO">提示</option></select></label>
            <label>问题代码 <input v-model="issue.code" maxlength="80" placeholder="例如 STORYBOARD_REVISION" /></label>
            <label>问题说明 <textarea v-model="issue.message" maxlength="2000" /></label>
            <label>修改建议 <textarea v-model="issue.suggestion" maxlength="2000" /></label>
            <label>依据 <input v-model="issue.evidence" maxlength="2000" /></label>
            <button @click="issues.splice(index, 1)">移除此项</button>
          </article>
          <button :disabled="issues.length >= 100" @click="addIssue">添加问题</button>
          <button :disabled="busy || !summary.trim() || !issues.some(issue => issue.severity === 'BLOCKER') || issues.some(issue => !issue.code.trim() || !issue.message.trim())" @click="revise">提交 REVISE</button>
        </div>
        <h4>审核历史</h4>
        <p v-if="!history.length">暂无审核记录。</p>
        <article v-for="row in history" :key="row.reviewId" class="history">
          <strong>{{ row.decision }} · {{ row.status }}</strong> · {{ row.source }} · {{ row.actorDisplayName || '审核人未知' }} · {{ new Date(Number(row.createdAt)).toLocaleString() }}
          <p>{{ row.summary }}</p>
          <p>分镜 {{ row.targetHash.slice(0, 12) }} · {{ row.profileKey }} @ {{ row.profileVersion }} · Recipe {{ row.recipeKey ? `${row.recipeKey} @ ${row.recipeVersion}` : '未绑定' }}</p>
          <p v-for="issue in row.issues" :key="`${issue.code}-${issue.message}`">{{ issue.severity }} · {{ issue.code }}：{{ issue.message }}<span v-if="issue.suggestion">；建议：{{ issue.suggestion }}</span></p>
        </article>
      </template>
    </section>
  </t-dialog>
</template>
<script setup lang="ts">
import { ref, watch } from 'vue';
import axios from '@/utils/axios';
const props = defineProps<{ visible: boolean; projectId: number; scriptId: number }>();
defineEmits<{ close: [] }>();
type Issue = { severity: 'BLOCKER' | 'WARNING' | 'INFO'; code: string; message: string; suggestion: string | null; evidence: string | null };
const reviewKey = 'storyboard.semantic-approval';
const target = ref<any>(null), gate = ref<any>(null), history = ref<any[]>([]);
const loading = ref(false), busy = ref(false), error = ref(''), showRevise = ref(false), summary = ref('');
const issues = ref<Issue[]>([]);
let epoch = 0;
const scope = () => ({ projectId: props.projectId, scriptId: props.scriptId, reviewKey });
const post = async (path: string, body: unknown) => (await axios.post(`/supervisor/${path}`, body)).data;
function fail(value: any) { error.value = value?.message || value?.response?.data?.message || 'Supervisor 操作失败'; }
function addIssue() { issues.value.push({ severity: 'BLOCKER', code: 'STORYBOARD_REVISION', message: '', suggestion: null, evidence: null }); }
async function load() {
  const current = ++epoch;
  if (!props.visible || !props.projectId || !props.scriptId) return;
  loading.value = true; error.value = ''; target.value = null; gate.value = null; history.value = [];
  try {
    const [nextTarget, nextHistory, nextGate] = await Promise.all([post('target/read', scope()), post('review/history', scope()), post('gate/check', scope())]);
    if (current === epoch) { target.value = nextTarget; history.value = nextHistory.history; gate.value = nextGate; }
  } catch (value) { if (current === epoch) fail(value); }
  finally { if (current === epoch) loading.value = false; }
}
async function submit(decision: 'PASS' | 'REVISE', text: string, submittedIssues: Issue[]) {
  if (!target.value || !gate.value) return;
  busy.value = true; error.value = '';
  try {
    await post('review/decide', { ...scope(), expectedTargetHash: target.value.target.targetHash, expectedControlContextHash: target.value.controlContextHash, decision, summary: text, issues: submittedIssues });
    showRevise.value = false; summary.value = ''; issues.value = []; await load();
  } catch (value) { fail(value); }
  finally { busy.value = false; }
}
function pass() {
  if (!window.confirm('确认当前分镜内容和精确 Profile/Recipe 上下文均已人工审核，可以通过吗？')) return;
  void submit('PASS', '人工确认当前 Storyboard 语义与生产规划通过。', []);
}
function revise() { void submit('REVISE', summary.value.trim(), issues.value); }
watch(() => [props.visible, props.projectId, props.scriptId], () => { ++epoch; target.value = null; gate.value = null; history.value = []; if (props.visible) void load(); }, { immediate: true });
</script>
<style scoped>
.supervisor-inspector{max-height:calc(100vh - 160px);overflow-y:auto;overscroll-behavior:contain;padding:4px 12px 16px;color:var(--td-text-color-primary)}
.supervisor-inspector p{overflow-wrap:anywhere}.error{color:var(--td-error-color)}.warning{color:var(--td-warning-color)}.pass{color:var(--td-success-color)}
.actions,.editor{margin:14px 0}.editor,.history,.issue{border:1px solid var(--td-component-border);border-radius:6px;padding:12px;margin:8px 0;background:var(--td-bg-color-container)}
label{display:block;margin:8px 0}input,textarea,select{display:block;box-sizing:border-box;width:100%;padding:7px;color:var(--td-text-color-primary);background:var(--td-bg-color-container);border:1px solid var(--td-component-border);border-radius:4px}textarea{min-height:65px}
button{margin:4px;padding:7px 10px;color:var(--td-text-color-primary);background:var(--td-bg-color-secondarycontainer);border:1px solid var(--td-component-border);border-radius:4px;cursor:pointer}button:disabled{opacity:.5;cursor:not-allowed}code{color:var(--td-text-color-secondary)}
</style>
