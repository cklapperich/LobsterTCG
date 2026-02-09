 Current Setup Architecture

  ┌─────────────────────────────────────────────────────────┐
  │ Game.svelte onMount                                     │
  │ ├─ plugin.startGame() → creates state with activePlayer=0│
  │ ├─ gameConfig.executeSetup(state, 0)  ← Pokemon-specific │
  │ ├─ gameConfig.executeSetup(state, 1)                    │
  │ └─ state.phase = SETUP, state.log = ['Game started']   │
  └─────────────────────────────────────────────────────────┘
                           ↓
  ┌─────────────────────────────────────────────────────────┐
  │ Players alternate END TURN clicks                       │
  │ → engine.ts executeEndTurn():                           │
  │   - Alternates activePlayer during setup phase          │
  │   - When both setupComplete[0] && [1]:                  │
  │     ✓ phase = PLAYING                                   │
  │     ✓ turnNumber = 1                                    │
  │     ✓ activePlayer = 0  ← HARDCODED!                    │
  └─────────────────────────────────────────────────────────┘
                           ↓
  ┌─────────────────────────────────────────────────────────┐
  │ Game.svelte executeEndTurnInner():                      │
  │ └─ gameConfig.onSetupComplete?.(gameState)              │
  │    ← Called AFTER activePlayer already set to 0         │
  └─────────────────────────────────────────────────────────┘

engine.ts line 140 hardcodes all the values

Need to determine who goes first by doing a coni flip with @action_executor.ts 
Then set the first player, which is currently hardcoded in gameSvelte.ts
