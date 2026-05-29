import './app.css'
import App from './App.svelte'
import { mount } from 'svelte'
import { initLangfuse } from './telemetry/langfuse'

initLangfuse()

const app = mount(App, {
  target: document.getElementById('app')!,
})

export default app
