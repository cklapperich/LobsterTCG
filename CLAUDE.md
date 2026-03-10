# LobsterTCG

Generic trading card game simulator with plugin architecture. Svelte 5 + TypeScript + Vite + Tailwind CSS + Supabase.
 
# Testing

Do NOT run tests unless you were messing with hooks.ts relating to evolution timing, energy attachment, or other things the tests look for.

## Philosophy

Rules enforcement is HARD. Pokemon can evolve from their previous stage, except on first turn. Except if Forest of Giant Plants is played. Except if a pokemon ability negates stadiums. Unless that pokemon has a special condition OR Hex Maniac was played earlier in the turn, or there's a Rocket's Tower and it's a non-colorless pokemon, etc.

**Core principle:** Game logic cannot be fully encoded in TypeScript. Everything is game-system-blind except plugins. Plugins encode minimal logic for things card effects can never change.
