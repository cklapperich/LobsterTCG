/// <reference types="vite/client" />
/// <reference types="svelte" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_AI_GATEWAY_KEY: string
  readonly VITE_OPENROUTER_API_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
