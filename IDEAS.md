CODE-BASED TOOL CALLING

KEYBOARD SUPPORT

Multi-agent, Implement a planning agent and execution agent

refactor agents.md files to be 'programmatically constructed' so we dont have to make identical edits across files

settings menu

Webcam support

NEW GAMES
solitaire
one piece
cardfight vanguard

'narrative' combat logs!


double-click should be hook-able: for pokemon its appropriate to flip and for yugioh, for MTG You'd need to tap

Arrange modal should let you select multiple cards to move to staging, same way search modal does. wait what if we just combined peek/arrange with search.
we dont want search to let p
double-click should be hook-able: for pokemon its appropriate to flip and for yugioh, for MTG You'd need to tap
eople accidentally re-arrange.
so search should just let you select, with a parameter to disable rearrange
but 'peek top N' should let you select cards to hand and confirm.


need a way to flip a stack upside down. 'reveal' vs 'reveal to oponnent'
same with the hand, need a perma-reveal for the hand

add a take_prize tool?
make shuffle go up outside of its zone when shuffling

space saving idea: dont show evoultion cards peeking through from beneath a stack
this requires a hook for pokemon specific stack logic?? ugh!

need to show visual deck stacking for decks! so we can 'see' the number of cards. reference shuffledemo.svelte from earlier commits on how to do this.

add a pokemon plugin hook for stadium auto-discard in stadium zone

VERY difficult to place cards under the deck right now as a human!!

Playing stadiums doesnt read the stadium text out loud into the chatlog - needed?

Behavioral issue: 
1. AI doesn't realize playing Iono could help it win??
2. AI discarded 2 energy not one for Diancie's effect
3. AI doesn't realize requirements for playing a card

if nothing is in staging AND a trainer goes to discard: warn and make sure its due to an effect, "if you're trying to play this trainer card, please move it to staging first, resolve the effect, then to discard! otherwise, proceed with the discard". can we JUST warn for this WITHOUT blocking, most warnings block as well. can this be a warn-only for human AND ai?

double-click should be hook-able: for pokemon its appropriate to flip and for yugioh, for MTG You'd need to tap
