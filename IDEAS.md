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
    this requires a hook for pokemon specific stack logic.

    7 add a pokemon plugin hook for stadium auto-discard in stadium zone

    9 Playing stadiums doesnt read the stadium text out loud into the chatlog - needed?

    19. Executor needs to use parallel tool calls

    22. Ai doesnt have access to hand knowledge
    a. add a cheating mode so it can see your hand?
   b. or somehow make AI aware of whats in oponnents hand after a search like a timer ball


    23. Auto-deck-strategy-generator. could probably just use a search engine, partially.

    24. SFX should be data-driven by action type at a single point. createExecutor's sfxMap is the right idea — it just
    only exists for AI calls. If tryAction itself used that map, you'd never forget to add SFX again.

    25. Add a 'concede' and 'declare victory' tool to the planner

26. remove all pokemon assets
a. importable cardback
b. importable playmats
c. sound effects?? leave for now?
d. image import like how twinleaf does it, we dont store links to the images

28. Get the AI to use Lass properly? lol

29. auto-inject AI warnings/reminders if damage >= HP via narrative.

30. cant choose 1st/2nd based on the coin flip currently

31. p1/p2 deck confusing, should be "choe your deck" and "AI deck"

32. keep the staging card visible/zoomed in while playing it?

33. low-res card artwork renders really small when zoomed in, zoom size should be consistent

34. persistent ideas

35. move pile doesnt broadcast