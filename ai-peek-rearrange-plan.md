# AI Peek / Search / Rearrange Fix Plan

## Problems Found

### Bug 1: `peek` tool returns nothing to the AI
- `executePeek()` in engine.ts returns `CardInstance[]` but `executeAction()` discards the return value
- The tool result to the AI is just `"[Player 2] Peeked at 4 cards"` or `"OK"` — no card names/data
- Peek doesn't change card visibility, so refreshed game state won't show peeked cards either
- **The AI literally cannot see what it peeked**

### Bug 2: `condenseToolResults` destroys `search_zone` data
- `runAgent` uses `maxSteps: 1` per loop iteration
- After each step, `condenseToolResults` replaces all tool results with `[tool_name succeeded]`
- `search_zone` returns a full card inventory (40+ cards) — immediately condensed before the AI's next inference
- AI sees `[search_zone succeeded]` with no card data → calls it again → infinite loop

### Gap 3: No prompting for peek/search workflow
- `prompt-sections.md` has zero mention of peek, search, or the peek→move_card→shuffle workflow
- `@TOOL_USAGE` only describes `move_card` for hand→board moves
- AI doesn't know it can `move_card` from `your_deck` by name after peeking/searching
- AI doesn't know to use `place_on_zone` to put cards back

### Gap 4: No rearrange tool
- After peeking top N cards, many card effects say "put them back in any order"
- AI has no tool to reorder cards within a zone
- `move_card` and `place_on_zone` only support `top`/`bottom` positioning
- Engine supports numeric positions but AI tools don't expose them
- Current workaround: 2N tool calls (move all to staging, place back one-by-one) — too chatty

---

## Design: Rich Tool Results via narrative.ts (No Visibility Changes)

### Core Insight
Instead of changing card visibility (which requires cleanup), have peek/search tools call `formatCardReference()` from `narrative.ts` directly. The tool result includes full card references in the **same format** the AI already sees in CARD REFERENCE. No state side effects, no cleanup needed.

### Why Not Visibility?
We considered having peek/search temporarily set cards visible so narrative.ts auto-includes them in CARD REFERENCE. Problems:
- **Cleanup is unreliable** — not all peek effects involve a shuffle
- **Shuffle resets** are clever (shuffle already touches every card → reset visibility to zone defaults) but only cover search workflows, not pure peek-rearrange flows
- **End-turn sweep** works as safety net but feels like a bug if cards stay visible across inference steps
- **Unnecessary complexity** — the tool result is the right place for ephemeral information

### Chosen Approach: Tool-Level Formatting + Smart Condense

**Peek and search tools:**
1. Read cards from the zone (peek: top/bottom N; search: all)
2. Call `formatCardReference()` for each card to get full card details
3. Return rich result with card references + inline instructions
4. **No visibility changes, no state side effects**

**Condense strategy (single-slot most-recent-wins):**
- `condenseToolResults` tracks a single `lastInfoToolIndex` for peek AND search_zone combined
- **Only the single most recent** peek or search result is preserved — whichever was called last
- All older peek/search results are condensed to `[peek succeeded]` / `[search_zone succeeded]`
- This bounds context cost to exactly 1 informational result in history at any time
- Rationale: peek and search are mutually exclusive — searching after peeking invalidates peek positions (cards moved), peeking after searching means you already shuffled (search data stale)
- Other informational tools (`coin_flip`, `dice_roll`) are small enough to always preserve

### Shuffle Visibility Reset (Bonus)
Even though we're not using visibility for the core fix, `shuffle` SHOULD reset card visibility to zone defaults as a general correctness improvement. If any future feature or manual state edit leaves cards with stale visibility, shuffling a hidden zone should clean it up. This is a small, safe change to `executeShuffle` in engine.ts.

---

## Fixes

### Fix 1: Rich peek tool result (ai-tools.ts)

Make the peek tool a hybrid — execute the action for logging/hooks, then read cards and return rich data.

The peek tool should:
1. Execute the peek action (for hooks/logging)
2. Read the top/bottom N cards from the zone
3. Call `formatCardReference()` for each card
4. Return a result like:
```
Peeked at top 4 of your_deck:

=== CARD REFERENCES ===
Psychic Energy — Energy — Type: Psychic
Spoink — Basic Pokemon — HP: 60 — Type: Psychic — Attacks: [Psyshot: 20 damage, cost: P] — Weakness: Dark x2 — Retreat: 1
Professor's Research — Supporter — Effect: Discard your hand and draw 7 cards
Psychic Energy — Energy — Type: Psychic

=== POSITION (top to bottom) ===
1. Psychic Energy (top of deck — drawn next)
2. Spoink
3. Professor's Research
4. Psychic Energy (4th from top)

=== ACTIONS ===
To take cards: move_card with fromZone="your_deck" and cardName="<name>"
To reorder: rearrange_zone with zone="your_deck" and cardNames in desired top-to-bottom order
To shuffle: shuffle with zone="your_deck"
```

### Fix 2: Smart condense for informational tools (run-turn.ts)

