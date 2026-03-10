1 - kimik2.5 thought the stadium in hand was on the field and tried using it
Solution: remove AI access to hand or trim down to just card names?￼Move Pile

2 - End phase game agent seems to always trigger!

3 - need a better way for cards like Berry to trigger by AI reliably

4 - somehow prevent AI from discarding oponnents cards, must rely on REQUEST button

5 - swap stacks can fail on an empty stack: [tool] swap_card_stacks {zone1: 'your_active', zone2: 'your_bench_1'}

6 - AI rotated wrong way for paralysis, maybe honest mistake, duoble check our status condition tool in pokemon plugin .ts file is correct

7 - error out on tool calls that leave a stranded stack of energies & tools?

8 - after several rounds of tool calls, it thought it hadnt yet attached an energy for the turn. do subsequent planners LOSE past context? double check they retain it. One conversation history per turn NOT per planning session!


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