<template>
  <div class="studio">
    <header class="studio-header">
      <div class="wordmark">Dream Stream <span>Studio</span></div>
      <div class="header-actions"><button v-if="state" @click="refresh">刷新项目</button><button v-if="state" @click="goProfessional()">专业模式 ↗</button></div>
    </header>
    <div v-if="!state" class="welcome">
      <p class="eyebrow">你的数字制作团队，从一个想法开始</p><h1>这部片子，想讲什么？</h1>
      <p>先创建项目。创意、素材、分镜和 Agent 对话会持续属于同一个项目。</p>
      <div class="create"><input v-model="newProject.name" placeholder="项目名称" /><textarea v-model="newProject.brief" rows="3" placeholder="一句话描述你想拍的故事…" /><div><label>目标时长 <input v-model.number="newProject.targetDuration" type="number" min="1" max="600" /></label><label>画幅 <select v-model="newProject.aspectRatio"><option>16:9</option><option>9:16</option><option>1:1</option></select></label></div><button class="primary" :disabled="busy || !newProject.name.trim()" @click="createProject">创建项目</button></div>
      <p v-if="projects.length">继续项目</p><button v-for="project in projects" :key="project.projectId" class="project-choice" @click="open(project.projectId,project.scriptId)">{{ project.name }} <span>继续 →</span></button>
      <p v-if="error" class="error">{{ error }}</p>
    </div>
    <div v-else ref="studioGrid" class="studio-grid" :style="{ gridTemplateColumns: `${layout.mainSplitRatio}% 7px minmax(0,1fr)` }">
      <main ref="filmWorld" class="film-world" :style="{ gridTemplateRows: `${layout.leftVerticalSplitRatio}% 7px minmax(0,1fr)` }">
        <div class="film-scroll">
        <section class="film-heading"><p class="eyebrow">正在制作</p><h1>{{ state.project.name }}</h1><p class="meta">{{ state.creative.targetDuration }} 秒 · {{ state.creative.aspectRatio }} · {{ state.storyboards.length }} 镜</p><button class="text-button" @click="session.leave();loadProjects()">切换项目</button></section>
        <section class="narrative"><div class="section-heading"><h2>影片方向</h2><button @click="goProfessional()">专业编辑 ↗</button></div><p class="narrative-text">{{ summaryText }}</p><button class="text-button" @click="showFullCreative=!showFullCreative">{{ showFullCreative ? '收起完整创意' : '查看完整创意' }}</button><div v-if="showFullCreative" class="expanded"><h3>Brief</h3><p>{{ state.creative.brief || '尚未确认' }}</p><h3>Treatment</h3><p>{{ state.creative.treatment || '尚未确认' }}</p><h3>Script</h3><p>{{ state.creative.script || '尚未确认' }}</p></div></section>
        <section class="story-world"><div class="section-heading"><h2>分镜</h2><span>{{ state.storyboards.length }} 镜</span></div><div v-if="!state.storyboards.length" class="empty-story">尚未形成分镜。和 Project Agent 讨论画面，再在专业模式确认草案。</div><div class="shot-grid"><button v-for="(shot,index) in state.storyboards" :key="shot.id" class="shot-card" :class="{active:selected?.type==='SHOT'&&selected.key===String(shot.id)}" @click="selectShot(shot)"><div v-if="safeStudioImagePath(shot.filePath)" class="shot-image"><img :src="safeStudioImagePath(shot.filePath)!" :alt="`镜头 ${index+1}`" /></div><div v-else class="shot-placeholder">画面待制作</div><div class="shot-body"><small>镜头 {{ String(index+1).padStart(2,'0') }} · {{ shot.duration }} 秒</small><p>{{ shot.prompt || shot.videoDesc || '尚无画面描述' }}</p><span>{{ shot.state || '待规划' }}</span></div></button></div></section>
        </div>
        <div class="split-handle film-handle" role="separator" aria-label="调整影片与 Project Agent 高度" aria-orientation="horizontal" :aria-valuenow="Math.round(layout.leftVerticalSplitRatio)" tabindex="0" @pointerdown="verticalResize.pointerdown" @pointermove="verticalResize.pointermove" @pointerup="verticalResize.pointerup" @pointercancel="verticalResize.pointercancel" @keydown="verticalResize.keydown" @dblclick="verticalResize.reset" />
        <section class="agent-workspace">
          <div v-if="revision.state.draft" class="action-card"><h3>分镜修订预览</h3><p v-if="revision.state.error" class="error">{{ revision.state.error }}</p><p>状态：{{ revision.state.status }}</p><template v-if="revision.state.preview"><p>影响工序：{{ revision.state.preview.stageTransitions?.length || 0 }}；产物影响：{{ revision.state.preview.outputImpact?.length || 0 }}</p><label>本次修改原因<textarea v-model="revision.state.humanReason" rows="2" /></label><button class="primary" :disabled="busy || revision.state.status!=='PREVIEWED' || !revision.state.humanReason.trim()" @click="confirmShot">人工确认并应用</button></template><button @click="revision.discard()">丢弃草案</button></div>
          <div class="agent-panel"><ProjectAgentPanel :key="`${state.project.id}:${state.creative.scriptId}`" ref="agentPanel" :project-id="state.project.id" :script-id="state.creative.scriptId" stage="studio" route-name="studio" :selected="selected" :review-candidate-id="viewedCandidate?.canonicalKey===selected?.key ? viewedCandidate?.jobId : undefined" :scope-label="selectedLabel" :studio-mode="true" :creative-mode="true" :accept-studio-proposal="acceptAction" :asset-create-review="assetCreateReview" :confirm-asset-create="confirmAssetCreate" :cancel-asset-create="cancelAssetCreate" :retry-asset-draft="retryAssetDraft" @studio-professional="goProfessional" @creative-candidate="onCreativeCandidate" @production-asset-applied="refresh" /></div>
        </section>
      </main>
      <div class="split-handle main-handle" role="separator" aria-label="调整影片与素材世界宽度" aria-orientation="vertical" :aria-valuenow="Math.round(layout.mainSplitRatio)" tabindex="0" @pointerdown="mainResize.pointerdown" @pointermove="mainResize.pointermove" @pointerup="mainResize.pointerup" @pointercancel="mainResize.pointercancel" @keydown="mainResize.keydown" @dblclick="mainResize.reset" />
      <aside class="asset-world"><div class="world-intro"><p class="eyebrow">Asset World</p><h2>这部片子的视觉世界</h2><p>先看结果，再决定要改什么。真实品牌和界面始终使用已确认参考。</p><button class="primary" :disabled="busy" @click="prepareNext">{{ busy ? '正在准备…' : 'AI 准备下一阶段' }}</button>
        <button class="text-button" @click="goProfessional()">专业配置 ↗</button>
      </div>
        <section class="review-center"><div class="section-heading"><h2>需要你关注</h2><span>{{ reviewCounts.attention }} 项提醒</span></div><p v-if="draftSummary.processed || bulkStatus">已处理 {{ draftSummary.processed }} 项 · 等待图片 {{ draftSummary.waiting }} · 需要关注 {{ reviewCounts.attention }} · 失败 {{ draftSummary.failed }}</p><div v-if="workspace.current().assetProposal" class="review-boundary"><strong>素材身份候选已准备</strong><p>请审查覆盖和关系后，再人工确认。</p><button @click="goProfessionalTab('assets')">审查素材提案 ↗</button></div><div v-if="workspace.current().storyboardDrafts.length" class="review-boundary"><strong>{{ workspace.current().storyboardDrafts.length }} 镜分镜草案已准备</strong><p>镜头仍未写入正式分镜；需预览影响并人工确认。</p><button @click="goProfessionalTab('storyboard')">审查分镜草案 ↗</button></div><p v-if="!reviewCounts.attention">正常草案留在 Asset World；目前没有需要单独处理的异常。</p><div v-else class="review-items"><button v-for="entry in reviewEntries" :key="entry.key" @click="selectAssetByKey(entry.key)">{{ entry.name }} <span>{{ entry.reason }}</span></button></div><p v-if="bulkStatus">{{ bulkStatus }}</p></section>
        <section v-for="group in groupedAssets" :key="group.name" class="asset-group"><div class="section-heading"><h2>{{ group.name }}</h2><span>{{ group.items.length }}</span></div><div v-if="!group.items.length" class="group-empty">待建立</div><div class="asset-grid"><button v-for="item in group.items" :key="item.asset.canonicalKey" class="asset-card" :class="{active:selected?.type==='ASSET'&&selected.key===item.asset.canonicalKey}" @click="selectAsset(item)"><div class="asset-visual"><img v-if="imageFor(item)" :src="imageFor(item)!" :alt="item.asset.name" :class="assetPreviewFit(item.asset) === 'cover' ? 'asset-preview-cover' : 'asset-preview-contain'" /><span v-else>{{ item.placeholder }}</span></div><div class="asset-caption"><small>{{ item.kind }}</small><strong>{{ item.asset.name }}</strong><span>{{ item.status }}</span><em v-if="isRealReference(item.asset)">真实参考 · AI 不重绘</em></div></button></div></section>
      </aside>
    </div>
    <StudioAssetDrawer :item="drawer" :image-url="drawer ? imageFor(drawer) : null" :width="layout.assetDrawerWidth" @width-change="layout.assetDrawerWidth=$event" @close="drawer=null" @modify="focusAgent" @regenerate="regenerateSelected" @prepare-confirmed="prepareConfirmedSelected" @draft-image="enqueueSelectedDraft" @request-image="requestAgentImage" @select-purpose="selectReferencePurpose" @professional="goProfessional()" />
    <p v-if="error && state" class="global-error" role="alert">{{ error }} <button @click="error=''">关闭</button></p>
  </div>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useRoute, useRouter } from 'vue-router';
