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
  turnStart: '/sfx/receive_card_pop.mp3',
  decisionRequested: '/sfx/question_mark.mp3',
} as const;

type SfxKey = keyof typeof SFX_PATHS;

// Battle theme paths
const BATTLE_THEMES = [
  '/battle_themes/03 Duel vs. Team GR.mp3',
  '/battle_themes/05 Duel.mp3',
  '/battle_themes/12 Duel vs. Fortress Leader.mp3',
  '/battle_themes/14 Club Master Duel.mp3',
  '/battle_themes/16 Ronald\'s Theme.mp3',
  '/battle_themes/20 Grand Master Duel.mp3',
];

// Audio element cache for preloading
const audioCache = new Map<SfxKey, HTMLAudioElement>();

// Background music state
let bgmAudio: HTMLAudioElement | null = null;

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

// Start a random battle theme on loop
export function playBgm(): void {
  stopBgm();
  const theme = BATTLE_THEMES[Math.floor(Math.random() * BATTLE_THEMES.length)];
  bgmAudio = new Audio(theme);
  bgmAudio.loop = true;
  bgmAudio.volume = audioSettings.volume * 0.4; // BGM quieter than SFX
  if (!audioSettings.bgmMuted) {
    bgmAudio.play().catch(() => {});
  }
}

// Stop background music
export function stopBgm(): void {
  if (bgmAudio) {
    bgmAudio.pause();
    bgmAudio.currentTime = 0;
    bgmAudio = null;
  }
}

// Toggle BGM mute (SFX unaffected)
export function toggleMute(): void {
  audioSettings.bgmMuted = !audioSettings.bgmMuted;
  if (bgmAudio) {
    if (audioSettings.bgmMuted) {
      bgmAudio.pause();
    } else {
      bgmAudio.volume = audioSettings.volume * 0.4;
      bgmAudio.play().catch(() => {});
    }
  }
}

// Audio settings state
export const audioSettings = $state({
  muted: false,
  bgmMuted: false,
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
  preload('turnStart');
  preload('decisionRequested');
}
