# LobsterTCG

A trading card game simulator for **netplay with friends** and **playing against AI agents**.

LobsterTCG is built for low-interaction TCGs, where turns are mostly self-contained
and players don't constantly interrupt each other. **Pokémon** fits this well. Fast-response-heavy
games like Yu-Gi-Oh! and Magic: The Gathering are poorer fits for the current design.

Currently **Pokémon** and **Pokémon Pocket** are implemented. A plugin system lets other card
games be added.

**Comparison to Other Simulators** LobsterTCG is a *tabletop card game simulator*. It sits halfway between
fully-automated clients like PTCGL or YGOPRO — which enforce every rule for you — and bare
tabletop simulators like Untapped.in, where you do everything by hand. LobsterTCG enforces
the things card effects can never negate and provides plenty of conveniences, but you stay in
control of resolving cards. This deliberate middle ground is also what makes it a good
environment for AI agents to play in.

## Why it exists

Two goals:

1. **Have fun** playing TCGs with friends over the internet, or against AI opponents.
2. **Research and learning** into building effective real-world AI agent systems. It's a
   practical testbed for tool-using agents that take real actions in a stateful environment.

It's fully open source. Anyone can contribute bug fixes or add new card games as plugins.

## Features

- **Netplay**: peer-to-peer multiplayer over WebRTC. Free, no server-side game state.
- **AI opponents**: play against LLM agents with configurable models and strategies.
- **Plugin architecture**: each game (rules, board layout, card effects) is a self-contained plugin.
  Core systems never reference a specific TCG.
- **Deck import/export**: export decks from [Limitless TCG](https://limitlesstcg.com) and import
  them here. Theme decks are bundled so you can start playing immediately.
- **Optional accounts**: log in with Google to save decks to the project's Supabase. We don't read
  your name or email.
- **Optional [simpledex](https://simpledex-weld.vercel.app/) integration**: if you're logged into
  both, your simpledex decks show up in LobsterTCG automatically.

## Playing against AI

Playing against AI requires an **OpenRouter** or **Fireworks** API key, entered in the in-app
AI settings. Netplay does not require any key.

**AI games cost roughly $0.10 to $3.00 per game in API costs**, depending on the model and mode
you choose. Netplay is free.

There are two AI modes:

| Mode | How it works | Trade-off |
|------|--------------|-----------|
| **Autonomous (Single Agent)** | One model reads the board and takes actions directly. | Smart model → smartest and most expensive. Cheap model → cheapest and fastest. |
| **Pipeline (Plan + Execute)** | A *planner* model decides strategy; a separate *executor* model carries it out. | A smart planner + cheaper executor is often the best balance of intelligence and cost. |

## Talking to the AI

You interact with the AI agent much like you would a human opponent across the table.

The key mechanism is **Request Decision**. Whenever you do something the opponent needs to
respond to — playing a Trainer card, knocking out their Pokémon, anything that hands them a
choice — you send a decision request. You can **leave the text field blank**, or **add
guidance** ("discard the Energy", "choose your Bench Pokémon"). Smart models can usually read
the field and figure out what's being asked. To **read what the model says back**, open the
browser console (`Ctrl+Shift+I`) and view its output.

### The staging area

When playing Trainer cards — or any card that resolves in several steps — use the **staging
area**. It's a shared in-progress zone that keeps both you *and* the AI aware of what's
currently being resolved, instead of cards teleporting around mid-effect.

Example, playing **Ultra Ball**:

1. Play Ultra Ball to **staging**.
2. Move 2 cards from hand to discard (its cost).
3. Search your deck for a card; it goes to **staging** by default.
4. Move the searched card from staging to hand.
5. Move Ultra Ball from staging to discard.

## Getting started

Requires Node.js (18+) and npm.

```bash
npm install
cp .env.example .env   # fill in Supabase + (optionally) Fireworks keys
npm run dev            # start the dev server
```

API keys for AI play (OpenRouter / Fireworks) are entered in the in-app AI settings rather than
the env file. Supabase keys (for optional login/deck-saving) go in `.env`:

```
VITE_FIREWORKS_API_KEY=...     # optional, can also be set in-app
VITE_SUPABASE_URL=...          # optional, for login + saved decks
VITE_SUPABASE_ANON_KEY=...
```

### Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Production build |
| `npm run preview` | Preview the production build |
| `npm run check` | Type-check with `svelte-check` |
| `npm test` | Run the Vitest test suite |

## Tech stack

Svelte 5 · TypeScript · Vite · Tailwind CSS · Supabase · WebRTC (P2P) ·
[Vercel AI SDK](https://sdk.vercel.ai) (OpenRouter, Fireworks, Anthropic, OpenAI providers).

## Contributing

Contributions are welcome, bug fixes and new game plugins especially.

- Game plugins live in `src/plugins/`. `pokemon` and `pokemon-pocket` are the reference
  implementations; the others are early scaffolds.
- Core systems (`src/core/`) must never import from a plugin or encode rules of a specific TCG.
- See [`docs/`](docs/) for architecture notes (`ai-tools.md`), design references, and
  archived implementation plans under `docs/plans/`.

## License

See [LICENSE.md](LICENSE.md).
