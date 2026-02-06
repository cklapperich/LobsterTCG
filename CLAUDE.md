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
Pre-hooks can block, warn, or replace actions. Post-hooks emit follow-up actions. State observers watch for changes and generate auto-actions. This enables game-specific rules without modifying core.

### Action Source & Warn vs Block
Actions carry an optional `source?: 'ui' | 'ai'` field. `PreHookResult` supports `warn` in addition to `block`/`replace`/`continue`. Warnings log to `state.log` but never prevent the action. The `blockOrWarn()` helper in `warnings.ts` returns `block` for AI actions and `warn` for UI actions — human players are never blocked by warnings. AI tools in `ai-tools.ts` automatically tag actions with `source: 'ai'`.

### Zone Keys
Format: `player{0|1}_{zoneId}` (e.g., "player0_hand"). Zone keys are the canonical identifier everywhere — readable state, AI tools, action factories, `state.zones`, warning hooks, and helper functions all use zone keys directly. Zone keys are constructed inline via template literals (e.g., `` `player${p}_${ZONE_IDS.DECK}` ``). `ZONE_IDS` constants name zone *types* (bare IDs like `'deck'`, `'hand'`) used only in construction. Playmat JSON uses bare zone type names since zone definitions are player-agnostic templates.

### Card Array Order
`zone.cards` array: **index 0 = visual bottom, end of array = visual top.** The last element is the card rendered on top with the highest z-index. `position: 0` inserts underneath all existing cards. `push()` / no position appends to the visual top. This convention is consistent across Zone.svelte drops, CardStack rendering, and warning hooks.

### Shared Zones & Opponent Interaction
Zones with `config.shared: true` (e.g., stadium) can be interacted with by any player. Non-shared zones are protected by a core engine check (`checkOpponentZone` in engine.ts, enforced in both GameLoop and executeDrop) that warns UI / blocks AI when targeting an opponent's zone. Counter actions (add/remove/set counter) are exempt — placing damage on opponent Pokemon is normal gameplay. Card effects can bypass with `allowed_by_effect: true`.

### Playmat as JSON Config
Playmats define visual grid layout separately from game logic. Zones are decoupled from visual slots.

### Readable State
`toReadableState()` converts internal state (instanceIds, visibility tuples) into human-readable format with card names, suitable for AI agents or logging. Only shows cards visible to the specified player.

### ToolContext & AI Tools
`ToolContext` is the interface between AI tools and the game. It provides `execute(action)`, `getState()`, and `getReadableState()`. The caller (Game.svelte) builds the context — its `execute` callback runs actions on the real reactive state with SFX and 500ms delays for visual feedback. Tools are serialized via a promise queue so parallel SDK `Promise.all` calls execute one at a time.

`GamePlugin.listTools(ctx: ToolContext)` returns Anthropic SDK-compatible `RunnableTool[]`. `createDefaultTools(ctx)` in `ai-tools.ts` generates one tool per built-in action type. All zone parameters accept zone keys (e.g. `"player1_hand"`) — the same format returned by readable state. Zone keys pass straight through to action factories. Uses `resolveCardName()` so AI works with card names, not instance IDs.

