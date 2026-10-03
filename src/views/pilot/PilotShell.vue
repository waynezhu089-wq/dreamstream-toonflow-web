<template>
  <div class="pilot">
    <header class="topbar">
      <div class="brand">Dream Stream <span>V0.4 Pilot</span></div>
      <div class="project-title">{{ state?.project?.name || "选择一个项目" }} <small v-if="state">· {{ state.creative.targetDuration }} 秒 · {{ state.creative.aspectRatio }}</small></div>
      <div class="top-actions"><span>{{ saving ? "正在同步…" : status }}</span><button v-if="state" class="quiet" @click="reload">刷新</button></div>
    </header>
    <div v-if="!state" class="welcome">
      <div class="welcome-copy"><p class="eyebrow">一个项目，一个持续协作的伙伴</p><h1>把想法变成可制作的影像。</h1><p>从创意开始，逐步建立素材身份，再进入受控的分镜、视频与剪辑流程。</p></div>
      <div class="welcome-form">
        <h2>新建广告项目</h2>
        <label>项目名称<input v-model="newProject.name" placeholder="例如 Dream Stream 品牌广告" /></label>
        <label>创意 Brief<textarea v-model="newProject.brief" rows="4" placeholder="你想表达什么？希望观众记住什么？" /></label>
        <div class="field-row"><label>目标时长<input v-model.number="newProject.targetDuration" type="number" min="1" max="600" /></label><label>画幅<select v-model="newProject.aspectRatio"><option>16:9</option><option>9:16</option><option>1:1</option></select></label></div>
        <button class="primary" :disabled="saving || !newProject.name.trim()" @click="createProject">创建并进入创意</button>
        <p class="fineprint">无需先配置图片或视频模型。真正使用生成能力时再检查。</p>
        <template v-if="projects.length"><h3>继续项目</h3><button v-for="p in projects" :key="p.projectId" class="project-row" @click="open(p.projectId,p.scriptId)">{{ p.name }} <span>继续 →</span></button></template>
      </div>
      <p v-if="error" class="error">{{ error }}</p>
    </div>
    <div v-else class="workspace" :class="{'assets-workspace':tab==='assets'}">
      <nav class="nav" aria-label="项目工序">
        <button v-for="item in tabs" :key="item.key" :class="{ active: tab === item.key }" @click="tab = item.key; selected = null">{{ item.label }}</button>
        <div class="nav-foot"><button @click="state=null; selected=null; loadProjects()">切换项目</button><small>实验环境 · 独立数据</small></div>
      </nav>
      <main class="content">
        <div class="heading"><div><p class="eyebrow">{{ tabLabel }}</p><h1>{{ heading }}</h1></div></div>
        <p v-if="error" class="error" role="alert">{{ error }}</p>
        <template v-if="tab === 'overview'">
          <p class="intro">从左侧选择工作阶段。Project Agent 在每个阶段使用同一项目记忆；创意、决定、素材和生产结果各有明确来源。</p>
          <div class="overview-list"><button @click="tab='creative'">01 · 打磨创意 <span>{{ state.creative.script ? "脚本已确认" : "从 Brief 开始" }} →</span></button><button @click="tab='assets'">02 · 建立素材圣经 <span>{{ state.assets.filter((a:any)=>a.status==='ACTIVE').length }} 项 →</span></button><button @click="tab='storyboard'">03 · 制作分镜 <span>沿用受控生产流程 →</span></button></div>
          <section v-if="state.agentReferences?.some((r:any)=>r.targetType==='PROJECT_REFERENCE')" class="subsection"><h2>项目图片参考</h2><p v-for="r in state.agentReferences.filter((x:any)=>x.targetType==='PROJECT_REFERENCE')" :key="r.id" class="muted">{{ r.originalName }} · 来自项目 Agent 对话</p></section>
          <section class="subsection"><h2>项目决定</h2><p class="muted">接受和否决意见会独立保存，不依赖聊天摘要。</p><div class="decision-form"><input v-model="decisionText" placeholder="例如：不要做成普通 SaaS 广告" /><button :disabled="!decisionText.trim()" @click="proposeDecision">提出决定</button></div><div v-for="d in state.decisions" :key="d.id" class="decision"><span :class="d.status">{{ decisionStatus(d.status) }}</span><p>{{ d.content }}</p><button v-if="d.status==='PROPOSED'" @click="setDecision(d.id,'ACCEPTED')">接受</button><button v-if="d.status==='PROPOSED'" @click="setDecision(d.id,'REJECTED')">否决</button></div></section>
        </template>
        <template v-else-if="tab === 'creative'">
          <p class="intro">先和右侧 Project Agent 讨论。这里展示当前已确认内容；Agent 生成的是待审提案，不会直接改写。</p>
          <div class="creative-truth"><section><div class="truth-heading"><h2>目标时长</h2><small>已确认 · v{{ state.creative.version }}</small></div><p>{{ state.creative.targetDuration }} 秒</p></section><section v-for="field in creativeFields" :key="field.key"><div class="truth-heading"><h2>{{ field.label }}</h2><small>已确认 · v{{ state.creative.version }}</small></div><p>{{ state.creative[field.key] || '尚未形成内容，和 Agent 讨论后生成提案。' }}</p></section></div>
          <div class="toolbar"><button class="quiet" @click="creativeEditing=!creativeEditing; creativePreview=null">{{ creativeEditing ? '收起人工编辑' : '人工编辑当前内容' }}</button></div>
          <div v-if="creativeEditing" class="editor"><p v-if="creativeCandidateReason" class="muted">Agent 提案：{{ creativeCandidateReason }}</p><label>目标时长（秒）<input v-model.number="creativeDraft.targetDuration" type="number" min="1" max="600" step="1" @input="creativePreview=null" /></label><label>Creative Brief<textarea v-model="creativeDraft.brief" rows="4" @input="creativePreview=null" /></label><label>Treatment / 创意展开<textarea v-model="creativeDraft.treatment" rows="5" @input="creativePreview=null" /></label><label>Script / 旁白与结构<textarea v-model="creativeDraft.script" rows="6" @input="creativePreview=null" /></label><button class="quiet" :class="actionClass('creative-preview')" :disabled="saving" @click="previewCreative"><span v-if="actionPhase('creative-preview')==='WORKING'" class="button-spinner" aria-hidden="true"></span>{{ actionLabel('creative-preview',creativePreview ? '重新预览差异' : '预览创意更改') }}</button></div>
          <div v-if="creativePreview" class="preview"><h2>确认前预览</h2><div class="duration-preview" :class="{changed:creativePreview.current.targetDuration!==creativePreview.proposed.targetDuration}"><h3>目标时长</h3><div class="diff"><p>当前<br /><strong>{{ creativePreview.current.targetDuration }} 秒</strong></p><p>提议<br /><strong>{{ creativePreview.proposed.targetDuration }} 秒</strong></p></div></div><div v-for="field in ['brief','treatment','script']" :key="field"><h3>{{ field }}</h3><div class="diff"><pre>{{ creativePreview.current[field] }}</pre><pre>{{ creativePreview.proposed[field] }}</pre></div></div><button class="primary" :class="actionClass('creative-apply')" :disabled="saving" @click="applyCreative"><span v-if="actionPhase('creative-apply')==='WORKING'" class="button-spinner" aria-hidden="true"></span>{{ actionLabel('creative-apply','确认并保存') }}</button><button class="quiet" @click="creativePreview=null">取消</button></div>
        </template>
        <template v-else-if="tab === 'assets'">
          <p class="intro">身份 ID 在确认时分配，改名也不会变化。真实界面、Logo 与产品文字需上传真实素材。</p>
          <div class="toolbar"><button class="quiet" @click="openAssetPreparation">打开广告资产准备与模型配置</button><button class="quiet" :class="actionClass('extract')" :disabled="saving" @click="runSkill('ASSET_EXTRACTION')"><span v-if="actionPhase('extract')==='WORKING'" class="button-spinner" aria-hidden="true"></span>{{ actionLabel('extract','AI 提取候选') }}</button><button class="quiet" :class="actionClass('asset-prompts')" :disabled="saving || !state.assets.length" @click="runSkill('ASSET_PROMPTS')"><span v-if="actionPhase('asset-prompts')==='WORKING'" class="button-spinner" aria-hidden="true"></span>{{ actionLabel('asset-prompts','批量 Prompt 草案') }}</button></div><p class="muted">AI 操作只有你点击后才使用已配置文本模型，可能产生费用；上传、绑定与 Gate 仍由现有后端校验。</p>
          <div class="asset-layout"><div class="asset-list" aria-label="资产结构树"><div v-for="group in assetGroups" :key="group.title" class="asset-group"><h3>{{ group.title }} <small>{{ group.items.length }}</small></h3><button v-for="asset in group.items" :key="asset.canonicalKey" :class="{ chosen:selected?.key===asset.canonicalKey }" @click="selectAsset(asset)"><strong>{{ asset.canonicalKey }}</strong><span>{{ asset.name }}</span><small>{{ asset.category }} / {{ assetKindLabel(asset.assetKind) }} · {{ planStatus(asset.canonicalKey) }}</small><small>低清：{{ reviewLabel(reviewFor(asset.canonicalKey)?.previewStatus || 'UNPLANNED') }} · 三视图：{{ reviewLabel(reviewFor(asset.canonicalKey)?.turnaroundStatus || 'UNPLANNED') }}</small><small v-if="!asset.description || (asset.sourcePolicy==='REAL_REQUIRED' && !state.agentReferences?.some((r:any)=>r.targetKey===asset.canonicalKey))">{{ !asset.description ? '缺描述' : '缺真实参考' }}</small><small v-if="asset.relatedKeys?.length || asset.variantOf || asset.sharedVisualSystemKey">关系：{{ [asset.variantOf,asset.sharedVisualSystemKey,...(asset.relatedKeys||[])].filter(Boolean).join('、') }}</small></button></div><div class="asset-group"><h3>关系 / 变体 <small>{{ relationshipAssets.length }}</small></h3><button v-for="asset in relationshipAssets" :key="`relation-${asset.canonicalKey}`" @click="selectAsset(asset)"><strong>{{ asset.canonicalKey }}</strong><span>{{ asset.name }}</span><small>{{ [asset.ownerKey,asset.variantOf,asset.sharedVisualSystemKey,...(asset.relatedKeys||[])].filter(Boolean).join(' → ') }}</small></button></div><button class="add-asset" @click="beginAsset">＋ 添加素材身份</button></div>
            <div class="asset-detail" v-if="assetDraft"><h2>{{ selected?.key || '新素材候选' }}</h2><p class="muted">{{ selected ? '修改身份不会更换 ID。' : '预览不会占用正式 ID。' }}</p><p v-if="selected" class="muted">当前制作单元：{{ planStatus(selected.key) }} · {{ planFor(selected.key)?.assetId ? `绑定资产 #${planFor(selected.key).assetId}` : '尚未绑定' }}。素材来源与完成状态以后端为准。</p>
              <div class="field-row"><label>名称<input v-model="assetDraft.name" /></label><label>类别<select v-model="assetDraft.category"><option v-for="c in categories" :key="c" :value="c">{{ c }}</option></select></label></div>
              <div class="field-row"><label>资产子类型<select v-model="assetDraft.assetKind"><option v-for="kind in assetKinds" :key="kind" :value="kind">{{ assetKindLabel(kind) }}</option></select></label><label>重要性<select v-model="assetDraft.importance"><option value="CORE">核心 · 默认规划三视图（适用时）</option><option value="SUPPORTING">辅助 · 可手动规划</option></select></label></div>
              <label>描述<textarea v-model="assetDraft.description" rows="3" /></label><label>身份锚点（一行一个）<textarea v-model="anchorsText" rows="3" /></label><label>必须保留（一行一个）<textarea v-model="preserveText" rows="2" /></label><label>禁止改变（一行一个）<textarea v-model="forbiddenText" rows="2" /></label>
              <div class="field-row"><label>来源要求<select v-model="assetDraft.sourcePolicy"><option value="AI_ALLOWED">允许 AI 生成</option><option value="REAL_REQUIRED">必须上传真实素材</option></select></label><label>归属 ID<input v-model="ownerText" placeholder="可选，如 CHAR-001" /></label></div>
              <label>变体来源 ID<input v-model="variantText" placeholder="可选，如 LOC-001" /></label><label>共享视觉系统 ID<input v-model="visualSystemText" placeholder="可选，如 FX-001" /></label><label>相关身份 ID（逗号分隔）<input v-model="relatedText" placeholder="可选，如 PROP-001, FX-001" /></label><label>素材 Prompt 草案<textarea v-model="assetDraft.prompt" rows="4" /></label>
              <section v-if="selected" class="review-section"><h3>低清审查与三视图</h3><p class="muted">{{ reviewFor(selected.key)?.previewKind || '尚无计划' }} · {{ reviewLabel(reviewFor(selected.key)?.previewStatus || 'UNPLANNED') }}。低清只供审核，不是正式生产图。</p><img v-if="reviewFor(selected.key)?.previewFilePath" :src="reviewFor(selected.key).previewFilePath" alt="低清审查图" /><p v-else class="muted">尚无低清图片；当前仅建立待执行计划，未调用图片模型。</p><p class="muted">三视图：{{ reviewLabel(reviewFor(selected.key)?.turnaroundStatus || 'UNPLANNED') }}</p><button v-if="reviewFor(selected.key)?.turnaroundStatus==='OPTIONAL'" class="quiet" :class="actionClass('turnaround')" :disabled="saving" @click="planTurnaround"><span v-if="actionPhase('turnaround')==='WORKING'" class="button-spinner" aria-hidden="true"></span>{{ actionLabel('turnaround','将三视图加入计划') }}</button><p v-if="assetDraft.sourcePolicy==='REAL_REQUIRED'" class="muted">真实素材请在广告资产准备中上传并绑定；Logo / UI 不会交给 AI 重绘。</p></section>
              <p v-for="r in state.agentReferences?.filter((x:any)=>['ASSET_BIBLE','BIND_SELECTED_ASSET'].includes(x.targetType) && (!x.targetKey || x.targetKey===selected?.key))" :key="r.id" class="muted">图片参考：{{ r.originalName }} · 尚未绑定为正式素材</p>
              <div class="toolbar"><button class="primary" :class="actionClass('asset-preview')" :disabled="saving || !assetDraft.name" @click="previewAsset"><span v-if="actionPhase('asset-preview')==='WORKING'" class="button-spinner" aria-hidden="true"></span>{{ actionLabel('asset-preview','预览素材变更') }}</button><button v-if="selected" class="quiet" :disabled="saving" @click="retireAsset">退休此身份</button></div>
            </div><div v-else class="asset-empty">选择一个素材查看身份与参考，或添加新的候选。</div></div>
          <div v-if="skillMergeSuggestions.length" class="preview"><h2>已有素材身份的合并建议</h2><p v-for="(suggestion,i) in skillMergeSuggestions" :key="i" class="muted">{{ suggestion.name }} → {{ suggestion.existingCanonicalKey }}：{{ suggestion.reason }}。不会自动新增或合并。</p><button class="quiet" @click="skillMergeSuggestions=[]">清除建议</button></div>
          <div v-if="assetChanges.length || skillCoverage.length" class="preview">
            <AssetProposalReview :changes="assetChanges" :coverage="skillCoverage" :sufficiency="skillSufficiency" :existing-assets="state.assets" :relation-status="skillRelationStatus" @dirty="assetPreview=null" @add-candidate="addCandidateToProposal" />
            <button class="quiet" :class="actionClass('asset-preview')" :disabled="saving" @click="previewAssetChanges"><span v-if="actionPhase('asset-preview')==='WORKING'" class="button-spinner" aria-hidden="true"></span>{{ actionLabel('asset-preview',assetPreview ? '重新预览' : '预览变更与重复建议') }}</button>
            <template v-if="assetPreview"><p v-for="s in assetPreview.suggestions" :key="s.clientRef" class="muted">{{ s.possibleMatches.length ? `可能重复：${s.possibleMatches.join('、')}。不会自动合并。` : '无同名身份；仍请人工检查是否同一实体。' }}</p><button class="primary" :class="actionClass('asset-apply')" :disabled="saving" @click="applyAsset"><span v-if="actionPhase('asset-apply')==='WORKING'" class="button-spinner" aria-hidden="true"></span>{{ actionLabel('asset-apply','确认并应用') }}</button></template>
            <button class="quiet" @click="discardAssetProposal">丢弃提案</button>
          </div>
          <section class="coverage-audit"><h2>Storyboard 前覆盖审计</h2><p class="muted">依据已确认 Treatment 和人工确认的提取审计；这是提示，不会伪造 Stage Gate。</p><p v-if="state.coverage?.stale" class="coverage-warning">Creative 已修改，覆盖审计过期。请重新提取并确认。</p><p v-if="!state.coverage?.items?.length" class="coverage-warning">尚无已确认的覆盖审计；进入分镜前请检查遗漏。</p><div class="coverage-grid"><div v-for="type in coverageGroups" :key="type"><strong>{{ coverageLabel(type) }}</strong><span>{{ state.coverage?.items?.filter((item:any)=>item.coverageType===type && item.status!=='UNCOVERED').length || 0 }} / {{ state.coverage?.items?.filter((item:any)=>item.coverageType===type).length || 0 }}</span></div></div><p v-for="item in coverageWarnings" :key="item.position" class="coverage-warning">未覆盖：{{ item.label }}（{{ coverageLabel(item.coverageType) }}）· {{ item.note }}</p></section>
        </template>
        <template v-else-if="tab === 'storyboard'">
          <p class="intro">镜头草案使用素材身份 ID；确认时由 Resolver 变为当前制作单元的 assetId，再交给现有 Semantic Revision 审查影响。</p>
          <p v-if="!state.coverage?.items?.length || state.coverage.stale || coverageWarnings.length" class="coverage-warning">素材覆盖审计尚未完成或仍有遗漏。可以继续制作分镜，但请先返回素材圣经核查；这里不会假装已经准备就绪。</p>
          <div class="shot-list"><button v-for="shot in state.storyboards" :key="shot.id" @click="selected={type:'SHOT',key:String(shot.id)}"><strong>SHOT {{ String(shot.index ?? 0).padStart(3,'0') }}</strong><span>{{ shot.prompt || '未填写画面意图' }}</span><small>{{ shot.state }}</small></button></div>
          <p v-for="r in state.agentReferences?.filter((x:any)=>x.targetType==='SHOT_REFERENCE' && x.targetKey===selected?.key && x.scriptId===state.creative.scriptId)" :key="r.id" class="muted">镜头对话参考：{{ r.originalName }} · 尚未绑定为正式分镜素材</p>
          <section class="subsection"><h2>批量新增镜头草案</h2><p class="muted">草案只留在当前页面。人工确认前不会写入分镜表。</p><button class="quiet" :class="actionClass('storyboard-ai')" :disabled="saving" @click="runSkill('STORYBOARD_BATCH')"><span v-if="actionPhase('storyboard-ai')==='WORKING'" class="button-spinner" aria-hidden="true"></span>{{ actionLabel('storyboard-ai','AI 生成批量草案') }}</button>
            <div v-for="(shot,i) in shotDrafts" :key="shot.localId" class="shot-draft"><div class="field-row"><label>镜头 {{ i+1 }} · 时长（秒）<input v-model.number="shot.duration" type="number" min="0.1" step="0.1" /></label><label>图片生产方式<select v-model="shot.productionMode"><option value="AI_TEXT_TO_IMAGE">文字生成画面</option><option value="REAL_ASSET_DIRECT">直接使用真实素材</option><option value="REAL_AI_COMPOSITE">背景与真实素材合成</option></select></label></div><label>画面意图<textarea v-model="shot.prompt" rows="3" /></label><label>动作 / 视频说明<textarea v-model="shot.videoDesc" rows="2" /></label><div class="field-row"><label>素材身份 ID（逗号分隔）<input v-model="shot.canonicalKeys" placeholder="CHAR-001, LOC-001" /></label><label>主素材 ID<input v-model="shot.primaryKey" placeholder="可选，例如 UI-001" /></label></div><button class="quiet" @click="shotDrafts.splice(i,1)">移除此草案</button></div>
            <div class="toolbar"><button class="quiet" @click="addShot">＋ 新增一镜</button><button class="primary" :class="actionClass('shot-preview')" :disabled="saving || !shotDrafts.length" @click="previewShots"><span v-if="actionPhase('shot-preview')==='WORKING'" class="button-spinner" aria-hidden="true"></span>{{ actionLabel('shot-preview','解析素材并预览分镜影响') }}</button></div>
          </section>
          <div v-if="revision.state.draft" class="preview"><h2>受控分镜修订</h2><p v-if="revision.state.error" class="error">{{ revision.state.error }}</p><p>状态：{{ revision.state.status }} · {{ revision.state.mode }}</p><template v-if="revision.state.preview"><p>拟议镜头 {{ revision.state.preview.proposedSemantic?.length }} 个；工序影响如下：</p><pre>{{ JSON.stringify(revision.state.preview.stageTransitions,null,2) }}</pre><h3>现有产物影响</h3><pre>{{ JSON.stringify(revision.state.preview.outputImpact,null,2) }}</pre><label>人工确认原因<textarea v-model="revision.state.humanReason" rows="2" /></label><button class="primary" :class="actionClass('shot-apply')" :disabled="saving || !revision.state.humanReason.trim() || revision.state.status!=='PREVIEWED'" @click="confirmShots"><span v-if="actionPhase('shot-apply')==='WORKING'" class="button-spinner" aria-hidden="true"></span>{{ actionLabel('shot-apply','确认并应用受控修订') }}</button></template><button class="quiet" @click="revision.discard()">丢弃草案</button></div>
          <div class="handoff"><h2>受控生产工作台</h2><p>完成分镜后继续按 Stage 与 Supervisor 审核，再生成图片、视频候选和进入剪辑。</p><button class="primary" @click="openProduction">进入图片 / 视频 / 剪辑</button></div>
        </template>
        <template v-else-if="tab === 'video' || tab === 'edit'">
          <p class="intro">视频继续走现有 Candidate → 人工审看 → Accept；剪辑导出仍由服务器验证已接受素材。</p><div class="handoff"><h2>{{ tab==='video'?'受控视频生产':'剪辑与导出' }}</h2><p>当前实验工作台保留项目 Agent 记忆，生产状态以现有系统为准。</p><button class="primary" @click="openProduction">打开现有 Production 工作台</button></div>
        </template>
      </main>
      <ProjectAgentPanel :key="state.project.id" :project-id="state.project.id" :script-id="state.creative.scriptId" :stage="tab" :route-name="`pilot/${tab}`" :selected="selected" :creative-mode="tab==='creative'" @creative-candidate="onCreativeCandidate" @production-asset-applied="reload" />
    </div>
  </div>
