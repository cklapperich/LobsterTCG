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

### Readable State
`toReadableState()` converts internal state (instanceIds, visibility tuples) into human-readable format with card names, suitable for AI agents or logging. Only shows cards visible to the specified player.

### AI Tools (`listTools`)
`GamePlugin.listTools(gameLoop, playerIndex)` returns Anthropic SDK-compatible `Tool[]` for AI agents. `createDefaultTools()` in `ai-tools.ts` generates one tool per built-in action type. Plugins call it, filter irrelevant tools, and append game-specific tools. Each tool's `run()` submits to the game loop and returns readable state as JSON. Uses `resolveCardName()` so AI works with card names, not instance IDs.

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

### /src/ - App Entry
| File | Purpose |
|------|---------|
| `App.svelte` | Root component. Screen router: deck-select -> game. Passes selected decks to Game. |
| `main.ts` | Vite entry point, mounts App into DOM. |
| `app.css` | Global styles and Tailwind config. |

### /src/core/ - Game Engine (game-agnostic)

| File | Purpose |
|------|---------|
| `engine.ts` | Core game state operations: `createGameState()`, `executeAction()`, `getPlayerView()`, `loadDeck()`, `makeZoneKey()`, `parseZoneKey()`, `findCardInZones()`, `getCardName()`. |
| `game-loop.ts` | Turn sequencing with plugin integration. Manages action queues, validation, pre/post hooks, event emission, history tracking. |
| `action.ts` | Factory functions for all action types: `draw()`, `moveCard()`, `playCard()`, `shuffle()`, `addCounter()`, `coinFlip()`, `endTurn()`, `peek()`, `reveal()`, etc. |
| `readable.ts` | Converts internal state to human-readable format. `toReadableState()`, `resolveCardName()`. Types: `ReadableCard`, `ReadableZone`, `ReadableGameState`, `ReadableAction`, `ReadableTurn`. |
| `ai-tools.ts` | AI agent tool factory. `createDefaultTools(gameLoop, playerIndex)` returns Anthropic SDK-compatible tools for all built-in action types. |
| `playmat-loader.ts` | Fetches and parses playmat JSON files. `loadPlaymat()`, `parsePlaymat()`. |
| `index.ts` | Barrel re-export of all core modules. |

### /src/core/types/

| File | Purpose |
|------|---------|
| `card.ts` | `CardTemplate` (static card def), `CardInstance` (runtime state with visibility, counters, attachments, evolutionStack), `VISIBILITY` constants. |
| `zone.ts` | `ZoneConfig` (zone rules), `Zone` (runtime zone with cards). |
| `action.ts` | Discriminated union of all action types (`DrawAction`, `MoveCardAction`, `CoinFlipAction`, etc). |
| `game.ts` | `GameState`, `GameConfig`, `PlayerInfo`, `Turn`, `GameResult`. |
| `playmat.ts` | `Playmat`, `PlaymatSlot`, `PlaymatZoneGroup`, `PlaymatLayout`, `PlaymatPosition`. |
| `counter.ts` | `CounterDefinition` for counter metadata. |
| `game-plugin.ts` | `GamePlugin` interface with optional `listTools()` for AI agent integration. |
| `tool.ts` | `Tool` interface matching Anthropic SDK `betaTool` shape (`name`, `description`, `inputSchema`, `run`). |
| `deck.ts` | `DeckEntry`, `DeckList` types. |
| `index.ts` | Barrel re-export of all types. |

### /src/core/plugin/

| File | Purpose |
|------|---------|
| `types.ts` | Plugin interface: `PreHookResult`, `PostHookResult`, hooks, observers, blockers, custom action executors. |
| `plugin-manager.ts` | Registers plugins, executes hooks with priority, manages state observers. |
| `index.ts` | Barrel re-export. |

### /src/components/game/ - UI

