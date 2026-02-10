# Plan: GX & VSTAR Markers

## Context
In the Pokemon TCG, GX attacks and VSTAR powers are **once-per-game** mechanics (per player, not per card or per ability name). Each player has a physical cardboard marker they flip face-down after using their one GX attack or VSTAR power. This plan adds digital equivalents — visual markers in the counter tray that auto-flip when used and enforce the restriction.

## Approach Overview
- **State**: Add `pluginState?: Record<string, unknown>` to `GameState` (1 line core addition). Pokemon plugin stores `{ gxUsed: [false, false], vstarUsed: [false, false] }`.
- **UI**: Add a "MARKERS" section at the bottom of `CounterTray.svelte`. Shows both players' GX and VSTAR markers. Auto-flipped by hooks; also manually clickable as override.
- **Enforcement**: Pre-hook blocks/warns when GX/VSTAR already used. Post-hook auto-flips marker on successful declaration.
- **AI awareness**: `modifyReadableState` + `formatNarrativeState` surface marker status.
- **No flip-back**: Once flipped, markers stay flipped (matches physical game).

## Files to Modify

### Core (minimal — 2 files)
| File | Change |
|------|--------|
| `src/core/types/game.ts` | Add `pluginState?: Record<string, unknown>` to `GameState` |
| `src/core/engine.ts` | Initialize `pluginState: {}` in `createGameState()` |

### Plugin (main work — 6 files)
| File | Change |
|------|--------|
| `src/plugins/pokemon/constants.ts` | Add `MARKER_IDS`, `COUNTER_CATEGORIES.MARKER` |
| `src/plugins/pokemon/helpers.ts` | Add `isGXAttack()`, `isVSTARPower()` detection helpers |
| `src/plugins/pokemon/hooks.ts` | Add pre-hook `warnGXAlreadyUsed` + `warnVSTARAlreadyUsed`, post-hook `autoFlipMarkerOnDeclare`, surface in `modifyReadableState` |
| `src/plugins/pokemon/index.ts` | Add `getMarkers()` to plugin, initialize pluginState in `startPokemonGameWithPlaymat`, add marker definitions |
| `src/plugins/pokemon/narrative.ts` | Add GX/VSTAR status to narrative state output |
| New images in `src/plugins/pokemon/markers/` | GX and VSTAR marker PNGs (or CSS-only rendering) |

### Components (2 files)
| File | Change |
|------|--------|
| `src/components/game/CounterTray.svelte` | Add optional `markers` prop + clickable marker section |
| `src/components/game/Game.svelte` | Derive markers from plugin, pass to CounterTray, handle click |

## Implementation Details

### 1. Core: `pluginState` on GameState
```typescript
// src/core/types/game.ts — add 1 field
export interface GameState<T extends CardTemplate = CardTemplate> {
  // ... existing fields ...
  pluginState?: Record<string, unknown>;
}
```
In `createGameState()` in engine.ts, initialize `pluginState: {}`.

### 2. Plugin: Constants
```typescript
// src/plugins/pokemon/constants.ts
export const MARKER_IDS = {
  GX: 'gx',
  VSTAR: 'vstar',
} as const;

// Extend COUNTER_CATEGORIES
export const COUNTER_CATEGORIES = { DAMAGE: 'damage', STATUS: 'status', MARKER: 'marker' } as const;
```

### 3. Plugin: Detection helpers
GX and VSTAR attacks/abilities have NO dedicated fields in the card database. Detection relies on parsing the `effect` text for restriction strings like `"(You can't use more than 1 GX attack in a game.)"` and `"(You can't use more than 1 VSTAR Power in a game.)"`. There are ~596 GX attacks and 94 VSTAR cards in cards-western.json.

```typescript
// src/plugins/pokemon/helpers.ts
export function isGXAttack(attack: PokemonAttack): boolean {
  return attack.effect?.includes("can't use more than 1 GX attack") ?? false;
}

export function isVSTARPower(ability: PokemonAbility): boolean {
  return ability.effect?.includes("can't use more than 1 VSTAR Power") ?? false;
}

// Fallback: check attack names ending in "GX" (some older cards use name convention)
export function isGXAttackByName(name: string): boolean {
  return name.trimEnd().toUpperCase().endsWith('GX') || name.trimEnd().toUpperCase().endsWith('-GX');
}
```

