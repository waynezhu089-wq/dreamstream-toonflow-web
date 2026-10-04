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

function mount(t, post, props = {}) {
  const module = { exports: {} };
  const studioActions = {};
  const requireMock = id => {
    if (id === '@/utils/axios') return { post, get: async () => new Blob() };
    if (id === '@/stores/setting') return () => ({});
    if (id === '@/stores/v04ProposalWorkspace') return { useV04ProposalWorkspace: () => ({
      current: () => ({ visualSpecProposals: {}, studioActions }),
      putStudioAction: (messageId, action) => { studioActions[messageId] = vue.reactive({ action, handled: false }); },
    }) };
    if (id === '@/components/ModelPresets.vue') return { render: () => vue.h('div', 'Model Presets') };
    if (id === 'pinia') return { storeToRefs: () => ({ themeSetting: vue.ref({ mode: 'dark' }) }) };
    if (id === 'md-editor-v3') return { MdPreview: { props: ['modelValue'], template: '<div class="md-preview">{{ modelValue }}</div>' } };
    return require(id);
  };
  new Function('require', 'module', 'exports', code)(requireMock, module, module.exports);
  const el = document.createElement('div'); document.body.append(el);
  const app = vue.createApp({ render: () => vue.h(module.exports.default,
    { projectId: 7, scriptId: 2, stage: 'creative', routeName: 'pilot/creative', selected: null, creativeMode: true, ...props }) });
  app.component('t-dialog', { props: ['visible'], render() { return this.visible ? vue.h('div', { class: 'dialog-stub' }, this.$slots.default?.()) : null; } });
  app.mount(el);
  t.after(() => { app.unmount(); el.remove(); });
  const button = label => [...el.querySelectorAll('button')].find(node => node.textContent.trim() === label);
  const send = async text => {
    const input = el.querySelector('textarea'); input.value = text; input.dispatchEvent(new Event('input', { bubbles: true }));
    await vue.nextTick(); button('发送').click(); await settle();
  };
  return { el, button, send, studioActions };
}

test('Studio uses the one Agent composer and keeps a controlled proposal in the same conversation turn', async t => {
  const action = { targetType: 'VISUAL_SPEC', targetKey: 'CHAR-001', summary: '收瘦体型', rationale: '保持年龄感', proposal: { canonicalKey: 'CHAR-001' }, applied: false };
  let accepted = 0, historyReads = 0;
  const panel = mount(t, (url, body) => {
    if (url === '/v04/agent/history') return Promise.resolve({ data: { messages: ++historyReads === 1 ? [] : [
      { id: 'studio-user', role: 'user', content: '让男孩再瘦一点', createTime: Date.now() },
      { id: 'studio-assistant', role: 'assistant', content: '建议收瘦体型。', createTime: Date.now() + 1 },
    ] } });
    assert.equal(url, '/v04/agent/studio-turn');
    assert.equal(body.context.selectedObject.key, 'CHAR-001');
    return Promise.resolve({ data: { mode: 'PROPOSE_CHANGE', reply: '建议收瘦体型。', actionProposal: action,
      userMessageId: 'studio-user', assistantMessageId: 'studio-assistant' } });
  }, { studioMode: true, selected: { type: 'ASSET', key: 'CHAR-001' }, scopeLabel: '正在讨论：男孩',
    acceptStudioProposal: async proposal => { assert.deepEqual(proposal, action); accepted++; } });
  await settle(); await panel.send('让男孩再瘦一点');
  assert.equal(panel.el.querySelectorAll('.composer').length, 1);
  assert.match(panel.el.textContent, /正在讨论：男孩/);
  assert.match(panel.el.querySelector('.studio-proposal').textContent, /收瘦体型.*提案尚未应用/s);
  assert.equal(accepted, 0, 'the model response cannot apply project truth');
  assert.equal(panel.button('接受修改并预览').disabled, false);
  panel.button('接受修改并预览').click(); await settle();
  assert.equal(accepted, 1);
  assert.equal(panel.studioActions['studio-assistant'].handled, true);
  assert.match(panel.el.querySelector('.studio-proposal').textContent, /已送入受控预览/);
});

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

test('Vision reanalysis keeps provider versus schema errors visible with a diagnostic code', async t => {
  let failure = { status: 'VISION_ANALYSIS_FAILED', reply: '视觉模型调用失败，请检查供应商配置。', errorCode: 'PILOT_VISION_PROVIDER_FAILED', errorId: 'diagnostic-1' };
  const user = { id: 'saved-user', role: 'user', content: '请看 Logo', attachments: [{ id: 'saved-image', name: 'logo.png', mimeType: 'image/png' }] };
  const panel = mount(t, async url => {
    if (url === '/v04/agent/history') return { data: { visionConfigured: true, messages: [user] } };
    if (url === '/v04/agent/reanalyze') return { data: failure };
    throw new Error(`unexpected ${url}`);
  });
  await settle();
  panel.button('重新分析这条消息').click(); await settle();
  assert.match(panel.el.querySelector('.turn.assistant [role="alert"]').textContent, /VISION_PROVIDER_FAILED.*diagnostic-1/);
  assert.ok(panel.button('配置视觉模型'));
  failure = { status: 'VISION_ANALYSIS_FAILED', reply: '视觉模型已返回内容，但结构化分析失败，可以重试。', errorCode: 'PILOT_VISION_SCHEMA_FAILED', errorId: 'diagnostic-2' };
  panel.button('重新分析这条消息').click(); await settle();
  assert.match(panel.el.querySelector('.turn.assistant [role="alert"]').textContent, /VISION_SCHEMA_FAILED.*diagnostic-2/);
  assert.equal(panel.button('配置视觉模型'), undefined);
});

test('a persisted image provider failure remains in the Agent turn after authoritative history refresh', async t => {
  let historyReads = 0;
  const panel = mount(t, async url => {
    if (url === '/v04/agent/history') return { data: { visionConfigured: true, messages: ++historyReads === 1 ? [] : [
      { id: 'saved-user', role: 'user', content: '分析图片', createTime: Date.now(), attachments: [{ id: 'saved-image', name: 'logo.png', mimeType: 'image/png' }] },
      ...(historyReads > 2 ? [{ id: 'reanalysis-answer', role: 'assistant', content: '真实图片观察' }] : []),
    ] } };
    if (url === '/v04/agent/chat') return { data: { status: 'VISION_ANALYSIS_FAILED', reply: '视觉模型调用失败，请检查供应商配置。', errorCode: 'PILOT_VISION_PROVIDER_FAILED', errorId: 'diagnostic-3', userMessageId: 'saved-user' } };
    if (url === '/v04/agent/reanalyze') return { data: { status: 'ANSWERED', reply: '真实图片观察' } };
    throw new Error(`unexpected ${url}`);
  });
  await settle(); await panel.send('分析图片');
  assert.equal(panel.el.querySelectorAll('.turn.user').length, 1);
  assert.match(panel.el.querySelector('.turn.assistant [role="alert"]').textContent, /VISION_PROVIDER_FAILED.*diagnostic-3/);
  panel.button('重新分析这条消息').click(); await settle();
  assert.equal(panel.el.querySelector('.turn.assistant [role="alert"]'), null,'successful reanalysis removes the stale provider error');
  assert.match(panel.el.querySelector('.turn.assistant').textContent, /真实图片观察/);
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
