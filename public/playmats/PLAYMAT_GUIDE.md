# Playmat JSON Authoring Guide

A playmat JSON file defines the visual layout and zone rules for a card game. The engine is game-agnostic — all game-specific behavior comes from plugins. The playmat defines where zones appear, how they look, and what rules they enforce.

See `pokemon-tcg.json` for a complete 2-player example.

---

## Top-Level Structure

```json
{
  "id": "my-game",
  "name": "My Card Game",
  "gameType": "my-game",
  "playerCount": 2,
  "layout": { ... },
  "zones": [ ... ],
  "playerSlots": { ... }
}
```

| Field | Description |
|-------|-------------|
| `id` | Unique playmat identifier |
| `name` | Display name |
| `gameType` | Must match the plugin's game type |
| `playerCount` | `1` or `2` |
| `layout` | Grid layout with slots (see below) |
| `zones` | Array of zone config definitions |
| `playerSlots` | Maps player index (`"0"`, `"1"`) to their slot IDs |

---

## Layout

```json
"layout": {
  "rows": 5,
  "cols": 9,
  "columnScales": [1.0, 1.5, 1.0, ...],
  "rowHeights": ["auto", "auto", "0", "auto", "auto"],
  "slots": [ ... ],
  "groups": [ ... ]
}
```

| Field | Description |
|-------|-------------|
| `rows` / `cols` | Grid dimensions |
| `columnScales` | Per-column width multipliers. Base unit is `(card-width + 1.5rem) * scale`. Use `1.5` for the active Pokemon column, `1.0` for standard. |
| `rowHeights` | Per-row CSS height values. `"auto"` sizes to content. `"0"` creates a collapsed spacer row (useful for shared zones like stadium/staging that float between player fields). |
| `slots` | Array of slot definitions (see below) |
| `groups` | Named groups of slot IDs for logical grouping (e.g., "p1_field", "shared") |

---

## Slots (Visual Rendering)

Each slot maps a zone to a position on the grid and controls how it renders.

```json
{
  "id": "p1_deck",
  "zoneId": "deck",
  "position": { "row": 3, "col": 0 },
  "label": "Deck",
  "stackDirection": "none",
  "fixedSize": true,
  "showCount": true,
  "scale": 1.0
}
```

### Slot Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `id` | string | required | Unique slot ID. Convention: `p1_zoneid`, `p2_zoneid`, or bare for shared. |
| `zoneId` | string | required | References a zone config `id`. Per-player zones get prefixed (`player1_deck`), shared zones use bare key. |
| `position` | object | required | `{ row, col, rowSpan?, colSpan? }` — 0-indexed grid placement. |
| `label` | string | *none* | **If omitted, no zone title is rendered.** Used to hide labels on small zones (prizes, etc.). |
| `stackDirection` | string | `"none"` | How cards stack visually. See Stack Directions below. |
| `fixedSize` | boolean | `false` | Constrains zone to single-card height via `max-height`. Content overflows visually (no clipping). Use for decks and single-card zones. |
| `scale` | number | `1.0` | Size multiplier for cards and zone. `1.5` for active, `0.5` for prizes/utility. |
| `showCount` | boolean | `false` | Appends card count to label: "Deck (47)". Only shown when count > 0. |
| `align` | string | *none* | Vertical alignment in grid cell: `"start"`, `"end"`, `"center"`. |
| `group` | string | *none* | Groups slots into a sub-grid. All slots with the same `group` value at the same `row` become a sub-grid. |
| `groupRow` | number | *none* | Row within group sub-grid (0-indexed). |
| `groupCol` | number | *none* | Column within group sub-grid (0-indexed). |

### Stack Directions

| Direction | Visual Effect | Use Case |
|-----------|---------------|----------|
| `"none"` | Cards stacked on top of each other with subtle offset for 3D deck thickness effect (`top: -0.022rem * i`, `left: 0.01rem * i`). | Decks, discard piles, prizes, stadium |
| `"down"` | Cards offset downward, each card peeking below the previous. | Active Pokemon (evolution stacks), bench slots |
| `"up"` | Cards offset upward from bottom. | Rarely used, available for special layouts |
| `"right"` | Cards offset rightward. | Horizontal spreads |
| `"fan"` | Cards spread horizontally to fill container width. Dynamically calculates overlap — full spread when space allows, compressed fan when tight. Hover-to-top enabled when cards overlap. | Hand zones |

### Group Sub-Grids

Multiple slots sharing the same `group` and `row` are rendered inside a single grid cell as a sub-grid. Use `groupRow`/`groupCol` for explicit placement within the sub-grid.

Example: 2x3 prize grid
```json
{ "id": "p1_prizes_1", "zoneId": "prizes_1", "position": { "row": 3, "col": 7 },
  "stackDirection": "none", "fixedSize": true, "scale": 0.5,
  "group": "p1_prizes", "groupRow": 0, "groupCol": 0 },
{ "id": "p1_prizes_2", "zoneId": "prizes_2", "position": { "row": 3, "col": 7 },
  "stackDirection": "none", "fixedSize": true, "scale": 0.5,
  "group": "p1_prizes", "groupRow": 0, "groupCol": 1 },
...
```