### 4. Plugin: pluginState helpers
```typescript
// src/plugins/pokemon/index.ts (or new file)
interface PokemonPluginState {
  gxUsed: [boolean, boolean];
  vstarUsed: [boolean, boolean];
}

function getPluginState(state: GameState): PokemonPluginState {
  if (!state.pluginState) state.pluginState = {};
  const ps = state.pluginState as Partial<PokemonPluginState>;
  if (!ps.gxUsed) ps.gxUsed = [false, false];
  if (!ps.vstarUsed) ps.vstarUsed = [false, false];
  return ps as PokemonPluginState;
}
```

### 5. Plugin: Enforcement hooks
```typescript
// src/plugins/pokemon/hooks.ts

// Pre-hook: block if GX already used this game
function warnGXAlreadyUsed(state: PokemonState, action: Action): PreHookResult {
  if (action.type !== ACTION_TYPES.DECLARE_ACTION) return { outcome: 'continue' };
  const da = action as DeclareAction;
  if (da.declarationType !== POKEMON_DECLARATION_TYPES.ATTACK) return { outcome: 'continue' };
  if (action.allowed_by_card_effect) return { outcome: 'continue' };

  // Check if this attack is a GX attack (by effect text or name)
  const activeKey = `player${da.player + 1}_${ZONE_IDS.ACTIVE}`;
  const topCard = state.zones[activeKey]?.cards.at(-1);
  const template = topCard ? getTemplate(topCard.template.id) : undefined;
  const attack = template?.attacks?.find(a => a.name === da.name);
  if (!attack || !isGXAttack(attack)) return { outcome: 'continue' };

  const ps = getPluginState(state as GameState);
  if (ps.gxUsed[da.player]) {
    return blockOrWarn(action, 'Already used a GX attack this game.');
  }
  return { outcome: 'continue' };
}

// Similar pattern for VSTAR (checks abilities via declarationType === 'ability')

// Post-hook: auto-flip marker when GX/VSTAR declared successfully
function autoFlipMarkerOnDeclare(state: PokemonState, action: Action): PostHookResult {
  if (action.type !== ACTION_TYPES.DECLARE_ACTION) return {};
  const da = action as DeclareAction;
  const ps = getPluginState(state as GameState);

  // Check GX attack
  if (da.declarationType === POKEMON_DECLARATION_TYPES.ATTACK) {
    const activeKey = `player${da.player + 1}_${ZONE_IDS.ACTIVE}`;
    const topCard = state.zones[activeKey]?.cards.at(-1);
    const template = topCard ? getTemplate(topCard.template.id) : undefined;
    const attack = template?.attacks?.find(a => a.name === da.name);
    if (attack && isGXAttack(attack)) {
      ps.gxUsed[da.player] = true;
      state.log.push(`Player ${da.player + 1} used their GX attack!`);
    }
  }

  // Check VSTAR ability
  if (da.declarationType === POKEMON_DECLARATION_TYPES.ABILITY) {
    // Look up ability by name across field Pokemon, check isVSTARPower()
    // ... similar pattern
    // ps.vstarUsed[da.player] = true;
  }
  return {};
}
```

Register both in `pokemonHooksPlugin.preHooks` and `pokemonHooksPlugin.postHooks`.

### 6. Plugin: getMarkers for UI
```typescript
// src/plugins/pokemon/index.ts — add to plugin object

// MarkerState type (used by CounterTray)
export interface MarkerState {
  id: string;
  label: string;       // "GX" or "V★"
  sublabel: string;    // "You" / "Opp"
  used: boolean;
  clickable: boolean;
}

function getMarkers(state: GameState, playerIndex: PlayerIndex): MarkerState[] {
  const ps = getPluginState(state);
  const opp = (playerIndex === 0 ? 1 : 0) as PlayerIndex;
  return [
    { id: `p${playerIndex}_gx`, label: 'GX', sublabel: 'You', used: ps.gxUsed[playerIndex], clickable: true },
    { id: `p${playerIndex}_vstar`, label: 'V★', sublabel: 'You', used: ps.vstarUsed[playerIndex], clickable: true },
    { id: `p${opp}_gx`, label: 'GX', sublabel: 'Opp', used: ps.gxUsed[opp], clickable: false },
    { id: `p${opp}_vstar`, label: 'V★', sublabel: 'Opp', used: ps.vstarUsed[opp], clickable: false },
  ];
}

function onMarkerClick(state: GameState, playerIndex: PlayerIndex, markerId: string): void {
  const ps = getPluginState(state);
  if (markerId.endsWith('_gx') && !ps.gxUsed[playerIndex]) {
    ps.gxUsed[playerIndex] = true;
    state.log.push(`Player ${playerIndex + 1} flipped GX marker`);
  }
  if (markerId.endsWith('_vstar') && !ps.vstarUsed[playerIndex]) {
    ps.vstarUsed[playerIndex] = true;
    state.log.push(`Player ${playerIndex + 1} flipped VSTAR marker`);
  }
}
```

