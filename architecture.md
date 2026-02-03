# Claude Plays

A card game simulator where Claude acts as both rules engine and opponent.

## Core Insight

Traditional TCG simulators spend years implementing card effects programmatically. Every new set introduces interactions with every old card. TCGOne has been at it for 10+ years and is still 5 years behind.

**Our approach:** Claude IS the rules engine. Claude reads card text, understands effects, and executes actions. No programmatic card implementations needed.

---

## Architecture Overview

### Two-Model System

| Model | Role | Cost |
|-------|------|------|
| **Sonnet** | Strategic brain | ~$0.003/1K tokens |
| **Haiku** | Mechanical executor | ~$0.00025/1K tokens |

**Strategic Model (Sonnet):**
- Win condition analysis
- Decision making ("Rare Candy now or wait?")
- Resource management
- Reading opponent's likely plays

**Execution Model (Haiku):**
- Interprets card text → tool calls
- Enforces rules from condensed rulebook
- Handles triggers and effects
- Stateless: given card + context, outputs actions

```
User plays Rare Candy
        ↓
Haiku reads: "Choose 1 of your Basic Pokémon in play. 
             Search your deck for a Stage 2 card that 
             evolves from that Pokémon and put it onto 
             that Pokémon."
        ↓
Haiku outputs:
  1. prompt_choice(type: "basic_pokemon_in_play")
  2. search_deck(filter: "stage2_evolves_from_choice")
  3. evolve(target: chosen_basic, card: search_result)
  4. shuffle_deck()
```

---

## Tech Stack

### Monorepo Structure
```
tcg-workspace/
├── apps/
│   ├── pokedex/           # Existing collection tracker
│   └── claude-plays/      # New simulator
├── packages/
│   ├── card-types/        # Shared TypeScript types
│   ├── card-db/           # Shared card database/API
│   └── ui-components/     # Shared Svelte components (optional)
├── pnpm-workspace.yaml
└── package.json
```

### Stack
- **Frontend:** Svelte + Vite + TypeScript
- **Backend:** Supabase (auth, DB, realtime subscriptions)
- **Card Data:** pokemontcg.io API + local cache
- **AI:** Anthropic API (Sonnet + Haiku)
- **Monorepo:** pnpm workspaces

---

## Game State Schema

```typescript
interface GameState {
  id: string;
  turn: number;
  activePlayer: 'player' | 'claude';
  phase: 'setup' | 'draw' | 'main' | 'attack' | 'between_turns';
  
  player: PlayerState;
  claude: PlayerState;
  
  history: Action[];  // For replay/analysis
}

interface PlayerState {
  deck: Card[];           // Order matters, top = index 0
  hand: Card[];
  active: Pokemon | null;
  bench: (Pokemon | null)[]; // 5 slots
  discard: Card[];
  prizes: Card[];         // Face down for Claude's own prizes
  lostZone: Card[];
}

interface Pokemon {
  card: Card;
  attachedEnergy: Card[];
  attachedTools: Card[];
  damageCounters: number;
  specialConditions: SpecialCondition[];
  evolutionStage: Card[];  // Stack of cards, basic at bottom
}

interface Card {
  instanceId: string;      // Unique per game instance
  cardId: string;          // pokemontcg.io ID
  name: string;
  type: 'pokemon' | 'trainer' | 'energy';
  imageUrl: string;
  text: string;            // Full card text for Claude
  // ... other metadata from pokemontcg.io
}

type SpecialCondition = 'poisoned' | 'burned' | 'asleep' | 'paralyzed' | 'confused';
```

---

## Action API

Simple state mutations. No game logic here—Claude decides what's legal.

