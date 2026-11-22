/* WebAssembly API from bengfarrell/demucs-wasm. See LICENSE. */
"use strict";

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
      const inputs = [left, right].map(channel => {
        const pointer = allocate(channel.byteLength);
        runtime.HEAPF32.set(channel, pointer / 4);
        return pointer;
      });
      const outputs = Array.from({ length: 8 }, () => allocate(left.byteLength));
      runtime._modelDemixSegment(...inputs, left.length, ...outputs, 0, 0, 0, 0, false, 1, 0);
      const waveforms = outputs.map(pointer => runtime.HEAPF32.slice(pointer / 4, pointer / 4 + left.length));
      const vocals = waveforms.slice(6);
      const accompaniment = waveforms.slice(0, 2);
      for (let channel = 0; channel < 2; channel++) {
        for (let i = 0; i < left.length; i++) {
          accompaniment[channel][i] += waveforms[channel + 2][i] + waveforms[channel + 4][i];
        }
      }
      self.postMessage({ vocals, accompaniment }, [...vocals, ...accompaniment].map(channel => channel.buffer));
    } finally {
      allocated.forEach(pointer => runtime._free(pointer));
    }
  } catch (error) {
    self.postMessage({ error: error.message || String(error) });
  }
};