In `condenseToolResults()`:
- Track a single `lastInfoToolIndex` across both `peek` and `search_zone`
- Condense ALL peek/search results except the single most recent one (whichever was called last)
- Always preserve `coin_flip` and `dice_roll` results (they're small)

Add to `constants.ts`:
```typescript
/** Tools that share a single "keep latest" slot in condenseToolResults.
 *  Only the most recent call among ALL of these is preserved; older ones are condensed.
 *  Rationale: peek and search are mutually exclusive (searching invalidates peek positions). */
export const KEEP_LATEST_INFO_TOOL_NAMES = ['search_zone', 'peek'] as const;

/** Tools whose results are ALWAYS preserved (small output). */
export const ALWAYS_PRESERVE_TOOL_NAMES = ['coin_flip', 'dice_roll'] as const;
```

### Fix 3: New `rearrange_zone` tool (ai-tools.ts)

**Purpose:** Reorder the top or bottom N cards of a zone. Used after peeking to put cards back in a chosen order.

**Tool schema:**
```typescript
{
  name: 'rearrange_zone',
  description: 'Reorder the top or bottom cards of a zone. Used after peeking to arrange cards in a specific order. Provide card names from top to bottom.',
  inputSchema: {
    type: 'object',
    properties: {
      zone: { type: 'string', description: 'Zone key (e.g. "your_deck")' },
      cardNames: {
        type: 'array',
        items: { type: 'string' },
        description: 'Card names in desired order, from top to bottom'
      },
      from: {
        type: 'string',
        enum: ['top', 'bottom'],
        description: 'Which end of the zone to rearrange (default: top)'
      },
    },
    required: ['zone', 'cardNames'],
  },
}
```

**Engine implementation — new action type (`REARRANGE_ZONE`):**
Prefer new action type over tool-level splice for history/replay consistency.
1. Resolve card names to instanceIds within the zone
2. Validate all named cards exist in the specified end (top/bottom N where N = cardNames.length)
3. Remove those cards from the zone array
4. Re-insert them at the same end in the specified order

Files needed:
- `src/core/types/constants.ts` — add `REARRANGE_ZONE` to `ACTION_TYPES`
- `src/core/types/action.ts` — add `RearrangeZoneAction` type
- `src/core/engine.ts` — add `executeRearrangeZone`
- `src/core/action.ts` — add `rearrangeZone()` factory

### Fix 4: Shuffle resets visibility (engine.ts)

Small bonus fix: `executeShuffle` should reset all cards in the zone to zone default visibility. This is correct general behavior (shuffling a face-down zone = cards go face-down) and provides natural cleanup for any future visibility-based features.

### Fix 5: Prompt updates (prompt-sections.md)

Add a new section `## @PEEK_AND_SEARCH`:

```markdown
## @PEEK_AND_SEARCH
### Peeking and Searching

**After peeking** (viewing top/bottom cards of a zone):
- The peek result shows you full card details and positions
- Use `move_card` with `fromZone="your_deck"` and `cardName="<name>"` to pull specific cards
- Use `rearrange_zone` to put remaining cards back in a specific order (top to bottom)
- Use `shuffle` if the card effect says to shuffle afterward
- You CAN use cardName to target cards in the deck after peeking — you know their names

**After searching** (viewing all cards in a zone):
- The search result shows all cards with full details and quantities
- Use `move_card` to take specific cards from the zone
- Always `shuffle` the zone after searching (unless the effect says otherwise)

**Common patterns:**
- "Look at the top N, take any Energy, shuffle the rest" → peek, move_card for energy, shuffle
- "Look at the top N, put them back in any order" → peek, rearrange_zone
- "Search your deck for a card, shuffle" → search_zone, move_card, shuffle
```

Update `@TOOL_USAGE` to add:
- `move_card` works from ANY zone, not just hand — use after peek/search to pull cards by name from deck
- `rearrange_zone` for reordering cards after peek
- `peek` to look at top/bottom N cards of any zone (returns full card details)
- `search_zone` to see all cards in a hidden zone (returns full card inventory)

---

## Build Order

1. **Fix 2** (smart condense) — unblocks search_zone immediately, stops infinite loop
2. **Fix 1** (rich peek result) — makes peek return useful data using `formatCardReference()`
3. **Fix 3** (rearrange_zone) — new action type + tool
4. **Fix 4** (shuffle visibility reset) — small correctness fix
5. **Fix 5** (prompts) — last, references new tool names

## Files to Modify

| File | Change |
|------|--------|
| `src/ai/constants.ts` | Add `KEEP_LATEST_TOOL_NAMES`, `ALWAYS_PRESERVE_TOOL_NAMES` |
| `src/ai/run-turn.ts` | Smart condense: keep most recent peek/search, always preserve coin/dice |
| `src/core/ai-tools.ts` | Rich peek result via `formatCardReference()`, add `rearrange_zone` tool |
| `src/core/types/constants.ts` | Add `REARRANGE_ZONE` action type |
| `src/core/types/action.ts` | Add `RearrangeZoneAction` type |
| `src/core/engine.ts` | Add `executeRearrangeZone`, add visibility reset in `executeShuffle` |
| `src/core/action.ts` | Add `rearrangeZone()` factory |
| `src/plugins/pokemon/prompt-sections.md` | Add `@PEEK_AND_SEARCH`, update `@TOOL_USAGE` |
| `src/plugins/pokemon/prompt-builder.ts` | Include `@PEEK_AND_SEARCH` in `PROMPT_FULL_TURN` |
| `src/plugins/pokemon/narrative.ts` | Export `formatCardReference()` if not already exported |

## Rejected Alternatives

### Visibility-based approach (rejected)
Set peeked/searched cards temporarily visible so narrative.ts auto-includes them in CARD REFERENCE. Rejected because:
- Cleanup is unreliable — not all peek effects shuffle
- Requires explicit "stop_peeking" action or end-turn sweep
- Unnecessary state side effects for what is essentially ephemeral information
- The tool result is the right place for one-shot data

### Never condense informational tools (rejected)
Simpler but unbounded — repeated search_zone calls would accumulate 40+ card listings in history. The single-slot "keep most recent only" strategy bounds context to exactly 1 informational result.

### Two slots (one peek + one search) (rejected)
Marginally safer but unnecessary — peek and search are mutually exclusive in practice. Searching after peeking invalidates peek positions; peeking after searching means you already shuffled. One shared slot is simpler and more aggressive on context savings.
