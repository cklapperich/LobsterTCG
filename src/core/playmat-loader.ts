import type { Playmat, Visibility, ZoneConfig } from './types';
import { VISIBILITY } from './types';

// JSON representation uses string visibility
type VisibilityString = 'public' | 'hidden' | 'player_a_only' | 'player_b_only';

interface ZoneConfigJson extends Omit<ZoneConfig, 'defaultVisibility'> {
  defaultVisibility: VisibilityString;
}

interface PlaymatJson extends Omit<Playmat, 'zones'> {
  zones: ZoneConfigJson[];
}

function parseVisibility(vis: VisibilityString): Visibility {
  switch (vis) {
    case 'public':
      return VISIBILITY.PUBLIC;
    case 'hidden':
      return VISIBILITY.HIDDEN;
    case 'player_a_only':
      return VISIBILITY.PLAYER_A_ONLY;
    case 'player_b_only':
      return VISIBILITY.PLAYER_B_ONLY;
    default:
      throw new Error(`Unknown visibility: ${vis}`);
  }
}

function parseZoneConfig(json: ZoneConfigJson): ZoneConfig {
  return {
    ...json,
    defaultVisibility: parseVisibility(json.defaultVisibility),
  };
}

export function parsePlaymat(json: PlaymatJson): Playmat {
  return {
    ...json,
    zones: json.zones.map(parseZoneConfig),
  };
}

export async function loadPlaymat(url: string): Promise<Playmat> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load playmat: ${response.statusText}`);
  }
  const json: PlaymatJson = await response.json();
  return parsePlaymat(json);
}
