const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<html><body></body></html>', { url: 'http://localhost' });
for (const key of ['window', 'document', 'Element', 'HTMLElement', 'SVGElement', 'Node', 'Event']) global[key] = dom.window[key];
const vue = require('vue'), ts = require('typescript');
const { parse, compileScript, compileTemplate } = require('vue/compiler-sfc');
const { parse: parseTemplate } = require('@vue/compiler-dom');
const file = path.resolve(__dirname, '../src/views/production/components/RevisionPanel.vue');
const descriptor = parse(fs.readFileSync(file, 'utf8'), { filename: file }).descriptor;
assert.deepEqual(compileTemplate({ source: descriptor.template.content, filename: file, id: 'revision-panel' }).errors, []);
const script = compileScript(descriptor, { id: 'revision-panel', inlineTemplate: true }).content;
const code = ts.transpileModule(script, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
const elements = nodes => nodes.filter(node => node.type === 1);
const propClass = node => node.props.find(prop => prop.name === 'class')?.value?.content || '';

test('Production mounts RevisionPanel and StageRecovery beside VueFlow, with separate bounded positions', () => {
  const productionFile = path.resolve(__dirname, '../src/views/production/index.vue');
  const production = parse(fs.readFileSync(productionFile, 'utf8'), { filename: productionFile }).descriptor;
  const tree = parseTemplate(production.template.content);
  const shell = elements(tree.children).find(node => node.tag === 'div' && propClass(node) === 'production-shell');
  assert.ok(shell);
  const children = elements(shell.children);
  assert.deepEqual(children.filter(node => ['VueFlow', 'RevisionPanel', 'StageRecovery'].includes(node.tag)).map(node => node.tag),
    ['VueFlow', 'RevisionPanel', 'StageRecovery']);
  const flow = children.find(node => node.tag === 'VueFlow');
  const descendants = node => elements(node.children).flatMap(child => [child, ...descendants(child)]);
  assert.ok(!descendants(flow).some(node => node.tag === 'RevisionPanel'));
  assert.match(production.styles[0].content, /recovery-below-revision[\s\S]*top:\s*160px/);
});

async function settle() { for (let i = 0; i < 3; i++) await vue.nextTick(); }
function mountPanel(t, overrides = {}) {
  const state = vue.reactive({ mode: 'CONTROLLED_V2', proposal: null,
    draft: { origin: 'MANUAL_EDIT', operations: [{ type: 'EDIT' }] }, dialogOpen: false,
    status: 'DRAFT', scope: { projectId: 7, scriptId: 12, generation: 1 },
    preview: null, humanReason: '', error: '', ...overrides });
  const actions = [];
  const revision = { state, open: (...args) => actions.push(['open', ...args]),
    discardProposal: () => { actions.push(['discard']); state.proposal = null; },
    refreshApplied: () => actions.push(['refresh']), close: () => { state.dialogOpen = false; },
    previewDraft: () => {}, confirm: () => {} };
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', code)(id => {
    if (id === '@/views/production/revision/coordinator') return { useStoryboardRevision: () => revision };
    if (id === '@/views/production/revision/proposalPlan') return { proposalOperations: () => [{ type: 'ADD' }], semanticBaseline: () => 'same' };
    if (id === '@/stores/productionAgent') return () => ({ getFlowData: async () => {} });
    return require(id);
  }, mod, mod.exports);
  const style = document.createElement('style'); style.textContent = descriptor.styles[0].content; document.head.append(style);
  const el = document.createElement('div'); document.body.append(el);
  const canvasEvents = [];
  const dialog = vue.defineComponent({ props: ['visible', 'attach'], setup(props, { slots }) {
    return () => props.visible ? vue.h('div', { class: 'mock-revision-dialog' }, slots.default?.()) : null;
  } });
  const app = vue.createApp({ render: () => vue.h('div', { class: 'production-shell',
    onPointerdown: () => canvasEvents.push('pointerdown'), onMousedown: () => canvasEvents.push('mousedown'),
    onWheel: () => canvasEvents.push('wheel'), onClick: () => canvasEvents.push('click') }, [
    vue.h('div', { class: 'vue-flow__viewport' }), vue.h(mod.exports.default, { storyboard: [] }),
  ]) });
  app.component('t-dialog', dialog); app.mount(el);
  t.after(() => { app.unmount(); el.remove(); style.remove(); });
  return { state, actions, el, canvasEvents };
}

test('mounted retained draft reopens its dialog and panel gestures never reach canvas', async t => {
  const { state, el, canvasEvents } = mountPanel(t);
  await settle();
  const panel = el.querySelector('.revision-entry'); assert.ok(panel);
  const css = window.getComputedStyle(panel);
  assert.equal(css.position, 'absolute'); assert.equal(css.zIndex, '110');
  assert.equal(css.pointerEvents, 'auto'); assert.equal(css.overflowY, 'auto');
  assert.equal(state.dialogOpen, false);
  assert.equal(el.querySelector('.mock-revision-dialog'), null);
  for (const type of ['pointerdown', 'mousedown', 'wheel'])
    panel.dispatchEvent(new dom.window.Event(type, { bubbles: true }));
  const button = [...panel.querySelectorAll('button')].find(item => item.textContent === '继续未提交的修订草稿');
  assert.ok(button);
  button.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  await settle();
  assert.equal(state.dialogOpen, true);
  assert.ok(el.querySelector('.mock-revision-dialog'));
  assert.deepEqual(canvasEvents, []);
});

test('proposal, discard and refresh entries remain clickable in the same overlay', async t => {
  const proposal = { kind: 'ADD', candidate: {}, baseline: 'same' };
  const { state, actions, el } = mountPanel(t, { proposal, draft: null, status: 'REFRESH_PENDING' });
  await settle();
  const click = async label => { const button = [...el.querySelectorAll('.revision-entry button')].find(item => item.textContent === label);
    assert.ok(button, label); button.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); await settle(); };
  await click('Agent 分镜提案待人工确认');
  assert.deepEqual(actions[0], ['open', 'AGENT_ADD', [{ type: 'ADD' }]]);
  await click('丢弃提案'); assert.equal(state.proposal, null);
  await click('修订已应用，重试刷新'); assert.deepEqual(actions.at(-1), ['refresh']);
});
