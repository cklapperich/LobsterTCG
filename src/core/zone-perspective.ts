import type { PlayerIndex } from './types';

/**
 * Zone key perspective translation.
 *
 * Internal zone keys use player1_/player2_ prefixes. Player-relative keys use your_/opponent_ instead.
 * Shared zones (stadium, staging) pass through unchanged.
 */

const PLAYER_PREFIX_RE = /^player([12])_/;

/**
 * Translate an internal zone key to player-relative perspective.
 * e.g. for player 1 (index 1):
 *   "player2_hand" → "your_hand"
 *   "player1_hand" → "opponent_hand"
 *   "stadium"      → "stadium"
 */
export function toPlayerPerspective(zoneKey: string, playerIndex: PlayerIndex): string {
  const match = zoneKey.match(PLAYER_PREFIX_RE);
  if (!match) return zoneKey; // shared zone — pass through

  const playerNum = parseInt(match[1], 10); // 1 or 2
  const zoneOwner = (playerNum - 1) as PlayerIndex; // 0 or 1
  const suffix = zoneKey.slice(match[0].length); // e.g. "hand", "active", "bench_1"

  return zoneOwner === playerIndex
    ? `your_${suffix}`
    : `opponent_${suffix}`;
}

/**
 * Translate a player-relative zone key back to internal format.
 * e.g. for player 1 (index 1):
 *   "your_hand"     → "player2_hand"
 *   "opponent_hand"  → "player1_hand"
 *   "stadium"        → "stadium"
 */
export function fromPlayerPerspective(zoneKey: string, playerIndex: PlayerIndex): string {
  if (zoneKey.startsWith('your_')) {
    const suffix = zoneKey.slice('your_'.length);
    return `player${playerIndex + 1}_${suffix}`;
  }
  if (zoneKey.startsWith('opponent_')) {
    const suffix = zoneKey.slice('opponent_'.length);
    const opponentNum = playerIndex === 0 ? 2 : 1;
    return `player${opponentNum}_${suffix}`;
  }
  // Shared zone or already internal — pass through
  return zoneKey;
}
