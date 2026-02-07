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

1 Settings menu

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

12 when opponnent moves to a card to staging: show the card full screen same as when you left-click, no need to pause the game

13 add a 'shuffle into deck' tool

# AI Behavioral Issues

1. AI doesn't realize playing Iono could help it win??
2. AI discarded 2 energy not one for Diancie's effect
3. AI doesn't realize requirements for playing a card
4. AI drew 2 cards?

Incomplete execution of plan:
run-turn.ts:198 [AI Pipeline: Planner]
run-turn.ts:199 [system] You are an AI agent playing the Pokemon Trading Card Game. You are Player 2.

You are the planning agent. You have NO tools — your job is to output a numbered plan as text.

First, summarize what happ...
2run-turn.ts:115 [rate-limit] RPM: 1 requests in last 60s
logging.ts:14 [AI] Let me analyze the current game state:

**My Board:**
- Active: Natu (20/50 HP) with 1 Psychic Energy attached
- Bench 1: Ditto (no energy)
- Hand: Fire Energy, Raticate, Fighting Energy, Professor Oak's Research, Moo-Moo Milk, Miracle Sphere Beta, Oracle
- Deck: 44 cards
- Prizes: 6

**Opponent Board:**
- Active: Voltorb (40/50 HP) with 2 Lightning Energy attached
- Hand: 6 cards
- Deck: 45 cards
- Prizes: 6

**Recent Actions:**
- Opponent used Spin Tackle last turn, dealing 30 damage to Natu (now at 20/50 HP) and 10 damage to itself (now at 40/50 HP)

**Current Turn:**
- I've already drawn 1 card (as shown in the log "[AI] Drew 1 card(s)")
- Now in the main phase

**Analysis:**
1. Natu is at 20/50 HP - very low, could be knocked out by another Spin Tackle (30 damage)
2. Voltorb is at 40/50 HP - one more hit could knock it out
3. I have Raticate in hand but no Rattata on board to evolve from
4. I have several trainer cards that could help:
   - Professor Oak's Research: Shuffle hand, draw 5 (would lose Raticate but get 5 new cards)
   - Moo-Moo Milk: Could heal Natu (flip 2 coins, remove 20 damage per heads)
   - Oracle: Look at top 2 cards of deck and arrange them
   - Miracle Sphere Beta: Technical Machine for evolved Pokemon (but Natu is Basic, not evolved)

**Options:**
1. Use Moo-Moo Milk on Natu to try to heal it
2. Use Professor Oak's Research to draw 5 new cards
3. Attach energy to Ditto on bench
4. Attack with Natu (Removal Beam - needs 2 Colorless, but I only have 1 Psychic attached, so can't use it; Foresight needs 1 Psychic which I have but doesn't do damage)
5. Retreat Natu and bring up Ditto

Wait, let me check Natu's attacks again:
- Foresight [Psychic] - Look at top 3 cards, rearrange them. Costs 1 Psychic (which I have).
- Removal Beam [Colorless, Colorless] - 10 damage, flip coin to discard energy. Costs 2 Colorless.

So I can use Foresight, but it doesn't do damage. I can't use Removal Beam because I only have 1 energy attached and it costs 2.

Ditto's attack:
- Copy [Colorless] - Copy opponent's attack. I have no energy on Ditto.

Actually, looking at Ditto's Poke-BODY: "Prismatic Body — Each basic Energy card attached to Ditto provides every type of Energy but provides only 1 Energy at a time."

So if I attach an energy to Ditto, it counts as all types. But I still need to attach energy first.

**Strategy considerations:**
- Natu is at 20 HP. Voltorb can do 30 damage with Spin Tackle, so Natu will likely be knocked out next turn if Voltorb attacks.
- I could try to heal Natu with Moo-Moo Milk (flip 2 coins, remove 20 damage per heads). If I get 2 heads, Natu goes to 60/50 (full heal). If 1 head, goes to 40/50. If 0 heads, stays at 20.
- I could use Professor Oak's Research to draw 5 cards, looking for a way to deal damage or set up better.
- I could attach energy to Ditto to prepare it as a backup attacker.

Given that Voltorb is at 40 HP and I need to knock it out to take a prize... but Natu can't deal damage with its current energy. Foresight is the only attack I can use, and it doesn't deal damage.

Actually, wait. I should check if I can retreat. Natu has retreat cost 1. I have Psychic Energy attached. If I retreat Natu (discard the Psychic Energy), I can bring up Ditto. Then I could attach an energy to Ditto and use Copy to copy Voltorb's Spin Tackle!