import axios from '@/utils/axios';
import { useV04ProjectSession } from '@/stores/v04ProjectSession';
import { useV04ProposalWorkspace } from '@/stores/v04ProposalWorkspace';
import { useStoryboardRevision } from '@/views/production/revision/coordinator';
import ProjectAgentPanel from './ProjectAgentPanel.vue';
import StudioAssetDrawer from './StudioAssetDrawer.vue';
import { isRealReference, safeStudioImagePath, studioAssets, assetPreviewFit } from './studioPresentation';
import { pendingVisualProposalKeys } from './visualProposalBatch';
import { freshStudioPackage, runStudioAssetDraftPipeline } from './studioAssetDraftPipeline';
import { classifyStudioDraftPackage, studioDraftReviewEntries, summarizeStudioDrafts } from './studioDraftDiagnostics';
import { currentDraftImageJob, currentDraftImageJobForPurpose, draftImageStatus } from './studioDraftImageView';
import { applyStudioAssetCreate, previewStudioAssetCreate, type StudioAssetCreateCardState } from './studioAssetCreateFlow';
import { defaultStudioLayout, mainBounds, readStudioLayout, saveStudioLayout, verticalBounds } from './studioLayout';
import { useResizablePane } from './useResizablePane';

const router=useRouter(), route=useRoute(), session=useV04ProjectSession(), workspace=useV04ProposalWorkspace(), revision=useStoryboardRevision();
const {state,projects,selected}=storeToRefs(session);
const viewedCandidate=ref<{canonicalKey:string;jobId:string}|null>(null);
const busy=ref(false),error=ref(''),drawer=ref<any>(null),showFullCreative=ref(false),bulkStatus=ref('');
const assetCreateReview=ref<StudioAssetCreateCardState|null>(null);
const agentPanel=ref<InstanceType<typeof ProjectAgentPanel> | null>(null);
const studioGrid=ref<HTMLElement|null>(null), filmWorld=ref<HTMLElement|null>(null);
const layout=reactive(readStudioLayout());
const mainRatio=computed({get:()=>layout.mainSplitRatio,set:value=>{layout.mainSplitRatio=value;}});
const verticalRatio=computed({get:()=>layout.leftVerticalSplitRatio,set:value=>{layout.leftVerticalSplitRatio=value;}});
const mainResize=useResizablePane({value:mainRatio,defaultValue:defaultStudioLayout.mainSplitRatio,axis:'x',
  bounds:()=>mainBounds(studioGrid.value?.clientWidth||1024),
  measure:event=>{const rect=studioGrid.value?.getBoundingClientRect();return rect?100*(event.clientX-rect.left)/rect.width:layout.mainSplitRatio;}});
