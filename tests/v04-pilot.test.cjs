const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { parse, compileTemplate } = require('@vue/compiler-sfc');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
function visualBatchModule(){const code=ts.transpileModule(read('src/views/pilot/visualProposalBatch.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const module={exports:{}};new Function('module','exports',code)(module,module.exports);return module.exports;}

test('pilot workspace and persistent Agent templates compile', () => {
  for (const name of ['src/views/pilot/PilotShell.vue', 'src/views/pilot/ProjectAgentPanel.vue', 'src/views/pilot/VisualSpecPanel.vue']) {
    const parsed = parse(read(name), { filename: name });
    assert.equal(parsed.errors.length, 0, name);
    const result = compileTemplate({ source: parsed.descriptor.template.content, filename: name, id: name });
    assert.equal(result.errors.length, 0, name);
  }
});

test('OPT-027A asset card opens editable Visual Spec proposal with preview/confirm and derived Prompt status', () => {
  const shell=read('src/views/pilot/PilotShell.vue');
  const panel=read('src/views/pilot/VisualSpecPanel.vue');
  const template=parse(panel,{filename:'VisualSpecPanel.vue'}).descriptor.template.content;
  assert.match(shell, /<VisualSpecPanel v-if="selected"/);
  assert.match(shell, /:visual-specs="state\.visualSpecs" :prompt-builds="state\.promptBuilds" @applied="reload"/);
  assert.match(shell, /视觉规格：\{\{ visualFor\(asset\.canonicalKey\)/);
  assert.match(template, /视觉规格 · \{\{ visualStatus \}\}/);
  assert.match(template, /Prompt · \{\{ promptStatus \}\}/);
  assert.match(template, /v-model="draft\.visualIdentitySummary"[^>]+@input="dirty"/);
  assert.match(template, /v-model="element\.promotionRecommendation"[^>]+@change="dirty"/);
  assert.match(template, /:disabled="working \|\| preview\.issues\.length>0" @click="applySpec"/);
  assert.match(panel, /api\('\/visual-spec\/propose'/);
  assert.match(panel, /api\('\/visual-spec\/preview'/);
  assert.match(panel, /api\('\/visual-spec\/apply'/);
  assert.match(panel, /sourceAssetRevision:props\.asset\.revision,spec:draft\.value,previewHash:preview\.value\.previewHash/);
  assert.match(panel, /promptBuilds\.find\(item=>item\.canonicalKey===props\.asset\.canonicalKey&&item\.effectiveStatus==='READY'\)/);
  assert.doesNotMatch(panel, /Comfy|image\.generate|\/production\/storyboard\/batchGenerateImage/);
});

test('Visual Spec partial batch retains successful drafts and clears only the retried failure', () => {
  const code=ts.transpileModule(read('src/views/pilot/visualProposalBatch.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const module={exports:{}};new Function('module','exports',code)(module,module.exports);
  const merge=module.exports.mergeVisualProposalResults;
  const candidates=Array.from({length:5},(_,index)=>({canonicalKey:`CHAR-${index+1}`,spec:{visualIdentitySummary:`Identity ${index+1}`}}));
  const failed={canonicalKey:'CHAR-6',name:'Sixth asset',code:'PILOT_VISUAL_SEMANTIC_ROOT_INVALID',message:'视觉语义根结构无效'};
  const first=merge({}, {}, {candidates,failures:[failed]});
  assert.equal(first.successfulCount,5);assert.equal(first.failedCount,1);
  assert.equal(Object.keys(first.proposals).length,5);assert.deepEqual(first.failures['CHAR-6'],failed);
  const retry=merge(first.proposals,first.failures,{candidates:[{canonicalKey:'CHAR-6',spec:{visualIdentitySummary:'Sixth identity'}}],failures:[]});
  assert.equal(Object.keys(retry.proposals).length,6);
  assert.deepEqual(retry.failures,{});
  assert.deepEqual(retry.proposals['CHAR-1'],candidates[0],'retry does not erase earlier drafts');
  const failedRefresh=merge(retry.proposals,retry.failures,{candidates:[],failures:[failed]});
  assert.deepEqual(failedRefresh.proposals['CHAR-6'],retry.proposals['CHAR-6'],'failed refresh keeps the earlier draft');
  assert.deepEqual(failedRefresh.failures['CHAR-6'],failed,'failed refresh remains visible for retry');
  const panel=read('src/views/pilot/VisualSpecPanel.vue');
  const template=parse(panel,{filename:'VisualSpecPanel.vue'}).descriptor.template.content;
  assert.match(template, /@click="retryFailed\(failure\.canonicalKey\)"/);
  assert.match(template, /draftDiagnostics\?\.qualityWarnings/);
  assert.match(panel, /canonicalKeys:\[canonicalKey\]/,'retry requests one failed identity');
});

test('Visual Spec pending queue excludes confirmed and real-reference assets and sends bounded sequential batches', async () => {
  const {pendingVisualProposalKeys,runVisualProposalBatches,VISUAL_PROPOSAL_BATCH_SIZE}=visualBatchModule();
  assert.equal(VISUAL_PROPOSAL_BATCH_SIZE,6);
  for(const count of [0,1,6,7,13]){
    const assets=Array.from({length:count},(_,index)=>({canonicalKey:`CHAR-${index+1}`,name:`Character ${index+1}`,status:'ACTIVE',sourcePolicy:'AI_ALLOWED',category:'CHAR'}));
    assets.push({canonicalKey:'BRAND-001',status:'ACTIVE',sourcePolicy:'REAL_REQUIRED',category:'BRAND'});
    assets.push({canonicalKey:'UI-001',status:'ACTIVE',sourcePolicy:'AI_ALLOWED',category:'UI'});
    assets.push({canonicalKey:'OLD-001',status:'RETIRED',sourcePolicy:'AI_ALLOWED',category:'CHAR'});
    const keys=pendingVisualProposalKeys(assets,[]),calls=[],progress=[];
    assert.equal(keys.length,count);
    const result=await runVisualProposalBatches(keys,async batch=>{calls.push(batch);return {candidates:batch.map(canonicalKey=>({canonicalKey,spec:{}})),failures:[]};},()=>{},item=>progress.push(item),()=>true,key=>key);
    assert.deepEqual(calls.map(batch=>batch.length),count===0?[]:count===1?[1]:count===6?[6]:count===7?[6,1]:[6,6,1]);
    assert.equal(result.aborted,false);assert.equal(result.progress.completed,count);assert.equal(result.progress.remaining,0);
  }
  const assets=[{canonicalKey:'CHAR-001',status:'ACTIVE',sourcePolicy:'AI_ALLOWED',category:'CHAR'},
    {canonicalKey:'CHAR-002',status:'ACTIVE',sourcePolicy:'AI_ALLOWED',category:'CHAR'}];
  assert.deepEqual(pendingVisualProposalKeys(assets,[{canonicalKey:'CHAR-001',effectiveStatus:'CONFIRMED'}]),['CHAR-002']);
});

test('Visual Spec all-pending keeps successes across partial batches and retries only failed keys', async () => {
  const {runVisualProposalBatches,mergeVisualProposalResults}=visualBatchModule();
  const keys=Array.from({length:13},(_,index)=>`CHAR-${index+1}`),calls=[],progress=[];
  let proposals={},failures={};
  const merge=result=>{const merged=mergeVisualProposalResults(proposals,failures,result);proposals=merged.proposals;failures=merged.failures;};
  const request=async batch=>{calls.push([...batch]);return {candidates:batch.filter(key=>!['CHAR-2','CHAR-8'].includes(key)).map(canonicalKey=>({canonicalKey,spec:{identity:canonicalKey}})),
    failures:batch.filter(key=>['CHAR-2','CHAR-8'].includes(key)).map(canonicalKey=>({canonicalKey,name:canonicalKey,code:'MODEL_FAILED',message:'请重试'}))};};
  const result=await runVisualProposalBatches(keys,request,merge,item=>progress.push(item),()=>true,key=>key);
  assert.deepEqual(calls.map(batch=>batch.length),[6,6,1]);
  assert.deepEqual(result.progress,{total:13,completed:13,succeeded:11,failed:2,remaining:0});
  assert.equal(Object.keys(proposals).length,11);assert.deepEqual(Object.keys(failures),['CHAR-2','CHAR-8']);
  assert.equal(progress[1].completed,6);assert.equal(progress[1].failed,1,'first batch failure does not stop the next');
  assert.equal(progress[2].completed,12);assert.equal(progress[2].failed,2,'second batch failure retains first batch successes');
  const retryKeys=Object.keys(failures),retryCalls=[];
  await runVisualProposalBatches(retryKeys,async batch=>{retryCalls.push([...batch]);return {candidates:batch.map(canonicalKey=>({canonicalKey,spec:{identity:canonicalKey}})),failures:[]};},merge,()=>{},()=>true,key=>key);
  assert.deepEqual(retryCalls,[['CHAR-2','CHAR-8']]);assert.equal(Object.keys(proposals).length,13);assert.deepEqual(failures,{});
  assert.deepEqual(proposals['CHAR-1'],{canonicalKey:'CHAR-1',spec:{identity:'CHAR-1'}});
  const uncertainCalls=[];
  const uncertain=await runVisualProposalBatches(keys.slice(0,7),async batch=>{uncertainCalls.push(batch.length);if(uncertainCalls.length===1)throw new Error('transport lost');return {candidates:batch.map(canonicalKey=>({canonicalKey,spec:{}})),failures:[]};},()=>{},()=>{},()=>true,key=>key);
  assert.deepEqual(uncertainCalls,[6,1],'a failed request does not skip later bounded batches');
  assert.equal(uncertain.progress.failed,6);assert.equal(uncertain.progress.succeeded,1);
});

test('Visual Spec old-scope response cannot mutate the new unit or start its next batch', async () => {
  const {runVisualProposalBatches}=visualBatchModule();
  let resolveRequest, current=true, applied=0, calls=0;
  const pending=new Promise(resolve=>{resolveRequest=resolve;});
  const run=runVisualProposalBatches(Array.from({length:7},(_,index)=>`A-${index}`),async()=>{calls++;return pending;},()=>{applied++;},()=>{},()=>current,key=>key);
  current=false;resolveRequest({candidates:[{canonicalKey:'A-0',spec:{}}],failures:[]});
  const result=await run;
  assert.equal(result.aborted,true);assert.equal(calls,1);assert.equal(applied,0);
  const panel=read('src/views/pilot/VisualSpecPanel.vue');
  assert.match(panel,/批量生成全部待处理资产/);assert.match(panel,/只重试失败项/);
  assert.match(panel,/pendingVisualProposalKeys\(props\.allAssets,props\.visualSpecs\)/);
  assert.match(panel,/runVisualProposalBatches\(keys,/);
});

test('canonical asset and storyboard writes retain preview and accepted authority', () => {
  const source = read('src/views/pilot/PilotShell.vue');
  assert.match(source, /api\("\/assets\/preview"/);
  assert.match(source, /api\("\/assets\/apply"/);
  assert.match(source, /previewHash:assetPreview\.value\.previewHash/);
  assert.match(source, /api\("\/assets\/resolve"/);
  assert.match(source, /revision\.open\("PILOT_BATCH",operations\)/);
  assert.match(source, /await revision\.previewDraft\(\)/);
  assert.match(source, /await revision\.confirm\(\)/);
  assert.doesNotMatch(source, /\/production\/storyboard\/(?:addStoryboard|replaceStoryboard|editStoryboardInfo)/);
});

test('Agent follows project across pages without changing production authority', () => {
  const pilot = read('src/views/pilot/PilotShell.vue');
  const workbench = read('src/pages/workbench/index.vue');
  const production = read('src/views/production/index.vue');
  assert.match(pilot, /<ProjectAgentPanel :key="state\.project\.id"/);
  assert.match(pilot, /:stage="tab" :route-name="`pilot\/\$\{tab\}`" :selected="selected"/);
  assert.match(workbench, /<ProjectAgentPanel :project-id="pilotScope\.projectId"/);
  assert.match(production, /v-if="!isV04Pilot"/);
});

test('Creative is authoritative content first, with Agent proposals entering preview before apply', () => {
  const pilot = read('src/views/pilot/PilotShell.vue');
  const panel = read('src/views/pilot/ProjectAgentPanel.vue');
  assert.match(pilot, /state\.creative\[field\.key\]/);
  assert.match(pilot, /v-if="creativeEditing" class="editor"/);
  assert.match(panel, /suggest\('brief'\)/);
  assert.match(panel, /suggest\('treatment'\)/);
  assert.match(panel, /suggest\('script'\)/);
  assert.match(pilot, /@creative-candidate="onCreativeCandidate"/);
  assert.match(pilot, /creativeDraft\[proposal\.target\]=proposal\.candidate\.proposedText/);
  assert.match(pilot, /await previewCreative\(\)/);
  assert.match(pilot, /previewHash:creativePreview\.value\.previewHash/);
  assert.doesNotMatch(pilot, /class="context-id">\{\{ state\.project\.id/);
});

test('OPT-019 duration travels through Creative draft, proposal, preview, confirm and refreshed truth', () => {
  const pilot = read('src/views/pilot/PilotShell.vue');
  const template = parse(pilot, { filename: 'PilotShell.vue' }).descriptor.template.content;
  assert.match(pilot, /reactive\(\{brief:"",treatment:"",script:"",targetDuration:30\}\)/);
  assert.match(pilot, /targetDuration:next\.creative\.targetDuration/,'project read restores the confirmed duration');
  assert.match(template, /目标时长（秒）<input v-model\.number="creativeDraft\.targetDuration" type="number" min="1" max="600" step="1" @input="creativePreview=null"/);
  assert.match(pilot, /creativeDraft\.targetDuration=proposal\.candidate\.proposedTargetDuration \?\? state\.value\.creative\.targetDuration/,'null proposal keeps confirmed duration instead of stale draft state');
  assert.match(pilot, /api\("\/creative\/preview",\{\.\.\.scope\(\),\.\.\.creativeDraft,expectedVersion:state\.value\.creative\.version\}\)/);
  assert.match(template, /creativePreview\.current\.targetDuration/);
  assert.match(template, /creativePreview\.proposed\.targetDuration/);
  assert.match(pilot, /api\("\/creative\/apply",\{\.\.\.scope\(\),\.\.\.creativeDraft,expectedVersion:state\.value\.creative\.version,previewHash:creativePreview\.value\.previewHash\}\);await reload\(\)/);
  assert.match(template, /state\.creative\.targetDuration \}\} 秒/,'confirmed truth and header display server duration');
});

test('OPT-021 extraction keeps existing identities as suggestions instead of ADD and shows safe Skill codes', () => {
  const code = ts.transpileModule(read('src/views/pilot/skillProposal.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function('module', 'exports', code)(module, module.exports);
  const output = { candidates: [
    { name: 'Dream Stream Logo', category: 'BRAND' },
    { name: 'Blue luminous matter', category: 'FX' },
  ], mergeSuggestions: [{ candidateIndex: 0, existingCanonicalKey: 'BRAND-001', reason: '已有真实 Logo' }] };
  const proposal = module.exports.prepareAssetExtractionProposal(output, 1234);
  assert.deepEqual(proposal.mergeSuggestions, [{ name: 'Dream Stream Logo', existingCanonicalKey: 'BRAND-001', reason: '已有真实 Logo' }]);
  assert.deepEqual(proposal.changes, [{ operation: 'ADD', clientRef: 'candidate_1234_1', asset: output.candidates[1] }]);
  const shell = read('src/views/pilot/PilotShell.vue');
  assert.match(shell, /prepareAssetExtractionProposal\(result\.output,Date\.now\(\),result\.sufficiency\?\.requirements \|\| \[\]\)/);
  assert.match(shell, /错误代码：\$\{e\.code\.slice\("PILOT_"\.length\)\}/);
  assert.match(shell, /:merge-suggestions="skillMergeSuggestions"/,'existing identities are reviewed as reference cards');
  assert.match(shell, /if\(switched\)\{[\s\S]*?skillMergeSuggestions\.value=\[\]/,'switching projects clears proposal hints');
});

test('OPT-023 action feedback blocks duplicate work and settles with visible outcome', () => {
  const source = read('src/views/pilot/pilotActionFeedback.ts');
  const code = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const module={exports:{}};new Function('module','exports',code)(module,module.exports);
  const {beginPilotAction,settlePilotAction}=module.exports;
  const state={key:'',phase:'IDLE',message:''};
  assert.equal(beginPilotAction(state,'extract','AI 提取中…'),true);
  assert.deepEqual(state,{key:'extract',phase:'WORKING',message:'AI 提取中…'});
  assert.equal(beginPilotAction(state,'extract','duplicate'),false);
  assert.equal(beginPilotAction(state,'shot-preview','other action'),false);
  assert.equal(settlePilotAction(state,'shot-preview','SUCCESS','wrong'),false);
  assert.equal(settlePilotAction(state,'extract','FAILURE','提取失败 · 重试'),true);
  assert.equal(state.phase,'FAILURE');
  assert.equal(beginPilotAction(state,'extract','AI 提取中…'),true,'failed action can be retried');
  assert.equal(settlePilotAction(state,'extract','SUCCESS','提案已就绪'),true);
  assert.equal(state.phase,'SUCCESS');
  const shell=read('src/views/pilot/PilotShell.vue');
  const template=parse(shell,{filename:'PilotShell.vue'}).descriptor.template.content;
  for(const key of ['extract','asset-preview','asset-apply','storyboard-ai','shot-preview','shot-apply','turnaround']) {
    assert.match(template,new RegExp(`actionClass\\('${key}'\\)`));
    assert.match(template,new RegExp(`actionPhase\\('${key}'\\)===\\'WORKING\\'`));
  }
  assert.match(shell,/button\.quiet:active:not\(:disabled\),button\.primary:active:not\(:disabled\)\{transform:translateY\(2px\)/);
  assert.match(shell,/\.button-spinner\{[^}]*animation:pilot-button-spin/);
  assert.match(shell,/if\(saving\.value\)return;\s*if\(!window\.confirm/,'AI action cannot repeat while one is running');
});

test('coverage-driven candidate mapping preserves shared visual system and confirmed BRAND identity without writing', () => {
  const code = ts.transpileModule(read('src/views/pilot/skillProposal.ts'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const module={exports:{}};new Function('module','exports',code)(module,module.exports);
  const base={category:'PROP',description:'',identityAnchors:[],mustPreserve:[],forbiddenChanges:[],ownerKey:null,variantOf:null,sourcePolicy:'AI_ALLOWED',prompt:'',assetKind:'VEHICLE',importance:'CORE'};
  const output={candidates:[
    {...base,name:'Dream Stream Logo',category:'BRAND',assetKind:'BRAND_MARK',sourcePolicy:'REAL_REQUIRED'},
    {...base,name:'蓝色梦物质',category:'FX',assetKind:'MATERIAL_FX',importance:'SUPPORTING',relatedCandidateIndexes:[2]},
    {...base,name:'海盗船',sharedVisualSystemCandidateIndex:1,relatedCandidateIndexes:[1]},
  ],mergeSuggestions:[{candidateIndex:0,existingCanonicalKey:'BRAND-001',reason:'已有真实身份'}],coverage:[
    {label:'Dream Stream Logo',coverageType:'BRAND',classification:'CANONICAL_ASSET',candidateIndexes:[0],existingCanonicalKeys:[],note:'real'},
    {label:'远方灯塔',coverageType:'SCENE',classification:'SCENE_ANCHOR',candidateIndexes:[],existingCanonicalKeys:[],note:'missing'},
  ]};
  const proposal=module.exports.prepareAssetExtractionProposal(output,99);
  assert.equal(proposal.changes.length,2);
  assert.equal(proposal.changes[0].clientRef,'candidate_99_1');
  assert.deepEqual(proposal.changes[0].relatedClientRefs,['candidate_99_2']);
  assert.equal(proposal.changes[1].sharedVisualSystemClientRef,'candidate_99_1');
  assert.deepEqual(proposal.coverage[0].existingCanonicalKeys,['BRAND-001']);
  assert.deepEqual(proposal.coverage[1].candidateRefs,[]);
  assert.equal(proposal.changes.some(change=>change.asset.name==='Dream Stream Logo'),false);
});

test('OPT-025 review names and de-duplicates semantic relations; human supplement stays pending', () => {
  const source=read('src/views/pilot/skillProposal.ts');
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const module={exports:{}};new Function('module','exports',code)(module,module.exports);
  const {describeProposalRelations,appendCandidateForRequirement,reviewPendingSufficiency,assetCoveragePayload}=module.exports;
  const changes=[
    {operation:'ADD',clientRef:'candidate_123_1',asset:{name:'蓝色荧光物质'}},
    {operation:'ADD',clientRef:'candidate_123_2',asset:{name:'海盗船',relatedKeys:[]},relatedClientRefs:['candidate_123_1','candidate_123_3','candidate_123_4','candidate_123_3'],sharedVisualSystemClientRef:'candidate_123_1'},
    {operation:'ADD',clientRef:'candidate_123_3',asset:{name:'潜水艇'}},
    {operation:'ADD',clientRef:'candidate_123_4',asset:{name:'飞马'}},
  ];
  assert.deepEqual(describeProposalRelations(changes[1],changes,[]),{shared:'蓝色荧光物质',continuity:['潜水艇','飞马']});
  const base={status:'NEEDS_REVIEW',reason:'Missing scene',auditComplete:true,requirements:[{requirementKey:'audit:SCENE:终场高空月夜:1',label:'终场高空月夜',coverageType:'SCENE',classification:'SCENE_ANCHOR',status:'MISSING',note:'独立环境',suggestedAsset:{name:'终场高空月夜',category:'LOC',assetKind:'ENVIRONMENT'}}]};
  const coverage=[];
  assert.equal(reviewPendingSufficiency(base,coverage).status,'NEEDS_REVIEW');
  const pending=appendCandidateForRequirement(changes,coverage,base.requirements[0],'manual_test');
  assert.equal(changes.length,4,'original proposal remains untouched');
  assert.deepEqual(coverage,[],'review helper cannot persist or mutate original coverage');
  assert.equal(pending.changes.at(-1).asset.assetKind,'ENVIRONMENT');
  assert.deepEqual(pending.coverage[0].candidateRefs,['manual_test']);
  assert.equal(pending.coverage[0].reviewRequirementKey,base.requirements[0].requirementKey);
  assert.equal(reviewPendingSufficiency(base,pending.coverage).status,'READY');
  pending.coverage[0].label='人工修正的终场环境';
  assert.equal(reviewPendingSufficiency(base,pending.coverage).requirements[0].label,'人工修正的终场环境');
  assert.equal('reviewRequirementKey' in assetCoveragePayload(pending.coverage)[0],false,'review-only key never enters strict Preview/Apply payload');
  assert.equal(reviewPendingSufficiency({...base,auditComplete:false},pending.coverage).status,'NEEDS_REVIEW','incomplete audit cannot become ready by UI mutation');
  const component=read('src/views/pilot/AssetProposalReview.vue');
  const template=parse(component,{filename:'AssetProposalReview.vue'}).descriptor.template.content;
  assert.equal(compileTemplate({source:template,filename:'AssetProposalReview.vue',id:'review'}).errors.length,0);
  assert.match(template,/共享视觉系统：/);assert.match(template,/连续形态：/);
  assert.match(template,/加入当前 Proposal/);assert.match(template,/补充候选/);
  assert.match(template,/relationStatus === 'NEEDS_REVIEW'/);
  assert.match(template,/视觉需求<input v-model="item.label"/,'manual Coverage labels remain editable before Preview');
  assert.doesNotMatch(template,/\{\{\s*change\.clientRef\s*\}\}/,'internal candidate IDs must never be presented');
  const shell=read('src/views/pilot/PilotShell.vue');
  assert.match(shell,/<AssetProposalReview :changes="assetChanges"/);
  assert.match(shell,/appendCandidateForRequirement\(assetChanges\.value,skillCoverage\.value,requirement/);
  assert.match(shell,/coverage:assetCoveragePayload\(skillCoverage\.value\)/);
  assert.match(shell,/assetPreview\.value=null;/,'a new candidate invalidates the previous Preview');
});

test('OPT-025B proposal review controls inherit the Pilot theme without changing button feedback', () => {
  const component = parse(read('src/views/pilot/AssetProposalReview.vue'), { filename: 'AssetProposalReview.vue' });
  assert.equal(component.errors.length, 0);
  assert.equal(compileTemplate({ source: component.descriptor.template.content, filename: 'AssetProposalReview.vue', id: 'review' }).errors.length, 0);
  const style = component.descriptor.styles[0].content;
  assert.match(style, /\.proposal-review input,\.proposal-review select,\.proposal-review textarea\s*\{[^}]*background:var\(--td-bg-color-container\);color:var\(--td-text-color-primary\)/);
  assert.match(style, /border:1px solid var\(--td-component-border\)/);
  assert.match(style, /\.proposal-review :is\(input,select,textarea\):hover\{[^}]*var\(--td-brand-color\)/);
  assert.match(style, /\.proposal-review :is\(input,select,textarea\):focus\{[^}]*outline:2px solid var\(--td-brand-color\)/);
  assert.match(style, /\.proposal-review select option\{[^}]*background:var\(--td-bg-color-container\);color:var\(--td-text-color-primary\)/);
  assert.match(style, /\.proposal-review textarea\{[^}]*min-height:6rem;[^}]*resize:vertical/);
  assert.doesNotMatch(style, /(?:background|color):\s*(?:white|#fff\b|#ffffff\b|rgb\(255\s*,\s*255\s*,\s*255\))/i);
  const shell = read('src/views/pilot/PilotShell.vue');
  assert.match(shell, /button\.quiet:active:not\(:disabled\),button\.primary:active:not\(:disabled\)\{transform:translateY\(2px\)/);
  assert.match(shell, /button\.action-working,button\.action-working:disabled\{/);
});

test('OPT-026 one pending candidate can satisfy two stable requirements without another ADD', () => {
  const code=ts.transpileModule(read('src/views/pilot/skillProposal.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const module={exports:{}};new Function('module','exports',code)(module,module.exports);
  const {appendCandidateForRequirement,linkRequirementToCandidate,reviewPendingSufficiency,assetCoveragePayload}=module.exports;
  const a={requirementKey:'audit:SCENE:月夜海面:1',label:'月夜海面',coverageType:'SCENE',classification:'SCENE_ANCHOR',status:'MISSING',note:''};
  const b={requirementKey:'audit:SCENE:云端月夜:1',label:'云端月夜',coverageType:'SCENE',classification:'SCENE_ANCHOR',status:'MISSING',note:''};
  const base={status:'NEEDS_REVIEW',reason:'two missing',auditComplete:true,requirements:[a,b]};
  const pending=appendCandidateForRequirement([],[],a,'manual_one');
  const linked=linkRequirementToCandidate(pending.changes,pending.coverage,b,'manual_one');
  assert.equal(pending.changes.length,1);
  assert.equal(linked.length,2);
  assert.deepEqual(linked.map(item=>item.candidateRefs),[['manual_one'],['manual_one']]);
  assert.deepEqual(reviewPendingSufficiency(base,linked).requirements.map(item=>item.status),['COVERED','COVERED']);
  pending.changes[0].asset.name='云端月夜 / 高空终场环境';
  assert.deepEqual(linked.map(item=>item.candidateRefs),[['manual_one'],['manual_one']],'rename does not change stable links');
  assert.equal(assetCoveragePayload(linked).every(item=>!('reviewRequirementKey' in item)),true);
  assert.throws(()=>linkRequirementToCandidate(pending.changes,linked,b,'missing_candidate'));
});

test('OPT-026 proposal and preview use grouped cards, on-demand detail and compact Coverage', () => {
  const component=parse(read('src/views/pilot/AssetProposalReview.vue'),{filename:'AssetProposalReview.vue'});
  const template=component.descriptor.template.content;
  assert.equal(compileTemplate({source:template,filename:'AssetProposalReview.vue',id:'review'}).errors.length,0);
  assert.match(template,/class="asset-grid"/);
  assert.match(template,/selectedRef = change.clientRef/);
  assert.match(template,/v-if="selectedChange" class="detail"/);
  assert.match(template,/assetKindLabel\(change.asset.assetKind\)/);
  assert.match(template,/relations\(change\).shared/);
  assert.match(template,/class="coverage-summary"/);
  assert.match(template,/v-if="showAllCoverage"/);
  assert.match(template,/v-if="showBeats"/);
  assert.match(template,/v-if="missing.length"/);
  assert.match(template,/class="duplicate-summary"/);
  assert.match(template,/class="asset-card existing-card"/);
  assert.doesNotMatch(template,/\{\{\s*change\.clientRef\s*\}\}/);
  const script=component.descriptor.scriptSetup.content;
  assert.match(script,/const showAllCoverage = ref\(false\), showBeats = ref\(false\)/);
  assert.match(script,/const referencedExisting = computed/);
  assert.match(script,/BRAND_MARK:'品牌标识'/);
  const style=component.descriptor.styles[0].content;
  assert.match(style,/\.asset-grid\{[^}]*repeat\(auto-fit,minmax\(240px,1fr\)\)/);
  assert.match(style,/background:var\(--td-bg-color-container\);color:var\(--td-text-color-primary\)/);
  const shell=read('src/views/pilot/PilotShell.vue');
  assert.match(shell,/@link-candidate="linkCandidateToRequirement"/);
  assert.match(shell,/class="proposal-actions"/);
  assert.match(shell,/button\.action-working,button\.action-working:disabled/);
});

test('OPT-025A stable requirement keys survive out-of-order supplements and human edits', () => {
  const code=ts.transpileModule(read('src/views/pilot/skillProposal.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const module={exports:{}};new Function('module','exports',code)(module,module.exports);
  const {prepareAssetExtractionProposal,appendCandidateForRequirement,reviewPendingSufficiency,assetCoveragePayload}=module.exports;
  const requirements=[
    {requirementKey:'audit:SCENE:鲸腹:1',sourceCoverageIndex:null,label:'鲸腹',coverageType:'SCENE',classification:'SCENE_ANCHOR',status:'MISSING',note:'第一处',suggestedAsset:{name:'鲸腹',category:'LOC',assetKind:'ENVIRONMENT'}},
    {requirementKey:'audit:SCENE:高空月夜:1',sourceCoverageIndex:null,label:'高空月夜',coverageType:'SCENE',classification:'SCENE_ANCHOR',status:'MISSING',note:'第二处',suggestedAsset:{name:'高空月夜',category:'LOC',assetKind:'ENVIRONMENT'}},
  ];
  const base={status:'NEEDS_REVIEW',reason:'two missing',auditComplete:true,requirements};
  const initial=prepareAssetExtractionProposal({candidates:[],mergeSuggestions:[],coverage:[]},99,requirements);
  const run=order=>{
    let pending=initial;
    for(const [step,index] of order.entries()){
      pending=appendCandidateForRequirement(pending.changes,pending.coverage,requirements[index],`manual_${index}`);
      const states=reviewPendingSufficiency(base,pending.coverage).requirements.map(item=>item.status);
      assert.equal(states[index],'COVERED');assert.equal(states[1-index],step===0?'MISSING':'COVERED');
    }
    pending.changes.find(item=>item.clientRef==='manual_1').asset.name='云端月夜';
    pending.coverage.find(item=>item.reviewRequirementKey===requirements[1].requirementKey).label='云端月夜';
    const review=reviewPendingSufficiency(base,pending.coverage);
    assert.equal(review.status,'READY');
    assert.equal(review.requirements[1].requirementKey,requirements[1].requirementKey);
    assert.equal(review.requirements[1].label,'云端月夜');
    assert.deepEqual(review.requirements.map(item=>item.status),['COVERED','COVERED']);
    assert.equal(assetCoveragePayload(pending.coverage).every(item=>!('reviewRequirementKey' in item)),true);
    return review.requirements.map(item=>[item.requirementKey,item.status]);
  };
  assert.deepEqual(run([1,0]),run([0,1]));
  assert.deepEqual(initial,{changes:[],coverage:[],mergeSuggestions:[]},'helpers never mutate initial proposal or persist data');
});

test('Asset Bible workspace exposes grouped assets, planned previews, turnarounds and coverage warning before Storyboard', () => {
  const shell=read('src/views/pilot/PilotShell.vue');
  const template=parse(shell,{filename:'PilotShell.vue'}).descriptor.template.content;
  assert.match(template,/class="workspace" :class="\{'assets-workspace':tab==='assets'\}"/);
  assert.match(shell,/\.assets-workspace :deep\(\.agent\)\{grid-column:2/);
  assert.match(template,/aria-label="资产结构树"/);
  assert.match(template,/reviewFor\(selected\.key\)\?\.previewStatus/);
  assert.match(template,/尚无低清图片；当前仅建立待执行计划，未调用图片模型/);
  assert.match(template,/planTurnaround/);
  assert.match(template,/assetDraft\.sourcePolicy==='REAL_REQUIRED'/);
  assert.match(template,/Storyboard 前覆盖审计/);
  assert.match(template,/coverageWarnings\.length/);
  assert.match(shell,/api\("\/assets\/turnaround\/plan"/);
  assert.match(shell,/coverage:assetCoveragePayload\(skillCoverage\.value\)/);
  assert.match(shell,/const token=unitToken\(\);[\s\S]*?const result=await api\("\/skills\/preview"/);
  assert.match(shell,/if\(!isCurrentUnit\(token\)\)return;/,'late extraction from a previous project cannot enter the new workspace');
});

test('image composer uploads bytes, sends attachment IDs and requires reference preview plus confirm', () => {
  const panel = read('src/views/pilot/ProjectAgentPanel.vue');
  assert.match(panel, /type="file" accept="image\/png,image\/jpeg,image\/webp"/);
  assert.match(panel, /@drop\.prevent="onDrop"/);
  assert.match(panel, /await asDataUrl\(file\)/);
  assert.match(panel, /post\("\/v04\/agent\/image\/upload"/);
  assert.match(panel, /post\("\/v04\/agent\/chat", \{ context: request\.ctx, message: request\.content, attachmentIds: request\.attachmentIds \}\)/);
  assert.match(panel, /responseType: "blob"/);
  assert.match(panel, /post\("\/v04\/agent\/reference\/preview"/);
  assert.match(panel, /post\("\/v04\/agent\/reference\/apply"/);
  assert.match(panel, /previewHash: p\.previewHash/);
  assert.match(panel, /PRODUCTION_ASSET/);
});

test('pilot login selects the isolated API before the first request and enters Creative', () => {
  const app = read('src/App.vue');
  const login = read('src/pages/login/index.vue');
  const router = read('src/router/index.ts');
  assert.match(app, /if \(window\.location\.port === "50189"\) baseUrl\.value = "http:\/\/127\.0\.0\.1:10589\/api"/);
  assert.match(login, /Router\.push\(window\.location\.port === "50189" \? "\/pilot" : "\/project"\)/);
  assert.match(router, /path: "\/pilot",\s*component: \(\) => import\("@\/views\/pilot\/PilotShell\.vue"\)/);
});

test('Assets and Video/Edit handoff load the real general project route before navigating', async () => {
  const shell = read('src/views/pilot/PilotShell.vue');
  assert.match(shell, /@click="openAssetPreparation"/);
  assert.match(shell, /tab === 'video' \|\| tab === 'edit'/);
  assert.match(shell, /@click="openProduction"/);
  assert.match(shell, /function openAssetPreparation\(\)\{return handoff\("assets"\);\}/);
  assert.match(shell, /function openProduction\(\)\{return handoff\("production"\);\}/);
  assert.match(shell, /<p v-if="error" class="error" role="alert">\{\{ error \}\}<\/p>/);
  assert.match(shell, /catch\(e:any\) \{\s*error\.value=`无法打开/);
  assert.doesNotMatch(shell, /\/project\/getSingleProject/);

  const code = ts.transpileModule(read('src/views/pilot/projectHandoff.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function('module', 'exports', code)(module, module.exports);
  const { handoffToProjectPage } = module.exports;
  for (const target of ['assets', 'production']) {
    const calls = [];
    const project = { id: 17, name: 'V0.4 Pilot' };
    await handoffToProjectPage(17, 42, target, {
      post: async (route, body) => { calls.push(['post', route, body]); return { data: [project] }; },
      setProject: value => calls.push(['setProject', value]),
      selectUnit: (projectId, scriptId) => calls.push(['selectUnit', projectId, scriptId]),
      navigate: async route => calls.push(['navigate', route]),
    });
    assert.deepEqual(calls, [
      ['post', '/general/getSingleProject', { id: 17 }],
      ['setProject', project],
      ['selectUnit', 17, 42],
      ['navigate', `/${target}?scriptId=42`],
    ]);
  }
});

test('handoff failure does not navigate or replace the selected project', async () => {
  const code = ts.transpileModule(read('src/views/pilot/projectHandoff.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function('module', 'exports', code)(module, module.exports);
  const calls = [];
  await assert.rejects(module.exports.handoffToProjectPage(17, 42, 'assets', {
    post: async () => { throw new Error('route unavailable'); },
    setProject: () => calls.push('setProject'),
    selectUnit: () => calls.push('selectUnit'),
    navigate: async () => calls.push('navigate'),
  }), /route unavailable/);
  assert.deepEqual(calls, []);
});
