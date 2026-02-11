# Plan: Extract `createGameStore()` from Game.svelte (ARCHIVED — not pursued)

## Context

Game.svelte is 1479 lines managing game state, AI orchestration, turn flow, action execution, and UI in one file. This plan proposed extracting all state ownership and game logic into a `createGameStore()` factory in a new `gameStore.svelte.ts`, leaving Game.svelte as a thin view layer (~800 lines).

**Decision:** Not pursued because total LOC stays ~the same (1479 → 650 + 800 = 1450). The benefit is architectural (separation of concerns, testability) but the cost is indirection and two-file maintenance overhead. Opted for targeted cleanup instead.

---

## New File: `src/components/game/gameStore.svelte.ts`

### Factory Config

```typescript
export interface GameStoreConfig {
  gameConfig: GameTypeConfig;
  plugin: GamePlugin;
  playerConfig: PlayerConfig;
  decks?: DeckSelection[];
  testFlags: Record<string, boolean>;
  selectedModel: ModelOption;
  getUICallbacks: () => UICallbacks;  // lazy — refs unavailable at construction
}

export interface UICallbacks {
  flipCoin: (isHeads: boolean) => Promise<void>;
  shuffleZone: (zoneKey: string) => Promise<void>;
  onPreviewCard: (card: CardInstance<CardTemplate> | null) => void;
}
```

### State That Moves (Game.svelte lines 61-98)

| Variable | Line | Notes |
|----------|------|-------|
| `gameState` | 70 | `$state` in factory closure |
| `playmat` | 71 | `$state` in factory closure |
| `loading` | 72 | `$state` in factory closure |
| `error` | 73 | `$state` in factory closure |
| `aiThinking` | 74 | `$state` in factory closure |
| `pendingDecisionResolve` | 75 | Plain `let` (not reactive — only used internally) |
| `pluginManager` | 61-64 | Constructed from `config.gameConfig.hooksPlugin` |
| `controllers` | 78-98 | Built by `buildControllers()` in closure |

### Derived State That Moves

| Derived | Current Line | Exposed via getter |
|---------|-------------|-------------------|
| `local` | 55 | `localPlayerIndex(config.playerConfig)` |
| `canLocalAct` | 107-109 | Computed from state + decisionTargetsHuman |
| `decisionTargetsHuman` | 101-103 | Computed from pendingDecision |
| `counterDefinitions` | 116 | Static from plugin |
| `actionPanels` | 119-121 | From `plugin.getActionPanels(state, local)` |
| `logEntries` | 148 | `state?.log ?? []` |
| `hasAI` | 67 | `config.gameConfig.needsAIModel` |

### Methods That Move

**Core (lines 222-308):** `tryAction`, `addLog`, `createExecutor`, `getToolContextDeps`

**AI (lines 580-692):** `triggerAITurn`, `triggerAISetupTurn`, `triggerAIDecisionTurn`, `buildControllers`

**Turn flow (lines 694-791):** `executeEndTurn` (inner part), `handlePostSetupTransition`, `resolveDecision`, `requestAction`, `mulligan`

**Zone operations:** `executeDrop`, `toggleVisibility`, `reorderCards`, `shuffleZone`, `confirmSearch`, `counterDrop`, `counterReturn`, `clearCounters`, `setCardOrientation`, `revealToOpponent`, `revealBothHands`, `actionPanelClick`

**Lifecycle:** `initialize` (from onMount body), `reset` (from resetGame), `announceTurnStart`

**Debug:** `getDebugInfo` (returns `{ narrative, json }`)

### Reactivity Pattern

Every `gameState = { ...gameState }` (16 occurrences) becomes a call to an internal `notifyStateChange()`:

```typescript
function notifyStateChange() {
  gameState = gameState ? { ...gameState } : null;
}
```

State exposed via getters:
```typescript
return {
  get state() { return gameState; },
  get aiThinking() { return aiThinking; },
  get canLocalAct() { return canLocalAct; },
  // ... etc
};
```

### Circular Dependency

`buildControllers()` → `triggerAITurn()` → `getToolContextDeps()` → `controllers` — all in the same closure scope, resolves naturally via JavaScript hoisting.

### UI Callbacks

`createExecutor()` calls `config.getUICallbacks()` lazily to get `flipCoin` and `shuffleZone`. This avoids the timing issue where component refs aren't ready at construction time but are ready by the time any game action executes.

## What Stays in Game.svelte

### UI State
`previewCard`, `showStagingConfirm`, `stagingConfirmCallback`, `showRequestModal`, `requestInput`, `requestInputEl`, `showSettings`, `showFullLog`, `showDebugModal`, `debugJson`, `debugNarrative`, `debugTab`, `logInput`, `logContainer`