All 6 prize slots share `position: { row: 3, col: 7 }` and `group: "p1_prizes"`. The sub-grid arranges them in a 2-column, 3-row layout using `groupRow`/`groupCol`.

---

## Zones (Game Rules)

Zones define the rules for a type of card location. Slots reference zones by `zoneId`. Non-shared zones are instantiated per-player (prefixed `player1_`, `player2_`). Shared zones exist once with their bare ID.

```json
{
  "id": "deck",
  "name": "Deck",
  "ordered": true,
  "defaultVisibility": "hidden",
  "maxCards": 60,
  "ownerCanSeeContents": false,
  "opponentCanSeeCount": true,
  "canHaveCounters": false,
  "shuffleable": true
}
```

### Zone Properties

| Property | Type | Description |
|----------|------|-------------|
| `id` | string | Zone type identifier. Used in slot `zoneId` references. |
| `name` | string | Display name (used as fallback if slot has no `label`). |
| `ordered` | boolean | Whether card order matters (decks = true, hands = false). |
| `defaultVisibility` | string | `"hidden"` = `[false, false]`, `"public"` = `[true, true]`. Controls whether cards are face-up or face-down by default. |
| `maxCards` | number | Maximum cards allowed. `-1` = unlimited. `1` for single-card zones (stadium, prizes). |
| `ownerCanSeeContents` | boolean | Whether the owner can see face-down cards in this zone. `false` for deck/prizes. |
| `opponentCanSeeCount` | boolean | Whether opponent can see how many cards are in this zone. |
| `canHaveCounters` | boolean | Whether cards in this zone can hold counters (damage, status, etc.). Default: `true`. |
| `shuffleable` | boolean | Whether "Shuffle" appears in the right-click context menu. Default: `false`. |
| `shared` | boolean | If `true`, one instance shared by both players (e.g., stadium). Zone key = bare ID. |

### Visibility Values

In the JSON, use string shorthands:
- `"hidden"` → `[false, false]` — neither player sees card faces (deck, prizes)
- `"public"` → `[true, true]` — both players see card faces (field, discard)

The engine converts these to `[boolean, boolean]` tuples internally. Per-card visibility can be changed at runtime via actions (peek, reveal, flip).

### Zone Key Convention

The engine creates zone instances from zone configs:
- **Non-shared zones**: `player{N}_{zoneId}` — e.g., `player1_deck`, `player2_hand`
- **Shared zones** (`shared: true`): bare `{zoneId}` — e.g., `stadium`, `staging`

Zone keys are the canonical identifier used everywhere: readable state, AI tools, actions, hooks.

---

## Visual Behavior Notes

### Card Array Order
`zone.cards` array: index 0 = visual bottom, end of array = visual top. The last element renders with the highest z-index. `position: 0` inserts at the bottom; `push()` / omitting position appends to the top.

### Fixed-Size Zones
`fixedSize: true` applies `max-height` to constrain the zone's layout size to a single card height. There is NO `overflow: hidden` — content (stacking offsets, shuffle animations, hover effects) is allowed to visually overflow the box. This is intentional so deck thickness and shuffle animations aren't clipped.

### Zone Labels
Labels render above cards (`z-index: 100`) so they're never hidden by stacked content. If a slot omits `label`, no title is rendered at all — useful for small zones like prizes where a label would be clutter.

### Shuffle Animation
Zones with `shuffleable: true` in their zone config show "Shuffle" in the right-click menu. The animation lifts packets of 12 cards upward (`translateY(-2.5rem)`) through 4 repetitions. Since `fixedSize` doesn't clip overflow, the animation is visible above the zone boundary.

### Context Menu
Right-clicking a zone shows options based on zone config: Peek, Arrange, Search (own non-public zones), Shuffle (if `shuffleable`), Status submenu (field zones), Reveal to Opponent (own zones).

### Browsable Zones
Public zones with `stackDirection: "none"` are auto-detected as browsable — clicking them opens a browse modal showing all cards. This enables browsing discard piles, stadiums, etc.

---

## Player Slots

Maps player indices to their slot IDs. Player `"0"` is the human (bottom of screen), player `"1"` is the opponent (top).

```json
"playerSlots": {
  "0": ["p1_deck", "p1_active", "p1_bench_1", ...],
  "1": ["p2_deck", "p2_active", "p2_bench_1", ...]
}
```

PlaymatGrid uses this to prefix zone keys: slot `p1_deck` for player `0` → zone key `player1_deck`.

---

## Grid Layout Tips

- Use `"0"` in `rowHeights` for collapsed spacer rows between player fields
- `columnScales` adjusts column widths relative to card size — `1.5` for the active column gives extra room for evolution stacks
- Player 1 (human) field slots use `p1-field` CSS class which aligns to bottom of grid cell (`align-self: end`)
- Active zone slots get `overflow: visible` and higher `z-index` in PlaymatGrid so evolution stacks and hover effects aren't clipped
- Shared zones (stadium, staging) get `mid-zone` class with `z-index: 5`
