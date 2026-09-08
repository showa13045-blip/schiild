export interface BspRect { x: number; y: number; w: number; h: number }
interface BspExports extends WebAssembly.Exports {
  memory: WebAssembly.Memory;
  set_seed(index: number, value: number): void;
  layout(capacity: number, size: number, variance: number): number;
  output_len(): number;
}
/** Only marshals the Rust WASM ABI. No partition algorithm exists in TypeScript. */
export async function loadBsp(bytes: Uint8Array) {
  const result = await WebAssembly.instantiate(new Uint8Array(bytes).buffer, {});
  const wasm = result.instance.exports as BspExports;
  return (seed: Uint8Array, capacity: number, size = 128, variance = 0.55): BspRect[] => {
    if (seed.length !== 32 || !Number.isInteger(capacity) || capacity < 1 || capacity > 65536 || !Number.isInteger(size) || size < 1 || size > 256 || !Number.isFinite(variance) || variance < 0 || variance > 1) throw new RangeError('Invalid BSP parameters');
    seed.forEach((value, index) => wasm.set_seed(index, value));
    const pointer = wasm.layout(capacity, size, variance);
    if (pointer === 0) throw new RangeError('Invalid BSP geometry');
    return JSON.parse(new TextDecoder().decode(new Uint8Array(wasm.memory.buffer, pointer, wasm.output_len()))) as BspRect[];
  };
}
