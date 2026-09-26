const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<html><body></body></html>', { url: 'http://localhost' });
for (const key of ['window','document','Element','HTMLElement','SVGElement','Node','Event']) global[key] = dom.window[key];
const vue = require('vue'), ts = require('typescript'), { parse, compileScript, compileTemplate } = require('vue/compiler-sfc');
const root = path.resolve(__dirname, '../src');
const file = path.join(root, 'views/production/components/SupervisorReviewInspector.vue');
const source = fs.readFileSync(file, 'utf8');
const descriptor = parse(source, { filename: file }).descriptor;
assert.deepEqual(compileTemplate({ source: descriptor.template.content, filename: file, id: 'supervisor-review' }).errors, []);
function component(post) {
  const script = compileScript(descriptor, { id: 'supervisor-review', inlineTemplate: true }).content;
  const code = ts.transpileModule(script, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  new Function('require','module','exports',code)(id => id === '@/utils/axios' ? { post } : require(id), module, module.exports);
  return module.exports.default;
}
async function settle() { for (let i = 0; i < 12; i++) { await new Promise(resolve => setTimeout(resolve, 0)); await vue.nextTick(); } }
const target = scriptId => ({ review: { displayName: 'Storyboard Semantic Approval' }, target: { targetHash: String(scriptId).padStart(64, '0'), targetAdapterKey: 'storyboard.semantic.v1', targetType: 'STORYBOARD_SEMANTIC', summary: '1 个分镜' }, profile: { profileKey: 'mv', profileVersion: 'v1' }, recipe: null, controlContextHash: 'a'.repeat(64) });
function setup(t, options = {}) {
  const calls = [];
  const post = async (url, body) => { calls.push({ url, body });
    if (url.endsWith('/current/resolve')) return { data: { mode: options.advisory ? 'LEGACY_ADVISORY' : 'GATE_DRIVING', gateDriving: !options.advisory, reviewKey: options.v2 ? 'storyboard.semantic-approval.v2' : 'storyboard.semantic-approval', gateKey: options.v2 ? 'supervisor.storyboard-approved.v2' : 'supervisor.storyboard-approved', targetAdapterKey: options.v2 ? 'storyboard.semantic.v2' : 'storyboard.semantic.v1', displayName: options.v2 ? 'Storyboard Semantic Approval V2' : 'Storyboard Semantic Approval' } };
    if (url.endsWith('/target/read')) return { data: options.v2 ? { ...target(body.scriptId), review: { displayName: 'Storyboard Semantic Approval V2' }, target: { ...target(body.scriptId).target, targetAdapterKey: 'storyboard.semantic.v2' } } : target(body.scriptId) };
    if (url.endsWith('/review/history')) return { data: { history: [{ reviewId: 'old', decision: 'PASS', status: 'STALE', source: 'HUMAN', actorDisplayName: 'Reviewer', createdAt: Date.now(), summary: 'Old', targetHash: 'b'.repeat(64), profileKey: 'mv', profileVersion: 'v1', recipeKey: null, issues: [] }] } };
    if (url.endsWith('/gate/check')) return { data: { pass: false, code: 'SUPERVISOR_REVIEW_REQUIRED', reason: 'Review needed', effectiveDecision: null, staleCount: 1 } };
    if (url.endsWith('/ai/context')) { if (options.aiContextError) throw Error('AI policy unavailable'); return { data: { skillId: 'supervisor.test', skillVersion: 'v1', skillStatus: 'ACTIVE', resolvedFrom: { scopeType: 'STAGE', scopeKey: 'project:7:script:42:stage:supervisor-review' }, supervisorResolutionHash: 'c'.repeat(64), overrideChain: [], targetHash: target(body.scriptId).target.targetHash, controlContextHash: 'a'.repeat(64) } }; }
    if (url.endsWith('/review/ai')) return options.aiResponse ? options.aiResponse() : { data: { decision: 'PASS' } };
    if (url.endsWith('/review/decide')) return { data: { reviewId: 'new' } };
    throw Error(url);
  };
  const props = vue.reactive({ visible: true, projectId: 7, scriptId: 42 });
  const el = document.createElement('div'); document.body.append(el);
  const app = vue.createApp({ render: () => vue.h(component(post), props) });
  app.component('t-dialog', { props: ['visible'], setup(p, { slots }) { return () => p.visible ? vue.h('div', slots.default?.()) : null; } });
  app.mount(el);
  t.after(() => { app.unmount(); el.remove(); });
  return { calls, props, el, button: text => [...el.querySelectorAll('button')].find(b => b.textContent.includes(text)) };
}

test('Production Inspector reads exact current unit, displays stale history and sends human PASS hashes', async t => {
  const f = setup(t); await settle();
  assert.match(f.el.textContent, /Storyboard Semantic Approval/);
  assert.match(f.el.textContent, /SUPERVISOR_REVIEW_REQUIRED/);
  assert.match(f.el.textContent, /过期审核记录/);
  assert.deepEqual(f.calls.filter(x => !x.url.endsWith('/review/decide') && !x.url.endsWith('/current/resolve')).map(x => x.body), Array(4).fill({ projectId: 7, scriptId: 42, reviewKey: 'storyboard.semantic-approval' }));
  assert.deepEqual(f.calls.find(x => x.url.endsWith('/current/resolve')).body, { projectId: 7, scriptId: 42 });
  window.confirm = () => true;
  f.button('人工确认 PASS').click(); await settle();
  const decision = f.calls.find(x => x.url.endsWith('/review/decide')).body;
  assert.equal(decision.expectedTargetHash, target(42).target.targetHash);
  assert.equal(decision.expectedControlContextHash, 'a'.repeat(64));
  assert.equal(decision.decision, 'PASS'); assert.equal(decision.source, undefined); assert.equal(decision.actorUserId, undefined);
  f.props.scriptId = 43; await settle();
  assert.equal(f.calls.filter(x => x.url.endsWith('/target/read')).at(-1).body.scriptId, 43);
});

test('B1 Inspector resolves V2 on server and labels legacy advisory separately', async t => {
  const v2 = setup(t, { v2: true }); await settle();
  assert.match(v2.el.textContent, /storyboard\.semantic-approval\.v2/);
  assert.match(v2.el.textContent, /supervisor\.storyboard-approved\.v2/);
  assert.equal(v2.calls.find(x => x.url.endsWith('/target/read')).body.reviewKey, 'storyboard.semantic-approval.v2');
  const advisory = setup(t, { advisory: true }); await settle();
  assert.match(advisory.el.textContent, /Legacy Advisory Review — not driving the current production Gate/);
  assert.match(advisory.el.textContent, /Advisory Decision/);
  assert.doesNotMatch(source, /const reviewKey\s*=/);
});

test('REVISE requires a blocker in UI and Production owns the Inspector mount', async t => {
  const f = setup(t); await settle();
  f.button('填写 REVISE').click(); await settle();
  assert.equal(f.button('提交 REVISE').disabled, true);
  f.button('添加问题').click(); await settle();
  assert.equal(f.button('提交 REVISE').disabled, true); // summary and issue message remain required by server
  const production = fs.readFileSync(path.join(root, 'views/production/index.vue'), 'utf8');
  assert.match(production, /SupervisorReviewInspector.*project-id="Number\(project\.id\)".*script-id="Number\(episodesId\)"/);
  assert.doesNotMatch(source, /advertisement\.asset-ready|actOnStage|AI\.generate/);
});

test('AI section shows exact Skill and sends only current scope and freshness hashes', async t => {
  const f = setup(t); await settle();
  assert.match(f.el.textContent, /supervisor\.test @ v1/);
  assert.match(f.el.textContent, /策略版本/);
  f.button('AI 审查当前版本').click(); await settle();
  const request = f.calls.find(x => x.url.endsWith('/review/ai')).body;
  assert.deepEqual(request, { projectId: 7, scriptId: 42, reviewKey: 'storyboard.semantic-approval', expectedTargetHash: target(42).target.targetHash, expectedControlContextHash: 'a'.repeat(64) });
  assert.equal(request.skillId, undefined); assert.equal(request.modelReference, undefined);
  assert.ok(f.calls.filter(x => x.url.endsWith('/target/read')).length >= 2);
});

test('AI failure remains in its section and duplicate triggers are disabled while busy', async t => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const f = setup(t, { aiResponse: () => pending }); await settle();
  const button = f.button('AI 审查当前版本'); button.click(); await vue.nextTick();
  assert.equal(button.disabled, true);
  button.click(); await vue.nextTick();
  assert.equal(f.calls.filter(x => x.url.endsWith('/review/ai')).length, 1);
  release({ data: { decision: 'PASS' } }); await settle();
  const noPolicy = setup(t, { aiContextError: true }); await settle();
  assert.match(noPolicy.el.textContent, /AI policy unavailable/);
  assert.equal(noPolicy.button('人工确认 PASS').disabled, false);
});
