export const fields = [
  ['title', '岗位名称'], ['company', '公司名称'], ['location', 'Base 地点'],
  ['salary', '薪资待遇'], ['hours', '工作时间'], ['skills', '技能要求'],
  ['duties', '工作内容'], ['other', '其他信息']
];
export const imageTypes = ['image/png', 'image/jpeg', 'image/webp'];
export const imageLimit = 8 * 1024 * 1024;
export const blank = () => Object.fromEntries(fields.map(([key]) => [key, '']));
export function uid() {
  return globalThis.crypto.randomUUID?.() ?? Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2, '0')).join('');
}

export function salaryInfo(source) {
  const text = source.normalize('NFKC').toLowerCase().replace(/\s/g, '');
  const match = /^(人民币|美元|港币|欧元|cny|rmb|usd|hkd|eur|¥|€)?(\d+(?:\.\d+)?)(k|千|万|元)?(?:[-–—~～至](\d+(?:\.\d+)?)(k|千|万|元)?)?(人民币|美元|港币|欧元|cny|rmb|usd|hkd|eur|元)?(?:\/|每|按)(小时|时|日|天|周|月|年|hour|day|week|month|year)$/.exec(text);
  if (!match) return null;
  const [, prefix, low, leftUnit, high, rightUnit, suffix, cycle] = match;
  const currencies = {人民币:'CNY', 元:'CNY', cny:'CNY', rmb:'CNY', 美元:'USD', usd:'USD', 港币:'HKD', hkd:'HKD', 欧元:'EUR', eur:'EUR', '€':'EUR'};
  const first = currencies[prefix];
  const hasYuan = [leftUnit, rightUnit].includes('元');
  const last = currencies[suffix] ?? (hasYuan ? 'CNY' : undefined);
  if ((first && last && first !== last) || (hasYuan && last !== 'CNY') || (prefix === '¥' && last !== 'CNY')) return null;
  const currency = first ?? last;
  if (!currency) return null;
  const factor = {k:1000, 千:1000, 万:10000, 元:1};
  const min = Number(low) * (factor[leftUnit] ?? factor[rightUnit] ?? 1);
  const max = high ? Number(high) * (factor[rightUnit] ?? 1) : min;
  if (!Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max < min) return null;
  const period = ({小时:'小时', 时:'小时', hour:'小时', 日:'日', 天:'日', day:'日', 周:'周', week:'周', 月:'月', month:'月', 年:'年', year:'年'})[cycle];
  return { currency, period, min, max };
}
export function salaryGroups(jobs) {
  const groups = new Map();
  for (const job of jobs) {
    const info = salaryInfo(job.salary);
    const label = info ? info.currency + ' / ' + info.period : '无法排序';
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push({job, info});
  }
  return [...groups].sort(([a], [b]) => a === '无法排序' ? 1 : b === '无法排序' ? -1 : a.localeCompare(b))
    .map(([label, entries]) => [label, entries.sort((a, b) => (b.info?.min ?? 0) - (a.info?.min ?? 0)).map(entry => entry.job)]);
}

export function hasImageSignature(bytes, type) {
  if (type === 'image/png') return [137,80,78,71,13,10,26,10].every((byte, i) => bytes[i] === byte);
  if (type === 'image/jpeg') return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  return type === 'image/webp' && String.fromCharCode(...bytes.slice(0,4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8,12)) === 'WEBP';
}
