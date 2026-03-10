    # MERE CONCEPTS OF A PLAN; UNHINGED large projects


    CODE-BASED TOOL CALLING

    KEYBOARD SUPPORT

    Webcam support

    NEW GAMES
    solitaire
    one piece
    cardfight vanguard

    # TESTING/VERIFICATION PHASE

    Multi-agent, Implement a planning agent and execution agent
    new agent: Pokemon checkup agent
    when execution agent fails, must go back to the main agent with the error message from the exception or the chatlog. 
    Errors from tools calls must be 'bubbled' up.

# JIRA TICKETS

1.  'narrative' combat logs?

2.  double-click should be hook-able: for pokemon its appropriate to flip and for yugioh, for MTG You'd need to tap

3. need a way to flip a stack upside down. 'reveal' vs 'reveal to oponnent'
    same with the hand, need a perma-reveal for the hand

4. space saving idea: dont show evoultion cards peeking through from beneath a stack
    this requires a hook for pokemon specific stack logic.

5. add a pokemon plugin hook for stadium auto-discard in stadium zone

6. Playing stadiums doesnt read the stadium text out loud into the chatlog - needed?

7. Executor needs to use parallel tool calls

8. Ai doesnt have access to hand knowledge
    a. add a cheating mode so it can see your hand?
   b. or somehow make AI aware of whats in oponnents hand after a search like a timer ball

9. tryAction → plugin hooks → executeAction → post-hooks → P2P broadcast → SFX → splash announcements is a pipeline that's assembled inline rather than composed. Every new feature (counters, decisions, coin flips) added more handlers that follow the same pattern but are written out longhand each time.
SFX should be data-driven by action type at a single point. createExecutor's sfxMap is the right idea — it just
    only exists for AI calls. If tryAction itself used that map, you'd never forget to add SFX again.

10. Add a 'concede' and 'declare victory' tool to the planner

11. remove all pokemon assets
a. importable cardback
b. importable playmats
c. sound effects?? leave for now?
d. image import like how twinleaf does it, we dont store links to the images

12. Get the AI to use Lass properly? lol

13. auto-inject AI warnings/reminders if damage >= HP via narrative.

14. keep the staging card visible/zoomed in while playing it?

15. low-res card artwork renders really small when zoomed in, zoom size should be consistent

16. GB2-style deckbuilder implementation for signed in users

17. better/easier ai debugging

18. FOR POKEMON - what if there were +/- maxhp markers and an 'under a special effect' market




GAME.SVELTE refactor:

The issue isn't that this file exists, it's that it's doing orchestration AND rendering AND UI event handling AND modal management all at once. If I started fresh, I'd split along those lines.
A headless game engine would be the core. Pure TypeScript, no framework dependency. It owns the GameState, exposes an dispatch(action) method, runs plugin hooks, validates moves, and emits events. This is independently testable — you can simulate an entire game in a unit test with no DOM. The tryAction function in this file is already 80% of the way there, it just needs to be extracted.
An input layer would sit on top, adapting different sources into actions. The local player's clicks, the AI's tool calls, and P2P messages from a remote peer all get normalized into the same Action type before hitting dispatch. Right now that mapping is scattered across dozens of handler functions in the component.
A presentation layer would subscribe to state changes and render. In Svelte 5 you could have a single reactive gameState derived from the engine, and then smaller components that each own their own concern — a TurnBanner, a DecisionModal, a GameLog, etc. The playmat grid is already its own component here, which is good.
An effects/feedback layer would handle the side-effecty stuff — SFX, animations, splash announcements, coin flip visuals. These react to actions after they resolve, not inline with dispatch. The ACTION_SFX_MAP in this file is a primitive version of that idea.
So the architecture would look something like:
[Input Sources] → [Action Dispatch] → [Game Engine + Plugins]
                                            ↓
                                      [State Change Event]
                                       ↓              ↓
                                [Render/UI]    [Effects/SFX]
The "orchestrator" still exists, but it becomes thin — maybe 50-80 lines that wires the engine to the inputs and the renderer. It doesn't contain the logic, it just connects the pieces.