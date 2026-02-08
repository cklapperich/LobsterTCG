const STORAGE_KEY = 'lobster-tcg-settings';

interface Settings {
  sfxVolume: number;
  bgmVolume: number;
  searchToHand: boolean;
}

const DEFAULTS: Settings = {
  sfxVolume: 0.5,
  bgmVolume: 0.5,
  searchToHand: false,
};

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULTS, ...parsed };
    }
  } catch {
    // private browsing or corrupted data
  }
  return { ...DEFAULTS };
}

export const settings = $state<Settings>(loadSettings());

$effect.root(() => {
  $effect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify($state.snapshot(settings)));
    } catch {
      // private browsing fallback
    }
  });
});
