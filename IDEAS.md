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

    2 'narrative' combat logs?

    3 double-click should be hook-able: for pokemon its appropriate to flip and for yugioh, for MTG You'd need to tap

    4 need a way to flip a stack upside down. 'reveal' vs 'reveal to oponnent'
    same with the hand, need a perma-reveal for the hand

    6 space saving idea: dont show evoultion cards peeking through from beneath a stack
    this requires a hook for pokemon specific stack logic?? ugh!

    7 add a pokemon plugin hook for stadium auto-discard in stadium zone


    8 VERY difficult to place cards under the deck right now as a human!!

    9 Playing stadiums doesnt read the stadium text out loud into the chatlog - needed?

    14. Really big Pop-up with pretty text, a sound effect, and the card text description whenever oponnent declares an attack

    17. add a little buzzing noise for normally-illegal stuff, unless it comes from staging

    18. re-add the staging cards in staging area reminder to prompt and to the pre-hooks in pokemon.ts

    19. Executor needs to use parallel tool calls

    20. remove autonomous agent?

    21. add surrender and declare_victory tools to the planner