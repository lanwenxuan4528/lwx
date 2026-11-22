import {fields, imageTypes, imageLimit, hasImageSignature, uid} from './model.mjs';

const asDataURL = blob => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(blob);
});
export async function exportBackup(data) {
  const jobs = await Promise.all(data.jobs.map(async job => ({
    ...job, image: job.image ? await asDataURL(job.image) : null
  })));
  return new Blob([JSON.stringify({format:'job-pocket', version:1, categories:data.categories, jobs})], {type:'application/json'});
}
const validId = value => typeof value === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(value);
const check = value => { if (!value) throw new Error('备份内容不符合岗位夹格式，未修改现有数据。'); };
export async function readBackup(file) {
  if (file.size > 100 * 1024 * 1024) throw new Error('备份超过 100 MB，无法导入。');
  let data;
  try { data = JSON.parse(await file.text()); }
  catch { throw new Error('无法读取 JSON 备份。'); }
  check(data?.format === 'job-pocket' && data.version === 1 && Array.isArray(data.categories) && Array.isArray(data.jobs));
  const categoryIds = new Set(), names = new Set(), jobIds = new Set();
  const categories = data.categories.map(item => {
    check(validId(item?.id) && !categoryIds.has(item.id) && typeof item.name === 'string');
    const name = item.name.trim();
    check(name && name.length <= 40 && !names.has(name));
    names.add(name);
    categoryIds.add(item.id);
    return {id:item.id, name};
  });
  const jobs = data.jobs.map(job => {
    check(validId(job?.id) && !jobIds.has(job.id) && Number.isFinite(job.createdAt) &&
      job.createdAt >= 0 && job.createdAt <= 8640000000000000 &&
      Array.isArray(job.categoryIds) && job.categoryIds.every(id => categoryIds.has(id)));
    jobIds.add(job.id);
    let image = null;
    if (job.image !== null) {
      check(typeof job.image === 'string');
      const parts = /^data:(image\/[a-z]+);base64,([A-Za-z0-9+/]+={0,2})$/.exec(job.image);
      check(parts && imageTypes.includes(parts[1]) && parts[2].length <= Math.ceil(imageLimit / 3) * 4);
      const bytes = Uint8Array.fromBase64 ? Uint8Array.fromBase64(parts[2]) : Uint8Array.from(atob(parts[2]), char => char.charCodeAt(0));
      check(bytes.length <= imageLimit && hasImageSignature(bytes, parts[1]));
      image = new Blob([bytes], {type:parts[1]});
    }
    const result = {id:job.id, createdAt:job.createdAt, categoryIds:[...new Set(job.categoryIds)], image};
    for (const [key] of fields) {
      check(typeof job[key] === 'string' && job[key].length <= 12000);
      result[key] = job[key];
    }
    return result;
  });
  return {jobs, categories};
}
export function mergeBackup(current, incoming) {
  const categories = [...current.categories];
  const byName = new Map(categories.map(category => [category.name, category.id]));
  const idMap = new Map();
  for (const category of incoming.categories) {
    if (!byName.has(category.name)) {
      const id = categories.some(item => item.id === category.id) ? uid() : category.id;
      categories.push({id, name:category.name});
      byName.set(category.name, id);
    }
    idMap.set(category.id, byName.get(category.name));
  }
  const jobs = [...current.jobs];
  const ids = new Set(jobs.map(job => job.id));
  for (const job of incoming.jobs) {
    if (!ids.has(job.id)) jobs.push({...job, categoryIds:job.categoryIds.map(id => idMap.get(id))});
  }
  return {jobs, categories};
}