const verticalResize=useResizablePane({value:verticalRatio,defaultValue:defaultStudioLayout.leftVerticalSplitRatio,axis:'y',
  bounds:()=>verticalBounds(filmWorld.value?.clientHeight||700),
  measure:event=>{const rect=filmWorld.value?.getBoundingClientRect();return rect?100*(event.clientY-rect.top)/rect.height:layout.leftVerticalSplitRatio;}});
let layoutObserver:ResizeObserver|null=null;
watch(layout,()=>saveStudioLayout(layout),{deep:true});
watch([studioGrid,filmWorld],([grid,film],[oldGrid,oldFilm])=>{
  if(oldGrid)layoutObserver?.unobserve(oldGrid);if(oldFilm)layoutObserver?.unobserve(oldFilm);
  if(grid)layoutObserver?.observe(grid);if(film)layoutObserver?.observe(film);
},{flush:'post'});
const newProject=reactive({name:'',brief:'',targetDuration:30,aspectRatio:'16:9'});
const referenceImages=ref<Record<string,string>>({});
const acceptedImageJobs=ref<any[]>([]);
const imageBaselines=ref<any[]>([]);
const draftImages=ref<Record<string,string>>({});
const imageJobs=ref<any[]>([]);
const executor=reactive({baseUrl:'http://127.0.0.1:8188',profile:'LOCAL_DRAFT_V1' as 'LOCAL_DRAFT_V1'|'Z_IMAGE_TURBO_SUBJECT_DRAFT_V1',checkpoint:'',checkpoints:[] as string[],status:''});
let imagePoll:ReturnType<typeof setInterval>|null=null;
let generation=0;
const scope=()=>session.scope();
const api=async(path:string,body:object)=>((await axios.post(`/v04${path}`,body)) as any).data;
const proposals=computed(()=>state.value ? workspace.current().visualSpecProposals : {});
const failures=computed(()=>state.value ? Object.values(workspace.current().visualSpecFailures).filter((failure:any)=>!packages.value[failure.canonicalKey]) : []);
const packages=computed(()=>state.value ? workspace.current().studioAssetDraftPackages : {});
const draftSummary=computed(()=>state.value ? summarizeStudioDrafts(state.value.assets,packages.value) : {processed:0,waiting:0,attention:0,failed:0});
const assets=computed(()=>studioAssets(state.value,proposals.value,packages.value).map((item:any)=>{
  const referenceJobs=Object.fromEntries(["FACE_HERO","FULL_BODY_FRONT","FULL_BODY_BACK","HERO_3Q","SIDE_PROFILE","BACK_3Q","REAR_3Q","DETAIL_REFERENCE"].map(purpose=>[purpose,currentDraftImageJobForPurpose(item.asset,item.draftPackage,imageJobs.value,purpose)]));
  const imageJob=imageJobs.value.find(j=>j.canonicalKey===item.asset.canonicalKey&&j.sourceAssetRevision===item.asset.revision&&j.executionPurpose==='ASSET_MAIN_PREVIEW'&&['QUEUED','RUNNING','SUCCEEDED','FAILED'].includes(j.status))||currentDraftImageJob(item.asset,item.draftPackage,imageJobs.value,scope());
  const confirmedSpec=state.value?.visualSpecs.find((spec:any)=>spec.canonicalKey===item.asset.canonicalKey
    && spec.effectiveStatus==='CONFIRMED' && Number(spec.sourceAssetRevision)===Number(item.asset.revision));
  const displayReferenceJob=[referenceJobs.FULL_BODY_FRONT,referenceJobs.FACE_HERO,referenceJobs.FULL_BODY_BACK].find(job=>job?.status==='SUCCEEDED')||null;
  const acceptedImageJob=acceptedImageJobs.value.find((j:any)=>j.canonicalKey===item.asset.canonicalKey && j.sourceAssetRevision===item.asset.revision);
  const baseline=imageBaselines.value.find((b:any)=>b.canonicalKey===item.asset.canonicalKey && b.role==='GENERAL')||imageBaselines.value.find((b:any)=>b.canonicalKey===item.asset.canonicalKey && b.role==='FULL_BODY_FRONT');
  const readyMainJob=imageJobs.value.find(j=>j.canonicalKey===item.asset.canonicalKey&&j.sourceAssetRevision===item.asset.revision&&j.status==='SUCCEEDED'&&j.outputs?.some((o:any)=>o.role==='MAIN_PREVIEW'));
  return {...item,readyMainJob,baseline,imageBaselines:imageBaselines.value.filter((b:any)=>b.canonicalKey===item.asset.canonicalKey),imageJob,referenceJobs,displayReferenceJob,acceptedImageJob,confirmedSpec,status:baseline?'已准备':isRealReference(item.asset)?'等待真实素材':imageJob?({QUEUED:'正在准备…',RUNNING:'正在生成…',SUCCEEDED:'已准备',FAILED:'生成遇到问题'} as any)[imageJob.status]||item.status:'正在准备…'};
}));
watch(assets,(items:any[])=>{if(drawer.value){const item=items.find((item:any)=>item.asset.canonicalKey===drawer.value.asset.canonicalKey);drawer.value=item?{...item,selectedPurpose:drawer.value.selectedPurpose}:null;}});
const groupedAssets=computed(()=>['主体','场景','视觉系统','品牌'].map(name=>({name,items:assets.value.filter((item:any)=>item.group===name)})));
const summaryText=computed(()=>{const creative=state.value?.creative;if(!creative)return '';const text=(creative.treatment||creative.brief||'尚无已确认创意。先和 Project Agent 讨论。').replace(/\s+/g,' ').trim();return text.length>220?text.slice(0,220)+'…':text;});
const selectedLabel=computed(()=>selected.value?.type==='ASSET'?`正在讨论：${state.value?.assets.find((a:any)=>a.canonicalKey===selected.value?.key)?.name||'素材'}`:selected.value?.type==='SHOT'?`正在讨论：镜头 ${String(state.value?.storyboards.findIndex((s:any)=>String(s.id)===selected.value?.key)+1).padStart(2,'0')}`:'正在讨论：整个项目');
const reviewEntries=computed(()=>state.value ? studioDraftReviewEntries(state.value.assets,packages.value,state.value.agentReferences,failures.value) : []);
const reviewCounts=computed(()=>({attention:reviewEntries.value.length}));
function requestAgentImage(label:string){focusAgent();agentPanel.value?.setInstruction?.('基于当前素材生成'+label+'，保持身份和服装。');}
function imageFor(item:any){if(item.selectedPurpose){const baseline=item.imageBaselines?.find((b:any)=>b.role===item.selectedPurpose);if(baseline)return referenceImages.value[baseline.attachmentId]||null;const job=item.referenceJobs?.[item.selectedPurpose];return job?.status==='SUCCEEDED'?draftImages.value[job.id]||null:null;}return (item.baseline?referenceImages.value[item.baseline.attachmentId]:null) || (item.acceptedImageJob?draftImages.value[item.acceptedImageJob.id]:null) || (item.imageJob?.executionPurpose==='ASSET_MAIN_PREVIEW'&&item.imageJob.status==='SUCCEEDED'?draftImages.value[item.imageJob.id]:null) || (item.displayReferenceJob?draftImages.value[item.displayReferenceJob.id]:null) || (item.imageJob?.status==='SUCCEEDED' ? draftImages.value[item.imageJob.id] : null) || (item.readyMainJob?draftImages.value[item.readyMainJob.id]:null) || item.outputPath || item.refs.map((row:any)=>referenceImages.value[row.attachmentId]).find(Boolean) || null;}
function clearImages(){viewedCandidate.value=null;for(const url of [...Object.values(referenceImages.value),...Object.values(draftImages.value)])URL.revokeObjectURL(url);referenceImages.value={};draftImages.value={};imageJobs.value=[];acceptedImageJobs.value=[];imageBaselines.value=[];}
async function reconcileAssets(){const current=scope(),token=generation;if(!current)return;const items=Object.values(packages.value).filter((d:any)=>d.stage==='WAITING_IMAGE_EXECUTOR'&&d.visualSpecDraft&&d.sourceAssetRevision===state.value?.assets.find((a:any)=>a.canonicalKey===d.canonicalKey)?.revision).map((d:any)=>({canonicalKey:d.canonicalKey,sourceAssetRevision:d.sourceAssetRevision,spec:d.visualSpecDraft}));try{await api('/studio/auto-assets/reconcile',{...current,items});if(token===generation)await loadDraftJobs();}catch(e:any){if(token===generation)error.value=e?.message||'图片准备暂时不可用，现有素材不受影响。';}}
async function loadDraftJobs(){const current=scope(),token=generation;if(!current)return;try{const bindings=await api('/studio/image-baseline/current',current);if(token!==generation)return;imageBaselines.value=bindings;for(const b of bindings){if(referenceImages.value[b.attachmentId])continue;const blob:Blob=await axios.get(`/v04/agent/image/${current.projectId}/${b.attachmentId}`,{responseType:'blob'});if(token!==generation)return;referenceImages.value[b.attachmentId]=URL.createObjectURL(blob);}const jobs=await api('/studio/draft-image/jobs',current);if(token!==generation)return;imageJobs.value=jobs;const candidates=await api('/studio/image-edit/candidates',current);if(token!==generation)return;acceptedImageJobs.value=candidates.filter((c:any)=>c.decision==='ACCEPTED'&&c.status==='SUCCEEDED');for(const job of [...jobs,...acceptedImageJobs.value]){if(job.status!=='SUCCEEDED'||draftImages.value[job.id]||!job.outputs?.[0])continue;try{const blob:Blob=await axios.get(`/v04/studio/artifact/${current.projectId}/${job.outputs[0].artifactId}`,{responseType:'blob'});if(token===generation)draftImages.value[job.id]=URL.createObjectURL(blob);}catch{/* An unavailable artifact remains a visible job failure, never a substitute image. */}}}catch{/* Keep current card state while reconnecting. */}}
function executorProfileChanged(){executor.status='';executor.checkpoint='';executor.checkpoints=[];}
async function loadExecutorConfig(){const current=scope(),token=generation;if(!current)return;try{const config=await api('/studio/executor/comfy/current',{projectId:current.projectId});if(token!==generation||!config)return;executor.baseUrl=config.baseUrl;executor.profile=config.profile;executor.checkpoint=config.checkpoint;executor.status=config.enabled?'已启用（可测试连接）':'';executor.checkpoints=[];}catch{/* Keep the local setup available if configuration cannot be read. */}}
async function testExecutor(){const current=scope();if(!current)return;try{const result=await api('/studio/executor/comfy/test',{projectId:current.projectId,baseUrl:executor.baseUrl,profile:executor.profile});executor.status=result.status;executor.checkpoints=result.checkpoints||[];if(!executor.checkpoints.includes(executor.checkpoint))executor.checkpoint=executor.checkpoints[0]||'';}catch(e:any){executor.status='UNAVAILABLE';error.value=e?.message||'连接测试失败';}}
async function saveExecutor(){const current=scope();if(!current)return;try{await api('/studio/executor/comfy/configure',{projectId:current.projectId,baseUrl:executor.baseUrl,profile:executor.profile,checkpoint:executor.checkpoint,enabled:true});executor.status='CONNECTED';}catch(e:any){error.value=e?.message||'本地执行器配置失败';}}
function selectReferencePurpose(purpose:string){if(drawer.value){drawer.value={...drawer.value,selectedPurpose:purpose};const job=drawer.value.referenceJobs?.[purpose];viewedCandidate.value=job?.status==='SUCCEEDED'?{canonicalKey:drawer.value.asset.canonicalKey,jobId:job.id}:null;}}
async function enqueueSelectedDraft(executionPurpose?:string){const current=scope(),item=drawer.value,token=generation;if(!current||!item||isRealReference(item.asset))return;const draft=packages.value[item.asset.canonicalKey];if(!draft?.visualSpecDraft||draft.stage!=='WAITING_IMAGE_EXECUTOR'){error.value='请先完成这项素材的 Studio 视觉草案';return;}try{const result=await api('/studio/draft-image/enqueue',{...current,canonicalKey:item.asset.canonicalKey,sourceAssetRevision:item.asset.revision,visualSpecDraft:draft.visualSpecDraft,force:!!(executionPurpose?item.referenceJobs?.[executionPurpose]:item.imageJob),...(executionPurpose?{executionPurpose}:{})});if(token!==generation)return;if(executionPurpose){draft.imageJobsByPurpose={...draft.imageJobsByPurpose,[executionPurpose]:result.job.id};item.selectedPurpose=executionPurpose;}else draft.imageJobId=result.job.id;await loadDraftJobs();}catch(e:any){error.value=e?.message||'草图任务创建失败';}}
async function prepareConfirmedSelected(){const current=scope(),item=drawer.value;if(!current||!item?.confirmedSpec||busy.value)return;
  const token=generation;busy.value=true;error.value='';try{await prepareDrafts(current,token,[item.asset.canonicalKey]);}
  catch(e:any){if(token===generation)error.value=e?.message||'已确认视觉规格编译失败';}
  finally{if(token===generation)busy.value=false;}}
