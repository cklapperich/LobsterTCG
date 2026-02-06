# Zone Key Refactor — Status

## Goal

Zone keys (`"player0_hand"`) are the single identifier everywhere. Bare zone IDs (`"hand"`) are only used in config/construction contexts (playmat JSON, `GameConfig.zones`, `ZONE_IDS` constants).

---

## Completed

| Area | Status |
|------|--------|
| `ZoneConfig.id` field | Removed from TS type |
| `Zone.key` field | Added — zones carry their own key |
| Action type docs (`types/action.ts`) | Updated — comments say "Zone key" |
| Action factories (`action.ts`) | Accept zone keys, not bare IDs |
| AI tools (`ai-tools.ts`) | Pass zone keys directly |
| `getZone()` in engine | Takes zone key directly |
| `dragState.svelte.ts` | Uses zone keys throughout |
| `isFieldZone()` / `isStadiumZone()` | Accept zone keys via `.endsWith()` / regex |
| Warnings plugin (`warnings.ts`) | All comparisons use zone key suffixes; no manual zone key construction |
| `checkOpponentZone()` | Uses `.endsWith('_discard')` and `zone.config.name` — no `parseZoneKey` |
| `makeZoneKey()` | **Deleted** — all call sites use inline template literals |
| `parseZoneKey()` | **Deleted** — zero references remain |
| `Game.svelte` logging | Uses `zone.config.name` instead of string splitting |
| `PlaymatGrid.svelte` | Constructs zone keys inline |
| `pokemon/index.ts` | Constructs zone keys inline with `ZONE_IDS` |
| All tests | Updated — 34/34 passing |

---

## Not Changing (by design)

| Area | Reason |
|------|--------|
| Playmat JSON format | `zones[].id` and `slots[].zoneId` use bare zone type names (`"deck"`, `"hand"`). This is correct — zone definitions are player-agnostic templates. `createGameState()` combines player index + zone type to produce runtime zone keys. |
| `ZONE_IDS` constants | Useful as construction helpers: `` `player${p}_${ZONE_IDS.DECK}` ``. They name zone *types*, not runtime zones. |
| `GameConfig.zones` | Keyed by zone type names, consumed only by `createGameState()` which constructs zone keys. Config-level, not runtime. |
