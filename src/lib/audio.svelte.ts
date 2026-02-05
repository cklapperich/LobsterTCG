// Sound effect paths mapping
const SFX_PATHS = {
  cursor: '/sfx/cursor.mp3',
  cardDrop: '/sfx/place_prize.mp3',
  cancel: '/sfx/cancel.mp3',
  confirm: '/sfx/confirm.mp3',
  shuffle: '/sfx/card_shuffle.mp3',
  coinToss: '/sfx/coin_toss.mp3',
  coinHeads: '/sfx/coin_toss_heads.mp3',
  coinTails: '/sfx/coin_toss_tails.mp3',
} as const;

type SfxKey = keyof typeof SFX_PATHS;

// Audio element cache for preloading
const audioCache = new Map<SfxKey, HTMLAudioElement>();

// Preload an audio file
function preload(key: SfxKey): HTMLAudioElement {
  if (!audioCache.has(key)) {
    const audio = new Audio(SFX_PATHS[key]);
    audio.preload = 'auto';
    audioCache.set(key, audio);
  }
  return audioCache.get(key)!;
}

// Play a sound effect (clones audio for overlapping sounds)
export function playSfx(key: SfxKey): void {
  const cached = preload(key);
  const audio = cached.cloneNode() as HTMLAudioElement;
  audio.volume = audioSettings.volume;
  if (!audioSettings.muted) {
    audio.play().catch(() => {
      // Ignore autoplay errors (user hasn't interacted yet)
    });
  }
}

// Audio settings state (for future mute/volume controls)
export const audioSettings = $state({
  muted: false,
  volume: 0.5,
});

// Preload common sounds on module load
if (typeof window !== 'undefined') {
  preload('cursor');
  preload('cardDrop');
  preload('cancel');
  preload('confirm');
  preload('shuffle');
  preload('coinToss');
  preload('coinHeads');
  preload('coinTails');
}
