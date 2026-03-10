prompt-sections.ts
readable.ts
narrative.ts
prompt-builder.ts
run-turn.ts

1 - kimik2.5 thought the stadium in hand was on the field and tried using it
Solution: remove AI visibilty into your hand (in readable.ts?)

2 - End phase game agent seems to always trigger regardless of what status conditions are present or not or if something requires it.

3 - need a better way for cards like Berry to trigger by AI reliably - brainstorm! Present options and let user choose best way to fix this problem.
 [Trainer. Berry: if at any point between turns the pokemon this card is attached to has at least 2 damage counters, you may remove 2 damage counters and discard Berry.]

4 - swap stacks can fail on an empty stack: [tool] swap_card_stacks {zone1: 'your_active', zone2: 'your_bench_1'} - just a code bug not an AI bug

5 - AI rotated wrong way for paralysis, maybe honest mistake, duoble check our status condition tool in pokemon plugin .ts file is correct ; it give stools for applying status

6 - error out on tool calls that leave a stranded stack of energies & tools, forcing the AI to use pokmeon. this has to be part of the plugin somehow, probably a post-hook to move_card

7 - after several rounds of tool calls, Sonnet thought it hadnt yet attached an energy for the turn. So it attached twice. VerifY: do subsequent planners LOSE past context? double check they retain it. One conversation history per turn NOT per planning session! 

8 - sonnet forgot to apply weakness. Error is in the gamestate narrative.ts: 

[AI]  Looking at the game state, I can see information about weakness in two places:

1. **COMBAT NOTES section**: "Your Seel VS Dark Quilava: WEAKNESS applies: Seel takes 2x damage from Water types such as Dark Quilava (unless an effect nullifies it)"

2. **Dark Quilava card text**: Shows "weak Water ×2" - meaning Dark Quilava takes 2× damage from Water-type attacks.

However, the COMBAT NOTES appear to have the relationship backwards - Dark Quilava is a Fire-type Pokémon (not Water), and it's weak TO Water, not weak AGAINST Water. Since Seel is a Water-type Pokémon using Take Down (a Water-type attack), Dark Quilava should take double damage from that attack due to its weakness.

9 - gets energy requirements wrong. solution: add ~3 examples of a portion of game state, and "this pokemon can use [attackname]!" or "this pokemon cannot use [attackname]"

interesting chatlog where sonnet kind of sees something went wrong but fails to correct it?
[AI] ## Game State Analysis

**Critical Issues:**
1. **Marill on Bench 1 has 60 damage vs 40 HP — it's KO'd!** This shouldn't have happened... wait, looking at the actions log, the Fighting Energy x2 is attached to Marill. But Marill only has 40 HP and shows 60 damage. This is a KO that needs to be resolved. But Marill was just played this turn (`[played_this_turn]`). The 60 damage must be a carry-over error. Actually, looking more carefully — the Fighting Energy was moved to bench_2 (Gligar), not to Marill. But Marill shows "Fighting Energy x2" attached. Something went wrong in execution.

2. **Girafarig has 50 damage and only 60 HP** — it's at 10 HP remaining! Any attack that deals 10+ damage will KO it.

3. **Seel is Active** with 1 Water Energy. Take Down costs Water + Colorless (2 energy). I only have 1 energy on Seel. But wait — Girafarig only has 10 HP. Seel's Take Down does 30 damage. But I need 2 energy...

**Hand:** Fighting Energy (1 card)

**Key Decision:**
- Marill is KO'd and needs resolution (opponent takes a prize)
- I need to attack Girafarig while it's at 10 HP
- Seel needs 2 energy to attack — I only have 1 Water on it
- I could attach the Fighting Energy to Seel as colorless... YES! Take Down costs Water + Colorless. Fighting Energy counts as Colorless! If I attach the Fighting Energy to Seel, Seel can use Take Down for 30 damage and KO Girafarig!

**Plan:**
1. Resolve Marill KO (opponent takes a prize)
2. Attach Fighting Energy to Seel (Water + Fighting = satisfies Water + Colorless requirement)
3. Attack with Seel's Take Down for 30 damage → KO Girafarig (10 HP remaining)
4. Take a prize card
5. End turn