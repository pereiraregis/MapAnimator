/* tslint:disable */
/* eslint-disable */

export class Sampler {
    free(): void;
    [Symbol.dispose](): void;
    constructor(points: string);
    sample(time: number): string;
}

export class TimelineRunner {
    free(): void;
    [Symbol.dispose](): void;
    command(cmd: string): void;
    configure(duration: number, fps: number, enabled: boolean, disabled: boolean): void;
    destroy(): void;
    constructor();
    set_scene(points: string, duration: number, fps: number, enabled: boolean, disabled: boolean): void;
    start(canvas: HTMLCanvasElement): Promise<void>;
    take_events(): string;
}

export function sample_points(points: string, time: number): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_sampler_free: (a: number, b: number) => void;
    readonly __wbg_timelinerunner_free: (a: number, b: number) => void;
    readonly sample_points: (a: number, b: number, c: number) => [number, number, number, number];
    readonly sampler_new: (a: number, b: number) => [number, number, number];
    readonly sampler_sample: (a: number, b: number) => [number, number];
    readonly timelinerunner_command: (a: number, b: number, c: number) => [number, number];
    readonly timelinerunner_configure: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly timelinerunner_destroy: (a: number) => void;
    readonly timelinerunner_new: () => number;
    readonly timelinerunner_set_scene: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number];
    readonly timelinerunner_start: (a: number, b: any) => any;
    readonly timelinerunner_take_events: (a: number) => [number, number];
    readonly wasm_bindgen_e8c9e71d28195151___convert__closures_____invoke___js_sys_389aeb828bf8c55b___Function_fn_wasm_bindgen_e8c9e71d28195151___JsValue_____wasm_bindgen_e8c9e71d28195151___sys__Undefined___js_sys_389aeb828bf8c55b___Function_fn_wasm_bindgen_e8c9e71d28195151___JsValue_____wasm_bindgen_e8c9e71d28195151___sys__Undefined_______true_: (a: number, b: number, c: any, d: any) => void;
    readonly wasm_bindgen_e8c9e71d28195151___convert__closures_____invoke___wasm_bindgen_e8c9e71d28195151___JsValue__core_37ee0ce0c4cd57d5___result__Result_____wasm_bindgen_e8c9e71d28195151___JsError___true_: (a: number, b: number, c: any) => [number, number];
    readonly wasm_bindgen_e8c9e71d28195151___convert__closures_____invoke___core_37ee0ce0c4cd57d5___result__Result_____wasm_bindgen_e8c9e71d28195151___JsValue___true_: (a: number, b: number) => [number, number];
    readonly wasm_bindgen_e8c9e71d28195151___convert__closures_____invoke___js_sys_389aeb828bf8c55b___Array______true_: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen_e8c9e71d28195151___convert__closures_____invoke___js_sys_389aeb828bf8c55b___Array______true__13: (a: number, b: number, c: any) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_destroy_closure: (a: number, b: number) => void;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
