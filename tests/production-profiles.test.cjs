const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<html><body></body></html>', { url: 'http://localhost' });
for (const key of ['window','document','Element','HTMLElement','SVGElement','Node','Event']) global[key] = dom.window[key];
const vue = require('vue'), ts = require('typescript'), { parse, compileScript } = require('vue/compiler-sfc');
const root = path.resolve(__dirname, '../src');
function component(relative, post) {
  const file = path.join(root, relative), source = fs.readFileSync(file, 'utf8');
  const code = ts.transpileModule(compileScript(parse(source, { filename: file }).descriptor, { id: 'profile-ui', inlineTemplate: true }).content, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  new Function('require','module','exports',code)(id => id === '@/utils/axios' ? { post } : require(id), module, module.exports);
  return module.exports.default;
}
async function settle() { for (let i = 0; i < 8; i++) { await new Promise(resolve => setTimeout(resolve, 0)); await vue.nextTick(); } }
function mount(t, Component, props) {
  const el = document.createElement('div'); document.body.append(el);
  const app = vue.createApp({ render: () => vue.h(Component, props) }); app.mount(el);
  t.after(() => { app.unmount(); el.remove(); });
  return { el, button: text => [...el.querySelectorAll('button')].find(b => b.textContent.includes(text)) };
}

test('generic Inspector uses current project and script, shows Gate blocker and adopts exact legacy version', async t => {
  const calls = [], blocked = { pass: false, code: 'ADVERTISEMENT_ASSET_GATE_BLOCKED', reason: '素材尚未准备' };
  let persisted = false;
  const post = async (url, body) => {
    calls.push({ url, body });
    if (url.endsWith('/adopt-legacy')) { persisted = true; return { data: { version: 'v1' } }; }
    if (url.endsWith('/read')) return { data: { profile: { profileKey: 'advertisement', version: 'v1', status: 'ACTIVE', source: 'LEGACY_ADAPTER', persisted }, productionUnit: body, readyStages: ['brief'], stages: [
      { stageKey: 'brief', displayName: 'Brief', required: true, persistentState: 'PENDING', availability: 'READY', predecessorKeys: [], nextStageKeys: ['asset-preparation'], entryGate: { pass: true, code: 'NO_GATE', reason: null }, exitGate: { pass: true, code: 'NO_GATE', reason: null }, blockerReasons: [] },
      { stageKey: 'asset-preparation', displayName: 'Asset Preparation', required: true, persistentState: 'IN_PROGRESS', availability: 'ACTIVE', predecessorKeys: ['brief'], nextStageKeys: ['director-planning'], entryGate: { pass: true, code: 'NO_GATE', reason: null }, exitGate: blocked, blockerReasons: [`${blocked.code}: ${blocked.reason}`] },
    ] } };
    throw Error(url);
  };
  const f = mount(t, component('components/StageOrchestratorInspector.vue', post), { projectId: 7, scriptId: 42 });
  await settle();
  assert.match(f.el.textContent, /advertisement @ v1/);
  assert.match(f.el.textContent, /ADVERTISEMENT_ASSET_GATE_BLOCKED/);
  assert.equal(f.button('完成').disabled, true);
  assert.deepEqual(calls[0].body, { projectId: 7, scriptId: 42 });
  assert.equal(f.el.querySelector('input'), null);
  f.button('Adopt 当前精确版本').click(); await settle();
  assert.deepEqual(calls.find(c => c.url.endsWith('/adopt-legacy')).body, { projectId: 7 });
  assert.equal(f.el.textContent.includes('尚未持久绑定'), false);
});

test('Profile Library displays exact versions and stage graph without project ID inputs', async t => {
  const definition = { stages: [{ stageKey: 'music', displayName: 'Music', required: true, uiOrder: 10, entryGateKey: null, exitGateKey: null }], transitions: [] };
  const post = async url => ({ data: url.endsWith('/list') ? [{ profileKey: 'mv', displayName: 'MV', description: '', versions: [{ version: 'v1', status: 'ACTIVE', definition }] }] : { family: { profileKey: 'mv', displayName: 'MV' }, versions: [{ version: 'v1', status: 'ACTIVE', definition }] } });
  const f = mount(t, component('components/ProductionProfileLibrary.vue', post)); await settle();
  f.button('v1 · ACTIVE').click(); await settle();
  assert.match(f.el.textContent, /Music/); assert.match(f.el.textContent, /MV · v1/);
  assert.equal(f.el.querySelector('input[placeholder*="project"]'), null);
});

test('Inspector renders an unrelated MV stage graph without advertisement labels', async t => {
  const post = async (_url, body) => ({ data: { profile: { profileKey: 'mv', version: 'v1', status: 'ACTIVE', source: 'MANUAL', persisted: true }, productionUnit: body, readyStages: ['music'], stages: [{ stageKey: 'music', displayName: 'Music Planning', required: true, persistentState: 'PENDING', availability: 'READY', predecessorKeys: [], nextStageKeys: ['beat-board'], entryGate: { pass: true, code: 'NO_GATE', reason: null }, exitGate: { pass: true, code: 'NO_GATE', reason: null }, blockerReasons: [] }] } });
  const f = mount(t, component('components/StageOrchestratorInspector.vue', post), { projectId: 3, scriptId: 30 }); await settle();
  assert.match(f.el.textContent, /mv @ v1/); assert.match(f.el.textContent, /Music Planning/);
  assert.doesNotMatch(f.el.textContent, /Asset Preparation/);
});

test('Inspector is mounted on Gate-accessible Asset Preparation, not by changing Production route Gate', () => {
  const asset = fs.readFileSync(path.join(root, 'views/assets/advertisement/AdvertisementAssetPlan.vue'), 'utf8');
  const setting = fs.readFileSync(path.join(root, 'components/setting/index.vue'), 'utf8');
  const inspector = fs.readFileSync(path.join(root, 'components/StageOrchestratorInspector.vue'), 'utf8');
  assert.match(asset, /<StageOrchestratorInspector :project-id="context.projectId" :script-id="context.scriptId"/);
  assert.match(setting, /ProductionProfileLibrary/);
  assert.doesNotMatch(inspector, /\[\s*['"]brief['"].*['"]asset-planning['"]/);
  assert.match(inspector, /不替代现有 Production Flow/);
});
