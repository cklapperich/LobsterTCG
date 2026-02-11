# Declare Action 3D Text Overlay

## Context
When attacks, abilities, retreats, or stadiums are declared, the only feedback is a log entry and a quiet "confirm" SFX. The user wants a fun animated 3D text popup — like a fighting game attack announcement — for every `DeclareAction` by either player.

## Approach
Follow the CoinFlip.svelte pattern: a new overlay component with an exported async `show()` method, bound via `bind:this` in Game.svelte, triggered after successful `DECLARE_ACTION` execution.

## Files to Create

### `src/components/game/DeclareOverlay.svelte`
New component following CoinFlip.svelte's pattern:

- **Props**: none needed (all data passed via `show()` method)
- **Exported method**: `async show(name: string, declarationType: string, playerLabel?: string)`
  - Sets internal `$state` to visible
  - Plays a more impactful SFX based on `declarationType` (attack → `big_hit`, ability → `glow`, retreat → `speed`, stadium → `confirm`)
  - Auto-dismisses after ~1.5s
- **Visual**: Full-screen semi-transparent overlay (like CoinFlip) with centered 3D text
- **Animation**:
  - CSS `perspective` on container for 3D depth
  - Text scales from 0 → 1.3 → 1.0 with slight `rotateX(-10deg)` tilt
  - Multi-layer `text-shadow` for extruded 3D depth effect (stacked shadow offsets)
  - Color varies by type: attack = `gbc-red`, ability = blue/purple, retreat = green, stadium = `gbc-yellow`
  - Small subtitle showing "Player 1" / "Player 2" / "AI" underneath
  - Fade out at end
- **Font**: `font-retro` (Press Start 2P) — matches existing retro aesthetic

## Files to Modify

### `src/lib/audio.svelte.ts`
Add new SFX keys to `SFX_PATHS`:
- `declareAttack: '/sfx/big_hit.mp3'`
- `declareAbility: '/sfx/glow.mp3'`
- `declareRetreat: '/sfx/speed.mp3'`

Preload all three at bottom of file.

### `src/components/game/Game.svelte`
1. **Import** `DeclareOverlay`
2. **Bind ref**: `let declareOverlayRef: DeclareOverlay | undefined = $state()`
3. **Hook into tryAction()**: After the successful `executeAction` + post-hooks block (line ~258), check if `action.type === ACTION_TYPES.DECLARE_ACTION`. If so, call `declareOverlayRef?.show(action.name, action.declarationType, playerLabel)`. This is fire-and-forget (no await needed since it doesn't block gameplay).
4. **Render component** near CoinFlip (line ~1216): `<DeclareOverlay bind:this={declareOverlayRef} />`
5. **Remove** `DECLARE_ACTION` from `sfxMap` in `createExecutor()` (the overlay component now handles SFX directly to avoid double-sound)

## Verification
1. `npm run dev` and start a game
2. Click an attack button → should see 3D animated text with attack name + impactful SFX
3. Click an ability → different color + different SFX
4. Let AI take a turn and declare an attack → same overlay fires
5. Confirm the overlay auto-dismisses and doesn't block gameplay
