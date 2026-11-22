/* WebAssembly API from bengfarrell/demucs-wasm. See LICENSE. */
"use strict";

const CHUNK = 30 * 44100;
const OVERLAP = 44100;

self.onmessage = async ({ data: { left, right, model } }) => {
  try {
    if (!model) model = await downloadModel();
    self.postMessage({ initializing: true });
    importScripts("./demucs_onnx_simd.js");
    const runtime = await libdemucs();
    const allocated = [];
    const allocate = size => {
      const pointer = runtime._malloc(size);
      if (!pointer) throw new Error("设备内存不足，请使用更短的音频。");
      allocated.push(pointer);
      return pointer;
    };
    try {
      const modelPointer = allocate(model.byteLength);
      runtime.HEAPU8.set(new Uint8Array(model), modelPointer);
      runtime._modelInit(modelPointer, model.byteLength);
      const sampleBytes = Math.min(CHUNK, left.length) * Float32Array.BYTES_PER_ELEMENT;
      const inputs = Array.from({ length: 2 }, () => allocate(sampleBytes));
      const outputs = Array.from({ length: 8 }, () => allocate(sampleBytes));
      const stereo = () => [new Float32Array(left.length), new Float32Array(left.length)];
      const vocals = stereo();
      const accompaniment = stereo();
      for (let start = 0; ; start += CHUNK - OVERLAP) {
        const end = Math.min(start + CHUNK, left.length);
        self.postMessage({ chunkStart: start, chunkEnd: end, total: left.length });
        runtime.HEAPF32.set(left.subarray(start, end), inputs[0] / 4);
        runtime.HEAPF32.set(right.subarray(start, end), inputs[1] / 4);
        runtime._modelDemixSegment(...inputs, end - start, ...outputs, 0, 0, 0, 0, false, 1, 0);
        const heap = runtime.HEAPF32;
        const [drumsL, drumsR, bassL, bassR, otherL, otherR, vocalL, vocalR] = outputs.map(pointer => pointer / 4);
        for (let i = 0; i < end - start; i++) {
          const index = start + i;
          const mix = start ? Math.min(1, i / (OVERLAP - 1)) : 1;
          vocals[0][index] += (heap[vocalL + i] - vocals[0][index]) * mix;
          vocals[1][index] += (heap[vocalR + i] - vocals[1][index]) * mix;
          const musicL = heap[drumsL + i] + heap[bassL + i] + heap[otherL + i];
          const musicR = heap[drumsR + i] + heap[bassR + i] + heap[otherR + i];
          accompaniment[0][index] += (musicL - accompaniment[0][index]) * mix;
          accompaniment[1][index] += (musicR - accompaniment[1][index]) * mix;
        }
        self.postMessage({ processed: end, total: left.length });
        if (end === left.length) break;
      }
      self.postMessage({ vocals, accompaniment }, [...vocals, ...accompaniment].map(channel => channel.buffer));
    } finally {
      allocated.forEach(pointer => runtime._free(pointer));
    }
  } catch (error) {
    self.postMessage({ error: error.message || String(error) });
  }
};

async function downloadModel() {
  const bytes = 54471499;
  const partSize = 7 * 1024 * 1024;
  const count = Math.ceil(bytes / partSize);
  const loaded = new Array(count).fill(0);
  const model = new Uint8Array(bytes);
  const pending = new Set();
  let next = 0;
  let cancelled = false;
  const cache = await (globalThis.caches?.open("unsung-model-35c8bd5").catch(() => null) ?? null);

  function update() {
    const total = loaded.reduce((sum, value) => sum + value, 0);
    self.postMessage({ modelLoaded: total, modelTotal: bytes });
  }

  async function download(index) {
    const offset = index * partSize;
    const size = Math.min(partSize, bytes - offset);
    const url = new URL("./model-35c8bd5.part" + String(index).padStart(2, "0"), self.location.href);
    const cached = await cache?.match(url).catch(() => null);
    if (cached) {
      const data = new Uint8Array(await cached.arrayBuffer());
      if (data.length === size) {
        model.set(data, offset);
        loaded[index] = size;
        update();
        return;
      }
    }
    for (let attempt = 0; !cancelled; attempt++) {
      const controller = new AbortController();
      pending.add(controller);
      let timer;
      const resetTimer = () => {
        clearTimeout(timer);
        timer = setTimeout(() => controller.abort(), 30000);
      };
      try {
        resetTimer();
        const response = await fetch(url, { signal: controller.signal, cache: "force-cache" });
        if (!response.ok || !response.body) throw new Error("HTTP " + response.status);
        const reader = response.body.getReader();
        loaded[index] = 0;
        update();
        while (true) {
          resetTimer();
          const { done, value } = await reader.read();
          if (done) break;
          if (loaded[index] + value.length > size) throw new Error("模型分段过大");
          model.set(value, offset + loaded[index]);
          loaded[index] += value.length;
          update();
        }
        if (loaded[index] !== size) throw new Error("模型分段不完整");
        if (cache) await cache.put(url, new Response(model.slice(offset, offset + size))).catch(() => {});
        return;
      } catch {
        controller.abort();
        if (attempt === 2) throw new Error("模型下载未完成。请检查网络并重新选择文件，已下载完成的分段可以复用。");
      } finally {
        clearTimeout(timer);
        pending.delete(controller);
      }
    }
  }

  async function lane() {
    while (!cancelled && next < count) await download(next++);
  }
  update();
  try {
    await Promise.all(Array.from({ length: 4 }, lane));
    return model.buffer;
  } catch (error) {
    cancelled = true;
    for (const controller of pending) controller.abort();
    throw error;
  }
}

