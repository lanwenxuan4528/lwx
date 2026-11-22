/* WebAssembly API from bengfarrell/demucs-wasm. See LICENSE. */
"use strict";

const CHUNK = 30 * 44100;
const OVERLAP = 44100;

self.onmessage = async ({ data: { left, right, model } }) => {
  try {
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
