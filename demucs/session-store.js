/* One browser-local job per tab; chunks are stored separately from the source. */
const separationStore = (() => {
  let opening;
  function open() {
    return opening ??= new Promise((resolve, reject) => {
      const request = indexedDB.open("unlive-resume-v1", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("records");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  async function request(mode, operation) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("records", mode);
      const result = operation(tx.objectStore("records"));
      tx.oncomplete = () => resolve(result.result);
      tx.onabort = () => reject(tx.error || result.error);
    });
  }
  const get = key => request("readonly", store => store.get(key));
  const put = (key, value) => request("readwrite", store => store.put(value, key));
  const remove = id => request("readwrite", store => store.delete(IDBKeyRange.bound([id], [id, []])));
  const cleanOld = () => request("readwrite", store =>
    store.delete(IDBKeyRange.upperBound([String(Date.now() - 24 * 60 * 60 * 1000)], true))
  );
  return { get, put, remove, cleanOld };
})();
