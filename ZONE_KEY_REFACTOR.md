# Plan: Zone Keys Everywhere

## Problem

Zone identity is split across two representations:
- **Zone keys** (`"player1_hand"`) — used in `state.zones`, readable state, UI
- **Zone IDs** (`"hand"`) + player index — used in actions, action factories, engine internals

This forces constant conversion via `makeZoneKey()`/`parseZoneKey()`. The AI sees zone keys but tools had to accept zone IDs (now fixed with a shim). Actions store zone IDs, so readable action history leaks bare IDs that don't match the zone keys the AI sees elsewhere.

## Goal

Zone keys are the single identifier. `makeZoneKey()` and `parseZoneKey()` are deleted. `ZoneConfig.id` is deleted — zones are identified by their key in `state.zones`.

---

## Changes

### 1. Action types — zone fields become zone keys

**File: `src/core/types/action.ts`**

All `fromZone`, `toZone`, `zoneId` fields become zone keys:

```ts
// Before
interface MoveCardAction { player: PlayerIndex; fromZone: string; toZone: string; ... }
// After
interface MoveCardAction { player: PlayerIndex; fromZone: string; toZone: string; ... }
```

The field names stay the same, but semantically they hold zone keys now. No type change needed — they're already `string`. The change is in what callers pass.

### 2. Action factories — accept zone keys

**File: `src/core/action.ts`**

```ts
// Before
export function moveCard(player, cardId, fromZone: "hand", toZone: "active", pos?)
// After
export function moveCard(player, cardId, fromZone: "player1_hand", toZone: "player1_active", pos?)
```

Convenience functions that currently hardcode zone IDs need updating:
- `shuffleDeck(player)` → needs to construct key, or callers pass it
- `moveToHand(player, card, from)` → same
- `peekTopOfDeck(player, count)` → same

**Option A**: Delete convenience functions. Callers construct keys.
**Option B**: Convenience functions accept player and construct keys internally.

Recommend **Option A** — fewer functions, less indirection. The handful of callers can construct keys inline.

### 3. Engine — `getZone()` uses key directly

**File: `src/core/engine.ts`**

```ts
// Before
function getZone(state, zoneId, playerIndex) {
  const zoneKey = makeZoneKey(playerIndex, zoneId);
  return state.zones[zoneKey] ?? null;
}

// After
function getZone(state, zoneKey) {
  return state.zones[zoneKey] ?? null;
}
```

All `execute*` functions update accordingly. `checkOpponentZone` parses the player from the key (or compares against `action.player`).

Delete `makeZoneKey()` and `parseZoneKey()` exports. If `checkOpponentZone` needs to know the owner of a zone key, a simple `zoneKey.startsWith('player0_')` check suffices — or keep a minimal `getZoneOwner(key)` helper.

### 4. `ZoneConfig.id` — delete

**File: `src/core/types/zone.ts`**

The `id` field on `ZoneConfig` is redundant — the zone is identified by its key in `state.zones`. Remove it.

**File: `src/core/engine.ts` (`createGameState`)**

Currently iterates zone configs and calls `makeZoneKey(player, config.id)`. Instead, playmat JSON provides zone keys directly, or `createGameState` constructs them from the player template.

### 5. Playmat JSON — zone definitions use keys

**File: `public/playmats/pokemon-tcg.json`**

Zone definitions in the playmat already map to keys. The slot `zoneId` field becomes `zoneKey`. The playmat loader constructs the full key.

### 6. AI tools — remove `parseZoneKey` shim

**File: `src/core/ai-tools.ts`**

The `zoneId()` helper that calls `parseZoneKey()` is deleted. Zone keys pass straight through to action factories.

### 7. Pokemon plugin setup — use zone keys

**File: `src/plugins/pokemon/index.ts`**

`executeSetup()`, `loadPlayerDeck()`, etc. currently pass zone IDs like `ZONE_IDS.DECK`. These become zone keys like `makeZoneKey(player, ZONE_IDS.DECK)` — or better, `ZONE_IDS` itself stores key templates and a helper constructs per-player keys.

Actually, with this refactor `ZONE_IDS` becomes less useful. The zone keys are just the keys in `state.zones`. The plugin could export helper functions or just use string literals.

### 8. Game.svelte — already uses zone keys

The UI already works with zone keys from `state.zones`. `handleDrop`, `handleShuffle`, etc. already have zone keys. The only change is that `parseZoneKey()` calls (for logging, etc.) get replaced with simpler string operations or removed.

### 9. Readable action history — now consistent

Since actions store zone keys, `convertAction()` in `readable.ts` passes them through. The AI sees `"fromZone": "player1_hand"` in action history — matching the zone keys it sees in the zones object.

---

## Files to Modify

| File | Change |
|------|--------|
| `src/core/types/action.ts` | Document zone fields hold keys (no type change) |
| `src/core/types/zone.ts` | Remove `id` from `ZoneConfig` |
| `src/core/action.ts` | Factories accept zone keys; delete convenience fns |
| `src/core/engine.ts` | `getZone(state, key)`, delete `makeZoneKey`/`parseZoneKey`, update all execute* fns |
| `src/core/ai-tools.ts` | Remove `parseZoneKey` import and `zoneId()` helper |
| `src/core/readable.ts` | No change (already uses zone keys) |
| `src/core/index.ts` | Remove `makeZoneKey`/`parseZoneKey` exports |
| `src/plugins/pokemon/index.ts` | `executeSetup()` etc. use zone keys |
| `src/plugins/pokemon/zones.ts` | Rethink ZONE_IDS — maybe just delete or convert to key helpers |
| `src/plugins/pokemon/warnings.ts` | Update any `makeZoneKey` calls |
| `src/components/game/Game.svelte` | Remove `parseZoneKey` calls, pass zone keys to actions |
| `src/components/game/dragState.svelte.ts` | Update if it uses `parseZoneKey` |
| `public/playmats/pokemon-tcg.json` | Possibly update zone definitions |
| `src/core/playmat-loader.ts` | Update zone key construction |

## Migration Strategy

1. Start from the bottom (action types) and work up
2. Keep `makeZoneKey` temporarily as a construction helper during migration
3. Delete it last once all callers are updated
4. Run `tsc --noEmit` after each file change

## Implementation Approach

Use find-and-replace tools liberally, and frequently build / type-check to find places you missed. Do NOT attempt to read all the files and make all the changes one at a time. Instead: make a sweeping change (e.g. rename a function, delete a parameter), run `tsc --noEmit`, and let the compiler errors guide you to the remaining call sites.
