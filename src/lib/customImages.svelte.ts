const STORAGE_KEY = 'lobster-custom-images';

export interface CustomImage {
  id: string;
  name: string;
  dataUrl: string;
}

interface CustomImageData {
  cardbacks: CustomImage[];
  playmats: CustomImage[];
  selectedCardback: string; // id or '' for default
  selectedPlaymat: string;  // id or '' for none
}

const DEFAULTS: CustomImageData = {
  cardbacks: [],
  playmats: [],
  selectedCardback: '',
  selectedPlaymat: '',
};

function load(): CustomImageData {
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

export const customImages = $state<CustomImageData>(load());

$effect.root(() => {
  $effect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify($state.snapshot(customImages)));
    } catch {
      // private browsing fallback
    }
  });
});

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function addCardback(file: File): Promise<CustomImage> {
  const dataUrl = await readFileAsDataUrl(file);
  const img: CustomImage = {
    id: crypto.randomUUID(),
    name: file.name.replace(/\.[^.]+$/, ''),
    dataUrl,
  };
  customImages.cardbacks = [...customImages.cardbacks, img];
  return img;
}

export async function addPlaymat(file: File): Promise<CustomImage> {
  const dataUrl = await readFileAsDataUrl(file);
  const img: CustomImage = {
    id: crypto.randomUUID(),
    name: file.name.replace(/\.[^.]+$/, ''),
    dataUrl,
  };
  customImages.playmats = [...customImages.playmats, img];
  return img;
}

export function removeCardback(id: string) {
  customImages.cardbacks = customImages.cardbacks.filter(c => c.id !== id);
  if (customImages.selectedCardback === id) {
    customImages.selectedCardback = '';
  }
}

export function removePlaymat(id: string) {
  customImages.playmats = customImages.playmats.filter(p => p.id !== id);
  if (customImages.selectedPlaymat === id) {
    customImages.selectedPlaymat = '';
  }
}

export function getSelectedCardbackUrl(): string {
  if (!customImages.selectedCardback) return '';
  const img = customImages.cardbacks.find(c => c.id === customImages.selectedCardback);
  return img?.dataUrl ?? '';
}

export function getSelectedPlaymatUrl(): string {
  if (!customImages.selectedPlaymat) return '';
  const img = customImages.playmats.find(p => p.id === customImages.selectedPlaymat);
  return img?.dataUrl ?? '';
}