Let me think about this:
1. Retreat Natu (discard Psychic Energy, Natu goes to bench, Ditto comes to active)
2. Attach Fire Energy or Fighting Energy to Ditto
3. Ditto's Prismatic Body makes that energy count as all types, including Lightning and Colorless
4. Use Copy to copy Spin Tackle (needs Lightning + Colorless, which Ditto would have via Prismatic Body)
5. Spin Tackle does 30 damage to Voltorb (knocking it out) and 10 to Ditto

But wait, Ditto only has 50 HP. Taking 10 damage is fine.

Actually, looking at the retreat rules: "Retreat your Active Pokemon (pay retreat cost by discarding attached Energy, then use `swap_card_stacks` to swap active with a bench Pokemon)"

Natu's retreat cost is 1. I have 1 Psychic Energy attached. So I can retreat.

But I should also consider: should I heal Natu instead? If I heal Natu to 40 or 60 HP, it might survive another hit. But Natu can't deal damage to knock out Voltorb. Foresight doesn't deal damage. Removal Beam needs 2 energy.

So my options are:
1. Retreat Natu, bring up Ditto, attach energy, copy Spin Tackle to KO Voltorb
2. Use Moo-Moo Milk to heal Natu, attach energy to Ditto on bench, pass
3. Use Professor Oak's Research to draw 5, hope for something good

Option 1 seems strongest because I can actually take a prize this turn by knocking out Voltorb.

Let me verify the steps:
1. Pokemon Checkup - nothing to do (no status conditions)
2. Draw - already done
3. Main phase:
   - Retreat Natu: discard Psychic Energy, swap with Ditto
   - Attach Fighting Energy (or Fire Energy) to Ditto
   - Attack with Copy, copying Spin Tackle
4. Attack phase:
   - Spin Tackle does 30 damage to Voltorb 
run-turn.ts:198 [AI Pipeline: Executor]
run-turn.ts:199 [system] You are an AI agent playing the Pokemon Trading Card Game. You are Player 2.

You are the executor agent. A plan has been given to you. Your job is to call the appropriate tools to execute the plan.
I...
run-turn.ts:115 [rate-limit] RPM: 2 requests in last 60s
logging.ts:11 [thinking] Let me analyze the current game state and execute the plan.

Current state:
- My active: Natu (20/50 HP) with 1 Psychic Energy
- My bench: Ditto (no energy)
- My hand: Fire Energy, Raticate, Fighting Energy, Professor Oak's Research, Moo-Moo Milk, Miracle Sphere Beta, Oracle
- Opponent active: Voltorb (40/50 HP) with 2 Lightning Energy

The plan suggests:
1. Retreat Natu (discard Psychic Energy, swap with Ditto)
2. Attach Fighting Energy to Ditto
3. End turn

This makes sense because:
- Natu is at 20 HP and will be KO'd by another Spin Tackle (30 damage)
- Retreating now lets Ditto take the hit instead (50 HP, survives with 20 HP after 30 damage)
- Ditto will have 1 energy attached, so next turn I can attach another and use Copy to copy Spin Tackle for the KO

Let me execute this plan step by step.

