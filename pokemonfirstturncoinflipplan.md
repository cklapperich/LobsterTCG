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

  The Problem

  Line 603 of engine.ts hardcodes activePlayer = 0 when setup completes. But
  Pokemon rules say: flip a coin to determine who goes first. This should be
  plugin-configurable.

  Proposed Solution

  Option A: Extend onSetupComplete to return first player

  // game-type-config.ts
  export interface GameTypeConfig {
    // ...
    /**
     * Called after setup phase transitions to playing.
     * Can optionally return the player index who should go first.
     * If not specified or returns undefined, defaults to player 0.
     */
    onSetupComplete?: (state: GameState) => PlayerIndex | void;
  }

  Then in engine.ts executeEndTurn (around line 599):

  if (state.setupComplete[0] && state.setupComplete[1]) {
    state.phase = PHASES.PLAYING;
    state.turnNumber = 1;
    state.activePlayer = 0;  // Default to player 0
    state.currentTurn = createTurn(1, 0);
  }

  And in Game.svelte (around line 857):

  if (wasSetup && gameState.phase === PHASES.PLAYING && gameState.turnNumber ===
   1) {
    const firstPlayer = gameConfig.onSetupComplete?.(gameState);
    if (firstPlayer !== undefined) {
      gameState.activePlayer = firstPlayer;
      gameState.currentTurn = createTurn(1, firstPlayer);
    }
    gameState = { ...gameState };
    return;
  }

  Then Pokemon plugin can implement:

  onSetupComplete: (state: GameState) => {
    flipFieldCardsFaceUp(state);

    // Coin flip for first player
    const firstPlayer = Math.random() < 0.5 ? 0 : 1;
    state.log.push(`Coin flip: Player ${firstPlayer + 1} goes first`);
    return firstPlayer as PlayerIndex;
  }

  Option B: Add separate getFirstPlayer callback

  export interface GameTypeConfig {
    // ...
    /** Called to determine which player goes first after setup. Defaults to 0.
  */
    getFirstPlayer?: (state: GameState) => PlayerIndex;
    /** Called after setup phase transitions to playing. */
    onSetupComplete?: (state: GameState) => void;
  }

  This is cleaner separation of concerns but adds another hook.

  Which do you prefer? Option A reuses the existing hook, Option B is more
  explicit but adds API surface.

✻ Churned for 54s

❯   Option A: Extend onSetupComplete to return first player                 
                                                                            
    // game-type-config.ts                                                  
    export interface GameTypeConfig {                                       
      // ...                                                                
      /**                                                                   
       * Called after setup phase transitions to playing.                   
       * Can optionally return the player index who should go first.        
       * If not specified or returns undefined, defaults to player 0.       
       */                                                                   
      onSetupComplete?: (state: GameState) => PlayerIndex | void;           
    }                                                                       
   | Pokemon plugin can flip a coin after both people put cards facedown    
  but before cars flip face up? is this possible?                           

● Yes! That's exactly the right timing. The onSetupComplete callback fires at
  the perfect moment:

● Read 1 file (ctrl+o to expand)
  ⎿  Interrupted · What should Claude do instead?

❯ whats interesting is that setup ISNT async. I have to complete setup      
  before my oponnent can. player 0 always sets up first?? that might be ok  
  for now but i watned to confirm that wont mess anything else.             

● Great catch! You're absolutely right to question this. Let me trace the setup
  phase turn order:

● Searched for 2 patterns, read 2 files (ctrl+o to expand)

● Yes, Player 0 always sets up first, but here's why it doesn't break anything:

  Setup Flow (Current Implementation)

  1. Deck Preparation (synchronous, in Game.svelte onMount)

  gameConfig.executeSetup(gameState, 0);  // Player 0: shuffle, draw 7, set
  prizes
  gameConfig.executeSetup(gameState, 1);  // Player 1: shuffle, draw 7, set
  prizes
  - Sequential execution: Player 0 first
  - All hidden operations (decks are private, hands are private, prizes are
  face-down)
  - No information leakage

  2. Pokemon Placement Phase (setup turns)

  Turn 0: Player 0's setup turn
    → Place Basic Pokemon from hand to field zones
    → setupFaceDown hook sets visibility = [false, false]  ← HIDDEN FROM BOTH
    → Click "END SETUP"

  Turn 0: Player 1's setup turn
    → Place Basic Pokemon from hand to field zones
    → setupFaceDown hook sets visibility = [false, false]  ← HIDDEN FROM BOTH
    → Click "END SETUP"

  Looking at line 373 of hooks.ts: card.visibility = VISIBILITY.HIDDEN which is
  [false, false] — neither player can see what the other placed.

  3. Transition to Playing

  onSetupComplete fires:
    1. Coin flip to determine first player
    2. flipFieldCardsFaceUp() sets visibility = [true, true]
    3. Return first player index
    4. First player's turn begins

  Is This OK?

  Yes, it's fine because:
  - ✅ All operations are hidden from opponent
  - ✅ Setup face-down hook prevents information leakage
  - ✅ Coin flip happens after both players place cards, before cards flip up
  - ✅ Functionally equivalent to simultaneous setup

  The only difference from real Pokemon TCG is sequential vs simultaneous
  placement, but since cards are [false, false] visibility during setup, Player
  1 has zero information advantage from going second.

  For now, this is perfectly fine. If you later want true simultaneous setup
  (e.g., both players connecting via WebSockets and placing cards at the same
  time), that would require a different architecture, but the current
  sequential-with-hidden-info approach is rules-correct.

❯ and if the pokemon hook function for setup calls the coin flip action with actionexecutor it  
  will appear on screen                               

This is the purpose of the action_executor.ts! 

