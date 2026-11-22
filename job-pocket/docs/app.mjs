import {API_BASE} from './config.mjs';
import {fields, blank, uid, imageTypes, imageLimit, hasImageSignature, salaryGroups} from './model.mjs';
import {read, change} from './store.mjs';
import {exportBackup, readBackup, mergeBackup} from './backup.mjs';

const app = document.querySelector('#app');
const modal = document.querySelector('#modal');
const toast = document.querySelector('#toast');
const api = API_BASE.replace(/\/+$/, '');
const local = location.protocol === 'http:' || ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
let status = {configured:false, message:'AI 服务尚未配置'};
let workspace = {jobs:[], categories:[]};
let ready = false, busy = false, recognizing = false, selecting = false, draft = null;
let filter = 'all', focusField = 'salary', salarySorted = true, revealed = null;
let error = '', toastTimer, imageURLs = [];
const fieldLabel = Object.fromEntries(fields);
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'})[char]);
const route = () => location.hash.slice(1) || 'capture';
const lookup = id => workspace.jobs.find(job => job.id === id);
const title = job => !job.title || ['未提及','待确认'].includes(job.title) ? '未命名岗位' : job.title;
const company = job => !job.company || ['未提及','待确认'].includes(job.company) ? '公司未提及' : job.company;
const display = (job, key) => key === 'company' ? company(job) : key === 'title' ? title(job) : job[key] || '未提及';
const imageURL = blob => {
  const url = URL.createObjectURL(blob);
  imageURLs.push(url);
  return url;
};
const date = time => new Intl.DateTimeFormat('zh-CN', {dateStyle:'medium'}).format(time);
const newDraft = () => ({...blank(), categoryIds:[], image:null});
function tell(message) {
  toast.textContent = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.textContent = ''; }, 4200);
}
function go(page) {
  if (route() === page && location.hash) render();
  else location.hash = page;
}
function selected(actual, expected) { return actual === expected ? 'selected' : ''; }
function button(label, action, tone = 'secondary', disabled = false) {
  return '<button type="button" class="button ' + tone + '" data-action="' + action + '" ' + (disabled ? 'disabled' : '') + '>' + label + '</button>';
}
function pageHeading(name, detail) {
  return '<div class="page-heading"><h1>' + name + '</h1>' + (detail ? '<p>' + detail + '</p>' : '') + '</div>';
}
function showDialog(content) {
  if (modal.open) modal.close();
  modal.innerHTML = content;
  modal.showModal();
}
function confirmAction(heading, detail, action, label = '确认', danger = false) {
  showDialog('<form method="dialog"><h2>' + escape(heading) + '</h2><p>' + escape(detail) + '</p><div class="actions"><button class="button secondary" autofocus>取消</button>' +
    '<button type="button" class="button ' + (danger ? 'danger' : 'primary') + '" id="confirm">' + escape(label) + '</button></div></form>');
  modal.querySelector('#confirm').onclick = () => { modal.close(); action(); };
}
function zoom(blob) {
  const url = URL.createObjectURL(blob);
  showDialog('<div class="zoom"><div class="zoom-bar"><h2>原始截图</h2><form method="dialog"><button class="button secondary" autofocus>关闭</button></form></div><div class="zoom-scroll"><img src="' + url + '" alt="放大的原始招聘截图"></div></div>');
  modal.addEventListener('close', () => URL.revokeObjectURL(url), {once:true});
}
async function write(update, message, after = render) {
  if (busy) return;
  busy = true;
  app.setAttribute('aria-busy', 'true');
  try {
    workspace = await change(update);
    tell(message);
    after();
  } catch (cause) {
    tell(cause.name === 'QuotaExceededError' ? '浏览器存储空间不足，请备份并清理后重试。' : cause.message || '操作失败，请重试。');
  } finally {
    busy = false;
    app.removeAttribute('aria-busy');
  }
}
async function refreshStatus() {
  if (!api && !local) return;
  try {
    const response = await fetch(api + '/api/status', {signal:AbortSignal.timeout(6000), cache:'no-store'});
    if (!response.ok) throw new Error();
    const value = await response.json();
    status = {...value, message:value.configured ? 'AI 服务已配置' : 'AI 服务尚未配置'};
  } catch {
    status = {configured:false, message:api ? '无法连接 AI 服务' : 'AI 服务尚未配置'};
  }
  if (ready && route() === 'capture' && !recognizing) render();
}
function capture() {
  const hasImage = Boolean(draft?.image);
  const count = workspace.jobs.length;
  return '<section class="hero"><div><span class="eyebrow">个人求职工具</span><h1>把招聘截图<br>整理成岗位清单<span>。</span></h1><p>上传截图，提取岗位信息。确认后保存，随时对照薪资、地点和要求。</p></div><a class="hero-link" href="#warehouse"><strong>' + count + '</strong><span>已保存岗位</span></a></section>' +
    '<section class="card upload"><div class="section-head"><div><h2>上传招聘截图</h2><p>一次选择一张 · PNG、JPEG、WebP · 最大 8 MB</p></div><span class="service ' + (status.configured ? 'online' : '') + '">' + escape(status.message) + '</span></div>' +
    '<input id="screenshot" type="file" accept="image/png,image/jpeg,image/webp" class="visually-hidden" ' + (recognizing || selecting ? 'disabled' : '') + '>' +
    (hasImage ? '<div class="preview"><button class="image-button" data-action="zoom-draft" aria-label="放大截图预览"><img alt="招聘截图预览" src="' + imageURL(draft.image) + '"></button><div><strong>截图已就绪</strong><p>' + escape(draft.image.name || '招聘截图') + '</p>' + pickButton('更换截图') + '</div></div>' :
    '<div class="drop"><span class="upload-symbol" aria-hidden="true">＋</span><strong>从相册或文件中选一张截图</strong>' + pickButton(selecting ? '正在读取…' : '选择截图', 'primary') + '</div>') +
    '<p class="notice">点击「开始识别」后，截图会发送到配置的后台与 AI 服务进行分析。手动填写只使用本地存储。</p>' +
    (status.requiresCode ? '<label class="code">识别访问码<input id="access-code" type="password" placeholder="由后台维护者提供" autocomplete="off"></label>' : '') +
    (error ? '<p class="error" role="alert">' + escape(error) + '</p>' : '') +
    '<div class="actions">' + button(recognizing ? '正在识别…' : '开始识别', 'recognize', 'primary', recognizing || selecting || !hasImage || !status.configured) +
    button('手动填写', 'manual', 'secondary', recognizing || selecting) +
    (!status.configured && (api || local) ? button('检查 AI 连接', 'check-ai', 'quiet', recognizing) : '') + '</div></section>' +
    '<aside class="privacy"><strong>本地保存</strong><p>岗位、分类和截图保存在当前浏览器。更换设备或清除浏览器数据可能导致数据丢失，当前版本无跨设备同步。<a href="#settings">管理备份</a></p></aside>';
}
function pickButton(label, tone = 'secondary') {
  return button(label, 'pick', tone, recognizing || selecting);
}
function editor(job, editing) {
  const list = fields.map(([key, label], index) => {
    const id = 'field-' + key;
    const control = index < 4
      ? '<input id="' + id + '" name="' + key + '" maxlength="12000" value="' + escape(job[key]) + '" placeholder="' + (key === 'salary' ? '如 10k–15k 人民币/月' : '未提及') + '">'
      : '<textarea id="' + id + '" name="' + key + '" rows="' + (index === 5 || index === 6 ? 4 : 2) + '" maxlength="12000" placeholder="未提及">' + escape(job[key]) + '</textarea>';
    return '<div class="field"><label for="' + id + '">' + label + '</label>' + control + '</div>';
  }).join('');
  const categories = workspace.categories.map(item => '<label class="tag check"><input type="checkbox" name="category" value="' + escape(item.id) + '" ' + (job.categoryIds.includes(item.id) ? 'checked' : '') + '>' + escape(item.name) + '</label>').join('');
  return pageHeading(editing ? '编辑岗位' : '确认岗位信息', editing ? '修改岗位字段和分类后保存。' : '核对各字段。看不清的信息可以标记为「待确认」。') +
    '<form id="job-form" class="card"><div class="field-grid">' + list + '</div><fieldset><legend>分类标签</legend><div class="tags">' +
    (categories || '<span class="muted">暂无分类</span>') + '</div>' + button('新建分类', 'category-new', 'quiet') + '</fieldset>' +
    (job.image ? '<button type="button" class="attachment" data-action="zoom-current"><img src="' + imageURL(job.image) + '" alt="">查看原始截图</button>' : '') +
    '<div class="actions form-actions"><button type="submit" class="button primary">保存岗位</button><a class="button secondary" href="' +
    (editing ? '#job/' + escape(job.id) : '#capture') + '">返回</a></div></form>';
}
function details(job) {
  return '<a class="back" href="#warehouse">返回岗位仓库</a>' + pageHeading(escape(title(job)), escape(company(job))) +
    '<div class="actions details-actions"><a class="button primary" href="#edit/' + escape(job.id) + '">编辑岗位</a>' +
    button('删除岗位', 'job-delete', 'danger-outline') + '</div><section class="card"><div class="tags">' + tags(job) +
    '</div><dl class="detail-fields">' + fields.map(([key, label]) => '<div><dt>' + label + '</dt><dd>' + escape(display(job,key)) + '</dd></div>').join('') + '</dl></section>' +
    '<section class="card original"><h2>原始截图</h2>' + (job.image ? '<p>点击截图可放大查看。</p><button class="image-button" data-action="zoom-current" aria-label="放大原始截图"><img src="' + imageURL(job.image) + '" alt="原始招聘截图"></button>' : '<p>该岗位没有附带截图。</p>') + '</section>';
}
function tags(job) {
  const labels = workspace.categories.filter(item => job.categoryIds.includes(item.id));
  return labels.length ? labels.map(item => '<span class="tag">' + escape(item.name) + '</span>').join('') : '<span class="tag unclassified">未分类</span>';
}
function row(job) {
  const id = escape(job.id);
  const open = revealed === job.id;
  return '<div class="job-row' + (open ? ' revealed' : '') + '" data-job="' + id + '"><a class="slide-edit" href="#edit/' + id + '" ' + (open ? '' : 'tabindex="-1" aria-hidden="true"') + '>编辑</a>' +
    '<a class="job-link" href="#job/' + id + '"><div><h3>' + escape(title(job)) + '</h3><p>' + escape(company(job)) +
    ' <span class="saved-date">· ' + date(job.createdAt) + '</span></p><div class="tags">' + tags(job) + '</div></div><div class="focus-value"><span>' +
    fieldLabel[focusField] + '</span><strong>' + escape(display(job, focusField)) + '</strong></div><span class="chevron" aria-hidden="true">›</span></a></div>';
}
function warehouse() {
  const jobs = workspace.jobs.filter(job => filter === 'all' || (filter === 'none' ? !job.categoryIds.length : job.categoryIds.includes(filter))).sort((a,b) => b.createdAt - a.createdAt);
  const options = [['all','全部岗位'], ['none','未分类'], ...workspace.categories.map(category => [category.id,category.name])];
  return pageHeading('岗位仓库', '按分类整理岗位，选择关注条目进行对照。') +
    '<div class="card filters"><label>分类<select id="filter">' + options.map(([value,label]) => '<option value="' + escape(value) + '" ' + selected(filter,value) + '>' + escape(label) + '</option>').join('') +
    '</select></label><label>关注条目<select id="focus-field">' + ['salary','location','skills','hours','duties','company'].map(key => '<option value="' + key + '" ' + selected(focusField,key) + '>' + fieldLabel[key] + '</option>').join('') +
    '</select></label></div><div class="list-heading"><strong>' + jobs.length + ' 个岗位</strong>' +
    (focusField === 'salary' ? '<label class="sort">排序<select id="sort"><option value="salary" ' + selected(salarySorted,true) + '>薪资从高到低</option><option value="recent" ' + selected(salarySorted,false) + '>最近保存</option></select></label>' : '<span>最近保存</span>') +
    '</div>' + (jobs.length ? (focusField === 'salary' && salarySorted ? '<p class="sort-note">按币种和周期分组。组内按薪资最低值从高到低排序。</p>' +
    salaryGroups(jobs).map(([label, items]) => '<section class="job-group"><h2>' + escape(label) + '</h2>' + items.map(row).join('') + '</section>').join('') : jobs.map(row).join('')) +
    '<p class="gesture-note">在手机上向右滑动岗位行可进入编辑。</p>' :
    '<section class="card empty"><span class="empty-icon" aria-hidden="true">▤</span><h2>' + (workspace.jobs.length ? '这个分类暂无岗位' : '还没有保存岗位') + '</h2><p>' +
    (workspace.jobs.length ? '切换分类，或添加新的招聘截图。' : '上传第一张招聘截图，开始整理你的求职清单。') +
    '</p><a class="button primary" href="#capture">上传招聘截图</a></section>');
}
function settings() {
  return pageHeading('设置', '管理分类和当前浏览器里的岗位数据。') +
    '<section class="card settings-card"><div class="section-head"><h2>分类管理</h2>' + button('新建分类', 'category-new', 'primary') + '</div>' +
    (workspace.categories.map(item => '<div class="category-row"><strong>' + escape(item.name) + '</strong><div class="actions">' +
    button('重命名', 'rename/' + escape(item.id), 'quiet') + button('删除', 'remove/' + escape(item.id), 'danger-outline') + '</div></div>').join('') ||
    '<p class="muted">还没有分类。你也可以在确认或编辑岗位时创建分类。</p>') +
    '</section><section class="card settings-card"><h2>备份与迁移</h2><p>导出文件包含岗位、分类和截图。导入时可选择合并或覆盖，单个备份最大 100 MB。</p>' +
    '<input id="backup-input" type="file" accept=".json,application/json" class="visually-hidden"><div class="actions">' +
    button('导出备份', 'export', 'primary') + button('导入备份', 'import') + '</div></section>' +
    '<aside class="privacy"><strong>数据存放位置</strong><p>岗位、分类和截图保存在当前设备的当前浏览器。清除站点数据、更换浏览器或设备后，原数据可能无法找回。当前版本无跨设备同步。</p></aside>';
}
function render() {
  if (!ready) return;
  for (const url of imageURLs) URL.revokeObjectURL(url);
  imageURLs = [];
  const [page,id] = route().split('/');
  const job = lookup(id);
  document.querySelectorAll('nav a').forEach(link => {
    const active = link.hash === '#' + (['job','edit'].includes(page) ? 'warehouse' : page === 'confirm' ? 'capture' : page);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  if (page === 'warehouse') app.innerHTML = warehouse();
  else if (page === 'settings') app.innerHTML = settings();
  else if (page === 'confirm') app.innerHTML = editor(draft ??= newDraft(), false);
  else if (page === 'job' && job) app.innerHTML = details(job);
  else if (page === 'edit' && job) app.innerHTML = editor(job, true);
  else if (page === 'job' || page === 'edit') app.innerHTML = pageHeading('岗位不存在', '') + '<a class="button secondary" href="#warehouse">返回岗位仓库</a>';
  else app.innerHTML = capture();
}
function formValues(form) {
  const input = new FormData(form);
  const values = Object.fromEntries(fields.map(([key]) => [key, String(input.get(key) ?? '').trim()]));
  return {...values, categoryIds:input.getAll('category')};
}
function categoryDialog(id) {
  const item = workspace.categories.find(category => category.id === id);
  showDialog('<form id="category-form"><h2>' + (item ? '重命名分类' : '新建分类') + '</h2><label>分类名称<input name="name" required maxlength="40" autofocus value="' +
    escape(item?.name) + '"></label><p id="category-error" class="error" role="alert"></p><div class="actions"><button class="button secondary" type="button" id="cancel-category">取消</button><button class="button primary">保存分类</button></div></form>');
  modal.querySelector('#cancel-category').onclick = () => modal.close();
  modal.querySelector('form').onsubmit = async event => {
    event.preventDefault();
    const name = new FormData(event.target).get('name').trim();
    const categoryId = id ?? uid();
    if (!name || workspace.categories.some(category => category.name === name && category.id !== categoryId)) {
      modal.querySelector('#category-error').textContent = '请输入非空且不重复的分类名称。';
      return;
    }
    const page = route();
    const jobForm = app.querySelector('#job-form');
    const snapshot = jobForm ? formValues(jobForm) : null;
    await write(data => {
      if (data.categories.some(category => category.name === name && category.id !== categoryId)) throw new Error('分类名称已存在。');
      if (id && !data.categories.some(category => category.id === id)) throw new Error('分类已删除。');
      const categories = id ? data.categories.map(category => category.id === id ? {id,name} : category) : [...data.categories, {id:categoryId,name}];
      return {...data, categories};
    }, '分类已保存', () => {
      modal.close();
      render();
      const form = route() === page && app.querySelector('#job-form');
      if (!form || !snapshot) return;
      for (const [key] of fields) form.elements.namedItem(key).value = snapshot[key];
      for (const input of form.querySelectorAll('[name=category]')) input.checked = input.value === categoryId || snapshot.categoryIds.includes(input.value);
    });
  };
}
async function recognize() {
  if (!draft?.image || !status.configured || recognizing || selecting) return;
  const code = app.querySelector('#access-code')?.value ?? '';
  if (status.requiresCode && !code) {
    error = '请输入识别访问码。';
    render();
    app.querySelector('#access-code')?.focus();
    return;
  }
  const image = draft.image;
  recognizing = true;
  error = '';
  render();
  try {
    const response = await fetch(api + '/api/recognize', {
      method:'POST', headers:{'Content-Type':image.type, ...(code ? {'X-AI-Access-Code':code} : {})},
      body:image, signal:AbortSignal.timeout(55000)
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new Error(result?.error || 'AI 识别失败，请稍后重试。');
    if (fields.some(([key]) => typeof result?.fields?.[key] !== 'string')) throw new Error('AI 未返回完整字段。');
    draft = {...draft, ...Object.fromEntries(fields.map(([key]) => [key, result.fields[key]]))};
    if (route() === 'capture') go('confirm');
    tell('识别完成，请核对字段。');
  } catch (cause) {
    error = (cause.name === 'TimeoutError' || cause instanceof TypeError ? 'AI 服务连接失败或超时。' : cause.message) + ' 你可以重试或手动填写。';
    if (route() !== 'capture') tell(error);
  } finally {
    recognizing = false;
    if (route() === 'capture') render();
  }
}
async function download() {
  if (busy) return;
  busy = true;
  tell('正在生成备份…');
  try {
    const blob = await exportBackup(await read());
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = '岗位夹备份-' + new Date().toISOString().slice(0,10) + '.json';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    tell(blob.size > 100 * 1024 * 1024 ? '已导出。此文件超过 100 MB，当前版本无法直接导入。' : '备份已生成，请保存在安全的位置。');
  } catch { tell('导出失败，请重试。'); }
  finally { busy = false; }
}
async function importFile(file) {
  if (busy) return;
  busy = true;
  tell('正在读取备份…');
  let incoming;
  try { incoming = await readBackup(file); }
  catch (cause) { tell(cause.message || '导入失败，现有数据未修改。'); }
  finally { busy = false; }
  if (!incoming) return;
  showDialog('<form method="dialog"><h2>确认导入备份</h2><p>备份包含 ' + incoming.jobs.length + ' 个岗位、' + incoming.categories.length +
    ' 个分类。合并会复用同名分类并跳过相同 ID 的现有岗位。覆盖会移除当前浏览器里的所有岗位、分类和截图，再恢复备份。</p><div class="actions"><button class="button secondary" autofocus>取消</button>' +
    '<button class="button primary" type="button" id="merge">合并导入</button><button class="button danger" type="button" id="replace">覆盖导入</button></div></form>');
  const apply = overwrite => write(data => overwrite ? incoming : mergeBackup(data, incoming), '备份已导入', () => { filter = 'all'; render(); });
  modal.querySelector('#merge').onclick = () => { modal.close(); apply(false); };
  modal.querySelector('#replace').onclick = () => confirmAction('确认覆盖本地数据？','当前岗位、分类和截图将被备份文件替换。', () => apply(true), '确认覆盖', true);
}
app.addEventListener('click', event => {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const [action,id] = target.dataset.action.split('/');
  const job = lookup(route().split('/')[1]);
  if (action === 'pick') app.querySelector('#screenshot').click();
  if (action === 'manual') { draft ??= newDraft(); go('confirm'); }
  if (action === 'recognize') recognize();
  if (action === 'check-ai') {
    target.disabled = true;
    target.textContent = '检查中…';
    refreshStatus();
  }
  if (action === 'zoom-draft' || action === 'zoom-current') {
    const image = (action === 'zoom-draft' || !job ? draft : job)?.image;
    if (image) zoom(image);
  }
  if (action === 'category-new' || action === 'rename') categoryDialog(id);
  if (action === 'remove') {
    const item = workspace.categories.find(category => category.id === id);
    if (item) confirmAction('删除分类？', '将移除「' + item.name + '」及其关联，岗位会保留。', () =>
      write(data => ({categories:data.categories.filter(category => category.id !== id),
        jobs:data.jobs.map(entry => ({...entry, categoryIds:entry.categoryIds.filter(category => category !== id)}))}),
      '分类已删除', () => { if (filter === id) filter = 'all'; render(); }), '删除分类', true);
  }
  if (action === 'job-delete' && job) confirmAction('删除岗位？', '「' + title(job) + '」以及它的本地截图将被删除。', () =>
    write(data => ({...data, jobs:data.jobs.filter(entry => entry.id !== job.id)}), '岗位已删除', () => go('warehouse')), '删除岗位', true);
  if (action === 'export') download();
  if (action === 'import') app.querySelector('#backup-input').click();
});
app.addEventListener('submit', event => {
  if (event.target.id !== 'job-form') return;
  event.preventDefault();
  const form = event.target;
  const old = lookup(route().split('/')[1]);
  const values = formValues(form);
  const job = {...(old ?? {id:uid(), createdAt:Date.now(), image:draft?.image ?? null}), ...values};
  if (!job.title) job.title = '未命名岗位';
  if (!job.company) job.company = '公司未提及';
  const submit = form.querySelector('[type=submit]');
  submit.disabled = true;
  submit.textContent = '正在保存…';
  write(data => {
    if (old && !data.jobs.some(entry => entry.id === old.id)) throw new Error('岗位已在其他页面删除。');
    const categoryIds = new Set(data.categories.map(category => category.id));
    job.categoryIds = job.categoryIds.filter(id => categoryIds.has(id));
    return {...data, jobs:old ? data.jobs.map(entry => entry.id === old.id ? job : entry) : [...data.jobs,job]};
  }, old ? '岗位修改已保存' : '岗位已加入仓库', () => {
    if (!old) { draft = null; filter = 'all'; error = ''; }
    go(old ? 'job/' + job.id : 'warehouse');
  }).finally(() => { submit.disabled = false; submit.textContent = '保存岗位'; });
});
app.addEventListener('change', async event => {
  const {id,value,files} = event.target;
  if (id === 'filter' || id === 'focus-field' || id === 'sort') {
    if (id === 'filter') filter = value;
    if (id === 'focus-field') focusField = value;
    if (id === 'sort') salarySorted = value === 'salary';
    revealed = null;
    render();
    document.getElementById(id)?.focus();
  }
  if (id === 'backup-input' && files[0]) {
    const file = files[0];
    event.target.value = '';
    importFile(file);
  }
  if (id !== 'screenshot' || !files[0] || selecting || recognizing) return;
  const file = files[0];
  selecting = true;
  error = '';
  render();
  try {
    if (!imageTypes.includes(file.type)) throw new Error('请选择 PNG、JPEG 或 WebP 截图。');
    if (file.size > imageLimit) throw new Error('截图超过 8 MB，请缩小后再上传。');
    const bytes = new Uint8Array(await file.slice(0,12).arrayBuffer());
    if (!hasImageSignature(bytes,file.type)) throw new Error('图片格式与文件内容不符。');
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
    } catch { throw new Error('截图无法读取，请换一张图片。'); }
    finally { URL.revokeObjectURL(url); }
    draft = {...newDraft(), image:file};
  } catch (cause) { error = cause.message; }
  finally { selecting = false; if (route() === 'capture') render(); }
});
let gesture, suppressClick = 0;
app.addEventListener('dragstart', event => {
  if (event.target.closest('.job-link')) event.preventDefault();
});
app.addEventListener('pointerdown', event => {
  const row = event.target.closest('[data-job]');
  if (!row || !event.isPrimary || event.button !== 0) { gesture = null; return; }
  const {clientX:x,clientY:y} = event;
  gesture = {id:row.dataset.job,x,y,pointerId:event.pointerId};
}, {passive:true});
app.addEventListener('pointercancel', () => { gesture = null; });
app.addEventListener('pointerup', event => {
  if (!gesture || gesture.pointerId !== event.pointerId) return;
  const {clientX:x,clientY:y} = event;
  const dx = x - gesture.x, dy = y - gesture.y;
  if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.4) {
    revealed = dx > 0 ? gesture.id : null;
    suppressClick = performance.now() + 350;
    render();
  }
  gesture = null;
}, {passive:true});
app.addEventListener('click', event => {
  if (performance.now() < suppressClick && event.target.closest('.job-link')) event.preventDefault();
}, true);
window.addEventListener('hashchange', () => {
  revealed = null;
  render();
  window.scrollTo(0,0);
  app.focus({preventScroll:true});
});
window.addEventListener('pageshow', async event => {
  if (event.persisted && ready) {
    try { workspace = await read(); render(); }
    catch { tell('无法重新读取本地数据。'); }
  }
});
try {
  workspace = await read();
  ready = true;
  render();
  refreshStatus();
} catch {
  app.innerHTML = pageHeading('无法打开岗位夹', '当前浏览器无法访问本地存储。请允许站点数据后刷新页面。');
}
