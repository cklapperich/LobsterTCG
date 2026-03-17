/**
 * Board widgets — small UI elements anchored to playmat slots.
 * Used for per-player displays like Pokemon Pocket's energy zone.
 */

export interface BoardWidgetItem {
  id: string;
  imageUrl: string | null;
  label?: string;
  counterId?: string;       // if set, item is draggable as this counter type
  disabled?: boolean;       // greyed out (e.g. already attached)
  dimmed?: boolean;         // visual-only preview (e.g. next energy)
}

export interface BoardWidget {
  id: string;
  slotId: string;                        // which playmat slot to anchor to
  position: 'above' | 'below';          // render above or below the slot's zone
  items: BoardWidgetItem[];
}
