// Game log store - manages log entries across components

export const gameLogStore = $state<{ entries: string[] }>({ entries: [] });

export function addLogEntry(message: string): void {
  gameLogStore.entries = [...gameLogStore.entries, message];
}

export function clearLog(): void {
  gameLogStore.entries = [];
}

export function resetLog(initialMessage?: string): void {
  gameLogStore.entries = initialMessage ? [initialMessage] : [];
}
