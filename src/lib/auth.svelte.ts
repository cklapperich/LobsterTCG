import { supabase } from './supabase';
import type { User, Session } from '@supabase/supabase-js';

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  error: string | null;
}

export const authState: AuthState = $state({
  user: null,
  session: null,
  loading: true,
  error: null,
});

// Initialize session on module load
supabase.auth.getSession().then(({ data, error }) => {
  authState.user = data.session?.user ?? null;
  authState.session = data.session;
  authState.loading = false;
  if (error) authState.error = error.message;
});

// Listen for auth state changes
$effect.root(() => {
  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
    authState.user = session?.user ?? null;
    authState.session = session;
    authState.loading = false;
    authState.error = null;
  });

  return () => subscription.unsubscribe();
});

export async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin },
  });
  if (error) authState.error = error.message;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  if (error) authState.error = error.message;
}
