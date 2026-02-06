export interface ActionPanelButton {
  id: string;
  label: string;
  sublabel?: string;
  disabled?: boolean;
  tooltip?: string;
}

export interface ActionPanel {
  id: string;
  title: string;
  buttons: ActionPanelButton[];
  emptyMessage?: string;
}
