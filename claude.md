# LobsterTCG

Generic trading card game simulator with plugin architecture. Svelte 5 + TypeScript + Vite + Tailwind CSS + Supabase.

## Philosophy

Rules enforcement is HARD. Pokemon can evolve from their previous stage, except on first turn. Except if Forest of Giant Plants is played. Except if a pokemon ability negates stadiums. Unless that pokemon has a special condition OR Hex Maniac was played earlier in the turn, or there's a Rocket's Tower and it's a non-colorless pokemon, etc.

TCGone.net worked on automating Pokemon rules enforcement for 10+ years, still fixing bugs weekly.

**Core principle:** Game logic cannot be fully encoded in TypeScript. Everything is game-system-blind except plugins. Plugins encode minimal logic for things card effects can never change.

---

## Architecture Decisions

### Action-Based State Machine
All game state changes happen via discrete Action objects. `GameLoop` processes actions through plugin hooks (pre/post) and validators. History is preserved for undo/replay.

### Visibility System
Cards have `Visibility = [playerA_sees, playerB_sees]` tuples. `getPlayerView()` filters state per player. Hidden information is preserved in core state but invisible to UI.

### Plugin Hooks
Pre-hooks can block or replace actions. Post-hooks emit follow-up actions. State observers watch for changes and generate auto-actions. This enables game-specific rules without modifying core.

### Zone Keys
Format: `player{0|1}_{zoneId}` (e.g., "player0_hand"). Parsed/created via `makeZoneKey()` and `parseZoneKey()`.

### Playmat as JSON Config
Playmats define visual grid layout separately from game logic. Zones are decoupled from visual slots.

### SFX Extraction
Tools extract SFX from Pokemon TCG GB ROM using PyBoy emulator. Memory addresses from poketcg disassembly. See `tools/extract_sfx.py`.

---

## File Reference

### Root
| File | Purpose |
|------|---------|
| `index.html` | Entry point, mounts Svelte app into `#app` |
| `vite.config.ts` | Vite build config with Svelte and Tailwind plugins |
| `svelte.config.js` | Svelte compiler options |
| `vercel.json` | Vercel deployment config |

### /src/core/ - Game Engine (game-agnostic)

| File | Purpose |
|------|---------|
| `engine.ts` | Core game state operations: `createGameState()`, `executeAction()`, `getPlayerView()`, `loadDeck()`. Handles card instances, zone manipulation, visibility filtering. |
| `game-loop.ts` | Turn sequencing with plugin integration. Manages action queues, validation, pre/post hooks, event emission, history tracking. |
| `action.ts` | Factory functions for all action types: `draw()`, `moveCard()`, `shuffle()`, `addCounter()`, `coinFlip()`, `endTurn()`, etc. |
| `readable.ts` | Converts internal state (with instanceIds) to human-readable format with card names. |
| `playmat-loader.ts` | Fetches and parses playmat JSON files. |

### /src/core/types/

| File | Purpose |
|------|---------|
| `card.ts` | `CardTemplate` (static card def), `CardInstance` (runtime state with visibility, counters, attachments, evolutionStack). |
| `zone.ts` | `ZoneConfig` (zone rules), `Zone` (runtime zone with cards). |
| `action.ts` | Discriminated union of all action types. |
| `game.ts` | `GameState`, `GameConfig`, `PlayerInfo`, `Turn`, `GameResult`. |
| `playmat.ts` | `Playmat`, `PlaymatSlot`, `PlaymatLayout` for visual grid config. |
| `counter.ts` | `CounterDefinition` for counter metadata. |
| `game-plugin.ts` | `GamePlugin` interface. |
| `deck.ts` | `DeckEntry`, `DeckList` types. |

### /src/core/plugin/

| File | Purpose |
|------|---------|
| `types.ts` | Plugin interface: `PreHookResult`, `PostHookResult`, hooks, observers, blockers, custom action executors. |
| `plugin-manager.ts` | Registers plugins, executes hooks with priority, manages state observers. |

### /src/components/game/ - UI

| File | Purpose |
|------|---------|
| `Game.svelte` | Root game UI. Loads playmat, manages game state, handles drag/drop, context menus, shuffle animations, SFX playback. |
| `PlaymatGrid.svelte` | Renders CSS Grid based on playmat config. Maps slots to Zone components. |
| `Zone.svelte` | Single zone view with label, card count, CardStack, context menu, drag-over highlighting. |
| `Card.svelte` | Card visual with face-up/down rendering, counters, drag support, hover preview. |
| `CardStack.svelte` | Renders cards with stack direction (none/down/right/fan). Handles shuffle animation. |
| `CounterIcon.svelte` | Draggable counter badge with image and quantity. |
| `ArrangeModal.svelte` | Modal for peeking/reordering cards from top/bottom of zone. |
| `DragOverlay.svelte` | Floating card following cursor during drag. |
| `CounterDragOverlay.svelte` | Floating counter during counter drag. |
| `ZoneContextMenu.svelte` | Right-click menu with peek/shuffle/arrange options. |
| `dragState.svelte.ts` | Svelte store for card drag state. |
| `counterDragState.svelte.ts` | Svelte store for counter drag state. |
| `CounterTray.svelte` | UI panel showing available counters to drag onto cards. |

### /src/plugins/pokemon/ - Pokemon TCG Plugin

| File | Purpose |
|------|---------|
| `index.ts` | Main plugin: `startPokemonGame()`, `executeSetup()`, `initializeGame()`, `getCounterDefinitions()`. Loads playmat, handles deck loading, setup phase. |
| `cards.ts` | Card definitions: `PokemonCardTemplate`, `BASE_SET_CARDS` (30 cards), `DEFAULT_POKEMON_DECK`, `getTemplate()`. |
| `zones.ts` | Pokemon zone IDs: deck, hand, active, bench_1-5, discard, prize_1-6, lost_zone, stadium. |
| `counters/*.png` | Counter images: burn, poison, damage-10/50/100. |

### /src/lib/

| File | Purpose |
|------|---------|
| `audio.svelte.ts` | SFX system: `playSfx()`, preloading, mute/volume settings. |
| `supabase.ts` | Supabase client initialization. |

### /public/

| Path | Purpose |
|------|---------|
| `playmats/*.json` | Playmat configs (pokemon-tcg.json, solitaire.json). Define grid layout, zone configs, player slots. |
| `card-images/pokemon/` | Card art PNGs (base1-*.png), card back, coin images. |
| `sfx/*.mp3` | 95+ SFX extracted from Pokemon TCG GB ROM. UI sounds, attack effects, status conditions. |

### /tools/

| File | Purpose |
|------|---------|
| `extract_sfx.py` | Extracts SFX from ROM using PyBoy. Writes to wCurSfxID (0xDD82), pauses music via wddf2 (0xDDF2), records audio. |
| `generate_counters.py` | Generates counter PNGs using PIL. |
| `poketcg/` | Embedded disassembly repo for memory address reference. |

### Documentation

| File | Purpose |
|------|---------|
| `aesthetics.md` | Retro pixel-art styling guidelines. |
| `AI_AGENT_PLAN.md` | AI agent integration planning. |
