import type { Playmat, Visibility, ZoneConfig } from './types';
import { VISIBILITY } from './types';

// JSON representation uses string visibility
type VisibilityString = 'public' | 'hidden' | 'player_a_only' | 'player_b_only';

interface ZoneConfigJson {
  id: string;
  name: string;
  ordered: boolean;
  defaultVisibility: VisibilityString;
  maxCards: number;
  ownerCanSeeContents: boolean;
  opponentCanSeeCount: boolean;
  shared?: boolean;
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
  const { id, defaultVisibility, ...rest } = json;
  return {
    ...rest,
    defaultVisibility: parseVisibility(defaultVisibility),
  };
}

export function parsePlaymat(json: PlaymatJson): Playmat {
  // Convert zones array to Record<string, ZoneConfig>
  const zones: Record<string, ZoneConfig> = {};
  for (const zoneJson of json.zones) {
    zones[zoneJson.id] = parseZoneConfig(zoneJson);
  }

  return {
    ...json,
    zones,
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