### Component Refs
`coinFlipRef`, `playmatGridRef` — passed to store via `getUICallbacks`

### All 3 `$effect` Blocks (small, depend on DOM refs or UI stores)
1. Auto-scroll log (lines 162-166)
2. Turn announcement (lines 171-178) — calls `game.announceTurnStart()`
3. Auto-open reveal decision modal (lines 191-201) — calls `openCardModal`

### Derived View State
`gridPanels`, `sidebarPanels`, `selectedModel`, `cardBack`, `renderFace`

### Template Event Handlers (become thin wrappers)

Example — `handleShuffle` before/after:
```typescript
// Before: 8 lines
async function handleShuffle() {
  if (!gameState || !contextMenu || !canLocalAct) return;
  const zoneKey = contextMenu.zoneKey;
  const zone = gameState.zones[zoneKey];
  if (!zone || zone.cards.length < 2) return;
  await createExecutor().shuffleZone(playerFromZoneKey(zoneKey), zoneKey);
  addLog(`Shuffled ${gameState!.zones[zoneKey]?.config.name ?? zoneKey}`);
}

// After: 3 lines
async function handleShuffle() {
  if (!contextMenu) return;
  await game.shuffleZone(contextMenu.zoneKey);
}
```

Example — `handleEndTurn` (staging check stays in view layer):
```typescript
function handleEndTurn() {
  if (!game.canLocalAct) return;
  if (game.hasStagingCards && isLocal(playerConfig, game.state!.activePlayer)) {
    showStagingConfirm = true;
    stagingConfirmCallback = () => {
      showStagingConfirm = false;
      stagingConfirmCallback = null;
      game.executeEndTurn();
    };
    return;
  }
  game.executeEndTurn();
}
```

### Template Changes
All `gameState` → `game.state`, `canLocalAct` → `game.canLocalAct`, `aiThinking` → `game.aiThinking`, etc. No structural template changes — just property access path updates.

## Return Type

```typescript
interface GameStore {
  // Reactive getters
  readonly state: GameState<CardTemplate> | null;
  readonly playmat: Playmat | null;
  readonly loading: boolean;
  readonly error: string | null;
  readonly aiThinking: boolean;
  readonly canLocalAct: boolean;
  readonly decisionTargetsHuman: boolean;
  readonly actionPanels: ActionPanel[];
  readonly logEntries: string[];
  readonly local: PlayerIndex;
  readonly counterDefinitions: CounterDefinition[];
  readonly hasAI: boolean;
  readonly pendingDecision: Decision | null;
  readonly playerConfig: PlayerConfig;

  // Lifecycle
  initialize(): Promise<void>;
  reset(): Promise<void>;
  announceTurnStart(): void;

  // Turn flow
  executeEndTurn(): Promise<void>;
  resolveDecision(): void;
  requestAction(opponentIndex: PlayerIndex, message?: string): void;
  mulligan(): void;

  // Zone operations
  executeDrop(cardInstanceId: string, toZoneKey: string, position?: number): void;
  toggleVisibility(cardInstanceId: string): void;
  setCardOrientation(zoneKey: string, degrees: string): void;
  revealToOpponent(zoneKey: string): void;
  revealBothHands(zoneKey: string): { opponentZoneKey: string; opponentCards: CardInstance[] } | null;
  reorderCards(zoneKey: string, displayOrderCards: CardInstance[]): void;
  confirmSearch(selectedCards: CardInstance[], fromZone: string, shouldShuffle: boolean): Promise<void>;
  shuffleZone(zoneKey: string): Promise<void>;
  actionPanelClick(panelId: string, buttonId: string): void;

  // Counter operations
  counterDrop(counterId: string, cardInstanceId: string): void;
  counterReturn(): void;
  clearCounters(zoneKey: string, zoneName: string): void;

  // Debug
  getDebugInfo(): { narrative: string; json: string };

  // Log
  addLog(message: string): void;
  hasStagingCards(): boolean;
}
```

## Implementation Steps

1. Create `src/components/game/gameStore.svelte.ts` with skeleton
2. Move state + core methods (tryAction, addLog, createExecutor)
3. Move controllers + AI orchestration
4. Move turn flow
5. Move zone operations
6. Move lifecycle + debug
7. Update Game.svelte to use store
8. Verify

## Risks

- `$state.snapshot` must stay in `.svelte.ts` — safe since gameStore is `.svelte.ts`
- `notifyStateChange()` must be called after every mutation path (16 sites)
- Mount timing for UI callbacks — lazy evaluation avoids the issue
- Total LOC stays ~the same (1479 → ~1450 across two files)

## Estimated Sizes
- `gameStore.svelte.ts`: ~650 lines
- `Game.svelte`: ~800 lines (down from 1479)
