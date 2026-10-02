const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<html><body></body></html>', { url: 'http://localhost' });
for (const key of ['window', 'document', 'Element', 'HTMLElement', 'SVGElement', 'Node', 'Event']) global[key] = dom.window[key];
global.HTMLElement.prototype.scrollTo = function () {};
global.crypto ??= require('node:crypto').webcrypto;
const vue = require('vue');
const ts = require('typescript');
const { parse, compileScript, compileTemplate } = require('vue/compiler-sfc');
const file = path.resolve(__dirname, '../src/views/pilot/ProjectAgentPanel.vue');
const source = fs.readFileSync(file, 'utf8');
const descriptor = parse(source, { filename: file }).descriptor;
assert.deepEqual(compileTemplate({ source: descriptor.template.content, filename: file, id: 'v04-agent' }).errors, []);
const code = ts.transpileModule(compileScript(descriptor, { id: 'v04-agent', inlineTemplate: true }).content,
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
const settle = async () => { for (let i = 0; i < 5; i++) { await new Promise(resolve => setTimeout(resolve, 0)); await vue.nextTick(); } };
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

function mount(t, post) {
  const module = { exports: {} };
  const requireMock = id => {
    if (id === '@/utils/axios') return { post, get: async () => new Blob() };
    if (id === '@/stores/setting') return () => ({});
    if (id === '@/components/ModelPresets.vue') return { render: () => vue.h('div', 'Model Presets') };
    if (id === 'pinia') return { storeToRefs: () => ({ themeSetting: vue.ref({ mode: 'dark' }) }) };
    if (id === 'md-editor-v3') return { MdPreview: { props: ['modelValue'], template: '<div class="md-preview">{{ modelValue }}</div>' } };
    return require(id);
  };
  new Function('require', 'module', 'exports', code)(requireMock, module, module.exports);
  const el = document.createElement('div'); document.body.append(el);
  const app = vue.createApp({ render: () => vue.h(module.exports.default,
    { projectId: 7, scriptId: 2, stage: 'creative', routeName: 'pilot/creative', selected: null, creativeMode: true }) });
  app.component('t-dialog', { props: ['visible'], render() { return this.visible ? vue.h('div', { class: 'dialog-stub' }, this.$slots.default?.()) : null; } });
  app.mount(el);
  t.after(() => { app.unmount(); el.remove(); });
  const button = label => [...el.querySelectorAll('button')].find(node => node.textContent.trim() === label);
  const send = async text => {
    const input = el.querySelector('textarea'); input.value = text; input.dispatchEvent(new Event('input', { bubbles: true }));
    await vue.nextTick(); button('发送').click(); await settle();
  };
  return { el, button, send };
}

test('send immediately shows a distinct user turn and animated Agent turn, then replaces it with authoritative history', async t => {
  const chat = deferred(), refreshed = deferred();
  let historyReads = 0, chatCalls = 0;
  const panel = mount(t, (url, body) => {
    if (url === '/v04/agent/history') return ++historyReads === 1 ? Promise.resolve({ data: { messages: [] } }) : refreshed.promise;
    if (url === '/v04/agent/chat') { chatCalls++; assert.equal(body.message, '这支片的视觉节奏如何？'); return chat.promise; }
    throw new Error(`unexpected ${url}`);
  });
  await settle(); await panel.send('这支片的视觉节奏如何？');
  assert.equal(chatCalls, 1);
  assert.equal(panel.el.querySelectorAll('.turn.user').length, 1);
  assert.match(panel.el.querySelector('.turn.user').textContent, /你.*视觉节奏/);
  assert.match(panel.el.querySelector('.turn.assistant [role="status"]').textContent, /Project Agent 正在思考/);
  assert.ok(panel.button('发送').disabled, 'pending request blocks duplicate send');
  panel.button('发送').click(); assert.equal(chatCalls, 1);

  chat.resolve({ data: { reply: '## 镜头节奏\n先慢后快。' } }); await settle();
  assert.match(panel.el.querySelector('.turn.assistant [role="status"]').textContent, /正在整理回答/);
  assert.match(panel.el.querySelector('.md-preview').textContent, /镜头节奏/);
  refreshed.resolve({ data: { messages: [
    { id: 'server-user', role: 'user', content: '这支片的视觉节奏如何？', createTime: Date.now() },
    { id: 'server-agent', role: 'assistant', content: '## 镜头节奏\n先慢后快。', createTime: Date.now() + 1 },
  ] } });
  await settle();
  assert.equal(panel.el.querySelectorAll('.turn.user').length, 1);
  assert.equal(panel.el.querySelectorAll('.turn.assistant').length, 1);
  assert.equal(panel.el.querySelector('.turn-progress'), null);
});

test('transport uncertainty stays in the Agent turn and requires status check instead of blind retry', async t => {
  let historyReads = 0, chatCalls = 0;
  const panel = mount(t, async url => {
    if (url === '/v04/agent/history') return { data: { messages: ++historyReads === 1 ? [] : [
      { id: 'persisted-user', role: 'user', content: '请看我的问题', createTime: Date.now() },
      ...(historyReads >= 3 ? [{ id: 'late-answer', role: 'assistant', content: '迟到的完整回复', createTime: Date.now() + 1 }] : []),
    ] } };
    if (url === '/v04/agent/chat') { chatCalls++; throw new Error('连接超时'); }
    throw new Error(`unexpected ${url}`);
  });
  await settle(); await panel.send('请看我的问题');
  assert.match(panel.el.querySelector('.turn.assistant [role="alert"]').textContent, /连接超时.*结果尚不确定/);
  assert.ok(panel.button('检查状态'));
  assert.equal(panel.button('重试'), undefined, 'uncertain delivery cannot be blindly retried');
  panel.button('检查状态').click(); await settle();
  assert.match(panel.el.querySelector('.turn.assistant [role="alert"]').textContent, /服务器已收到/);
  assert.equal(panel.el.querySelectorAll('.turn.user').length, 1, 'persisted history replaces optimistic user turn');
  assert.equal(chatCalls, 1);
  panel.button('检查状态').click(); await settle();
  assert.equal(panel.el.querySelectorAll('.turn.assistant').length, 1, 'late server answer replaces the failed placeholder');
  assert.match(panel.el.querySelector('.turn.assistant').textContent, /迟到的完整回复/);
  assert.equal(panel.button('检查状态'), undefined);
});

test('status check does not claim a different identical project message as this request', async t => {
  let historyReads = 0;
  const panel = mount(t, async url => {
    if (url === '/v04/agent/history') return { data: { messages: ++historyReads === 1 ? [] : [
      { id: 'other-user', role: 'user', content: '同一问题', createTime: Date.now() },
      { id: 'other-answer', role: 'assistant', content: '别的对话的回答', createTime: Date.now() + 1 },
      { id: 'possible-user', role: 'user', content: '同一问题', createTime: Date.now() + 2 },
    ] } };
    if (url === '/v04/agent/chat') throw new Error('连接中断');
    throw new Error(`unexpected ${url}`);
  });
  await settle(); await panel.send('同一问题');
  panel.button('检查状态').click(); await settle();
  assert.equal(panel.el.querySelectorAll('.turn.assistant').length, 2, 'unrelated answer does not remove the pending Agent turn');
  assert.match(panel.el.querySelector('.turn.assistant [role="alert"]').textContent, /多条相同消息/);
  assert.ok(panel.button('检查状态'));
});

test('known provider failure remains explicit after checking the persisted message', async t => {
  let historyReads = 0;
  const panel = mount(t, async url => {
    if (url === '/v04/agent/history') return { data: { messages: ++historyReads === 1 ? [] : [
      { id: 'saved-user', role: 'user', content: '分析图片', createTime: Date.now() },
    ] } };
    if (url === '/v04/agent/chat') throw { code: 'PILOT_IMAGE_MODEL_UNSUPPORTED', message: '当前文本模型未能处理图片' };
    throw new Error(`unexpected ${url}`);
  });
  await settle(); await panel.send('分析图片');
  assert.match(panel.el.querySelector('.turn.assistant [role="alert"]').textContent, /当前文本模型未能处理图片/);
  panel.button('检查状态').click(); await settle();
  assert.match(panel.el.querySelector('.turn.assistant [role="alert"]').textContent, /当前文本模型未能处理图片.*消息已保留/);
  assert.equal(panel.button('重试'), undefined);
});

test('saved conversational image offers vision setup and reanalysis without reupload', async t => {
  let historyReads = 0, reanalysis = 0;
  const user = { id: 'saved-user', role: 'user', content: '请看 Logo', attachments: [{ id: 'saved-image', name: 'logo.png', mimeType: 'image/png' }] };
  const panel = mount(t, async (url, body) => {
    if (url === '/v04/agent/history') return { data: { visionConfigured: ++historyReads > 1, messages: historyReads > 2 ? [user, { id: 'answer', role: 'assistant', content: 'Logo 是蓝色轮廓。' }] : [user] } };
    if (url === '/v04/agent/reanalyze') { reanalysis++; assert.equal(body.userMessageId, 'saved-user'); return { data: { status: 'ANSWERED', reply: 'Logo 是蓝色轮廓。' } }; }
    throw new Error(`unexpected ${url}`);
  });
  await settle();
  assert.match(panel.el.textContent, /图片已保存为对话参考.*视觉模型未配置/);
  assert.ok(panel.button('重新分析这条消息').disabled);
  panel.button('配置视觉模型').click(); await settle();
  assert.ok(panel.button('完成并返回对话'));
  panel.button('完成并返回对话').click(); await settle();
  assert.equal(panel.button('重新分析这条消息').disabled, false);
  panel.button('重新分析这条消息').click(); await settle();
  assert.equal(reanalysis, 1);
  assert.match(panel.el.querySelector('.turn.assistant').textContent, /Logo 是蓝色轮廓/);
});

test('definite pre-persist rejection offers Retry on the same local turn without another user bubble', async t => {
  let chatCalls = 0;
  const panel = mount(t, async url => {
    if (url === '/v04/agent/history') return { data: { messages: [] } };
    if (url === '/v04/agent/chat') { chatCalls++; throw { code: 'PILOT_INPUT_INVALID', message: '输入不合法' }; }
    throw new Error(`unexpected ${url}`);
  });
  await settle(); await panel.send('请继续');
  assert.match(panel.el.querySelector('.turn.assistant [role="alert"]').textContent, /输入不合法/);
  panel.button('重试').click(); await settle();
  assert.equal(chatCalls, 2);
  assert.equal(panel.el.querySelectorAll('.turn.user').length, 1);
});

test('quiet role colors and message widths distinguish user, Agent, progress, error and accepted state', () => {
  assert.match(source, /--user-ink:color-mix\([^;]*#779dce/);
  assert.match(source, /--agent-ink:color-mix\([^;]*#a792c1/);
  assert.match(source, /\.turn\.user\{[^}]*max-width:92%/);
  assert.match(source, /\.turn\.assistant\{[^}]*border-top:/);
  assert.match(source, /\.turn-progress\{[^}]*--td-text-color-secondary/);
  assert.match(source, /\.turn-error\{[^}]*--td-error-color/);
  assert.match(source, /\.attachment \.accepted\{color:var\(--td-success-color\)/);
  assert.match(source, /<MdPreview[^>]+:modelValue="m\.content"/);
});
