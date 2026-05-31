# Updating the Pokemon TCG card database

The card database (`src/plugins/pokemon/cards-western.json`) and set codes
(`src/plugins/pokemon/set-codes.json`) are **generated**, not hand-edited. The
generator lives in the sister repo `../simpledex`, which converts the
[pokemon-tcg-data](https://github.com/PokemonTCG/pokemon-tcg-data) dataset into
this project's `WesternCard` format.

## How to update

From the `simpledex` repo:

```bash
npm run build:cards
```

That script:

1. `git submodule update --init --remote` — pulls the latest `pokemon-tcg-data`.
2. `tsx build-ptcg.ts` — converts to western format (converter:
   `build-pokemon-tcg-data.ts`), writing `public/cards-western.json` and
   `public/set-codes.json`.
3. `cp`s the outputs (and the `pokemon-shared/` files) into this repo.

Then commit `cards-western.json` + `set-codes.json` here.

## Gotcha: revert the clobbered `types.ts`

`build:cards` also copies `pokemon-shared/types.ts` from simpledex. That copy has
**diverged** into a simpler all-`string` version that drops the named unions
(`Supertype`, `EnergyType`, `Subtype`, `AbilityType`, `Series`, …). Our
`cards.ts` imports those names, so taking the copy breaks the TypeScript build.

After running `build:cards`, revert it:

```bash
git checkout -- src/plugins/pokemon/pokemon-shared/types.ts
```

Commit only the data files. (`constants.ts` / `ptcgoParser.ts` are usually
identical and safe.)

## Notes

- Image URLs come straight from the source data — newer sets use
  `images.scrydex.com`, older ones `images.pokemontcg.io`.
- Card IDs are `<set-id>-<number>` (e.g. `me4-1`); the `set` field is the set
  name, `setNumber` is `"<set name> <number>"`.
