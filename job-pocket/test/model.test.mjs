import {test} from 'node:test';
import assert from 'node:assert/strict';
import {salaryInfo, salaryGroups, blank} from '../docs/model.mjs';
import {readBackup, mergeBackup} from '../docs/backup.mjs';

test('salary parsing preserves the currency and payment period', () => {
  assert.deepEqual(salaryInfo('12k–16k 人民币/月'), {currency:'CNY',period:'月',min:12000,max:16000});
  assert.deepEqual(salaryInfo('300 元/天'), {currency:'CNY',period:'日',min:300,max:300});
  assert.deepEqual(salaryInfo('USD 45k–60k/year'), {currency:'USD',period:'年',min:45000,max:60000});
  for (const text of ['面议','', '10k–15k/月', '300元', '300元 USD/日', '¥300/日','CNY 30k–10k/月']) {
    assert.equal(salaryInfo(text), null, text);
  }
});
test('sort uses the low end within each currency and period', () => {
  const jobs = [
    {id:'a',salary:'10k–29k 人民币/月'}, {id:'b',salary:'12k–16k 人民币/月'},
    {id:'c',salary:'300元/天'}, {id:'d',salary:'USD 3000/month'}, {id:'e',salary:'面议'}
  ];
  const entries = salaryGroups(jobs).map(([group, rows]) => [group, rows.map(row => row.id)]);
  assert.deepEqual(Object.fromEntries(entries), {'CNY / 日':['c'], 'CNY / 月':['b','a'], 'USD / 月':['d'], '无法排序':['e']});
  assert.equal(entries.at(-1)[0], '无法排序');
});
test('backup validates associations and preserves image bytes when merging', async () => {
  const raw = {
    format:'job-pocket', version:1, categories:[{id:'incoming',name:'产品'}],
    jobs:[{...blank(), id:'job1', createdAt:100, categoryIds:['incoming'],
      image:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aM1sAAAAASUVORK5CYII='}]
  };
  const file = () => new Blob([JSON.stringify(raw)]);
  const incoming = await readBackup(file());
  const current = {categories:[{id:'existing',name:'产品'}], jobs:[]};
  const merged = mergeBackup(current, incoming);
  assert.deepEqual(merged.jobs[0].categoryIds, ['existing']);
  assert.deepEqual(new Uint8Array(await merged.jobs[0].image.arrayBuffer()).slice(0, 8),
    Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10));
  assert.equal(mergeBackup(merged, incoming).jobs.length, 1);
  raw.jobs[0].categoryIds = ['missing'];
  await assert.rejects(readBackup(file()), /备份内容不符合/);
});
