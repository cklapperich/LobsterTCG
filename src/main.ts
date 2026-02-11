import './app.css'
import App from './App.svelte'
import { mount } from 'svelte'
import { BasicTracerProvider } from '@opentelemetry/sdk-trace-base'
import { LangfuseSpanProcessor } from '@langfuse/otel'
import { setLangfuseTracerProvider } from '@langfuse/tracing'

const provider = new BasicTracerProvider({
  spanProcessors: [new LangfuseSpanProcessor({
    publicKey: import.meta.env.VITE_LANGFUSE_PUBLIC_KEY,
    secretKey: import.meta.env.VITE_LANGFUSE_SECRET_KEY,
    baseUrl: import.meta.env.VITE_LANGFUSE_BASE_URL,
    exportMode: 'immediate',
  })],
})
setLangfuseTracerProvider(provider)

const app = mount(App, {
  target: document.getElementById('app')!,
})

export default app