Add `getMarkers` and `onMarkerClick` to the `GamePlugin` interface in `src/core/types/game-plugin.ts`.

### 7. UI: CounterTray marker section
Add optional props to CounterTray:
```typescript
interface Props {
  counters: CounterDefinition[];
  onCounterReturn?: () => void;
  markers?: MarkerState[];              // NEW
  onMarkerClick?: (id: string) => void; // NEW
}
```

Render after counter categories — a row of small styled buttons:
- **Available**: Bright border (gbc-green), full opacity, label text visible
- **Used**: Dim/greyed out, "USED" overlay or strikethrough, gbc-red border
- **Not clickable** (opponent's): No hover effect, no cursor pointer, slightly smaller
- **Compact layout**: 2x2 grid (Your GX / Your VSTAR on top, Opp GX / Opp VSTAR on bottom)
- CSS-only rendering (no images needed for v1) — styled `<button>` elements with "GX" / "V★" text

### 8. UI: Game.svelte wiring
```typescript
const markers = $derived(plugin.getMarkers?.(gameState, 0) ?? []);

function handleMarkerClick(markerId: string) {
  plugin.onMarkerClick?.(gameState, 0, markerId);
  gameState = gameState; // trigger Svelte reactivity
}
```
Pass `markers` and `onMarkerClick={handleMarkerClick}` to CounterTray.

### 9. AI Awareness
In `modifyReadableState` (hooks.ts): add `gxAvailable` and `vstarAvailable` boolean fields to the readable state header.

In `formatNarrativeState` (narrative.ts): add a "MARKERS" line in the GAME STATE header section:
```
GX: Available | VSTAR: Used
Opponent GX: Used | Opponent VSTAR: Available
```

### 10. GamePlugin interface extension
Add to `src/core/types/game-plugin.ts`:
```typescript
getMarkers?: (state: GameState<T>, playerIndex: PlayerIndex) => MarkerState[];
onMarkerClick?: (state: GameState<T>, playerIndex: PlayerIndex, markerId: string) => void;
```

## Visual Design (Counter Tray)
```
┌───────────────────────┐
│       COUNTERS         │
│ [🔥] [☠] [10][50][100] │
│                         │
│       MARKERS           │
│  ┌──────┐ ┌──────┐     │
│  │  GX  │ │ V★   │  You│
│  │      │ │      │     │
│  └──────┘ └──────┘     │
│  ┌──────┐ ┌──────┐     │
│  │  GX  │ │ V★   │  Opp│
│  │ USED │ │      │     │
│  └──────┘ └──────┘     │
└─────────────────────────┘
```

## Key Design Decisions
1. **pluginState on GameState** (approved) — 1-line core addition, clean architecture
2. **No flip-back** — matches physical game, simplifies implementation
3. **Auto-flip via hooks** — markers flip automatically when GX/VSTAR is declared; manual click is an override
4. **CSS-only markers** for v1 — no image assets needed, can add images later
5. **Detection via effect text parsing** — no card DB schema changes needed

## Verification
1. Start a game — markers show "Available" for both players in counter tray
2. Click your GX marker — it flips to "Used", log entry appears
3. Declare a GX attack via action panel — marker auto-flips, pre-hook blocks repeated use
4. AI uses VSTAR power — opponent's VSTAR marker auto-flips
5. Verify AI narrative state includes marker status
6. Verify pre-hook blocks AI from using GX/VSTAR twice (returns `block` for AI source)