| File | Purpose |
|------|---------|
| `Game.svelte` | Root game UI. Loads playmat, manages game state, handles drag/drop, context menus, shuffle animations, SFX playback. |
| `DeckSelect.svelte` | Pre-game deck selection screen. Loads deck files via Vite glob import, parses PTCGO format, lets each player pick a deck. |
| `PlaymatGrid.svelte` | Renders CSS Grid based on playmat config. Maps slots to Zone components. |
| `Zone.svelte` | Single zone view with label, card count, CardStack, context menu, drag-over highlighting. |
| `Card.svelte` | Card visual with face-up/down rendering, counters, drag support, hover preview. |
| `CardStack.svelte` | Renders cards with stack direction (none/down/right/fan). Handles shuffle animation. |
| `CoinFlip.svelte` | Animated coin flip overlay with heads/tails result display and SFX. |
| `CounterIcon.svelte` | Draggable counter badge with image and quantity. |
| `ArrangeModal.svelte` | Modal for peeking/reordering cards from top/bottom of zone. |
| `DragOverlay.svelte` | Floating card following cursor during drag. |
| `CounterDragOverlay.svelte` | Floating counter during counter drag. |
| `ZoneContextMenu.svelte` | Right-click menu with peek/shuffle/arrange options. |
| `CounterTray.svelte` | UI panel showing available counters to drag onto cards. |
| `dragState.svelte.ts` | Svelte 5 rune store for card drag state. |
| `counterDragState.svelte.ts` | Svelte 5 rune store for counter drag state. |
| `gameLog.svelte.ts` | Svelte 5 rune store for game log entries. `addLogEntry()`, `clearLog()`, `resetLog()`. |
| `cardModal.svelte.ts` | Svelte 5 rune store for peek/arrange modal state. `openCardModal()`, `closeCardModal()`. |
| `contextMenu.svelte.ts` | Svelte 5 rune store for zone context menu state. `openContextMenu()`, `closeContextMenu()`. |

### /src/plugins/pokemon/ - Pokemon TCG Plugin

| File | Purpose |
|------|---------|
| `index.ts` | Main plugin: `startPokemonGame()`, `startPokemonGameWithPlaymat()`, `executeSetup()`, `initializeGame()`, `loadPlayerDeck()`, `getCounterDefinitions()`, `getCoinFront()`, `getCoinBack()`, `getCardInfo()`. Exports `plugin` object implementing `GamePlugin`. `listTools()` filters defaults and adds Pokemon-specific tools: `attack`, `retreat`, `attach_energy`, `use_ability`. |
| `helpers.ts` | Pokemon card type helpers: `isBasicPokemon()`, `isEvolution()`, `isSupporter()`, `isStadium()`, `isEnergy()`, `isFieldZone()`. |
| `cards.ts` | Card database backed by `cards-western.json`. `PokemonCardTemplate`, `PokemonAttack`, `PokemonAbility`, `POKEMON_TEMPLATE_MAP`, `getTemplate()`, `getCardBack()`, `parsePTCGODeck()`. |
| `cards-western.json` | Western card database (all sets). Card data including names, images, attacks, abilities, HP, types. |
| `set-codes.json` | Mapping of Pokemon TCG set names to set code prefixes for image lookup. |
| `warnings.ts` | Pokemon warnings plugin (validation rules). Exported as `pokemonWarningsPlugin`. |
| `warnings.test.ts` | Tests for Pokemon warnings plugin. |
| `zones.ts` | Pokemon zone IDs: deck, hand, active, bench_1-5, discard, prize_1-6, lost_zone, stadium. |
| `decks/*.txt` | PTCGO-format deck lists (brushfire, overgrowth, raindance). |
| `counters/*.png` | Counter images: burn, poison, damage-10/50/100. |
| `cardback.png` | Pokemon card back image. |
| `coinfront.png`, `coinback.png` | Coin flip images. |

### /src/lib/

| File | Purpose |
|------|---------|
| `audio.svelte.ts` | SFX system: `playSfx()`, preloading, mute/volume settings. |
| `supabase.ts` | Supabase client initialization. |

### /public/

| Path | Purpose |
|------|---------|
| `playmats/*.json` | Playmat configs (pokemon-tcg.json, solitaire.json). Define grid layout, zone configs, player slots. |
| `card-images/pokemon/` | Card art PNGs (~19,600 images across all sets). |
| `sfx/*.mp3` | 95 SFX extracted from Pokemon TCG GB ROM. UI sounds, attack effects, status conditions. |

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
| `plugin_todolist.md` | Plugin system TODO/planning notes. |
| `sharpen.md` | Project sharpening/improvement notes. |