### Status Conditions via Orientation
Pokemon status conditions (paralyzed, asleep, confused) are tracked via card orientation — matching real TCG where you rotate the card. The core engine has `orientation?: string` on `CardInstance` and `set_orientation` as an action type. Moving a card to a different zone automatically clears orientation (`card.orientation = undefined` in all move/draw executors). Card.svelte renders orientation via `data-orientation` attribute + CSS rotation rules. The Pokemon readable state modifier translates `orientation` into a `status` field for AI consumption and strips raw orientation. The `ZoneContextMenu` has a "Status..." submenu for field zones.

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
| `engine.ts` | Core game state operations: `createGameState()`, `executeAction()`, `getPlayerView()`, `loadDeck()`, `findCardInZones()`, `getCardName()`, `checkOpponentZone()`. Moving cards between zones auto-clears `card.orientation`. |
| `game-loop.ts` | Turn sequencing with plugin integration. Manages action queues, validation, pre/post hooks, event emission, history tracking. |
| `action.ts` | Factory functions for all action types: `draw()`, `moveCard()`, `playCard()`, `shuffle()`, `addCounter()`, `coinFlip()`, `endTurn()`, `peek()`, `reveal()`, etc. |
| `readable.ts` | Converts internal state to human-readable format. `toReadableState()`, `resolveCardName()`. Types: `ReadableCard`, `ReadableZone`, `ReadableGameState`, `ReadableAction`, `ReadableTurn`. |
| `ai-tools.ts` | `ToolContext` interface and AI tool factory. `createDefaultTools(ctx)` returns Anthropic SDK-compatible tools. Tools accept zone keys directly (no parsing). `set_orientation` tool uses Pokemon status enum: `normal`/`paralyzed`/`asleep`/`confused`. Actions tagged with `source: 'ai'` by the context's execute callback. |
| `playmat-loader.ts` | Fetches and parses playmat JSON files. `loadPlaymat()`, `parsePlaymat()`. |
| `index.ts` | Barrel re-export of all core modules. |

### /src/core/types/

| File | Purpose |
|------|---------|
| `card.ts` | `CardTemplate` (static card def), `CardInstance` (runtime state with visibility, counters, attachments, evolutionStack), `VISIBILITY` constants. |
| `zone.ts` | `ZoneConfig` (zone rules), `Zone` (runtime zone with cards). |
| `action.ts` | Discriminated union of all action types (`DrawAction`, `MoveCardAction`, `CoinFlipAction`, etc). `BaseAction` includes `source?: 'ui' \| 'ai'`. |
| `game.ts` | `GameState`, `GameConfig`, `PlayerInfo`, `Turn`, `GameResult`. |
| `playmat.ts` | `Playmat`, `PlaymatSlot`, `PlaymatZoneGroup`, `PlaymatLayout`, `PlaymatPosition`. |
| `counter.ts` | `CounterDefinition` for counter metadata. |
| `game-plugin.ts` | `GamePlugin` interface with optional `listTools(ctx: ToolContext)` for AI agent integration. |
| `deck.ts` | `DeckEntry`, `DeckList` types. |
| `index.ts` | Barrel re-export of all types. |

### /src/core/plugin/

| File | Purpose |
|------|---------|
| `types.ts` | Plugin interface: `PreHookResult` (continue/warn/block/replace), `PostHookResult`, hooks, observers, blockers, custom action executors. |
| `plugin-manager.ts` | Registers plugins, executes hooks with priority, manages state observers. |
| `index.ts` | Barrel re-export. |

### /src/components/game/ - UI

| File | Purpose |
|------|---------|
| `Game.svelte` | Root game UI. Loads playmat, manages game state, handles drag/drop, context menus, shuffle animations, SFX playback. |
| `DeckSelect.svelte` | Pre-game deck selection screen. Loads deck files via Vite glob import, parses PTCGO format, lets each player pick a deck. |
| `PlaymatGrid.svelte` | Renders CSS Grid based on playmat config. Maps slots to Zone components. |
| `Zone.svelte` | Single zone view with label, card count, CardStack, context menu, drag-over highlighting. |
| `Card.svelte` | Card visual with face-up/down rendering, counters, drag support, hover preview. Renders orientation via `data-orientation` attribute + CSS rotation (paralyzed=90°, asleep=-90°, confused=180°). |
| `CardStack.svelte` | Renders cards with stack direction (none/down/right/fan). Handles shuffle animation. |
| `CoinFlip.svelte` | Animated coin flip overlay with heads/tails result display and SFX. |
| `CounterIcon.svelte` | Draggable counter badge with image and quantity. |
| `ArrangeModal.svelte` | Modal for peeking/reordering cards from top/bottom of zone. |
| `DragOverlay.svelte` | Floating card following cursor during drag. |
| `CounterDragOverlay.svelte` | Floating counter during counter drag. |
| `ZoneContextMenu.svelte` | Right-click menu with peek/shuffle/arrange/status options. Status submenu (paralyzed/asleep/confused/clear) shown for field zones. |
| `CounterTray.svelte` | UI panel showing available counters to drag onto cards. |
| `dragState.svelte.ts` | Svelte 5 rune store for card drag state. |
| `counterDragState.svelte.ts` | Svelte 5 rune store for counter drag state. |
| `gameLog.svelte.ts` | Svelte 5 rune store for game log entries. `addLogEntry()`, `clearLog()`, `resetLog()`. |
| `cardModal.svelte.ts` | Svelte 5 rune store for peek/arrange modal state. `openCardModal()`, `closeCardModal()`. |
| `contextMenu.svelte.ts` | Svelte 5 rune store for zone context menu state. `openContextMenu()`, `closeContextMenu()`. |

