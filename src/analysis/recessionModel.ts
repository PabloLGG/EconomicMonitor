import * as ort from 'onnxruntime-web';
import type { RecessionModelMeta } from './recessionTypes';
import { FEATURE_NAMES, HAZARD_HORIZON, INPUT_WINDOW } from './recessionTypes';

ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/';

const MODEL_URL = `${import.meta.env.BASE_URL}models/recession_v1.onnx`;
const META_URL = `${import.meta.env.BASE_URL}models/recession_v1_meta.json`;

export interface ModelInferenceResult {
  hazards: Float32Array;
  futureCorr: Float32Array;
}

let session: ort.InferenceSession | null = null;
let meta: RecessionModelMeta | null = null;
let loadPromise: Promise<RecessionModelMeta> | null = null;

/** ORT WASM allows only one in-flight session.run() per session. */
let runChain: Promise<unknown> = Promise.resolve();

export async function loadRecessionModel(): Promise<RecessionModelMeta> {
  if (session && meta) return meta;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const [metaResp, modelResp] = await Promise.all([
      fetch(META_URL),
      fetch(MODEL_URL),
    ]);

    if (!metaResp.ok) {
      throw new Error(`Failed to load model metadata (${metaResp.status})`);
    }
    if (!modelResp.ok) {
      throw new Error(`Failed to load ONNX model (${modelResp.status})`);
    }

    meta = (await metaResp.json()) as RecessionModelMeta;
    const buffer = await modelResp.arrayBuffer();
    session = await ort.InferenceSession.create(buffer, {
      executionProviders: ['wasm'],
    });
    return meta;
  })();

  try {
    return await loadPromise;
  } catch (err) {
    loadPromise = null;
    throw err;
  }
}

export function getRecessionModelMeta(): RecessionModelMeta | null {
  return meta;
}

export async function runInference(normalizedFlat: Float32Array): Promise<ModelInferenceResult> {
  if (!session) throw new Error('Model not loaded');

  const task = runChain.then(async () => {
    const input = new ort.Tensor(
      'float32',
      normalizedFlat,
      [1, INPUT_WINDOW, FEATURE_NAMES.length],
    );
    const outputs = await session!.run({ features: input });
    const hazards = outputs.hazards.data as Float32Array;
    const futureCorr = outputs.future_corr.data as Float32Array;

    return {
      hazards: hazards.slice(0, HAZARD_HORIZON),
      futureCorr,
    };
  });

  runChain = task.catch(() => {});
  return task;
}

export function isModelLoaded(): boolean {
  return session !== null && meta !== null;
}
