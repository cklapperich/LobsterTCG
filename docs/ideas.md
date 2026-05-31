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
e. create an "install plugin from github URL feature

12. Get the AI to use Lass properly? lol

13. auto-inject AI warnings/reminders if damage >= HP via narrative.

14. keep the staging card visible/zoomed in while playing it?

15. low-res card artwork renders really small when zoomed in, zoom size should be consistent

16. GB2-style deckbuilder implementation for signed in users

17. better/easier ai debugging

18. FOR POKEMON - what if there were +/- maxhp markers and an 'under a special effect' market