### /src/ai/ - AI Agent

| File | Purpose |
|------|---------|
| `run-turn.ts` | `runAITurn(config)` — runs one AI turn via Anthropic SDK `toolRunner`. Accepts `ToolContext` (no GameLoop cloning). Returns `void` — state mutated in real-time via context. Logs system prompt, iterates messages for structured logging. |
| `logging.ts` | `logMessage()` — color-coded console output for AI messages. `[thinking]` gray, `[AI]` green, `[tool]` orange (name + input only, no full state). |
| `tools/spawn-subagent.ts` | `createSpawnSubagentTool()` — tool that spawns a sub-agent (haiku or sonnet) sharing the same game tools and system prompt. |
| `index.ts` | Barrel re-export of `runAITurn` and `AITurnConfig`. |

### /src/plugins/pokemon/ - Pokemon TCG Plugin

| File | Purpose |
|------|---------|
| `index.ts` | Main plugin: `startPokemonGame()`, `executeSetup()`, `initializeGame()`, `loadPlayerDeck()`, `getCounterDefinitions()`, `getCoinFront()`, `getCoinBack()`, `getCardInfo()`. Exports `plugin` object implementing `GamePlugin`. `listTools(ctx)` filters defaults and adds Pokemon-specific tools: `declare_attack`, `declare_retreat`, `declare_ability`. `set_orientation` is exposed for status conditions. |
| `helpers.ts` | Pokemon card type helpers: `isBasicPokemon()`, `isEvolution()`, `isSupporter()`, `isStadium()`, `isEnergy()`, `isFieldZone()`, `isStadiumZone()`. Zone helpers accept zone keys (e.g., `isFieldZone('player0_active')` → true). |
| `cards.ts` | Card database backed by `cards-western.json`. `PokemonCardTemplate`, `PokemonAttack`, `PokemonAbility`, `POKEMON_TEMPLATE_MAP`, `getTemplate()`, `getCardBack()`, `parsePTCGODeck()`. |
| `cards-western.json` | Western card database (all sets). Card data including names, images, attacks, abilities, HP, types. |
| `set-codes.json` | Mapping of Pokemon TCG set names to set code prefixes for image lookup. |
| `warnings.ts` | Pokemon warnings plugin (validation rules). Uses `blockOrWarn()` — blocks AI, warns UI. `modifyReadableState()` translates orientation→status field, computes totalDamage, converts retreatCost. Exported as `pokemonWarningsPlugin`. |
| `warnings.test.ts` | Tests for Pokemon warnings plugin. |
| `zones.ts` | Pokemon zone IDs: deck, hand, active, bench_1-5, discard, prizes, lost_zone, stadium. |
| `decks/*.txt` | PTCGO-format deck lists (brushfire, overgrowth, raindance). |
| `counters/*.png` | Counter images: burn, poison, damage-10/50/100. |
| `cardback.png` | Pokemon card back image. |
| `coinfront.png`, `coinback.png` | Coin flip images. |
| `agents.md` | System prompt for AI agent (Pokemon TCG heuristics, turn structure, rules). Loaded as raw text via Vite `?raw` import. |

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
| `ZONE_KEY_REFACTOR.md` | Zone key refactor status — complete. `makeZoneKey()` and `parseZoneKey()` deleted. All code uses zone keys directly. |
