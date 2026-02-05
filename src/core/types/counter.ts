export interface CounterDefinition {
  id: string;              // "burn", "poison", "10"
  name: string;            // "Burned", "10 Damage"
  imageUrl?: string;       // "/counter-images/pokemon/burn.png"
  category?: string;       // "status", "damage"
  sortOrder?: number;      // Display order within category
}