</template>
<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import axios from "@/utils/axios";
import projectStore from "@/stores/project";
import { selectAdvertisementUnit } from "@/utils/advertisementUnit";
import ProjectAgentPanel from "./ProjectAgentPanel.vue";
import AssetProposalReview from "./AssetProposalReview.vue";
import { handoffToProjectPage, type PilotHandoffTarget } from "./projectHandoff";
import { appendCandidateForRequirement, assetCoveragePayload, prepareAssetExtractionProposal } from "./skillProposal";
import { beginPilotAction, settlePilotAction, type PilotActionFeedback } from "./pilotActionFeedback";
import { useStoryboardRevision } from "@/views/production/revision/coordinator";
const router = useRouter();
const categories = ["CHAR","ACC","PROP","PRODUCT","LOC","BRAND","UI","FX"];
const assetKinds = ["HUMAN_CHARACTER","CREATURE","VEHICLE","PROP","ENVIRONMENT","MATERIAL_FX","CELESTIAL","BRAND_MARK","UI_REFERENCE","OTHER"];
const assetKindLabel = (kind:string) => ({HUMAN_CHARACTER:"人物",CREATURE:"生物",VEHICLE:"载具",PROP:"道具",ENVIRONMENT:"场景",MATERIAL_FX:"FX / 材质",CELESTIAL:"天体 / 目标",BRAND_MARK:"品牌标识",UI_REFERENCE:"界面参考",OTHER:"其他"} as Record<string,string>)[kind] || kind;
const tabs = [{key:"overview",label:"概览"},{key:"creative",label:"创意"},{key:"assets",label:"素材圣经"},{key:"storyboard",label:"分镜"},{key:"video",label:"视频"},{key:"edit",label:"剪辑"}];
const tab = ref("creative"), state = ref<any>(null), projects = ref<any[]>([]), status = ref("已同步"), saving = ref(false), error = ref("");
const actionFeedback = reactive<PilotActionFeedback>({ key: "", phase: "IDLE", message: "" });
let feedbackTimer: ReturnType<typeof setTimeout> | undefined;
let feedbackGeneration = 0;
function startAction(key: string, message: string) {
  if (saving.value || !beginPilotAction(actionFeedback, key, message)) return false;
  clearTimeout(feedbackTimer);
  feedbackGeneration++;
  saving.value = true;
  error.value = "";
  return true;
}
function finishAction(key: string, succeeded: boolean, message: string) {
  if (!settlePilotAction(actionFeedback, key, succeeded ? "SUCCESS" : "FAILURE", message)) return;
  if (succeeded) {
    const generation = feedbackGeneration;
    feedbackTimer = setTimeout(() => {
      if (feedbackGeneration === generation && actionFeedback.key === key && actionFeedback.phase === "SUCCESS")
        Object.assign(actionFeedback, { key: "", phase: "IDLE", message: "" });
    }, 1800);
  }
}
function actionPhase(key: string) { return actionFeedback.key === key ? actionFeedback.phase : "IDLE"; }
function actionLabel(key: string, normal: string) { return actionFeedback.key === key && actionFeedback.phase !== "IDLE" ? actionFeedback.message : normal; }
function actionClass(key: string) { return { "action-working": actionPhase(key) === "WORKING", "action-success": actionPhase(key) === "SUCCESS", "action-failure": actionPhase(key) === "FAILURE" }; }
const selected = ref<{type:"ASSET"|"SHOT"|"PROJECT";key:string}|null>(null);
const newProject = reactive({name:"",brief:"",targetDuration:30,aspectRatio:"16:9"});
const creativeDraft = reactive({brief:"",treatment:"",script:"",targetDuration:30});
const creativeEditing = ref(false), creativeCandidateReason = ref("");
const creativeFields = [{key:"brief",label:"Creative Brief"},{key:"treatment",label:"Treatment / 创意展开"},{key:"script",label:"Script / 旁白与结构"}] as const;
const creativePreview = ref<any>(null), assetPreview = ref<any>(null), assetChanges = ref<any[]>([]), assetDraft = ref<any>(null), resolved = ref<any>(null), assetSourceVersion = ref<number|null>(null), skillMergeSuggestions = ref<{name:string;existingCanonicalKey:string;reason:string}[]>([]), skillCoverage = ref<any[]>([]), skillSufficiency = ref<any>(null);
const skillRelationStatus = ref<"READY" | "NEEDS_REVIEW">("READY");
const anchorsText = ref(""), preserveText = ref(""), forbiddenText = ref(""), ownerText = ref(""), variantText = ref(""), relatedText = ref(""), visualSystemText = ref("");
const resolveText = ref(""), decisionText = ref("");
const revision = useStoryboardRevision();
const shotDrafts = ref<any[]>([]);
let unitGeneration = 0;
const tabLabel = computed(() => tabs.find(x=>x.key===tab.value)?.label || "");
const heading = computed(() => ({overview:"项目概览",creative:"创意工作台",assets:"素材圣经",storyboard:"分镜",video:"视频候选",edit:"剪辑"} as any)[tab.value]);
const planFor = (key:string) => state.value?.assetPlan?.find((item:any)=>item.assetKey===key);
const planStatus = (key:string) => ({UNBOUND:"未绑定",SOURCE_INVALID:"来源不符合",INCOMPLETE:"未完成",READY:"已准备"} as Record<string,string>)[planFor(key)?.status] || "尚未加入本单元清单";
const reviewFor = (key:string) => state.value?.reviewPlans?.find((item:any)=>item.canonicalKey===key);
const reviewLabel = (status:string) => ({PLANNED:"已列入计划，尚无图片",OPTIONAL:"可手动列入计划",NOT_APPLICABLE:"不适用",REFERENCE_REQUIRED:"只用真实参考，不做 AI 重绘",READY:"已生成",UNPLANNED:"尚未规划"} as Record<string,string>)[status] || status;
const assetGroups = computed(() => [
  {title:"主体资产",items:state.value?.assets?.filter((a:any)=>a.status==='ACTIVE' && !['LOC','FX'].includes(a.category) && !['ENVIRONMENT','MATERIAL_FX','CELESTIAL'].includes(a.assetKind)) || []},
  {title:"场景资产",items:state.value?.assets?.filter((a:any)=>a.status==='ACTIVE' && (a.category==='LOC' || ['ENVIRONMENT','CELESTIAL'].includes(a.assetKind))) || []},
  {title:"视觉系统",items:state.value?.assets?.filter((a:any)=>a.status==='ACTIVE' && (a.category==='FX' || a.assetKind==='MATERIAL_FX')) || []},
]);
const relationshipAssets = computed(() => state.value?.assets?.filter((a:any)=>a.status==='ACTIVE' && (a.ownerKey || a.variantOf || a.sharedVisualSystemKey || a.relatedKeys?.length)) || []);
const coverageGroups = ["PERSON","CREATURE","VEHICLE","SCENE","FX_MATERIAL","BRAND","COMPOSITION_GOAL"];
const coverageLabel = (type:string) => ({PERSON:"人物",CREATURE:"生物",VEHICLE:"载具",SCENE:"场景",FX_MATERIAL:"FX / 材质",BRAND:"品牌",COMPOSITION_GOAL:"关键构图 / 目标",PROP:"道具",OTHER:"其他"} as Record<string,string>)[type] || type;
const coverageWarnings = computed(() => state.value?.coverage?.items?.filter((item:any)=>item.status==='UNCOVERED') || []);
const api = async (path:string, body:object) => { const response:any = await axios.post(`/v04${path}`,body); return response.data; };
function fail(e:any){ error.value=e?.message || "请求失败，请检查服务状态"; saving.value=false; }
async function loadProjects(){ try{ projects.value=await api("/projects",{}); }catch(e){fail(e);} }
async function open(projectId:number,scriptId:number){ saving.value=true;error.value="";try{const switched=!state.value || state.value.project.id!==projectId || state.value.creative.scriptId!==scriptId;const next=await api("/project/read",{projectId,scriptId});state.value=next;Object.assign(creativeDraft,{brief:next.creative.brief,treatment:next.creative.treatment,script:next.creative.script,targetDuration:next.creative.targetDuration});creativePreview.value=null;assetPreview.value=null;status.value="已同步";sessionStorage.setItem("v04PilotScope",JSON.stringify({projectId,scriptId}));if(switched){unitGeneration++;feedbackGeneration++;Object.assign(actionFeedback,{key:"",phase:"IDLE",message:""});shotDrafts.value=[];assetChanges.value=[];skillMergeSuggestions.value=[];skillCoverage.value=[];skillSufficiency.value=null;skillRelationStatus.value="READY";assetSourceVersion.value=null;selected.value=null;assetDraft.value=null;}const generation=unitGeneration;revision.bind({current:()=>({projectId,scriptId,generation:unitGeneration}),isCurrent:(candidate)=>!!candidate && !!state.value && candidate.projectId===state.value.project.id && candidate.scriptId===state.value.creative.scriptId && candidate.generation===unitGeneration,invalidate:()=>{unitGeneration++;},refresh:reload});revision.setScope({projectId,scriptId,generation});}catch(e){fail(e);}finally{saving.value=false;} }
async function reload(){if(state.value)await open(state.value.project.id,state.value.creative.scriptId);}
async function createProject(){saving.value=true;error.value="";try{const created=await api("/project/create",{...newProject});await open(created.projectId,created.scriptId);tab.value="creative";}catch(e){fail(e);}finally{saving.value=false;}}
function scope(){return{projectId:state.value.project.id,scriptId:state.value.creative.scriptId};}
function unitToken(){return{...scope(),generation:unitGeneration};}
function isCurrentUnit(token:{projectId:number;scriptId:number;generation:number}){return unitGeneration===token.generation && state.value?.project.id===token.projectId && state.value?.creative.scriptId===token.scriptId;}
async function previewCreative(){const key="creative-preview";if(!startAction(key,"正在预览…"))return;try{creativePreview.value=await api("/creative/preview",{...scope(),...creativeDraft,expectedVersion:state.value.creative.version});finishAction(key,true,"预览已就绪");}catch(e){fail(e);finishAction(key,false,"预览失败 · 重试");}finally{saving.value=false;}}
async function applyCreative(){const key="creative-apply";if(!startAction(key,"正在确认…"))return;try{await api("/creative/apply",{...scope(),...creativeDraft,expectedVersion:state.value.creative.version,previewHash:creativePreview.value.previewHash});await reload();creativeEditing.value=false;creativeCandidateReason.value="";finishAction(key,true,"已确认保存");}catch(e){fail(e);finishAction(key,false,"确认失败 · 重试");}finally{saving.value=false;}}
async function onCreativeCandidate(proposal:{target:"brief"|"treatment"|"script";sourceVersion:number;candidate:{proposedText:string;reason:string;proposedTargetDuration:number|null}}){
  if (!state.value || state.value.creative.version !== proposal.sourceVersion) { error.value="创意内容已变化，请让 Agent 重新生成提案"; return; }
  creativeDraft[proposal.target]=proposal.candidate.proposedText;creativeDraft.targetDuration=proposal.candidate.proposedTargetDuration ?? state.value.creative.targetDuration;creativeCandidateReason.value=proposal.candidate.reason;creativeEditing.value=true;creativePreview.value=null;
  await previewCreative();
}
function beginAsset(){selected.value=null;assetDraft.value={name:"",category:"CHAR",assetKind:"HUMAN_CHARACTER",importance:"SUPPORTING",description:"",sourcePolicy:"AI_ALLOWED",prompt:""};anchorsText.value=preserveText.value=forbiddenText.value=ownerText.value=variantText.value=relatedText.value=visualSystemText.value="";assetPreview.value=null;}
function selectAsset(a:any){selected.value={type:"ASSET",key:a.canonicalKey};assetDraft.value={name:a.name,category:a.category,assetKind:a.assetKind,importance:a.importance,description:a.description,sourcePolicy:a.sourcePolicy,prompt:a.prompt};anchorsText.value=a.identityAnchors.join("\n");preserveText.value=a.mustPreserve.join("\n");forbiddenText.value=a.forbiddenChanges.join("\n");ownerText.value=a.ownerKey || "";variantText.value=a.variantOf || "";relatedText.value=(a.relatedKeys || []).join(", ");visualSystemText.value=a.sharedVisualSystemKey || "";assetPreview.value=null;}
const lines=(v:string)=>v.split("\n").map(x=>x.trim()).filter(Boolean);
function buildAsset(){return {...assetDraft.value,identityAnchors:lines(anchorsText.value),mustPreserve:lines(preserveText.value),forbiddenChanges:lines(forbiddenText.value),ownerKey:ownerText.value.trim()||null,variantOf:variantText.value.trim()||null,relatedKeys:relatedText.value.split(',').map(x=>x.trim()).filter(Boolean),sharedVisualSystemKey:visualSystemText.value.trim()||null};}
async function previewAsset(){const a=buildAsset();assetSourceVersion.value=null;skillCoverage.value=[];skillSufficiency.value=null;skillRelationStatus.value="READY";assetChanges.value=selected.value?[{operation:"EDIT",canonicalKey:selected.value.key,expectedRevision:state.value.assets.find((x:any)=>x.canonicalKey===selected.value?.key).revision,patch:a}]:[{operation:"ADD",clientRef:`asset_${Date.now()}`,asset:a}];await previewAssetChanges();}
async function retireAsset(){if(!selected.value)return;assetChanges.value=[{operation:"RETIRE",canonicalKey:selected.value.key,expectedRevision:state.value.assets.find((x:any)=>x.canonicalKey===selected.value?.key).revision}];await previewAssetChanges();}
function addCandidateToProposal(requirementKey:string|null){
  const requirement=requirementKey===null?null:skillSufficiency.value?.requirements?.find((item:any)=>item.requirementKey===requirementKey);
  if(requirementKey!==null&&!requirement)return;
  const pending=appendCandidateForRequirement(assetChanges.value,skillCoverage.value,requirement,`manual_${crypto.randomUUID()}`);
  assetChanges.value=pending.changes;skillCoverage.value=pending.coverage;
  assetPreview.value=null;
}
function discardAssetProposal(){assetChanges.value=[];skillCoverage.value=[];skillSufficiency.value=null;skillRelationStatus.value="READY";skillMergeSuggestions.value=[];assetSourceVersion.value=null;assetPreview.value=null;}
async function previewAssetChanges(){const key="asset-preview";if(!startAction(key,"正在预览…"))return;const token=unitToken();try{const preview=await api("/assets/preview",{projectId:token.projectId,scriptId:token.scriptId,changes:assetChanges.value,...(skillCoverage.value.length?{coverage:assetCoveragePayload(skillCoverage.value)}:{}),...(assetSourceVersion.value===null?{}:{sourceCreativeVersion:assetSourceVersion.value})});if(isCurrentUnit(token)){assetPreview.value=preview;finishAction(key,true,"预览已就绪");}}catch(e){if(isCurrentUnit(token)){fail(e);finishAction(key,false,"预览失败 · 重试");}}finally{saving.value=false;}}
async function applyAsset(){const key="asset-apply";if(!startAction(key,"正在应用…"))return;const token=unitToken();const body={projectId:token.projectId,scriptId:token.scriptId,changes:assetChanges.value,previewHash:assetPreview.value.previewHash,...(skillCoverage.value.length?{coverage:assetCoveragePayload(skillCoverage.value)}:{}),...(assetSourceVersion.value===null?{}:{sourceCreativeVersion:assetSourceVersion.value})};try{await api("/assets/apply",body);if(!isCurrentUnit(token))return;selected.value=null;assetDraft.value=null;assetChanges.value=[];skillCoverage.value=[];skillSufficiency.value=null;skillRelationStatus.value="READY";assetPreview.value=null;assetSourceVersion.value=null;skillMergeSuggestions.value=[];await reload();finishAction(key,true,"已确认应用");}catch(e){if(isCurrentUnit(token)){fail(e);finishAction(key,false,"应用失败 · 重试");}}finally{saving.value=false;}}
async function planTurnaround(){if(!selected.value)return;const key="turnaround";if(!startAction(key,"正在规划…"))return;const token=unitToken(),canonicalKey=selected.value.key;try{await api("/assets/turnaround/plan",{projectId:token.projectId,scriptId:token.scriptId,canonicalKey});if(isCurrentUnit(token)){await reload();finishAction(key,true,"已加入计划");}}catch(e){if(isCurrentUnit(token)){fail(e);finishAction(key,false,"规划失败 · 重试");}}finally{saving.value=false;}}
async function resolve(){error.value="";try{resolved.value=await api("/assets/resolve",{...scope(),canonicalKeys:resolveText.value.split(',').map(x=>x.trim()).filter(Boolean)});}catch(e){fail(e);}}
async function runSkill(method:"ASSET_EXTRACTION"|"ASSET_PROMPTS"|"STORYBOARD_BATCH"){
  if(saving.value)return;
  if(!window.confirm("此操作会调用项目中配置的文本模型，可能产生费用。仅生成提案，不自动应用。继续吗？"))return;
  const key=method==="ASSET_EXTRACTION"?"extract":method==="STORYBOARD_BATCH"?"storyboard-ai":"asset-prompts";
  if(!startAction(key,method==="ASSET_EXTRACTION"?"AI 提取中…":method==="STORYBOARD_BATCH"?"AI 规划分镜中…":"AI 编写 Prompt 中…"))return;
  const token=unitToken();
  try{
    const result=await api("/skills/preview",{projectId:token.projectId,scriptId:token.scriptId,method});
    if(!isCurrentUnit(token))return;
    if(method==="ASSET_EXTRACTION"){
      assetSourceVersion.value=result.sourceVersion;
      const proposal=prepareAssetExtractionProposal(result.output,Date.now(),result.sufficiency?.requirements || []);
      skillMergeSuggestions.value=proposal.mergeSuggestions;
      assetChanges.value=proposal.changes;
      skillCoverage.value=proposal.coverage;
      skillSufficiency.value=result.sufficiency || null;
      skillRelationStatus.value=result.relationStatus || "READY";
      assetPreview.value=null;
    }else if(method==="ASSET_PROMPTS"){
      assetSourceVersion.value=result.sourceVersion;skillMergeSuggestions.value=[];skillCoverage.value=[];skillSufficiency.value=null;skillRelationStatus.value="READY";
      assetChanges.value=result.output.prompts.map((item:any)=>({operation:"EDIT",canonicalKey:item.canonicalKey,expectedRevision:state.value.assets.find((a:any)=>a.canonicalKey===item.canonicalKey)?.revision,patch:{prompt:item.prompt}}));assetPreview.value=null;
    }else{
      shotDrafts.value=result.output.shots.map((shot:any)=>({...shot,localId:crypto.randomUUID(),canonicalKeys:shot.canonicalKeys.join(', '),primaryKey:shot.primaryKey||''}));tab.value='storyboard';
    }
    status.value=`${result.skillId} · 待人工确认`;
    finishAction(key,true,"提案已就绪");
  }catch(e:any){
    if(!isCurrentUnit(token))return;
    if(typeof e?.code==="string" && e.code.startsWith("PILOT_SKILL_"))error.value=`${e.message} · 错误代码：${e.code.slice("PILOT_".length)}`;
    else fail(e);
    finishAction(key,false,"提取失败 · 重试");
  }finally{saving.value=false;}
}
function addShot(){shotDrafts.value.push({localId:crypto.randomUUID(),duration:3,productionMode:"AI_TEXT_TO_IMAGE",prompt:"",videoDesc:"",canonicalKeys:"",primaryKey:""});}
async function previewShots(){const key="shot-preview";if(!startAction(key,"正在预览分镜…"))return;try{const allKeys=[...new Set(shotDrafts.value.flatMap(s=>[...s.canonicalKeys.split(',').map((k:string)=>k.trim()).filter(Boolean),...(s.primaryKey.trim()?[s.primaryKey.trim()]:[])]))] as string[];const resolved=allKeys.length?await api("/assets/resolve",{...scope(),canonicalKeys:allKeys}):{resolved:[]};const ids=new Map(resolved.resolved.map((x:any)=>[x.canonicalKey,x.assetId]));const operations=shotDrafts.value.map((shot,i)=>{const keys=[...new Set(shot.canonicalKeys.split(',').map((k:string)=>k.trim()).filter(Boolean))] as string[];const linkedAssetIds=keys.map(k=>Number(ids.get(k)));const primaryAssetId=shot.primaryKey.trim()?Number(ids.get(shot.primaryKey.trim())):null;return{type:"ADD" as const,clientRef:`shot_${i}_${shot.localId.replaceAll('-','')}`,storyboard:{track:null,duration:Number(shot.duration),prompt:shot.prompt,videoDesc:shot.videoDesc,productionMode:shot.productionMode,primaryAssetId,referenceAssetIds:[],referenceAssetGroupIds:[],linkedAssetIds}};});revision.open("PILOT_BATCH",operations);await revision.previewDraft();if(revision.state.status==="PREVIEWED")finishAction(key,true,"预览已就绪");else finishAction(key,false,"预览失败 · 重试");}catch(e){fail(e);finishAction(key,false,"预览失败 · 重试");}finally{saving.value=false;}}
async function confirmShots(){const key="shot-apply";if(!startAction(key,"正在确认分镜…"))return;try{await revision.confirm();if(revision.state.status==="APPLIED"){shotDrafts.value=[];finishAction(key,true,"分镜已应用");}else finishAction(key,false,"确认失败 · 重试");}catch(e){fail(e);finishAction(key,false,"确认失败 · 重试");}finally{saving.value=false;}}
async function proposeDecision(){error.value="";try{await api("/decision/propose",{...scope(),category:"CREATIVE_DIRECTION",subjectType:null,subjectKey:null,content:decisionText.value.trim(),sourceMessageIds:[]});decisionText.value="";await reload();}catch(e){fail(e);}}
async function setDecision(decisionId:string,status:"ACCEPTED"|"REJECTED"){try{await api("/decision/decide",{...scope(),decisionId,status});await reload();}catch(e){fail(e);}}
const decisionStatus=(v:string)=>({PROPOSED:"待决定",ACCEPTED:"已接受",REJECTED:"已否决",SUPERSEDED:"已替代"} as any)[v]||v;
async function handoff(target:PilotHandoffTarget){
  if (!state.value || saving.value) return;
  saving.value=true;error.value="";
  try {
    await handoffToProjectPage(state.value.project.id,state.value.creative.scriptId,target,{
      post:(path,body)=>axios.post(path,body),
      setProject:project=>{projectStore().project=project;},
      selectUnit:selectAdvertisementUnit,
      navigate:path=>router.push(path),
    });
  } catch(e:any) {
    error.value=`无法打开${target==="assets"?"广告资产准备":"Production 工作台"}：${e?.response?.data?.message || e?.message || "请检查服务后重试"}`;
  } finally {saving.value=false;}
}
function openProduction(){return handoff("production");}
function openAssetPreparation(){return handoff("assets");}
onMounted(async()=>{await loadProjects();const raw=sessionStorage.getItem("v04PilotScope");if(raw){try{const s=JSON.parse(raw);await open(Number(s.projectId),Number(s.scriptId));}catch{sessionStorage.removeItem("v04PilotScope");}}});
</script>
<style scoped>
.pilot{height:100vh;display:flex;flex-direction:column;background:var(--td-bg-color-page);color:var(--td-text-color-primary);font-family:Inter,"Segoe UI",sans-serif}.topbar{height:3.7rem;display:grid;grid-template-columns:16rem 1fr auto;align-items:center;gap:1rem;padding:0 1.3rem;border-bottom:1px solid var(--td-component-border);background:var(--td-bg-color-container)}.brand{font-weight:720;letter-spacing:-.035em}.brand span{font-size:.7rem;color:var(--td-text-color-secondary);font-weight:500;margin-left:.45rem}.project-title{font-weight:600}.project-title small,.top-actions{color:var(--td-text-color-secondary);font-size:.78rem}.top-actions{display:flex;gap:.8rem;align-items:center}.workspace{display:grid;grid-template-columns:10.5rem minmax(25rem,1fr) 21rem;flex:1;min-height:0}.nav{border-right:1px solid var(--td-component-border);padding:1rem .55rem;display:flex;flex-direction:column;gap:.15rem;background:var(--td-bg-color-container)}.nav button{border:0;background:transparent;color:var(--td-text-color-secondary);text-align:left;padding:.7rem .9rem;border-radius:.4rem;cursor:pointer;font:inherit}.nav button:hover,.nav button.active{background:var(--td-bg-color-secondarycontainer);color:var(--td-text-color-primary)}.nav button.active{font-weight:650}.nav-foot{margin-top:auto;display:grid}.nav-foot small{padding:.5rem .9rem;color:var(--td-text-color-placeholder);font-size:.7rem}.content{overflow-y:auto;min-width:0;padding:2.2rem clamp(1.5rem,4vw,4.5rem) 5rem}.heading{display:flex;align-items:end;justify-content:space-between;gap:1rem;margin-bottom:1.3rem}.eyebrow{text-transform:uppercase;letter-spacing:.12em;font-size:.7rem;color:var(--td-brand-color);font-weight:700;margin:0 0 .45rem}h1{font-size:2rem;letter-spacing:-.045em;margin:0;font-weight:680}h2{font-size:1.06rem;margin:0 0 1rem}h3{font-size:.83rem;margin:1.4rem 0 .6rem}.context-id{color:var(--td-text-color-placeholder);font-size:.7rem}.intro{max-width:46rem;line-height:1.65;color:var(--td-text-color-secondary);margin:0 0 2rem}.muted,.fineprint{color:var(--td-text-color-secondary);font-size:.83rem;line-height:1.5}.error{color:var(--td-error-color);padding:.65rem;border:1px solid var(--td-error-color);border-radius:.4rem;margin-bottom:1rem}button{cursor:pointer;font:inherit}.primary{border:0;background:var(--td-brand-color);color:#fff;padding:.68rem 1rem;border-radius:.4rem;font-weight:600}.primary:disabled{opacity:.45}.quiet{border:1px solid var(--td-component-border);background:var(--td-bg-color-container);color:var(--td-text-color-primary);border-radius:.4rem;padding:.6rem .8rem}.toolbar{display:flex;align-items:center;gap:.8rem;margin:1rem 0;color:var(--td-text-color-secondary);font-size:.8rem}label{display:block;font-size:.79rem;font-weight:600;margin:0 0 1.05rem}input,textarea,select{display:block;box-sizing:border-box;width:100%;margin-top:.45rem;border:1px solid var(--td-component-border);background:var(--td-bg-color-container);color:var(--td-text-color-primary);padding:.65rem .75rem;border-radius:.4rem;font:inherit;font-weight:400;resize:vertical}input:focus,textarea:focus{outline:2px solid var(--td-brand-color);outline-offset:1px}.field-row{display:grid;grid-template-columns:1fr 1fr;gap:1rem}.editor{max-width:48rem}.preview{margin-top:1.4rem;border-top:1px solid var(--td-component-border);padding-top:1.5rem}.preview pre{white-space:pre-wrap;overflow-wrap:anywhere;background:var(--td-bg-color-secondarycontainer);padding:1rem;border-radius:.4rem;font-size:.82rem}.diff{display:grid;grid-template-columns:1fr 1fr;gap:.7rem}.diff pre{min-height:3rem}.asset-layout{display:grid;grid-template-columns:12rem minmax(18rem,1fr);gap:2rem}.asset-list{display:flex;flex-direction:column;gap:.25rem}.asset-list button{display:grid;grid-template-columns:1fr auto;text-align:left;border:1px solid transparent;background:transparent;color:var(--td-text-color-primary);padding:.7rem;border-radius:.4rem}.asset-list button:hover,.asset-list button.chosen{background:var(--td-bg-color-secondarycontainer);border-color:var(--td-component-border)}.asset-list button strong{font-size:.76rem}.asset-list button span{grid-column:1/3;margin-top:.25rem}.asset-list button small{color:var(--td-text-color-secondary);font-size:.68rem}.asset-list .add-asset{color:var(--td-brand-color);border:1px dashed var(--td-component-border);margin-top:.5rem}.asset-detail{max-width:39rem}.asset-empty{color:var(--td-text-color-secondary);padding:2rem 0}.overview-list{max-width:43rem;border-top:1px solid var(--td-component-border)}.overview-list button,.project-row{display:flex;justify-content:space-between;width:100%;border:0;border-bottom:1px solid var(--td-component-border);background:none;color:var(--td-text-color-primary);padding:1rem 0;text-align:left}.overview-list span,.project-row span{color:var(--td-text-color-secondary)}.subsection{max-width:43rem;margin-top:3rem}.decision-form{display:flex;gap:.5rem}.decision-form input{margin:0}.decision-form button,.resolver button{white-space:nowrap;border:1px solid var(--td-component-border);background:var(--td-bg-color-container);color:var(--td-text-color-primary);border-radius:.4rem;padding:.5rem}.decision{display:flex;align-items:center;gap:.6rem;border-bottom:1px solid var(--td-component-border)}.decision p{flex:1}.decision span{font-size:.75rem;color:var(--td-text-color-secondary)}.decision .ACCEPTED{color:var(--td-success-color)}.decision .REJECTED{color:var(--td-error-color)}.decision button{border:0;background:transparent;color:var(--td-brand-color)}.resolver,.handoff{max-width:40rem;border-top:1px solid var(--td-component-border);padding-top:1.5rem;margin-top:2rem}.resolver button{margin-top:.6rem}.welcome{display:grid;grid-template-columns:minmax(15rem,1fr) minmax(20rem,26rem);gap:4rem;max-width:75rem;width:calc(100% - 5rem);margin:8vh auto}.welcome-copy h1{font-size:clamp(2.4rem,5vw,4.2rem);line-height:1.12;max-width:10em}.welcome-copy>p:last-child{color:var(--td-text-color-secondary);font-size:1.05rem;line-height:1.7;max-width:31rem}.welcome-form{border:1px solid var(--td-component-border);background:var(--td-bg-color-container);padding:1.6rem;border-radius:.65rem}.welcome-form h3{border-top:1px solid var(--td-component-border);padding-top:1rem}.welcome-form .primary{width:100%}@media(max-width:1000px){.workspace{grid-template-columns:8rem minmax(18rem,1fr) 17rem}.content{padding:1.5rem}}@media(max-width:700px){.workspace{grid-template-columns:5.5rem 1fr}.workspace :deep(.agent){grid-column:1/3;height:18rem;border-top:1px solid var(--td-component-border)}.nav button{font-size:.75rem;padding:.55rem}.welcome{display:block;margin:3rem auto}.welcome-form{margin-top:2rem}}
.shot-list{max-width:45rem;border-top:1px solid var(--td-component-border)}.shot-list button{display:grid;grid-template-columns:7rem 1fr auto;gap:.7rem;align-items:center;width:100%;padding:.85rem 0;border:0;border-bottom:1px solid var(--td-component-border);background:transparent;color:var(--td-text-color-primary);text-align:left}.shot-list strong{font-size:.76rem}.shot-list span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.shot-list small{font-size:.72rem;color:var(--td-text-color-secondary)}.shot-draft{max-width:43rem;padding:1rem 0 1.4rem;border-top:1px solid var(--td-component-border)}
.creative-truth{max-width:49rem;border-top:1px solid var(--td-component-border)}.creative-truth section{padding:1.2rem 0;border-bottom:1px solid var(--td-component-border)}.truth-heading{display:flex;align-items:baseline;justify-content:space-between;gap:1rem}.truth-heading h2{margin:0}.truth-heading small{font-size:.72rem;color:var(--td-text-color-secondary)}.creative-truth p{white-space:pre-wrap;line-height:1.7;margin:.75rem 0 0;color:var(--td-text-color-primary)}
.duration-preview{padding:.1rem .8rem .8rem;border:1px solid var(--td-component-border);border-radius:.4rem}.duration-preview.changed{border-color:var(--td-brand-color);background:var(--td-bg-color-secondarycontainer)}.duration-preview .diff p{margin:.2rem 0 .5rem;color:var(--td-text-color-secondary);font-size:.8rem}.duration-preview .diff strong{display:inline-block;margin-top:.35rem;color:var(--td-text-color-primary);font-size:1rem}
.workspace.assets-workspace{grid-template-columns:7.5rem minmax(17rem,21rem) minmax(37rem,1fr)}
.assets-workspace .nav{grid-column:1;grid-row:1}
.assets-workspace :deep(.agent){grid-column:2;grid-row:1;border-right:1px solid var(--td-component-border)}
.assets-workspace .content{grid-column:3;grid-row:1;padding:1.5rem 2rem 4rem}
.assets-workspace .asset-layout{grid-template-columns:minmax(14rem,18rem) minmax(20rem,1fr);gap:1.5rem}
.asset-group{border-top:1px solid var(--td-component-border);padding:.4rem 0 .6rem}
.asset-group h3{display:flex;justify-content:space-between;color:var(--td-text-color-secondary);margin:.3rem .7rem .6rem}
.asset-list button small{grid-column:1/3;line-height:1.45}
.review-section,.coverage-audit{border-top:1px solid var(--td-component-border);padding-top:1rem;margin-top:1.4rem}
.review-section img{display:block;max-width:100%;max-height:16rem;object-fit:contain}
.coverage-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(9rem,1fr));gap:.5rem}
.coverage-grid>div{display:flex;justify-content:space-between;border:1px solid var(--td-component-border);padding:.5rem .65rem;border-radius:.3rem;font-size:.77rem}
.coverage-grid span{color:var(--td-text-color-secondary)}
.coverage-warning{color:var(--td-warning-color);font-size:.83rem;line-height:1.5}
.coverage-draft{border-top:1px solid var(--td-component-border);margin:1rem 0;padding-top:.5rem}
@media(max-width:1100px){.workspace.assets-workspace{grid-template-columns:6rem minmax(15rem,19rem) minmax(22rem,1fr)}.assets-workspace .asset-layout{grid-template-columns:1fr}.assets-workspace .content{padding:1rem}}
@media(max-width:700px){.workspace.assets-workspace{display:flex;flex-direction:column}.assets-workspace .nav{flex-direction:row;overflow-x:auto}.assets-workspace .content{order:2}.assets-workspace :deep(.agent){order:3;min-height:18rem}}
button.quiet,button.primary{transition:transform .12s ease,box-shadow .12s ease,filter .12s ease,background-color .12s ease}
button.quiet:hover:not(:disabled),button.primary:hover:not(:disabled){filter:brightness(1.08);box-shadow:0 0 0 1px var(--td-brand-color)}
button.quiet:active:not(:disabled),button.primary:active:not(:disabled){transform:translateY(2px);box-shadow:inset 0 2px 4px rgba(0,0,0,.2)}
button.action-working,button.action-working:disabled{opacity:1;background:var(--td-bg-color-secondarycontainer);color:var(--td-brand-color);border:1px solid var(--td-brand-color);cursor:wait}
button.action-success,button.action-success:disabled{opacity:1;color:var(--td-success-color);border:1px solid var(--td-success-color);background:var(--td-bg-color-container)}
button.action-failure,button.action-failure:disabled{opacity:1;color:var(--td-error-color);border:1px solid var(--td-error-color);background:var(--td-bg-color-container)}
.button-spinner{display:inline-block;width:.75em;height:.75em;margin-right:.45em;vertical-align:-.06em;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:pilot-button-spin .8s linear infinite}
@keyframes pilot-button-spin{to{transform:rotate(360deg)}}
</style>