async function loadImages(){clearImages();if(!state.value)return;const token=generation,projectId=state.value.project.id;const refs=state.value.agentReferences.filter((row:any)=>['ASSET_BIBLE','BIND_SELECTED_ASSET'].includes(row.targetType)).slice(0,60);await Promise.all(refs.map(async(ref:any)=>{try{const blob:Blob=await axios.get(`/v04/agent/image/${projectId}/${ref.attachmentId}`,{responseType:'blob'});if(token===generation)referenceImages.value[ref.attachmentId]=URL.createObjectURL(blob);}catch{/* Keep a truthful placeholder. */}}));}
async function loadProjects(){try{await session.loadProjects();}catch(e:any){error.value=e?.message||'项目读取失败';}}
async function open(projectId:number,scriptId:number){mainResize.cancel();verticalResize.cancel();const token=++generation;busy.value=true;error.value='';bulkStatus.value='';assetCreateReview.value=null;try{const next=await session.open(projectId,scriptId);if(!next||token!==generation)return;workspace.setScope(projectId,scriptId);drawer.value=null;bindRevision(projectId,scriptId);await loadImages();await loadDraftJobs();await loadExecutorConfig();await reconcileAssets();}catch(e:any){if(token===generation)error.value=e?.message||'项目读取失败';}finally{if(token===generation)busy.value=false;}}
async function refresh(){const current=scope();if(current)await open(current.projectId,current.scriptId);}
async function refreshRevision(){const current=scope();if(!current)return;await session.reload();await loadImages();}
function bindRevision(projectId:number,scriptId:number){revision.bind({current:()=>({projectId,scriptId,generation}),isCurrent:candidate=>!!candidate&&candidate.projectId===scope()?.projectId&&candidate.scriptId===scope()?.scriptId&&candidate.generation===generation,invalidate:()=>{generation++;},refresh:refreshRevision});revision.setScope({projectId,scriptId,generation});}
async function createProject(){if(busy.value)return;busy.value=true;try{const result=await api('/project/create',{...newProject});busy.value=false;await open(result.projectId,result.scriptId);}catch(e:any){error.value=e?.message||'创建失败';busy.value=false;}}
function selectAsset(item:any){viewedCandidate.value=!item.baseline&&item.imageJob?.status==='SUCCEEDED'?{canonicalKey:item.asset.canonicalKey,jobId:item.imageJob.id}:null;selected.value={type:'ASSET',key:item.asset.canonicalKey};drawer.value=item;}
function selectAssetByKey(key:string){const item=assets.value.find((entry:any)=>entry.asset.canonicalKey===key);if(item)selectAsset(item);}
function selectShot(shot:any){selected.value={type:'SHOT',key:String(shot.id)};drawer.value=null;}
async function goProfessional(){const current=scope();if(!current){error.value='请先打开项目';return;}const query:any={projectId:String(current.projectId),scriptId:String(current.scriptId)};if(selected.value?.type==='ASSET')query.asset=selected.value.key;if(selected.value?.type==='SHOT')query.shot=selected.value.key;try{await router.push({path:'/professional',query});}catch(e:any){error.value=e?.message||'专业模式打开失败';}}
function goProfessionalTab(tab:string){const current=scope();if(current)void router.push({path:'/professional',query:{projectId:String(current.projectId),scriptId:String(current.scriptId),tab}});}
function focusAgent(){drawer.value=null;agentPanel.value?.focusComposer();}
async function regenerateSelected(){const current=scope(),key=selected.value?.key;if(!current||!key||busy.value)return;if(!window.confirm('将调用已配置文本模型重新生成此素材的视觉草案，可能产生费用。继续吗？'))return;const token=generation;busy.value=true;try{const result=await api('/visual-spec/propose',{...current,canonicalKeys:[key]});if(token!==generation)return;for(const candidate of result.candidates||[])workspace.putVisual(candidate);for(const failure of result.failures||[])workspace.current().visualSpecFailures[failure.canonicalKey]=failure;
  if(result.candidates?.length)await prepareDrafts(current,token,[key],true);
}catch(e:any){if(token===generation)error.value=e?.message||'草案生成失败';}finally{if(token===generation)busy.value=false;}}
async function acceptAction(action:any,actionId:string){if(action.targetType==='VISUAL_SPEC'){workspace.putVisual(action.proposal);selectAssetByKey(action.targetKey);return;}if(action.targetType==='STORYBOARD_SHOT'){revision.open('STUDIO_AGENT',[action.proposal]);await revision.previewDraft();if(revision.state.status!=='PREVIEWED')throw new Error(revision.state.error||'分镜预览失败');return;}
  if(action.targetType==='ASSET_CREATE'){
    const current=scope(),token=generation;if(!current)throw new Error('请选择项目');
    if(assetCreateReview.value && assetCreateReview.value.actionId!==actionId)throw new Error('请先处理当前新增素材提案');
    const review=await previewStudioAssetCreate(action,current,(path,body)=>api(path,body),()=>token===generation&&session.isCurrent(current.projectId,current.scriptId));
    assetCreateReview.value={...review,...current,generation:token,actionId,status:'PREVIEWED',canonicalKey:null,error:'',prepareError:null};
  }
}
function cancelAssetCreate(actionId:string){const review=assetCreateReview.value;if(!review||review.actionId!==actionId||review.status!=='PREVIEWED')return;
  const entry=workspace.current().studioActions[actionId];
  if(entry)entry.handled=false;assetCreateReview.value=null;
}
function draftPreparationResult(review:StudioAssetCreateCardState){
  const key=review.canonicalKey;if(!key)return;
  const draft=workspace.entries[`${review.projectId}:${review.scriptId}`]?.studioAssetDraftPackages[key];
  const asset=state.value?.assets.find((item:any)=>item.canonicalKey===key);
  const result=draft?classifyStudioDraftPackage(draft,asset):{stage:'FAILED',reason:'没有返回视觉草案'};
  review.status=result.stage==='WAITING_IMAGE_EXECUTOR'?'READY':'PREPARE_FAILED';
  review.prepareError=review.status==='PREPARE_FAILED'?(result.reason||draft?.error?.message||'视觉草案未完成'):null;
}
async function confirmAssetCreate(actionId:string){const review=assetCreateReview.value;if(!review||review.actionId!==actionId||review.status!=='PREVIEWED'||busy.value)return;
  const isCurrent=()=>review.generation===generation&&session.isCurrent(review.projectId,review.scriptId);
  if(!isCurrent()){assetCreateReview.value=null;return;}
  busy.value=true;review.status='APPLYING';review.error='';
  try{const result=await applyStudioAssetCreate(review,(path,body)=>api(path,body),async()=>{if(isCurrent())review.status='PREPARING';await session.reload();},async key=>{
      review.canonicalKey=key;
      selectAssetByKey(key);await prepareDrafts({projectId:review.projectId,scriptId:review.scriptId},review.generation,[key],true);
    },isCurrent);
    if(isCurrent()){
      review.canonicalKey=result.canonicalKey;
      if(result.prepareError){review.status='PREPARE_FAILED';review.prepareError=result.prepareError;}
      else draftPreparationResult(review);
    }
  }catch(e:any){if(isCurrent()){review.status='UNCERTAIN';review.error=`${e?.message||'无法确认新增结果'}。请刷新项目核查；不要直接重试同一新增操作。`;}}
  finally{if(isCurrent())busy.value=false;}
}
async function retryAssetDraft(actionId:string){const review=assetCreateReview.value;
  if(!review||review.actionId!==actionId||review.status!=='PREPARE_FAILED'||!review.canonicalKey||busy.value)return;
  const isCurrent=()=>review.generation===generation&&session.isCurrent(review.projectId,review.scriptId);
  if(!isCurrent())return;
  busy.value=true;review.status='PREPARING';review.prepareError=null;
  try{await session.reload();if(!isCurrent())return;selectAssetByKey(review.canonicalKey);
    await prepareDrafts({projectId:review.projectId,scriptId:review.scriptId},review.generation,[review.canonicalKey],true);
    if(isCurrent())draftPreparationResult(review);
  }catch(e:any){if(isCurrent()){review.status='PREPARE_FAILED';review.prepareError=e?.message||'自动准备失败';}}
  finally{if(isCurrent())busy.value=false;}
}
async function confirmShot(){if(busy.value)return;busy.value=true;try{await revision.confirm();}finally{busy.value=false;}}
async function prepareDrafts(current:{projectId:number;scriptId:number},token:number,onlyKeys?:string[],force=false){
  if(!state.value)return;
  const key=`${current.projectId}:${current.scriptId}`,entry=workspace.entries[key];
  const isCurrent=()=>token===generation&&session.isCurrent(current.projectId,current.scriptId);
  const selectedAssets=onlyKeys?state.value.assets.filter((asset:any)=>onlyKeys.includes(asset.canonicalKey)):state.value.assets;
  const summary=await runStudioAssetDraftPipeline({ ...current,assets:selectedAssets,visualSpecs:force?state.value.visualSpecs.filter((spec:any)=>!onlyKeys?.includes(spec.canonicalKey)):state.value.visualSpecs,
    proposals:entry.visualSpecProposals,packages:force?{}:entry.studioAssetDraftPackages,
    propose:keys=>api('/visual-spec/propose',{...current,canonicalKeys:keys}),
    compile:items=>api('/visual-spec/draft-prompts',{...current,items}),isCurrent,
    onVisual:draft=>workspace.putVisual(draft,key),onPackage:draft=>workspace.putStudioDraft(draft,key),
    onProgress:progress=>{bulkStatus.value=`视觉资产 ${progress.completed}/${progress.total} · 等待图片 ${progress.ready} · 需要关注 ${progress.attention} · 失败 ${progress.failed}`;},
  });
  if(isCurrent()&&!summary.aborted){bulkStatus.value='';await reconcileAssets();}
}
async function prepareNext(){const current=scope();if(!current||busy.value||!state.value)return;const pending=workspace.current();
  const active=state.value.assets.filter((asset:any)=>asset.status==='ACTIVE');
  const eligible=active.filter((asset:any)=>asset.sourcePolicy==='AI_ALLOWED'&&!isRealReference(asset));
  const needsPackages=eligible.some((asset:any)=>!freshStudioPackage(asset,state.value.visualSpecs.find((spec:any)=>spec.canonicalKey===asset.canonicalKey&&spec.effectiveStatus==='CONFIRMED'),pending.visualSpecProposals[asset.canonicalKey],pending.studioAssetDraftPackages[asset.canonicalKey]));
  const attention=eligible.some((asset:any)=>{const draft=pending.studioAssetDraftPackages[asset.canonicalKey];return draft&&['FAILED','NEEDS_ATTENTION','STALE'].includes(classifyStudioDraftPackage(draft,asset).stage);});
  const method=!active.length?'ASSET_EXTRACTION':needsPackages?'STUDIO_DRAFT':attention?null:!state.value.storyboards.length?'STORYBOARD_BATCH':null;
  if(!method){error.value='当前视觉资产草案已准备；图片正在后台准备。';return;}
  if(method==='ASSET_EXTRACTION'&&pending.assetProposal){error.value='素材身份候选已准备，请先确认 Asset Bible。';return;}
  if(method==='STORYBOARD_BATCH'&&pending.storyboardDrafts.length){error.value='分镜草案已准备，请先审看。';return;}
  const missing=pendingVisualProposalKeys(state.value.assets,state.value.visualSpecs).filter(key=>!pending.visualSpecProposals[key]||pending.visualSpecProposals[key].sourceAssetRevision!==state.value?.assets.find((asset:any)=>asset.canonicalKey===key)?.revision);
  if((method!=='STUDIO_DRAFT'||missing.length)&&!window.confirm(`将调用已配置文本模型准备${method==='ASSET_EXTRACTION'?'素材身份候选':method==='STORYBOARD_BATCH'?'分镜草案':`${eligible.length} 项视觉资产草案`}，可能产生费用。继续吗？`))return;
  busy.value=true;const token=generation,isCurrent=()=>token===generation&&session.isCurrent(current.projectId,current.scriptId);
  try{if(method==='STUDIO_DRAFT')await prepareDrafts(current,token);
    else {const result=await api('/skills/preview',{...current,method});if(!isCurrent())return;
      if(method==='ASSET_EXTRACTION')pending.assetProposal=result;
      else pending.storyboardDrafts=result.output.shots.map((shot:any)=>({...shot,localId:crypto.randomUUID(),canonicalKeys:shot.canonicalKeys.join(', '),primaryKey:shot.primaryKey||''}));
      bulkStatus.value='草案已准备，等待人工审查。';}
  }catch(e:any){if(isCurrent())error.value=e?.message||'准备失败';}finally{if(isCurrent())busy.value=false;}}
