# Zone Key Refactor — Status

## Goal

Zone keys (`"player0_hand"`) become the single identifier. Eliminate the split between bare zone IDs (`"hand"`) and zone keys. Delete `makeZoneKey()`/`parseZoneKey()`.

---

## What's Done

| Area | Status |
|------|--------|
| `ZoneConfig.id` field | Removed from TS type |
| `Zone.key` field | Added — zones carry their own key |
| Action type docs (`types/action.ts`) | Updated — comments say "Zone key" |
| Action factories (`action.ts`) | Accept zone keys, not bare IDs |
| AI tools (`ai-tools.ts`) | Pass zone keys directly, no `parseZoneKey` shim |
| `getZone()` in engine | Takes zone key directly |
| `dragState.svelte.ts` | Uses zone keys throughout |

---

## What's NOT Done

| Area | Current State | Needed |
|------|---------------|--------|
| `makeZoneKey()` | 10+ production call sites | Delete; callers construct keys or use zone keys directly |
| `parseZoneKey()` | 1 call site (`checkOpponentZone`) + dead import in Game.svelte | Delete; use `zone.owner` or `key.startsWith('player0_')` |
| `GameConfig.zones` | `Record<string, ZoneConfig>` keyed by bare zone IDs | Key by zone key templates or restructure |
| `executeDraw()` | Hardcodes `makeZoneKey(player, 'deck')` / `'hand'` | Use zone keys from DrawAction or construct inline |
| Playmat JSON | Zones have `"id": "deck"`, slots have `"zoneId": "hand"` | Use zone key format |
| `PlaymatGrid.svelte` | `makeZoneKey(player, slot.zoneId)` | Read zone keys from playmat directly |
| `ZONE_IDS` constants | Bare IDs: `'deck'`, `'hand'`, `'active'` | Delete or convert to zone key helpers |
| `isFieldZone()` / `isStadiumZone()` | Accept bare zone IDs only — `"player0_active"` would FAIL | Accept zone keys (match with `.endsWith()` or regex) |
| **Warnings plugin** | **Compares `fromZone`/`toZone` against bare IDs like `'hand'`, `'staging'`** | **Update to zone key comparisons** |
| `checkOpponentZone()` | Uses `parseZoneKey()` to extract zone ID for discard exemption | Use `zone.owner` or string check |
| Game.svelte logging | `zoneKey.split('_').slice(1).join('_')` to extract zone ID for display | Use `zone.config.name` instead |

---

## Critical Bug: Warnings Plugin

The warnings plugin is broken by the partial refactor. Action factories now put **zone keys** in `fromZone`/`toZone`, but the warnings plugin compares against **bare zone IDs**:

```ts
// warnings.ts — these all silently fail now:
if (fromZone !== 'hand' || toZone !== 'staging') return false;  // "player0_hand" !== "hand"
if (!isFieldZone(toZone))                                       // isFieldZone("player0_active") → false
const zoneKey = `player${player}_${toZone}`;                    // double-prefix: "player0_player0_active"
```

**Result:** All warning hooks are bypassed — supporter limit, energy limit, evolution checks, field placement, stadium-only, energy ordering. **16 of 27 tests fail.**

### Fix: Update helpers to accept zone keys

```ts
// helpers.ts — before:
export function isFieldZone(zoneId: string): boolean {
  return zoneId === 'active' || /^bench_\d+$/.test(zoneId);
}

// after:
export function isFieldZone(zoneKey: string): boolean {
  return zoneKey.endsWith('_active') || /_bench_\d+$/.test(zoneKey);
}
```

Then update all bare-ID comparisons in warnings.ts similarly (e.g. `toZone.endsWith('_hand')`). Remove manual `player${player}_${toZone}` zone key construction — `toZone` already IS a zone key.

---

## Remaining Steps (Priority Order)

1. **Fix warnings plugin + helpers** — make `isFieldZone`/`isStadiumZone` and all bare-ID comparisons work with zone keys. This unbreaks 16 tests.
2. **Delete `parseZoneKey`** — replace the 1 call site in `checkOpponentZone` with `zone.owner` or string prefix check.
3. **Delete `makeZoneKey`** — update all 10 call sites to construct keys inline or restructure callers.
4. **Update `GameConfig.zones`** — key by zone key templates, update `createGameState`.
5. **Update playmat JSON + loader** — zones/slots use zone keys.
6. **Delete `ZONE_IDS`** — or convert to zone key helpers if still useful.

Step 1 is the critical fix. Steps 2-6 are cleanup that can happen incrementally.
