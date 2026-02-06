
## BUG

When AI uses coin flip, you HEAR the coin flip and the result. you do not see the animation modal pop up. you do not see the result of the coin flip in the log. You do not see any AI actions in the logs, actually, you should see all AI actions in the combatlog / game state log

## Chatlog (NOT gamelog) is this:

[AI] Perfect! I now have Weedle as my Active Pokemon with a Grass Energy attached. Now I can use Weedle's "Poison Sting" attack which costs 1 Grass Energy, deals 10 damage, and has a chance to poison the opponent's Growlithe.

Let me declare the attack and resolve it:
logging.ts:12 [tool] declare_attack Object
logging.ts:10 [AI] Now I need to apply the damage and flip a coin to see if Growlithe gets poisoned:
logging.ts:12 [tool] add_counter Object
logging.ts:12 [tool] coin_flip Object
logging.ts:10 [AI] The coin flip result isn't visible in the output, but the attack has been executed. I've dealt 10 damage to Growlithe. According to the rules, the opponent will handle the poison status effect if the coin was heads during their Pokemon checkup.

Now I'll end my turn:
logging.ts:12 [tool] end_turn Object
logging.ts:10 [AI] Perfect! I've completed my turn. Here's what I accomplished:

**Turn 2 Summary:**
1. ✅ Drew a card (Water Energy)
2. ✅ Played Weedle as my Active Pokemon
3. ✅ Attached a Grass Energy to Weedle
4. ✅ Attacked with Poison Sting, dealing 10 damage to opponent's Growlithe
5. ✅ Flipped a coin for the poison effect (result to be handled by opponent)
6. ✅ Ended my turn

**Current Board State:**
- My Active: Weedle (40 HP) with 1 Grass Energy attached
- My Hand: 2 Grass Energy, 3 Water Energy, 1 Gust of Wind
- Opponent's Active: Growlithe (with 10 damage)
- Opponent's Bench: Charmander, Vulpix

The game is now back to Player 1's turn (Turn 3). I've established board presence and started dealing damage. Weedle is vulnerable to Fire-type attacks due to its weakness, but I'm in a reasonable position to continue building my board on future turns.
