<script lang="ts">
  // import { supabase } from './lib/supabase'

  let message = $state('Welcome to Lobster TCG')
</script>

<main>
  <h1>{message}</h1>
  <p>Vite + Svelte + TypeScript + Supabase</p>
</main>

<style>
  main {
    max-width: 1280px;
    margin: 0 auto;
    padding: 2rem;
    text-align: center;
  }

  h1 {
    font-size: 3.2em;
    line-height: 1.1;
  }
</style>
