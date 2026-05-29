import { BasicTracerProvider } from '@opentelemetry/sdk-trace-base';
import { LangfuseSpanProcessor } from '@langfuse/otel';
import {
  setLangfuseTracerProvider,
  startActiveObservation as startActiveObservationRaw,
  type StartActiveObservationOpts,
} from '@langfuse/tracing';

interface ObservationLike {
  update: (attributes: unknown) => void;
  end: (...args: unknown[]) => void;
}

const NOOP_OBSERVATION: ObservationLike = {
  update: () => undefined,
  end: () => undefined,
};

let isInitialized = false;
let isEnabled = false;
let warned = false;

function warnOnce(message: string, error?: unknown): void {
  if (warned) return;
  warned = true;
  if (error === undefined) {
    console.warn(message);
    return;
  }
  console.warn(message, error);
}

export function initLangfuse(): void {
  if (isInitialized) return;
  isInitialized = true;

  const publicKey = import.meta.env.VITE_LANGFUSE_PUBLIC_KEY;
  const secretKey = import.meta.env.VITE_LANGFUSE_SECRET_KEY;
  const baseUrl = import.meta.env.VITE_LANGFUSE_BASE_URL;

  if (!publicKey || !secretKey) {
    setLangfuseTracerProvider(null);
    warnOnce('[Telemetry] Langfuse disabled: missing VITE_LANGFUSE_PUBLIC_KEY or VITE_LANGFUSE_SECRET_KEY.');
    return;
  }

  try {
    const provider = new BasicTracerProvider({
      spanProcessors: [new LangfuseSpanProcessor({
        publicKey,
        secretKey,
        baseUrl,
        exportMode: 'immediate',
      })],
    });
    setLangfuseTracerProvider(provider);
    isEnabled = true;
  } catch (error) {
    isEnabled = false;
    setLangfuseTracerProvider(null);
    warnOnce('[Telemetry] Langfuse failed to initialize. Continuing without telemetry.', error);
  }
}

export function startSafeObservation<T>(
  name: string,
  fn: (observation: ObservationLike) => T,
  options?: StartActiveObservationOpts,
): T {
  if (!isInitialized) {
    initLangfuse();
  }

  if (!isEnabled) {
    return fn(NOOP_OBSERVATION);
  }

  let callbackStarted = false;
  try {
    return startActiveObservationRaw(
      name,
      (observation) => {
        callbackStarted = true;
        return fn(observation as unknown as ObservationLike);
      },
      options as any,
    ) as T;
  } catch (error) {
    if (callbackStarted) {
      throw error;
    }
    isEnabled = false;
    setLangfuseTracerProvider(null);
    warnOnce('[Telemetry] Langfuse write failed. Continuing without telemetry.', error);
    return fn(NOOP_OBSERVATION);
  }
}