```typescript
type Action =
  | { type: 'draw'; player: Player; count: number }
  | { type: 'play_to_bench'; player: Player; cardInstanceId: string }
  | { type: 'play_trainer'; player: Player; cardInstanceId: string }
  | { type: 'attach_energy'; cardInstanceId: string; targetInstanceId: string }
  | { type: 'attach_tool'; cardInstanceId: string; targetInstanceId: string }
  | { type: 'evolve'; cardInstanceId: string; targetInstanceId: string }
  | { type: 'retreat'; newActiveInstanceId: string; discardEnergyIds: string[] }
  | { type: 'switch_active'; newActiveInstanceId: string }  // From effects
  | { type: 'attack'; attackIndex: number; targetInstanceId?: string }
  | { type: 'add_damage'; targetInstanceId: string; amount: number }
  | { type: 'heal'; targetInstanceId: string; amount: number }
  | { type: 'add_condition'; targetInstanceId: string; condition: SpecialCondition }
  | { type: 'remove_condition'; targetInstanceId: string; condition: SpecialCondition }
  | { type: 'move_card'; cardInstanceId: string; from: Zone; to: Zone; position?: number }
  | { type: 'shuffle'; player: Player; zone: 'deck' }
  | { type: 'search_deck'; player: Player; filter?: string }  // Reveals to searcher
  | { type: 'reveal'; cardInstanceIds: string[]; to: 'opponent' | 'both' }
  | { type: 'flip_coin'; result?: 'heads' | 'tails' }  // Result filled by system
  | { type: 'end_turn' }
  | { type: 'take_prize'; player: Player; count: number };

type Zone = 'deck' | 'hand' | 'active' | 'bench' | 'discard' | 'prizes' | 'lost_zone';
type Player = 'player' | 'claude';
```

---

## Haiku Execution Engine

### System Prompt (condensed rulebook)
```markdown
# Pokemon TCG Execution Engine

You interpret card effects and output action sequences. Be precise and mechanical.

## Core Rules

### Energy Attachment
- Once per turn (unless card says otherwise)
- From hand to your Pokemon in play

### Evolution  
- Place Stage 1 on matching Basic, Stage 2 on matching Stage 1
- Can't evolve Pokemon played this turn
- Can't evolve first turn of game
- Removes: Asleep, Burned, Confused, Paralyzed, Poisoned
- Keeps: damage counters, attached cards

### Retreat
- Once per turn (unless switched by effect)
- Discard energy = retreat cost from active
- Switch active with one of your benched Pokemon
- Removes: Asleep, Confused, Paralyzed (NOT poison/burn)

### Attacks
- Must have required energy attached (check types)
- Weakness: ×2 damage (applied after all other effects)
- Resistance: -30 damage (applied after weakness)
- Knock out: damage >= HP sends to discard, attacker takes prizes

### Special Conditions (checked between turns)
- Poisoned: 1 damage counter between turns
- Burned: flip coin, tails = 2 damage counters
- Asleep: flip coin, heads = wake up
- Paralyzed: can't attack/retreat, removed at end of owner's next turn
- Confused: flip to attack, tails = 3 damage counters to self

### Prize Cards
- Take 1 prize per KO (2 for EX/GX/V, 3 for VMAX/VSTAR)

## Output Format
Respond with JSON array of actions. Example:
[
  {"type": "search_deck", "player": "player", "filter": "stage2_evolves_from:Charmander"},
  {"type": "evolve", "cardInstanceId": "$SEARCH_RESULT", "targetInstanceId": "char_01"},
  {"type": "shuffle", "player": "player", "zone": "deck"}
]
```

---

## Turn Flow

```
┌─────────────────────────────────────────────────────┐
│ HUMAN'S TURN                                        │
├─────────────────────────────────────────────────────┤
│ 1. Draw (auto)                                      │
│ 2. Human takes actions via UI                       │
│    - Each action → Haiku validates/executes         │
│ 3. Human declares attack (optional)                 │
│    - Haiku resolves damage, effects                 │
│ 4. Human clicks "End Turn"                          │
│ 5. Between turns: poison, burn, etc (Haiku)         │
└─────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────┐
│ CLAUDE'S TURN                                       │
├─────────────────────────────────────────────────────┤
│ 1. Draw (auto)                                      │
│ 2. Sonnet receives:                                 │
│    - Current game state                             │
│    - Claude's hand (full card text)                 │
│    - Heuristics file for deck                       │
│ 3. Sonnet thinks through options                    │
│ 4. Sonnet outputs natural language + action intents │
│    "I'll attach Fire Energy to Charizard ex         │
│     and use Burning Darkness for 180."              │
│ 5. Haiku parses intent → action sequence            │
│ 6. UI animates actions                              │
│ 7. Between turns: poison, burn, etc                 │
└─────────────────────────────────────────────────────┘
```

