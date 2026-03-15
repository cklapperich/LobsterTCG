import { supabase } from './supabase';

export interface SupabaseDeck {
  id: string;
  name: string;
  cards: Record<string, number>;
  strategy: string;
}

export async function saveDeckStrategy(deckId: string, strategy: string): Promise<boolean> {
  const { error } = await supabase
    .from('decks')
    .update({ strategy })
    .eq('id', deckId);
  if (error) {
    console.error('Failed to save deck strategy:', error);
    return false;
  }
  return true;
}

export async function saveDeckToSupabase(
  userId: string,
  tcg: string,
  name: string,
  cards: Record<string, number>,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('decks')
    .insert({ id: crypto.randomUUID(), user_id: userId, TCG: tcg, name, cards, strategy: '' })
    .select('id')
    .single();
  if (error) {
    console.error('Failed to save deck:', error.message, error.details, error.code);
    return null;
  }
  return data.id;
}

export async function updateDeckCards(
  deckId: string,
  name: string,
  cards: Record<string, number>,
): Promise<boolean> {
  const { error } = await supabase
    .from('decks')
    .update({ name, cards })
    .eq('id', deckId);
  if (error) {
    console.error('Failed to update deck:', error);
    return false;
  }
  return true;
}

export async function deleteDeck(deckId: string): Promise<boolean> {
  const { error } = await supabase
    .from('decks')
    .delete()
    .eq('id', deckId);
  if (error) {
    console.error('Failed to delete deck:', error);
    return false;
  }
  return true;
}

export async function loadDecksFromSupabase(userId: string, tcg: string): Promise<SupabaseDeck[]> {
  const { data, error } = await supabase
    .from('decks')
    .select('id, name, cards, strategy')
    .eq('user_id', userId)
    .eq('TCG', tcg);

  if (error) {
    console.error('Failed to load decks from Supabase:', error);
    return [];
  }

  return (data ?? []).map(row => ({
    id: row.id,
    name: row.name,
    cards: row.cards as Record<string, number>,
    strategy: row.strategy ?? '',
  }));
}
