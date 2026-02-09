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

    2 'narrative' combat logs!

    3 double-click should be hook-able: for pokemon its appropriate to flip and for yugioh, for MTG You'd need to tap

    4 need a way to flip a stack upside down. 'reveal' vs 'reveal to oponnent'
    same with the hand, need a perma-reveal for the hand

    5 add a take_prize tool?

    6 space saving idea: dont show evoultion cards peeking through from beneath a stack
    this requires a hook for pokemon specific stack logic?? ugh!

    7 add a pokemon plugin hook for stadium auto-discard in stadium zone

    8 VERY difficult to place cards under the deck right now as a human!!

    9 Playing stadiums doesnt read the stadium text out loud into the chatlog - needed?

    10 if nothing is in staging AND a trainer goes to discard: warn and make sure its due to an effect, "if you're trying to play this trainer card, please move it to staging first, resolve the effect, then to discard! otherwise, proceed with the discard". can we JUST warn for this WITHOUT blocking, most warnings block as well. can this be a warn-only for human AND ai?

    11 double-click should be hook-able: for pokemon its appropriate to flip and for yugioh, for MTG You'd need to tap

    13 add a 'shuffle into deck' tool (?? probably not needed)

    14. Really big Pop-up with pretty text, a sound effect, and the card text description whenever oponnent declares an attack

    17. add a little buzzing noise for normally-illegal stuff, unless it comes from staging

    17. the 'find pokemon' system is suspicious, verify it needs to be that complex

    18. System states auto-ended turn even when AI called end_turn

    18. disable all hooks when moving a card FROM staging to somewhere else??

    20. double-check evolution timing hooks: '[AI] Moved Gogoat from hand to bench_1
    Action blocked: Already attached an Energy this turn. Set allowed_by_card_effect if a card effect permits this.'
    in hooks.ts

    Bug: "Warning: Cannot place Water Energy (Energy) on empty active pokemon. Only Basic Pokemon can be placed directly. Set allowed_by_card_effect if a card effect permits this."
    in hooks.ts

    21. Evolution hook: cant play a basic on a basic!
    22. hook bug: tools not sorted to bottom

24. bug: not all moves getting logged. the AI did this sucesfully. we need to log when we do swap_card_stacks

26. bug: "[AI] Turn auto-ended (AI did not call end_turn)" after AI calls end_turn tool

28. Bug: still lots of references to Player2 in the logs

[AI] Moved Charmander from hand to bench_1
[AI] Moved Fire Energy from hand to bench_1
Action blocked: Already attached an Energy this turn. Set allowed_by_card_effect if a card effect permits this.
Action blocked: Nidoran♀ needs 1 energy for Call for Family (cost: Colorless, attached: 0). Check for card effects that provide extra energy.
Action blocked: Already attached an Energy this turn. Set allowed_by_card_effect if a card effect permits this.
[Switch] Switch your Active Pokémon with 1 of your Benched Pokémon.
[AI] Moved Switch from hand to
[AI] Moved Switch from to discard
Charmander used Ember!
[Ember] Discard an Energy from this Pokémon.
[AI] Charmander used Ember!
[AI] Added 3x 10 Damage to Farfetch’d
[AI] Ended turn

    to active
    [Professor Kukui] Draw 2 cards. During this turn, your Pokémon’s attacks do 20 more damage to your opponent’s Active Pokémon (before applying Weakness and Resistance).
    [AI] Moved Professor Kukui from hand to
    [AI] Drew 2 card(s)
    Water Energy used Collect!
    [AI] Collect declared
    [AI] Drew 2 card(s)
    [AI] Turn auto-ended (AI did not call end_turn)
