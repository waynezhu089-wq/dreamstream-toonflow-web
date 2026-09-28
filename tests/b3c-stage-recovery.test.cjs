const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<html><body></body></html>', { url: 'http://localhost' });
for (const key of ['window', 'document', 'Element', 'HTMLElement', 'SVGElement', 'Node', 'Event']) global[key] = dom.window[key];
const vue = require('vue'), ts = require('typescript'), { parse, compileScript, compileTemplate } = require('vue/compiler-sfc');
const { parse: parseTemplate } = require('@vue/compiler-dom');
const file = path.resolve(__dirname, '../src/views/production/components/StageRecovery.vue');
const descriptor = parse(fs.readFileSync(file, 'utf8'), { filename: file }).descriptor;
assert.deepEqual(compileTemplate({ source: descriptor.template.content, filename: file, id: 'stage-recovery' }).errors, []);
const script = compileScript(descriptor, { id: 'stage-recovery', inlineTemplate: true }).content;
const code = ts.transpileModule(script, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
const stage = (key, state, availability, gate = true) => ({ stageKey: key, displayName: key,
  persistentState: state, availability, allowSkip: false, entryGate: { pass: gate }, exitGate: { pass: gate } });
async function settle() { for (let i = 0; i < 6; i++) { await new Promise(resolve => setTimeout(resolve, 0)); await vue.nextTick(); } }

test('Production mounts StageRecovery beside VueFlow in a bounded overlay', () => {
  const productionFile = path.resolve(__dirname, '../src/views/production/index.vue');
  const production = parse(fs.readFileSync(productionFile, 'utf8'), { filename: productionFile }).descriptor;
  const tree = parseTemplate(production.template.content);
  const elements = nodes => nodes.filter(node => node.type === 1);
  const shell = elements(tree.children).find(node => node.tag === 'div' && node.props.some(prop => prop.name === 'class' && prop.value?.content === 'production-shell'));
  assert.ok(shell, 'positioning shell');
  const children = elements(shell.children).map(node => node.tag);
  assert.ok(children.includes('VueFlow') && children.includes('StageRecovery'));
  assert.ok(children.indexOf('StageRecovery') > children.indexOf('VueFlow'), 'overlay follows canvas as sibling');
  assert.ok(!elements(elements(shell.children).find(node => node.tag === 'VueFlow').children).some(node => node.tag === 'StageRecovery'));
});

test('mounted Stage recovery click completes the current storyboard-board without reaching canvas gestures', async t => {
  let steps = [stage('storyboard-board', 'IN_PROGRESS', 'ACTIVE'), stage('supervisor-review', 'PENDING', 'BLOCKED'),
    stage('image-production', 'PENDING', 'BLOCKED')];
  const calls = [], ready = [];
  const post = async (url, body) => { calls.push({ url, body });
    if (url.endsWith('/read')) return { data: { profile: { profileKey: 'advertisement', version: 'v2' }, stages: steps } };
    if (url.endsWith('/complete') && body.stageKey === 'storyboard-board') steps = [stage('storyboard-board', 'COMPLETED', 'DONE'),
      stage('supervisor-review', 'PENDING', 'READY'), stage('image-production', 'PENDING', 'BLOCKED')];
    else if (url.endsWith('/start') && body.stageKey === 'supervisor-review') steps = [steps[0], stage('supervisor-review', 'IN_PROGRESS', 'ACTIVE'), steps[2]];
    else if (url.endsWith('/complete') && body.stageKey === 'supervisor-review') steps = [steps[0], stage('supervisor-review', 'COMPLETED', 'DONE'), stage('image-production', 'PENDING', 'READY')];
    else if (url.endsWith('/start') && body.stageKey === 'image-production') steps = [steps[0], steps[1], stage('image-production', 'IN_PROGRESS', 'ACTIVE')];
    return { data: {} };
  };
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', code)(id => id === '@/utils/axios' ? { post } : require(id), mod, mod.exports);
  const props = vue.reactive({ projectId: 7, scriptId: 12, generation: 1 });
  const style = document.createElement('style'); style.textContent = descriptor.styles[0].content; document.head.append(style);
  const el = document.createElement('div'); document.body.append(el);
  const canvasEvents = [];
  const app = vue.createApp({ render: () => vue.h('div', { class: 'production-shell',
    onPointerdown: () => canvasEvents.push('pointerdown'), onMousedown: () => canvasEvents.push('mousedown'),
    onWheel: () => canvasEvents.push('wheel'), onClick: () => canvasEvents.push('click') }, [
    vue.h('div', { class: 'vue-flow__viewport' }),
    vue.h(mod.exports.default, { ...props, onReady: value => ready.push(value) }),
  ]) });
  app.mount(el); t.after(() => { app.unmount(); el.remove(); style.remove(); }); await settle();
  const panel = el.querySelector('.stage-recovery-overlay'); assert.ok(panel);
  const css = window.getComputedStyle(panel);
  assert.equal(css.position, 'absolute'); assert.equal(css.zIndex, '100');
  assert.equal(css.pointerEvents, 'auto'); assert.equal(css.overflowY, 'auto');
  for (const type of ['pointerdown', 'mousedown', 'wheel']) panel.dispatchEvent(new dom.window.Event(type, { bubbles: true }));
  assert.deepEqual(canvasEvents, []);
  const click = text => { const button = [...el.querySelectorAll('button')].find(item => item.textContent === text && !item.disabled);
    assert.ok(button, `enabled ${text}`); button.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); };
  assert.equal(calls.filter(item => !item.url.endsWith('/read')).length, 0);
  assert.ok(ready.length > 0 && ready.every(value => value === false));
  click('完成'); await settle();
  const completed = calls.find(item => item.url === '/stageOrchestrator/complete');
  assert.deepEqual(completed?.body, { projectId: 7, scriptId: 12, stageKey: 'storyboard-board', actorType: 'HUMAN', reason: null });
  assert.deepEqual(canvasEvents, []);
  click('开始'); await settle(); assert.equal(calls.at(-2).body.stageKey, 'supervisor-review');
  click('完成'); await settle(); assert.equal(calls.at(-2).body.stageKey, 'supervisor-review');
  click('开始'); await settle(); assert.equal(calls.at(-2).body.stageKey, 'image-production');
  assert.equal(ready.at(-1), true);
  assert.equal(calls.filter(item => item.url.endsWith('/start') || item.url.endsWith('/complete')).length, 4);
});