function onCreativeCandidate(value:any){workspace.current().creativeProposal=value;goProfessionalTab('creative');}
onMounted(async()=>{layoutObserver=new ResizeObserver(()=>{mainResize.clamp();verticalResize.clamp();});if(studioGrid.value)layoutObserver.observe(studioGrid.value);if(filmWorld.value)layoutObserver.observe(filmWorld.value);await loadProjects();const projectId=Number(route.query.projectId),scriptId=Number(route.query.scriptId);if(Number.isSafeInteger(projectId)&&projectId>0&&Number.isSafeInteger(scriptId)&&scriptId>0)await open(projectId,scriptId);else{const restored=await session.restore();if(restored){workspace.setScope(restored.project.id,restored.creative.scriptId);bindRevision(restored.project.id,restored.creative.scriptId);await loadImages();await loadDraftJobs();await loadExecutorConfig();await reconcileAssets();}}if(route.query.asset)selectAssetByKey(String(route.query.asset));if(route.query.shot&&state.value){const shot=state.value.storyboards.find((s:any)=>String(s.id)===String(route.query.shot));if(shot)selectShot(shot);}imagePoll=setInterval(()=>{void loadDraftJobs();},2500);});
watch(()=>[route.query.projectId,route.query.scriptId],async()=>{const projectId=Number(route.query.projectId),scriptId=Number(route.query.scriptId);if(Number.isSafeInteger(projectId)&&projectId>0&&Number.isSafeInteger(scriptId)&&scriptId>0&&(scope()?.projectId!==projectId||scope()?.scriptId!==scriptId))await open(projectId,scriptId);});
onBeforeUnmount(()=>{if(imagePoll)clearInterval(imagePoll);clearImages();layoutObserver?.disconnect();mainResize.cancel();verticalResize.cancel();});
</script>
<style scoped>
.studio{min-height:100vh;background:#13161c;color:var(--td-text-color-primary);font-family:Inter,'Segoe UI',sans-serif}.studio-header{height:64px;display:flex;align-items:center;justify-content:space-between;padding:0 2rem;border-bottom:1px solid var(--td-component-border);background:var(--td-bg-color-container)}.wordmark{font-size:1rem;font-weight:750;letter-spacing:.02em}.wordmark span{font-size:.73rem;font-weight:500;color:var(--td-text-color-secondary);margin-left:.5rem}.header-actions{display:flex;gap:.5rem}button{border:1px solid var(--td-component-border);background:var(--td-bg-color-secondarycontainer);color:var(--td-text-color-primary);border-radius:8px;padding:.5rem .8rem;cursor:pointer;font:inherit}button:hover:not(:disabled){border-color:var(--td-brand-color)}button:disabled{opacity:.48;cursor:default}.primary{background:var(--td-brand-color);border-color:var(--td-brand-color);color:#fff}.eyebrow{color:var(--td-brand-color);text-transform:uppercase;font-size:.7rem;font-weight:750;letter-spacing:.13em}.studio-grid{display:grid;grid-template-columns:minmax(0,1.42fr) minmax(360px,1fr);height:calc(100vh - 64px);min-height:640px}.film-world,.asset-world{min-width:0;scrollbar-width:thin}.film-world{min-height:0;display:flex;flex-direction:column;padding:0 clamp(1.3rem,3vw,3.5rem)}.film-scroll{min-height:0;flex:1;overflow-y:auto;padding-top:2.2rem;scrollbar-width:thin}.asset-world{overflow-y:auto;background:color-mix(in srgb,var(--td-bg-color-container) 85%,#13161c);border-left:1px solid var(--td-component-border);padding:2.2rem clamp(1.2rem,2vw,2rem)}h1{font-size:clamp(1.7rem,2.5vw,2.6rem);margin:.4rem 0}h2{font-size:1.18rem;margin:0}h3{font-size:.97rem}.meta,.world-intro p,.muted{color:var(--td-text-color-secondary)}.film-heading{margin-bottom:2.5rem}.text-button{background:none;border:0;padding:.3rem 0;color:var(--td-brand-color)}.section-heading{display:flex;justify-content:space-between;align-items:center;gap:.8rem;margin-bottom:1.2rem}.section-heading span{font-size:.75rem;color:var(--td-text-color-secondary)}.section-heading button{font-size:.75rem}.narrative,.story-world{padding:1.6rem 0;border-top:1px solid var(--td-component-border)}.narrative-text,.expanded{white-space:pre-wrap;line-height:1.75;color:var(--td-text-color-primary)}.expanded{max-height:24rem;overflow-y:auto;font-size:.87rem}.expanded h3{color:var(--td-text-color-secondary)}.shot-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:.9rem}.shot-card{text-align:left;overflow:hidden;padding:0;border-radius:11px;background:var(--td-bg-color-container)}.shot-card.active,.asset-card.active{outline:2px solid var(--td-brand-color)}.shot-image img{width:100%;height:145px;object-fit:cover}.shot-placeholder,.asset-visual{height:145px;display:grid;place-items:center;background:linear-gradient(155deg,#242935,#1b202a);color:#b5b9c6;font-size:.8rem}.shot-body{padding:.8rem}.shot-body small,.shot-body span{color:var(--td-text-color-secondary);font-size:.72rem}.shot-body p{line-height:1.45;max-height:4.3em;overflow:hidden}.empty-story,.group-empty{color:var(--td-text-color-secondary);font-size:.84rem;padding:1.2rem;border:1px dashed var(--td-component-border);border-radius:10px}.agent-workspace{flex:0 0 min(56vh,520px);min-height:390px;display:flex;flex-direction:column;padding:.9rem 0;border-top:1px solid var(--td-component-border)}.agent-workspace .section-heading{margin-bottom:.5rem}.agent-action{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:end;gap:.5rem;margin-bottom:.5rem}.agent-action label{font-size:.77rem}.agent-action textarea{display:block;width:100%;box-sizing:border-box;margin-top:.25rem;min-height:2.7rem;height:2.7rem;resize:vertical;border:1px solid var(--td-component-border);border-radius:8px;background:var(--td-bg-color-container);color:inherit;padding:.5rem;font:inherit}.agent-action small{display:none}.agent-panel{flex:1;min-height:0;border:1px solid var(--td-component-border);border-radius:10px;overflow:hidden}.action-card,.review-center{border:1px solid var(--td-component-border);border-radius:11px;background:var(--td-bg-color-container);padding:1rem;margin:1rem 0}.action-card{max-height:10rem;overflow-y:auto;flex-shrink:0;margin:.4rem 0}.action-card div{display:flex;gap:.5rem;flex-wrap:wrap}.action-card textarea{width:100%;box-sizing:border-box;background:var(--td-bg-color-secondarycontainer);color:inherit}.world-intro{margin-bottom:2rem}.world-intro h2{font-size:1.5rem;line-height:1.25}.world-intro p{line-height:1.55}.asset-group{margin:2rem 0}.asset-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.8rem}.asset-card{text-align:left;padding:0;overflow:hidden;background:var(--td-bg-color-container)}.asset-visual{height:125px;overflow:hidden;display:flex;align-items:center;justify-content:center}.asset-preview-contain{display:block;max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain;object-position:center}.asset-preview-cover{display:block;width:100%;height:100%;object-fit:cover;object-position:center}.asset-caption{display:grid;gap:.25rem;padding:.8rem}.asset-caption small,.asset-caption span{font-size:.72rem;color:var(--td-text-color-secondary)}.asset-caption strong{font-size:.9rem}.asset-caption em{font-size:.7rem;color:var(--td-warning-color);font-style:normal}.review-center p{font-size:.83rem;line-height:1.55;color:var(--td-text-color-secondary)}.review-items{display:grid;margin-top:.6rem}.review-items button{text-align:left;display:flex;justify-content:space-between;gap:.5rem;margin-top:.35rem}.review-items span{font-size:.72rem;color:var(--td-text-color-secondary)}.warning,.error{color:var(--td-error-color)}.global-error{position:fixed;bottom:1rem;left:1rem;z-index:90;background:var(--td-bg-color-container);border:1px solid var(--td-error-color);padding:.8rem;border-radius:8px}.welcome{max-width:700px;margin:7vh auto;padding:2rem}.welcome h1{font-size:2.5rem}.create{display:grid;gap:.7rem;margin:2rem 0}.create input,.create textarea,.create select{box-sizing:border-box;padding:.7rem;border:1px solid var(--td-component-border);border-radius:8px;background:var(--td-bg-color-container);color:inherit;font:inherit}.create div{display:flex;gap:.7rem}.create label{display:grid;gap:.3rem}.project-choice{display:flex;justify-content:space-between;width:100%;margin:.4rem 0}
.studio{overflow-x:hidden}.studio-grid{min-height:0;max-width:100vw;overflow:hidden}.film-world{display:grid;min-height:0;min-width:0}.film-scroll{min-width:0;min-height:0;overflow-y:auto;overflow-x:hidden}.asset-world{min-height:0;overflow-x:hidden}.agent-workspace{min-width:0;min-height:0;overflow:hidden;border-top:0;padding:.3rem 0}.agent-panel{min-width:0;min-height:0}.narrative-text,.expanded,.shot-body p{overflow-wrap:anywhere;word-break:break-word}.narrative-text{white-space:normal}
.split-handle{position:relative;z-index:2;background:var(--td-component-border);touch-action:none;outline:none}.split-handle:hover,.split-handle:focus-visible{background:var(--td-brand-color)}.main-handle{cursor:col-resize}.film-handle{cursor:row-resize}.split-handle::after{content:'';position:absolute;inset:-3px}
@media(max-width:999px){.studio-grid{display:block;height:auto;overflow:visible}.film-world{display:block;padding:0 1.2rem}.film-scroll,.asset-world{overflow:visible}.split-handle{display:none}.agent-workspace{min-height:0;height:500px}.agent-panel{height:auto}.asset-world{border-left:0;border-top:1px solid var(--td-component-border)}.asset-grid{grid-template-columns:repeat(auto-fit,minmax(170px,1fr))}}
.executor-setup{margin-top:.75rem;font-size:.78rem;color:var(--td-text-color-secondary)}.executor-setup summary{cursor:pointer}.executor-setup label{display:block;margin:.5rem 0}.executor-setup input,.executor-setup select{display:block;box-sizing:border-box;width:100%;margin-top:.25rem;padding:.45rem;background:var(--td-bg-color-container);color:var(--td-text-color-primary);border:1px solid var(--td-component-border);border-radius:6px}.executor-setup button{margin:.3rem .35rem .3rem 0}
</style>
