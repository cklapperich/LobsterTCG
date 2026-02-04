Core Aesthetic Elements
1. Pixel-Perfect Rendering
css/* Global CSS or Tailwind layer */
.pixel-art {
  image-rendering: pixelated;
  image-rendering: crisp-edges;
}
2. Authentic Color Palettes
Game Boy Color had limited palettes. Define them as CSS variables:
css:root {
  /* Pokemon TCG GB-style palette */
  --bg-dark: #081820;
  --bg-mid: #346856;
  --bg-light: #88c070;
  --bg-lightest: #e0f8d0;
  
  /* GBA Yu-Gi-Oh style (richer) */
  --panel-bg: #2a3a5c;
  --panel-border-light: #7b9cc7;
  --panel-border-dark: #101828;
  --accent: #d4aa00;
}
3. Pixel Fonts
Use fonts like "Press Start 2P" (Google Fonts) or "Silkscreen":
html<link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap" rel="stylesheet">
css.retro-text {
  font-family: 'Press Start 2P', monospace;
  font-size: 8px;
  transform: scale(2);
  transform-origin: top left;
}

Key UI Patterns
Beveled Panel Borders (Pokemon TCG style)
Those games used a distinctive raised/inset border effect:
svelte<script>
  export let inset = false;
</script>

<div class="retro-panel" class:inset>
  <slot />
</div>

<style>
  .retro-panel {
    background: var(--bg-mid);
    border: 4px solid;
    border-color: var(--bg-lightest) var(--bg-dark) var(--bg-dark) var(--bg-lightest);
    padding: 8px;
  }
  .retro-panel.inset {
    border-color: var(--bg-dark) var(--bg-lightest) var(--bg-lightest) var(--bg-dark);
  }
</style>
Scaled Container Approach
Render at native resolution (160×144 for GBC, 240×160 for GBA) then scale up:
svelte<script>
  let scale = 3;
</script>

<div 
  class="game-screen"
  style="width: {160 * scale}px; height: {144 * scale}px;"
>
  <div class="inner" style="transform: scale({scale})">
    <!-- Your content at 160x144 -->
  </div>
</div>

<style>
  .game-screen {
    overflow: hidden;
    background: #081820;
  }
  .inner {
    width: 160px;
    height: 144px;
    transform-origin: top left;
    image-rendering: pixelated;
  }
</style>

Tailwind Extensions
Add these to your tailwind.config.js:
jsmodule.exports = {
  theme: {
    extend: {
      fontFamily: {
        pixel: ['"Press Start 2P"', 'monospace'],
      },
      colors: {
        gb: {
          darkest: '#081820',
          dark: '#346856',
          light: '#88c070',
          lightest: '#e0f8d0',
        }
      },
      boxShadow: {
        'retro-raised': 'inset -4px -4px 0 #081820, inset 4px 4px 0 #e0f8d0',
        'retro-inset': 'inset 4px 4px 0 #081820, inset -4px -4px 0 #e0f8d0',
      }
    }
  }
}

Specific Game Aesthetics
FeaturePokemon TCG GBYu-Gi-Oh GBAResolution160×144240×160Colors~4-8 per scene16-32BordersThick beveledThinner, metallicCardsTiny spritesSmall thumbnailsFont8px bitmap8px, sometimes 6px

Animation Tips
Use stepped animations, not smooth easing:
css@keyframes blink {
  0%, 49% { opacity: 1; }
  50%, 100% { opacity: 0; }
}

.cursor {
  animation: blink 1s steps(1) infinite;
}
For sprite animations:
css.sprite {
  background: url('spritesheet.png');
  animation: walk 0.5s steps(4) infinite;
}
@keyframes walk {
  to { background-position: -64px 0; }
}

Optional: Scanlines/CRT Effect
css.scanlines::after {
  content: '';
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(
    transparent 0px,
    transparent 2px,
    rgba(0,0,0,0.1) 2px,
    rgba(0,0,0,0.1) 4px
  );
  pointer-events: none;
}
