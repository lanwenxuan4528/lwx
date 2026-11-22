"""Round large FLOAT initializers in the pinned Demucs ORT model, then gzip.

The ORT graph and float32 tensor types stay the same. Only weight mantissas
change. This reduces transfer size, not the inference memory requirements.
Schema: microsoft/onnxruntime, onnxruntime/core/flatbuffers/schema/ort.fbs.
"""
import argparse
import gzip
from pathlib import Path
import struct
import sys


def compact(data, mantissa):
    if data[4:8] != b"ORTM" or sys.byteorder != "little":
        raise ValueError("Expected a little-endian ORT flatbuffer")

    def u32(at):
        return struct.unpack_from("<I", data, at)[0]

    def field(table, index):
        vtable = table - struct.unpack_from("<i", data, table)[0]
        size = struct.unpack_from("<H", data, vtable)[0]
        entry = 4 + 2 * index
        offset = struct.unpack_from("<H", data, vtable + entry)[0] if entry + 2 <= size else 0
        return table + offset if offset else None

    def follow(at):
        return at + u32(at)

    model = follow(field(u32(0), 1))
    graph = follow(field(model, 7))
    tensors = follow(field(graph, 0))
    dropped = 23 - mantissa
    bit_mask = (0xFFFFFFFF << dropped) & 0xFFFFFFFF
    half = (1 << dropped) // 2
    count = 0
    seen = set()
    for index in range(u32(tensors)):
        tensor = follow(tensors + 4 + index * 4)
        kind = field(tensor, 3)
        raw = field(tensor, 4)
        dims = field(tensor, 2)
        if kind is None or u32(kind) != 1 or raw is None or dims is None or u32(follow(dims)) < 2:
            continue
        vector = follow(raw)
        size = u32(vector)
        start = vector + 4
        if vector in seen or size < 4096 or size % 4:
            continue
        seen.add(vector)
        if start + size > len(data):
            raise ValueError("Initializer exceeds ORT file range")
        words = memoryview(data)[start:start + size].cast("I")
        for i, bits in enumerate(words):
            if bits & 0x7F800000 != 0x7F800000:
                words[i] = (bits + half - 1 + ((bits >> dropped) & 1)) & bit_mask
        count += size // 4
    if count < 1000000:
        raise ValueError(f"Too few eligible model weights: {count}")
    return count


if __name__ == "__main__":
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("source", type=Path)
    cli.add_argument("target", type=Path)
    cli.add_argument("--mantissa", type=int, choices=range(4, 16), default=7)
    args = cli.parse_args()
    if args.source.resolve() == args.target.resolve():
        cli.error("Use a different output path")
    data = bytearray(gzip.decompress(args.source.read_bytes()))
    weights = compact(data, args.mantissa)
    with args.target.open("wb") as target:
        with gzip.GzipFile(fileobj=target, mode="wb", filename="", compresslevel=6, mtime=0) as out:
            out.write(data)
    print(f"Rounded {weights:,} weights; {args.source.stat().st_size:,} -> {args.target.stat().st_size:,} bytes")
