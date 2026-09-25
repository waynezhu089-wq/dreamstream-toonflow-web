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
function setup(t) {
  const calls = [];
  const post = async (url, body) => { calls.push({ url, body });
    if (url.endsWith('/target/read')) return { data: target(body.scriptId) };
    if (url.endsWith('/review/history')) return { data: { history: [{ reviewId: 'old', decision: 'PASS', status: 'STALE', source: 'HUMAN', actorDisplayName: 'Reviewer', createdAt: Date.now(), summary: 'Old', targetHash: 'b'.repeat(64), profileKey: 'mv', profileVersion: 'v1', recipeKey: null, issues: [] }] } };
    if (url.endsWith('/gate/check')) return { data: { pass: false, code: 'SUPERVISOR_REVIEW_REQUIRED', reason: 'Review needed', effectiveDecision: null, staleCount: 1 } };
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
  assert.deepEqual(f.calls.filter(x => !x.url.endsWith('/review/decide')).map(x => x.body), Array(3).fill({ projectId: 7, scriptId: 42, reviewKey: 'storyboard.semantic-approval' }));
  window.confirm = () => true;
  f.button('人工确认 PASS').click(); await settle();
  const decision = f.calls.find(x => x.url.endsWith('/review/decide')).body;
  assert.equal(decision.expectedTargetHash, target(42).target.targetHash);
  assert.equal(decision.expectedControlContextHash, 'a'.repeat(64));
  assert.equal(decision.decision, 'PASS'); assert.equal(decision.source, undefined); assert.equal(decision.actorUserId, undefined);
  f.props.scriptId = 43; await settle();
  assert.equal(f.calls.filter(x => x.url.endsWith('/target/read')).at(-1).body.scriptId, 43);
});

test('REVISE requires a blocker in UI and Production owns the Inspector mount', async t => {
  const f = setup(t); await settle();
  f.button('填写 REVISE').click(); await settle();
  assert.equal(f.button('提交 REVISE').disabled, true);
  f.button('添加问题').click(); await settle();
  assert.equal(f.button('提交 REVISE').disabled, true); // summary and issue message remain required by server
  const production = fs.readFileSync(path.join(root, 'views/production/index.vue'), 'utf8');
  assert.match(production, /SupervisorReviewInspector.*project-id="Number\(project\.id\)".*script-id="Number\(episodesId\)"/);
  assert.doesNotMatch(source, /advertisement\.asset-ready|actOnStage|modelReference|AI\.generate/);
});
