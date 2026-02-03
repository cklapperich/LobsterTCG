we need:

1. generic card data structures
2. pokemon related data types that (for now) we copy from ../simpledex
3. ability to store a turn, so we can rewind turns
4. ability for user to reject a turn for an illegal play (and save info on that turn?)
5. hidden vs public information
6. cards can be in zones, and can be visible/hidden to each player. Public, A-only, B-only, None. or maybe store it as just [A, B], 2 booleans
7. deck format
8. play table format that lists zones
9. a pokemon plugin that implements pokemon-specific conveniences like the playmat structure, and a condensed rulebook for AI agents. plugins can also define new non-standard tools like 'evolve' and also remove access to standard tools.

10. define core actions:
draw card
flip card
search deck
place card on top/bottom of deck
place stack on top/bottom of deck
shuffle stack of cards
search top/bottom X cards
search deck
play card
play card on top of card
move card to hand
move card to [zone]
Zones must be marked as unordered or ordered.
Counters/tokens - Damage counters, poison markers, various tracking. Generic add_counter(card, type, n) and remove_counter
Coin flips and dice - Core action
Card orientation
card 'status' ie tapped (maybe defined by plugin?)

Zones as ordered vs unordered - Deck order matters, hand order usually doesn't, discard sometimes does (bottom card matters in some effects)
"Reject turn" metadata - You mentioned saving info on rejected turns. For training/heuristics? What gets saved - the attempted actions, reason for rejection, correct play?

automatically filter out empty info from card json: if a card isnt tapped and is in normal orientation, omit orientation info.

11. track who's turn it is and win/lose state
concede/declare victory should be actions, as no rules engine exists to verify you won

MVP: play solitaire by taking actions on this fake table.
DO NOT IMPLEMENT SOLITAIRE RULES, no GUI.

12. A turn is just a list of core actions taken
we store (state,action,state,action,state,action)