First, I need to retreat Natu. I'll declare the retreat, then swap the stacks.
logging.ts:14 [AI] Looking at the game state, I need to retreat Natu (which is at 20 HP and about to be KO'd) and bring up Ditto to take the hit instead. This will preserve Natu on the bench and let me set up Ditto with energy to attack next turn.

Let me execute this plan:
logging.ts:18 [tool] declare_retreat {cardName: 'Natu'}
logging.ts:18 [tool] move_card {fromZone: 'player2_active', toZone: 'player2_discard', cardName: 'Psychic Energy'}
logging.ts:18 [tool] swap_card_stacks {zone1: 'player2_active', zone2: 'player2_bench_1'}
logging.ts:18 [tool] move_card {fromZone: 'player2_hand', toZone: 'player2_active', cardName: 'Fighting Energy', toPosition: 'bottom'}
logging.ts:18 [tool] end_turn {}



============================================================================

run-turn.ts:198 [AI Pipeline: Planner]
run-turn.ts:199 [system] You are an AI agent playing the Pokemon Trading Card Game. You are Player 2.

You are the planning agent. You have NO tools. Output ONLY a short numbered plan — no analysis, no preamble.

**Format — f...
run-turn.ts:115 [rate-limit] RPM: 1 requests in last 60s
logging.ts:11 [thinking] The user wants me to plan a turn for Player 2 in a Pokemon TCG game.

Current state analysis:
- Turn 2, Player 2's turn, Phase: playing
- Player 2 Active: Snorlax (80 HP, Colorless, retreat 3)
- Player 2 Bench 1: Rattata (30 HP)
- Player 2 Hand: Water Energy, Oracle, Miracle Sphere Beta, Xatu, Miracle Sphere Alpha, Lightning Energy (6 cards)
- Player 2 Deck: 46, Discard: 0, Prizes: 6

Opponent:
- Active: Voltorb (50 HP, Lightning, has 1 Lightning Energy attached)
- Bench 1: Lapras (60 HP, Water)
- Hand: 6 hidden
- Deck: 43, Discard: 2 (Fast Ball, Bill's Maintenance), Prizes: 6

Combat notes: No weakness/resistance between Snorlax and Voltorb.

Recent actions: Player 1 played Bill's Maintenance (Supporter) on their first turn (which is illegal but the system allowed it?), attached Lightning Energy to Voltorb, and ended turn. Then I drew 1 card.

Wait, the log says "Warning: Cannot play a Supporter on the first turn." but then shows Player 1 playing Bill's Maintenance. This seems like a log entry showing an attempt or the system allowed it. Anyway, it's my turn now.

My hand:
1. Water Energy
2. Oracle (Supporter)
3. Miracle Sphere Beta (Technical Machine)
4. Xatu (Stage 1, evolves from Natu - but I don't have Natu!)
5. Miracle Sphere Alpha (Technical Machine)
6. Lightning Energy

Wait, Xatu evolves from Natu, but I don't see Natu on my board or in my hand. So Xatu is currently unplayable.

My active is Snorlax. It has no energy attached yet.
My bench has Rattata.

Snorlax attacks:
- Continuous Tumble [Colorless, Colorless, Colorless] -> 30x (flip coins until tails, 30 damage per heads)
- Lolling About (Poke-POWER): Once during turn (before attack) if Active, may remove 1 damage counter and becomes Asleep.

Rattata attacks:
- Call for Friends [Colorless] - search deck for Baby or Basic and put on bench
- Body Slam [Colorless] -> 10, flip coin, heads = paralyzed

I have 6 cards in hand. I need to:
1. Play any basics from hand (none available except possibly if I use Rattata's attack)
2. Attach energy (once per turn)
3. Play trainers/supporters (one supporter per turn)
4. Use abilities
5. Attack or end turn

Options:
- Attach Lightning Energy or Water Energy to Snorlax or Rattata. Snorlax needs 3 Colorless for its attack. Rattata needs 1 Colorless for Call for Friends.
- Play Oracle (Supporter) to choose 2 cards from deck and put on top. This could help me set up draws.
- Play Miracle Sphere Alpha or Beta - but these require evolved Pokemon (Fire/Grass/Lightning for Alpha, Water/Fighting/Psychic for Beta according to the text). Wait, looking at the card text:

Miracle Sphere Beta: "Lege diese Karte an 1 deiner entwickelten -, - oder Pokémon im Spiel an." - The text seems cut off but likely means Water, Fighting, or Psychic? Actually looking at the pattern, Alpha is probably Fire/Grass/Lightning and Beta is probably Water/Fighting/Psychic. But I don't have any evolved Pokemon anyway. I only have Basic Snorlax and Basic Rattata. So I cannot play the Miracle Spheres.

- Use Rattata's Call for Friends attack to search for a Basic Pokemon and put it on bench. But Rattata has no energy attached.

- Use Snorlax's Lolling About power? It has no damage counters, so removing one does nothing, but it would make Snorlax Asleep, which is bad.

Strategy:
I should probably attach an energy to Snorlax to power up Continuous Tumble. Snorlax needs 3 energy. I have Lightning and Water energy. Both are valid for Snorlax (Colorless accepts any).

I should also play Oracle to set up my next draws. Oracle lets me choose 2 cards from deck and put them on top in any order. This is strong for setting up future turns.

Can I attack this turn?
Snorlax needs 3 Colorless. I can attach 1 energy this turn. So I have 0 energy on Snorlax now, attach 1, still need 2 more. Cannot attack with Snorlax.

Rattata is on bench. To use Call for Friends, it needs to be active. So I can't use that attack this turn unless I retreat Snorlax. Snorlax has retreat cost 3. I have no energy attached to Snorlax yet, so I cannot retreat.

So my turn is limited:
1. Draw (already done according to log "[AI] Drew 1 card(s)")
2. Play Oracle (Supporter) - choose 2 cards from deck to top
3. Attach 1 Energy to Snorlax (probably Lightning or Water, doesn't matter which for Snorlax)
4. End turn

Wait, I should check if I can play Xatu. Xatu requires Natu. I don't have Natu. So no.

I could also consider attaching to Rattata instead, but Rattata is on bench and has 30 HP, very fragile. Snorlax is my tank at 80 HP. I should power up Snorlax.

So plan:
1. Play Oracle (Supporter) - select 2 cards from deck to put on top. What should I look for? Probably energy or basics. But I don't know my deck composition. I'll just execute the action.
2. Attach Lightning Energy (or Water) to Snorlax.
3. End turn.

Actually, looking at the hand, I have both Lightning and Water energy. Either works.

Is there any reason to play Miracle Sphere? No, requires evolved Pokemon.

Is there any reason to use Snorlax's power? No, it would put it to sleep for no benefit.

So the plan is straightforward.

Wait, I should check the exact wording of Oracle: "Wähle 2 Karten aus deinem Deck und mische den Rest deines Decks. Lege die gewählten Karten in beliebiger Reihenfolge oben auf dein Deck."

So: Choose 2 cards from deck, shuffle the rest, put the 2 chosen on top in any order.

And for attaching energy: Attach Lightning Energy to Snorlax (or Water, doesn't matter).

Then end turn.

Numbered plan:
1. Play Oracle (Supporter) - move from hand to staging/active area, then select 2 cards from deck to top.
2. Attach Lightning Energy from hand to Snorlax (active).
3. End turn.

Or I could attach Water Energy, but Lightning is fine.

Actually, looking at the opponent's board, they have Voltorb (Lightning) active with 1 energy, and Lapras (Water) on bench. If I knock out Voltorb, I take a prize. But I can't attack this turn.

So yes, just setup.

One more check: Can I play Fast Ball? I don't have Fast Ball in hand, opponent discarded it.

Can I play Bill's Maintenance? I don't have it.

So final plan:
1. Play Oracle (Supporter)
2. Attach Lightning Energy to Snorlax
3. End turn

Wait, the format requires:
1. One-line summary of what opponent did last turn.
2. Numbered action steps.
3. Final step is ALWAYS either `declare_attack` + `end_turn`, or just `end_turn`.

So:
1. Opponent attached Lightning Energy to Voltorb, played Bill's Maintenance (Supporter) to shuffle a card and draw 3, then ended turn.
2. Play Oracle from hand (Supporter).
3. Attach Lightning Energy to Snorlax.
4. End turn.

Or should I attach Water Energy? It doesn't matter for Snorlax, but maybe I want to save Lightning for something else? No, I should just attach one.

Actually, looking at my hand again: Water Energy, Oracle, Miracle Sphere Beta, Xatu, Miracle Sphere Alpha, Lightning Energy.

If I play Oracle, I need to choose 2 cards. I don't know what cards are in my deck, but presumably I want to find energy or Natu to evolve into Xatu. But I can't choose specific cards without knowing the deck list. The plan should just say to play Oracle.

So:
1. Opponent attached Lightning Energy to Voltorb, played Bill's Maintenance (Supporter), and ended their turn.
2. Play Oracle (Supporter) from hand.
3. Attach Lightning Energy to Snorlax.
4. End turn.

That's it.
logging.ts:14 [AI] 1. Opponent attached Lightning Energy to Voltorb, played Bill's Maintenance (Supporter) to shuffle a Fire Energy into their deck and draw 3 cards, then ended their turn.
2. Play Oracle (Supporter) from hand to select 2 cards from the deck and place them on top in any order.
3. Attach Lightning Energy from hand to Snorlax (player2_active).
4. End turn.
run-turn.ts:198 [AI Pipeline: Executor]
run-turn.ts:199 [system] You are an AI agent playing the Pokemon Trading Card Game. You are Player 2.

You are the executor agent. A plan has been given to you. Your job is to call the appropriate tools to execute the plan.
*...
logging.ts:11 [thinking] The plan is:
1. Play Oracle (Supporter) from hand to select 2 cards from the deck and place them on top in any order.
2. Attach Lightning Energy from hand to Snorlax (player2_active).
3. End turn.

Let me start by playing Oracle. First, I need to move Oracle from hand to staging (since it's a Supporter), then search my deck to select 2 cards.

Actually, looking at the Oracle card text: "Wähle 2 Karten aus deinem Deck und mische den Rest deines Decks. Lege die gewählten Karten in beliebiger Reihenfolge oben auf dein Deck."

This means I need to:
1. Move Oracle to staging
2. Search my deck to see all cards
3. Select 2 cards to put on top
4. Shuffle the rest

Let me start by moving Oracle to staging and searching the deck.
logging.ts:14 [AI] I'll execute the plan. First, let me play Oracle by moving it to staging and searching my deck to select 2 cards.
logging.ts:18 [tool] move_card {fromZone: 'player2_hand', toZone: 'staging', cardName: 'Oracle'}
logging.ts:18 [tool] search_zone {zone: 'player2_deck'}
run-turn.ts:115 [rate-limit] RPM: 3 requests in last 60s
logging.ts:11 [thinking] I can see my deck contents. I need to select 2 cards to put on top of my deck. Looking at the deck, I have:
- Natu (Basic Psychic) - I have Xatu in hand, so Natu would let me evolve
- Raticate (Stage 1 from Rattata) - I have Rattata on bench
- Professor Oak's Research (Supporter) - good draw power
- Psychic Energy x9 - useful for Xatu
- Lightning Energy x2 - useful for Snorlax
- Various other cards

Good choices would be:
1. Natu - so I can evolve into Xatu (which I have in hand)
2. Professor Oak's Research - for draw power

Or I could go with energy. Let me pick Natu and Professor Oak's Research as they give me the most options.

Actually, looking more carefully - I need to move the selected cards to the TOP of the deck, not to hand. The Oracle effect says to choose 2 cards and place them on top of the deck in any order.

So I need to:
1. Move 2 cards from deck to... somewhere (probably staging or a temporary zone), then
2. Move them back to deck on top
3. Shuffle the rest

Wait, let me re-read the card text: "Wähle 2 Karten aus deinem Deck und mische den Rest deines Decks. Lege die gewählten Karten in beliebiger Reihenfolge oben auf dein Deck."

So I select 2 cards, shuffle the rest, and put the 2 selected on top. The search_zone result shows me what's in the deck. I need to move 2 cards to the top of the deck.

The way to do this would be:
1. Move the 2 selected cards from deck to staging (or hand temporarily)
2. Shuffle the deck
3. Move the 2 cards back to the top of the deck

Let me select Natu and Professor Oak's Research. I'll move them to staging, shuffle the deck, then move them back to the top.
logging.ts:14 [AI] I can see my deck. I'll select Natu (to evolve into Xatu) and Professor Oak's Research (for draw power). Let me move these to staging, shuffle the deck, then place them on top.
logging.ts:18 [tool] move_card {fromZone: 'player2_deck', toZone: 'staging', cardName: 'Natu'}
logging.ts:18 [tool] move_card {fromZone: 'player2_deck', toZone: 'staging', cardName: "Professor Oak's Research"}
logging.ts:18 [tool] shuffle {zone: 'player2_deck'}
logging.ts:11 [thinking] Good, I've shuffled the deck. Now I need to place the two selected cards (Natu and Professor Oak's Research) on top of the deck in any order. I'll put Professor Oak's Research on top first, then Natu, so Natu will be the top card. Actually, let me think about this - I want to be able to play Professor Oak's Research next turn, so I should put it on top. Let me put Professor Oak's Research on top first, then Natu on top of it. Wait, the order matters - the last card I place will be on top. So if I want Natu on top, I place Professor Oak's Research first, then Natu. If I want Professor Oak's Research on top, I place Natu first, then Professor Oak's Research.

I think having Professor Oak's Research on top makes more sense so I can draw into it and use it for draw power. Let me place Natu first, then Professor Oak's Research on top.
logging.ts:14 [AI] Now I need to place the two selected cards on top of the deck. I'll put Natu first, then Professor Oak's Research on top (so Professor Oak's Research will be the top card).
logging.ts:18 [tool] move_card {fromZone: 'staging', toZone: 'player2_deck', cardName: 'Natu', toPosition: 'top'}
logging.ts:18 [tool] move_card {fromZone: 'staging', toZone: 'player2_deck', cardName: "Professor Oak's Research", toPosition: 'top'}
logging.ts:18 [tool] move_card {fromZone: 'staging', toZone: 'player2_discard', cardName: 'Oracle'}
logging.ts:11 [thinking] Good! Oracle has been resolved. Now I need to:
1. Attach Lightning Energy to Snorlax
2. End turn

Let me attach the Lightning Energy to Snorlax.
logging.ts:14 [AI] Oracle has been resolved. Now I'll attach Lightning Energy to Snorlax and end my turn.
logging.ts:18 [tool] move_card {fromZone: 'player2_hand', toZone: 'player2_active', cardName: 'Lightning Energy'}
logging.ts:18 [tool] end_turn {}