---

## Heuristics File (per deck)

```markdown
# Charizard ex Deck Guide

## Deck Goal
Set up Charizard ex and take OHKOs. Burning Darkness scales 
with opponent's prizes taken—strongest late game.

## Ideal Setup
- Turn 1: Charmander active, energy attached, Rare Candy in hand
- Turn 2: Rare Candy → Charizard ex, attack for 180+

## Priority Decisions

### Mulligan
Keep if: Charmander + (Rare Candy OR Irida OR Arven)
Mulligan if: No basic Pokemon, or Charmander with no search

### Energy Attachment Priority
1. Active Charizard ex (if attacking this turn)
2. Benched Charizard ex (powering up)
3. Charmander (if no Charizard ready)

### When to Rare Candy
- ASAP if opponent is aggressive
- Can wait if you have Charmeleon and opponent is slow

## Matchup Notes
- vs Water: They OHKO you. Race them, don't set up multiple.
- vs Gardevoir: Watch for Scream Tail. Take early prizes.
- vs Control: Don't overcommit bench. They'll Boss + KO.

## Common Mistakes
- Benching too many Charmander (Boss vulnerability)
- Using Iono when you're ahead on prizes
- Forgetting Charizard does 30 more per OPPONENT'S prizes
```

---

## UI Components (Svelte)

```
src/
├── lib/
│   ├── components/
│   │   ├── Board.svelte           # Main game board layout
│   │   ├── Zone.svelte            # Generic drop zone
│   │   ├── CardStack.svelte       # Deck, discard (shows count)
│   │   ├── Hand.svelte            # Fan of cards
│   │   ├── ActiveSlot.svelte      # Active Pokemon + attachments
│   │   ├── BenchSlot.svelte       # Bench Pokemon + attachments  
│   │   ├── PrizeCards.svelte      # 6 face-down cards
│   │   ├── Card.svelte            # Single card render
│   │   ├── CardDetail.svelte      # Zoomed card view + text
│   │   ├── DamageCounters.svelte  # Counter overlay
│   │   ├── StatusMarkers.svelte   # Condition indicators
│   │   └── ChatLog.svelte         # Claude's narration
│   ├── stores/
│   │   ├── gameState.ts           # Svelte store for state
│   │   └── settings.ts            # User preferences
│   ├── api/
│   │   ├── claude.ts              # Anthropic API calls
│   │   └── cards.ts               # pokemontcg.io queries
│   └── engine/
│       ├── actions.ts             # Action executors
│       ├── validation.ts          # Basic state validation
│       └── turnFlow.ts            # Turn phase management
└── routes/
    ├── +page.svelte               # Home / deck select
    ├── game/
    │   └── +page.svelte           # Game board
    └── deck-builder/
        └── +page.svelte           # Deck construction
```

---

## MVP Scope

### Phase 1: Playable Board
- [ ] Game state store + actions
- [ ] Board UI with all zones
- [ ] Drag/drop cards between zones
- [ ] Manual play (no AI, no rules)
- [ ] Deck import (pokemontcg.io format)

### Phase 2: Claude Opponent  
- [ ] Sonnet integration for Claude's turns
- [ ] Natural language narration
- [ ] Basic heuristics file support
- [ ] Turn flow automation (draw, between turns)

### Phase 3: Rules Execution
- [ ] Haiku execution engine
- [ ] Condensed rulebook system prompt
- [ ] Damage calculation
- [ ] Special conditions

### Phase 4: Polish
- [ ] Deck builder UI
- [ ] Post-game analysis
- [ ] Heuristic suggestions from losses
- [ ] Animation and UX improvements

---

## Open Questions

1. **Hidden information:** Claude's prizes should be hidden from Claude. Flip them face-down in its game state view?

2. **Randomness:** Coin flips and deck shuffling need to be server-authoritative so Claude can't cheat (even accidentally).

3. **Complex cards:** Some cards have paragraphs of text. Test Haiku's ability to parse things like Gardevoir ex, Lost Zone effects, etc.

4. **Multi-TCG future:** How generic should the state schema be? Energy types are Pokemon-specific. Mana is Magic-specific. Abstract to "resources"?

5. **Multiplayer later?** Could two humans play, each with optional Claude "coach" suggesting plays?