import type { Playmat, Visibility, ZoneConfig } from './types';
import { VISIBILITY, PLAYMAT_VISIBILITY } from './types';

// JSON representation uses string visibility
type VisibilityString = typeof PLAYMAT_VISIBILITY[keyof typeof PLAYMAT_VISIBILITY];

interface ZoneConfigJson {
  id: string;
  name: string;
  ordered: boolean;
  defaultVisibility: VisibilityString;
  maxCards: number;
  ownerCanSeeContents: boolean;
  opponentCanSeeCount: boolean;
  shared?: boolean;
  canHaveCounters?: boolean;
}

interface PlaymatJson extends Omit<Playmat, 'zones'> {
  zones: ZoneConfigJson[];
}

function parseVisibility(vis: VisibilityString): Visibility {
  switch (vis) {
    case PLAYMAT_VISIBILITY.PUBLIC:
      return VISIBILITY.PUBLIC;
    case PLAYMAT_VISIBILITY.HIDDEN:
      return VISIBILITY.HIDDEN;
    case PLAYMAT_VISIBILITY.PLAYER_A_ONLY:
      return VISIBILITY.PLAYER_A_ONLY;
    case PLAYMAT_VISIBILITY.PLAYER_B_ONLY:
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
