const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { parse, compileTemplate } = require('@vue/compiler-sfc');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const cache = new Map();
function load(file) {
  const absolute = path.resolve(root, file);
  if (cache.has(absolute)) return cache.get(absolute);
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('module','exports','require',code)(module,module.exports,name =>
    name.startsWith('.') ? load(path.join(path.dirname(absolute), name + '.ts')) : require(name));
  cache.set(absolute, module.exports);
  return module.exports;
}
const { previewStudioAssetCreate, applyStudioAssetCreate } = load('src/views/pilot/studioAssetCreateFlow.ts');
const { runStudioAssetDraftPipeline } = load('src/views/pilot/studioAssetDraftPipeline.ts');
const action = { targetType:'ASSET_CREATE',sourceCreativeVersion:3,proposal:{operation:'ADD',clientRef:'studio-1',
  asset:{name:'月牙挂件',category:'ACC',assetKind:'PROP',ownerKey:'CHAR-001',relatedKeys:['CHAR-001']}} };
const scope = { projectId: 11, scriptId: 2 };

test('Studio identity proposal performs read-only preview, then one human Apply and auto-enqueues the server key', async () => {
  const calls = [], refreshed = [], queued = [];
  const post = async (path, body) => { calls.push({path,body}); return path === '/assets/preview'
    ? {previewHash:'h'.repeat(64),suggestions:[]} : {applied:[{clientRef:'studio-1',canonicalKey:'ACC-001'}]}; };
  const review = await previewStudioAssetCreate(action,scope,post,()=>true);
  assert.deepEqual(calls.map(call=>call.path),['/assets/preview']);
  assert.deepEqual(calls[0].body,{...scope,sourceCreativeVersion:3,changes:[action.proposal]});
  const result = await applyStudioAssetCreate(review,post,async()=>refreshed.push('authoritative-read'),
    async key=>queued.push(key),()=>true);
  assert.deepEqual(calls.map(call=>call.path),['/assets/preview','/assets/apply']);
  assert.equal(calls[1].body.previewHash,'h'.repeat(64));
  assert.deepEqual(refreshed,['authoritative-read']);
  assert.deepEqual(queued,['ACC-001']);
  assert.deepEqual(result,{applied:true,canonicalKey:'ACC-001',current:true,prepareError:null});
});

test('failed Apply never enqueues or retries; late response cannot update a switched unit', async () => {
  const review={action,body:{...scope,sourceCreativeVersion:3,changes:[action.proposal]},preview:{previewHash:'x'}};
  let calls=0, refreshed=0, queued=0;
  await assert.rejects(applyStudioAssetCreate(review,async()=>{calls++;throw Error('response uncertain');},
    async()=>{refreshed++;},async()=>{queued++;},()=>true),/response uncertain/);
  assert.deepEqual([calls,refreshed,queued],[1,0,0]);
  let current=true;
  await assert.rejects(previewStudioAssetCreate(action,scope,async()=>{current=false;return {previewHash:'x'};},()=>current),/已切换/);
  current=true;
  const result=await applyStudioAssetCreate(review,async()=>{current=false;return {applied:[{clientRef:'studio-1',canonicalKey:'ACC-001'}]};},
    async()=>{refreshed++;},async()=>{queued++;},()=>current);
  assert.equal(result.applied,true);
  assert.equal(result.current,false);
  assert.deepEqual([refreshed,queued],[0,0]);
});

test('Apply success remains identity truth even if automatic draft preparation fails', async () => {
  const review={action,body:{...scope,sourceCreativeVersion:3,changes:[action.proposal]},preview:{previewHash:'x'}};
  const result=await applyStudioAssetCreate(review,async()=>({applied:[{clientRef:'studio-1',canonicalKey:'ACC-001'}]}),
    async()=>{},async()=>{throw Error('text model unavailable');},()=>true);
  assert.deepEqual(result,{applied:true,canonicalKey:'ACC-001',current:true,prepareError:'text model unavailable'});
});

test('confirmed new identity immediately receives a Visual Spec draft and compiled Draft Package', async () => {
  const calls = [], packages = {}, proposals = {};
  const post = async path => path === '/assets/preview'
    ? { previewHash: 'h'.repeat(64) } : { applied: [{ clientRef: action.proposal.clientRef, canonicalKey: 'ACC-001' }] };
  const review = await previewStudioAssetCreate(action, scope, post, () => true);
  const result = await applyStudioAssetCreate(review, post, async () => calls.push('reload'), async key => {
    calls.push(`enqueue:${key}`);
    const run = await runStudioAssetDraftPipeline({ ...scope, assets: [{ canonicalKey: key, name: '月牙挂件',
      revision: 1, status: 'ACTIVE', sourcePolicy: 'AI_ALLOWED', category: 'ACC', assetKind: 'PROP' }],
      visualSpecs: [], proposals, packages, isCurrent: () => true,
      propose: async keys => { calls.push(`propose:${keys.join(',')}`); return { candidates: [{ canonicalKey: key,
        sourceAssetRevision: 1, spec: { visualIdentitySummary: 'Crescent pendant' }, qualityWarnings: [] }], failures: [] }; },
      compile: async items => { calls.push(`compile:${items.map(item => item.canonicalKey).join(',')}`);
        return { candidates: [{ canonicalKey: key, generationIntent: 'PROP_REFERENCE',
          draftPromptIR: { identityBlock: { canonicalKey: key } }, draftRenderedPrompt: { text: 'Crescent pendant' },
          previewPlan: { previewKind: 'PROP' }, completenessIssues: [] }], failures: [] }; },
      onVisual: candidate => { proposals[candidate.canonicalKey] = candidate; },
      onPackage: candidate => { packages[candidate.canonicalKey] = candidate; },
      onProgress: () => {},
    });
    assert.equal(run.progress.ready, 1);
  }, () => true);
  assert.equal(result.applied, true);
  assert.deepEqual(calls, ['reload', 'enqueue:ACC-001', 'propose:ACC-001', 'compile:ACC-001']);
  assert.equal(proposals['ACC-001'].spec.visualIdentitySummary, 'Crescent pendant');
  assert.equal(packages['ACC-001'].stage, 'WAITING_IMAGE_EXECUTOR');
  assert.equal(packages['ACC-001'].draftRenderedPrompt.text, 'Crescent pendant');
});

test('Studio UI wires ASSET_CREATE proposal, human confirm and Phase 1 auto draft without a direct insert route', () => {
  const studio=read('src/views/pilot/StudioWorkspace.vue'),panel=read('src/views/pilot/ProjectAgentPanel.vue');
  const template=parse(studio).descriptor.template.content;
  assert.deepEqual(compileTemplate({source:template,filename:'StudioWorkspace.vue',id:'studio'}).errors,[]);
  assert.match(template,/assetCreateReview/);
  assert.match(template,/@click="confirmAssetCreate"/);
  assert.match(studio,/previewStudioAssetCreate\(action,current/);
  assert.match(studio,/applyStudioAssetCreate\(review/);
  assert.match(studio,/prepareDrafts\(\{projectId:review\.projectId,scriptId:review\.scriptId\},review\.generation,\[key\],true\)/);
  assert.match(panel,/"ASSET_CREATE"\]\.includes\(response\.data\.mode\)/);
  assert.doesNotMatch(studio,/\/assets\/insert|\/assets\/direct-create/);
});
