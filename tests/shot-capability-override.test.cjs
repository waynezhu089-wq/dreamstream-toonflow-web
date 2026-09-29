const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<html><body></body></html>', { url: 'http://localhost' });
for (const key of ['window', 'document', 'Element', 'HTMLElement', 'SVGElement', 'Node', 'Event']) global[key] = dom.window[key];
const vue = require('vue'), ts = require('typescript');
const { parse, compileScript, compileTemplate } = require('vue/compiler-sfc');
const file = path.resolve(__dirname, '../src/views/production/components/ShotCapabilityOverride.vue');
const descriptor = parse(fs.readFileSync(file, 'utf8'), { filename: file }).descriptor;
assert.deepEqual(compileTemplate({ source: descriptor.template.content, filename: file, id: 'shot-capability' }).errors, []);
const code = ts.transpileModule(compileScript(descriptor, { id: 'shot-capability', inlineTemplate: true }).content,
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
const settle = async () => { for (let i = 0; i < 5; i++) { await new Promise(resolve => setTimeout(resolve, 0)); await vue.nextTick(); } };

function mount(t, post) {
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', code)(id => id === '@/utils/axios' ? { post } : require(id), mod, mod.exports);
  const events = [], el = document.createElement('div'); document.body.append(el);
  const app = vue.createApp({ render: () => vue.h(mod.exports.default,
    { projectId: 7, scriptId: 12, storyboardId: 9, capabilityId: null, onApplied: () => events.push('applied') }) });
  app.component('t-dialog', { template: '<div><slot /></div>' });
  app.component('t-button', { emits: ['click'], template: '<button @click="$emit(\'click\')"><slot /></button>' });
  app.mount(el); t.after(() => { app.unmount(); el.remove(); });
  const save = () => [...el.querySelectorAll('button')].find(button => button.textContent === '保存').click();
  return { el, events, save };
}

test('mounted Shot control lists VERIFIED exact IDs, saves current scope, clears to fallback and shows server rejection', async t => {
  const writes = [];
  let fail = false;
  const post = async (url, body) => {
    if (url === '/capabilities/list') return { data: [{ versions: [
      { capabilityId: 'local.image.v1', status: 'VERIFIED' },
      { capabilityId: 'draft.image.v1', status: 'DRAFT' },
      { capabilityId: 'disabled.image.v1', status: 'DISABLED' },
    ] }] };
    writes.push({ url, body });
    if (fail) throw { response: { data: { message: 'Capability 不符合图片角色' } } };
    return { data: { capabilityId: body.capabilityId } };
  };
  const { el, events, save } = mount(t, post); await settle();
  const select = el.querySelector('select');
  assert.deepEqual([...select.options].map(option => option.value), ['', 'local.image.v1']);
  select.value = 'local.image.v1'; select.dispatchEvent(new Event('change', { bubbles: true })); await settle();
  save(); await settle();
  assert.deepEqual(writes[0], { url: '/storyboardCapability', body: {
    projectId: 7, scriptId: 12, storyboardId: 9, capabilityId: 'local.image.v1' } });
  assert.deepEqual(events, ['applied']);
  select.value = ''; select.dispatchEvent(new Event('change', { bubbles: true })); await settle();
  save(); await settle(); assert.equal(writes[1].body.capabilityId, null);
  fail = true; save(); await settle();
  assert.match(el.querySelector('[role="alert"]').textContent, /不符合图片角色/);
  assert.equal(events.length, 2);
});

test('Storyboard card exposes selector only for Controlled AI text-to-image and refreshes authoritative data', async () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/views/production/node/storyboard.vue'), 'utf8');
  const parsed = parse(source, { filename: 'storyboard.vue' }).descriptor;
  assert.deepEqual(compileTemplate({ source: parsed.template.content, filename: 'storyboard.vue', id: 'storyboard' }).errors, []);
  assert.match(parsed.template.content, /controlled && item\.id && item\.productionMode === 'AI_TEXT_TO_IMAGE'/);
  assert.match(parsed.template.content, /<ShotCapabilityOverride[^>]+@applied="refreshCapabilityShot"/);
  const syntax = ts.createSourceFile('storyboard.ts', parsed.scriptSetup.content, ts.ScriptTarget.Latest, true);
  const fn = syntax.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'refreshCapabilityShot');
  assert.ok(fn);
  let refreshes = 0;
  const refresh = new Function('capabilityShot', 'productionAgentStore',
    ts.transpileModule(fn.getText(syntax), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText + ';return refreshCapabilityShot;')(
    { value: { id: 9 } }, () => ({ getFlowData: async () => { refreshes++; } }));
  await refresh(); assert.equal(refreshes, 1);
});
