const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs'), path = require('node:path');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
for (const key of ['window', 'document', 'Element', 'HTMLElement', 'SVGElement', 'Node', 'File', 'FileReader', 'Event']) global[key] = dom.window[key];
const vue = require('vue');
const ts = require('typescript');
const { parse, compileScript } = require('vue/compiler-sfc');
const root = path.resolve(__dirname, '..');
const settle = async () => { for (let i = 0; i < 8; i++) { await new Promise(r => setTimeout(r, 0)); await vue.nextTick(); } };
function fixture(t, initial = []) {
  const route = vue.reactive({ query: { scriptId: '10' } }); const navigations = [], requests = [];
  const plans = new Map([[10, initial], [11, []]]), states = new Map();
  const units = [{ id: 10, name: '广告 A', relatedAssets: [{ id: 100, name: '真实产品图片' }, { id: 101, name: 'AI 场景' }] }, { id: 11, name: '广告 B', relatedAssets: [{ id: 200, name: '另一条广告的素材' }] }];
  const control = { rejectBind: false, rejectConfirm: false, confirmReady: true, before: null };
  function gate(scriptId) {
    const rows = (plans.get(scriptId) || []).map(item => ({ ...item, ready: item.assetId != null, issue: item.assetId ? null : 'UNBOUND' }));
    return { projectId: 1, scriptId, planItems: rows, prepared: rows.length > 0 && rows.filter(r => r.required).every(r => r.ready), ready: false, confirmed: false, ...states.get(scriptId) };
  }
  const post = async (url, body) => {
    requests.push({ url, body: structuredClone(body) });
    if (control.before) { const response = await control.before(url, body); if (response) return response; }
    if (url === '/script/getScrptApi') return { data: structuredClone(units) };
    if (url.endsWith('/getWorkflowState')) return { data: gate(body.scriptId) };
    if (url.endsWith('/confirmAssetPreparation')) {
      if (control.rejectConfirm) throw { message: '真实素材来源已失效，请重新上传。' };
      return { data: { ...gate(body.scriptId), ready: control.confirmReady } };
    }
    if (url === '/assets/uploadClip') { units.find(u => u.id === body.scriptId).relatedAssets.push({ id: 102, name: body.name }); return { data: { id: 102 } }; }
    const list = plans.get(body.scriptId) || [];
    if (url.endsWith('/save')) plans.set(body.scriptId, structuredClone(body.items));
    if (url.endsWith('/bind')) {
      if (control.rejectBind) throw { message: 'REAL_REQUIRED 只能绑定当前文件具有服务器上传来源凭据的资产' };
      list.find(i => i.assetKey === body.assetKey).assetId = body.assetId;
    }
    if (url.endsWith('/unbind')) list.find(i => i.assetKey === body.assetKey).assetId = null;
    return { data: { projectId: body.projectId, scriptId: body.scriptId, items: structuredClone(plans.get(body.scriptId) || []) } };
  };
  const router = { push: async location => { navigations.push(location); }, replace: async location => { route.query = location.query || {}; } };
  const cache = new Map();
  function load(file) {
    file = path.resolve(file); if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} }; cache.set(file, module);
    const source = file.endsWith('.vue') ? compileScript(parse(fs.readFileSync(file, 'utf8'), { filename: file }).descriptor, { id: 'asset-plan', inlineTemplate: true }).content : fs.readFileSync(file, 'utf8');
    const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true }, fileName: file + '.ts' }).outputText;
    new Function('require', 'module', 'exports', code)(name => {
      if (name === '@/components/ModelPresets.vue') return { template: '<div />' };
      if (name === '@/components/StageOrchestratorInspector.vue') return { template: '<div />' };
      if (name === '@/utils/axios') return { post };
      if (name === 'vue-router') return { useRoute: () => route, useRouter: () => router };
      if (name.startsWith('@/')) return load(path.join(root, 'src', name.slice(2) + '.ts'));
      if (name.startsWith('.')) return load(path.resolve(path.dirname(file), name + '.ts'));
      return require(name);
    }, module, module.exports); return module.exports;
  }
  const container = document.createElement('div'); document.body.append(container);
  const component = load(path.join(root, 'src/views/assets/advertisement/AdvertisementAssetPlan.vue')).default;
  const app = vue.createApp(component, { projectId: 1 }); app.mount(container);
  window.confirm = () => true;
  t.after(() => { app.unmount(); container.remove(); });
  const buttons = () => [...container.querySelectorAll('button')];
  const button = text => { const b = buttons().find(b => b.textContent.trim() === text); assert.ok(b, text); return b; };
  const input = async (el, value) => { el.value = value; el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); await settle(); };
  const click = async text => { button(text).click(); await settle(); };
  return { container, requests, plans, states, route, navigations, control, button, input, click, load, gate };
}
const item = (overrides = {}) => ({ assetKey: 'product', name: '产品照片', category: '产品', required: true, sourcePolicy: 'REAL_REQUIRED', assetId: null, ...overrides });
test('current unit Plan/Gate load; Chinese list, blockers, required/source controls and prepared=false guard', async t => {
  const f = fixture(t, [item(), item({ assetKey: 'scene', name: '场景', category: '环境', required: false, sourcePolicy: 'AI_ALLOWED' })]); await settle();
  for (const suffix of ['/read', '/getWorkflowState']) assert.ok(f.requests.some(r => r.url.endsWith(suffix) && r.body.projectId === 1 && r.body.scriptId === 10));
  const text = f.container.textContent; for (const label of ['素材清单', '必需素材 1 项，已准备 0 项，还缺 1 项', '产品照片', '必须上传真实素材', '允许AI生成', '未绑定', '可选']) assert.ok(text.includes(label), label);
  assert.equal(text.includes('REAL_REQUIRED'), false); assert.equal(text.includes('AI_ALLOWED'), false);
  assert.ok(f.button('确认资产准备完成，进入广告制作').disabled);
  assert.equal(f.container.querySelectorAll('input[type=file]').length, 1);
  assert.ok(f.button('去资产生成'));
});
test('actual UI adds, edits and deletes a stable plan item with only editable fields', async t => {
  const f = fixture(t); await settle(); await f.click('＋ 新增素材');
  const form = () => f.container.querySelector('form');
  await f.input(form().querySelector('input[required]'), '包装照片');
  await f.input(form().querySelectorAll('input[required]')[1], '产品');
  await f.input(form().querySelector('select'), 'AI_ALLOWED');
  form().dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await settle();
  assert.equal(f.plans.get(10)[0].name, '包装照片'); const key = f.plans.get(10)[0].assetKey; assert.ok(key);
  await f.click('编辑'); await f.input(form().querySelector('input[required]'), '新版包装');
  form().querySelector('input[type=checkbox]').click(); form().dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await settle();
  assert.equal(f.plans.get(10)[0].assetKey, key); assert.equal(f.plans.get(10)[0].required, false);
  assert.deepEqual(Object.keys(f.plans.get(10)[0]).sort(), ['assetId', 'assetKey', 'category', 'name', 'required', 'sourcePolicy']);
  await f.click('删除'); assert.equal(f.plans.get(10).length, 0);
});
test('binding only lists this unit assets; server rejection is shown and cannot fake real provenance', async t => {
  const f = fixture(t, [item()]); await settle();
  const select = f.container.querySelector('select[aria-label^="为"]'); assert.ok(!select.textContent.includes('另一条'));
  await f.input(select, '101'); f.control.rejectBind = true; await f.click('校验来源并绑定');
  assert.equal(f.plans.get(10)[0].assetId, null); assert.ok(f.container.querySelector('[role=alert]').textContent.includes('来源')); assert.equal(f.navigations.length, 0);
  f.control.rejectBind = false; await f.input(select, '100'); await f.click('校验来源并绑定'); assert.equal(f.plans.get(10)[0].assetId, 100);
  assert.ok(f.container.textContent.includes('当前绑定：真实产品图片'));
  await f.click('解除绑定'); assert.equal(f.plans.get(10)[0].assetId, null);
});
test('real upload calls existing upload endpoint with unit and binds returned asset without source assertions', async t => {
  const f = fixture(t, [item()]); await settle();
  const input = f.container.querySelector('input[type=file]'); Object.defineProperty(input, 'files', { value: [new File(['image'], 'product.png', { type: 'image/png' })] });
  input.dispatchEvent(new Event('change', { bubbles: true })); await settle(); await settle();
  const upload = f.requests.find(r => r.url === '/assets/uploadClip'); assert.equal(upload.body.scriptId, 10); assert.equal(upload.body.projectId, 1); assert.match(upload.body.base64Data, /^data:image\/png;base64,/);
  assert.equal(Object.hasOwn(upload.body, 'sourcePolicy'), false); assert.equal(f.plans.get(10)[0].assetId, 102);
});
test('prepared=true confirmation carries explicit unit; only backend ready=true navigates', async t => {
  const f = fixture(t, [item({ assetId: 100 })]); await settle();
  assert.equal(f.button('确认资产准备完成，进入广告制作').disabled, false);
  f.control.confirmReady = false; await f.click('确认资产准备完成，进入广告制作'); assert.equal(f.navigations.length, 0);
  f.control.rejectConfirm = true; await f.click('确认资产准备完成，进入广告制作'); assert.ok(f.container.textContent.includes('来源已失效')); assert.equal(f.navigations.length, 0);
  f.control.rejectConfirm = false; f.control.confirmReady = true; await f.click('确认资产准备完成，进入广告制作');
  assert.deepEqual(f.requests.find(r => r.url.endsWith('/confirmAssetPreparation')).body, { projectId: 1, scriptId: 10, confirmed: true });
  assert.deepEqual(f.navigations, [{ path: '/production', query: { scriptId: '10' } }]);
});
test('unit switching clears old plan/draft/asset choices and stale confirmation cannot navigate', async t => {
  const f = fixture(t, [item({ assetId: 100 })]); await settle();
  let resolve; f.control.before = (url) => url.endsWith('/confirmAssetPreparation') ? new Promise(r => { resolve = r; }) : null;
  f.button('确认资产准备完成，进入广告制作').click(); await settle();
  f.route.query = { scriptId: '11' }; await settle(); assert.equal(f.container.querySelectorAll('article').length, 0);
  resolve({ data: { ...f.gate(10), ready: true } }); await settle(); assert.equal(f.navigations.length, 0);
  assert.ok(f.requests.some(r => r.url.endsWith('/read') && r.body.scriptId === 11));
});
test('late old-unit reads cannot replace the new unit list', async t => {
  const f = fixture(t, [item()]); await settle();
  let resolve; f.control.before = (url, body) => url.endsWith('/read') && body.scriptId === 10 ? new Promise(r => { resolve = r; }) : null;
  f.button('刷新状态').click(); await settle(); f.route.query = { scriptId: '11' }; await settle();
  resolve({ data: { projectId: 1, scriptId: 10, items: [item()] } }); await settle(); assert.equal(f.container.querySelectorAll('article').length, 0);
});
test('non-advertisement keeps legacy assets UI; every changed Vue script/template compiles', () => {
  for (const file of ['src/views/assets/index.vue', 'src/views/assets/advertisement/AdvertisementAssetPlan.vue', 'src/views/project/index.vue', 'src/pages/workbench/index.vue', 'src/views/production/index.vue']) {
    const { descriptor } = parse(fs.readFileSync(path.join(root, file), 'utf8'), { filename: file });
    assert.doesNotThrow(() => compileScript(descriptor, { id: file, inlineTemplate: true }), file);
  }
  const source = fs.readFileSync(path.join(root, 'src/views/assets/index.vue'), 'utf8');
  assert.match(source, /<AdvertisementAssetPlan v-if="isAdvertisement && !props.selectorMode"/);
  assert.match(source, /<div v-else class="assets">/);
});

