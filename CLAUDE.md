# LobsterTCG

Generic trading card game simulator with plugin architecture. Svelte 5 + TypeScript + Vite + Tailwind CSS + Supabase.
 
# Testing

Do NOT run tests unless you were messing with hooks.ts relating to evolution timing, energy attachment, or other things the tests look for.

## Philosophy

- Rules enforcement is HARD (would require full rules engine), almost rule can be negated by some card effect. Plugins encode minimal logic for things card effects can never be negated by an effect.

- Game logic cannot be fully encoded in TypeScript. Core systems must NEVER reference any aspect of a specific TCG or import from a plugin. 