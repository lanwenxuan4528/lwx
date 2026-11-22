const open = new Promise((resolve, reject) => {
  const request = indexedDB.open('job-pocket-v1', 1);
  request.onupgradeneeded = () => request.result.createObjectStore('workspace');
  request.onerror = () => reject(request.error);
  request.onsuccess = () => {
    request.result.onversionchange = () => request.result.close();
    resolve(request.result);
  };
});
const empty = () => ({jobs: [], categories: []});
export async function read() {
  const db = await open;
  return new Promise((resolve, reject) => {
    const request = db.transaction('workspace').objectStore('workspace').get('data');
    request.onsuccess = () => resolve(request.result ?? empty());
    request.onerror = () => reject(request.error);
  });
}
export async function change(update) {
  const db = await open;
  return new Promise((resolve, reject) => {
    const tx = db.transaction('workspace', 'readwrite');
    const store = tx.objectStore('workspace');
    const request = store.get('data');
    let next, error;
    request.onsuccess = () => {
      try {
        next = update(request.result ?? empty());
        store.put(next, 'data');
      } catch (cause) {
        error = cause;
        tx.abort();
      }
    };
    tx.oncomplete = () => resolve(next);
    tx.onabort = () => reject(error ?? tx.error ?? new Error('保存失败'));
  });
}