function sourceFunction(file, name, bindings) {
  const { descriptor } = parse(fs.readFileSync(path.join(root, file), 'utf8'));
  const source = ts.createSourceFile(file + '.ts', descriptor.scriptSetup.content, ts.ScriptTarget.Latest, true);
  const fn = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name.text === name);
  assert.ok(fn, name);
  const code = ts.transpileModule(fn.getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(bindings), code + `; return ${name};`)(...Object.values(bindings));
}
test('workbench navigation checks selected scriptId and preserves it on blocked and ready routes; legacy bypass unchanged', async t => {
  const f = fixture(t); await settle();
  const helpers = f.load(path.join(root, 'src/utils/advertisementUnit.ts'));
  const project = vue.ref({ id: 1 }), ad = vue.ref(true), activeMenu = vue.ref('/assets');
  const routes = [], requests = []; let ready = false;
  const route = { query: { scriptId: '11' } };
  const handle = sourceFunction('src/pages/workbench/index.vue', 'handleClick', {
    project, isAdvertisement: ad, activeMenu, route, ...helpers,
    router: { push: async r => routes.push(r) },
    axios: { post: async (url, body) => { requests.push(body); return { data: { ...body, ready } }; } },
    window: { $message: { warning() {}, error() {} } }, $t: key => key,
  });
  await handle({ path: '/production' }); assert.deepEqual(requests[0], { projectId: 1, scriptId: 11 }); assert.deepEqual(routes[0], { path: '/assets', query: { scriptId: '11' } });
  ready = true; await handle({ path: '/production' }); assert.deepEqual(routes[1], { path: '/production', query: { scriptId: '11' } });
  ad.value = false; await handle({ path: '/production' }); assert.equal(requests.length, 2); assert.equal(routes[2], '/production');
});
test('Production initialization retains selected advertisement unit instead of resetting to first; legacy keeps original behavior', async t => {
  const f = fixture(t); await settle(); const helpers = f.load(path.join(root, 'src/utils/advertisementUnit.ts'));
  const episodesId = vue.ref(null), episodesOptions = vue.ref([]), ad = vue.ref(true), loads = [];
  const getScripts = sourceFunction('src/views/production/index.vue', 'getScriptData', {
    episodesId, episodesOptions, advertisementViewActive: true, isAdvertisement: ad, project: vue.ref({ id: 1 }), advertisementRoute: { query: { scriptId: '11' } }, ...helpers,
    status: vue.ref('idle'), router: { replace: async () => {} },
    axios: { post: async () => ({ data: [{ id: 10, name: 'first' }, { id: 11, name: 'selected' }] }) },
    productionAgentStore: () => ({ getFlowData: async () => loads.push(episodesId.value), getHistory: async () => {} }),
  });
  await getScripts(); assert.equal(episodesId.value, 11); assert.deepEqual(loads, [11]);
  ad.value = false; await getScripts(); assert.equal(episodesId.value, 10);
});
test('server source and incomplete diagnostics display distinct readable states', async t => {
  const f = fixture(t, [item({ assetId: 100 })]); await settle();
  f.states.set(10, { prepared: false, planItems: [{ ...item({ assetId: 100 }), ready: false, issue: 'ASSET_PLAN_REAL_SOURCE_REQUIRED' }] });
  await f.click('刷新状态'); assert.ok(f.container.textContent.includes('来源不符合')); assert.ok(f.button('确认资产准备完成，进入广告制作').disabled);
  f.states.set(10, { prepared: false, planItems: [{ ...item({ assetId: 100 }), ready: false, issue: 'ASSET_PLAN_IMAGE_INCOMPLETE' }] });
  await f.click('刷新状态'); assert.ok(f.container.textContent.includes('未完成'));
});

test('late mutation refresh from old unit cannot unlock a new-unit operation', async t => {
  const f = fixture(t, [item({ sourcePolicy: 'AI_ALLOWED', assetId: 100 })]); await settle();
  f.plans.set(11, [item({ sourcePolicy: 'AI_ALLOWED' })]);
  let finishOld, finishNew;
  f.control.before = (url, body) => {
    if (url.endsWith('/read') && body.scriptId === 10) return new Promise(r => { finishOld = r; });
    if (url.endsWith('/bind') && body.scriptId === 11) return new Promise(r => { finishNew = r; });
  };
  f.button('解除绑定').click(); await settle();
  f.route.query = { scriptId: '11' }; await settle();
  await f.input(f.container.querySelector('select[aria-label^="为"]'), '200'); f.button('绑定素材').click(); await settle();
  finishOld({ data: { projectId: 1, scriptId: 10, items: [item()] } }); await settle();
  assert.ok(f.button('绑定素材').disabled); assert.ok(f.container.querySelector('select[aria-label="当前广告制作单元"]').disabled);
  finishNew({ data: {} }); await settle();
});
