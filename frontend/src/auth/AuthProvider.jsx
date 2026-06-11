/*
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from './supabaseClient';

// Capacitor APIs — safe to import (no-ops on web if Capacitor is absent)
let Browser  = null;
let CapApp   = null;
let Capacitor = null;

try {
  Browser   = (await import('@capacitor/browser')).Browser;
  CapApp    = (await import('@capacitor/app')).App;
  Capacitor = window.Capacitor;
} catch (_) {
  // Running in browser without Capacitor — that's fine
}

const OAUTH_REDIRECT = 'com.vocassistant.app://login-callback';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  // ── Bootstrap: load existing session on mount ────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for auth state changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  // ── Handle deep link on Android after OAuth ───────────────────────────────────
  useEffect(() => {
    if (!CapApp) return; // Web — supabase detects tokens from URL hash automatically

    const handleDeepLink = async ({ url }) => {
      if (!url.includes('login-callback')) return;

      // Close the system browser
      try { await Browser?.close(); } catch (_) {}

      // Extract tokens from the callback URL
      const urlObj      = new URL(url);
      const accessToken  = urlObj.searchParams.get('access_token')
                        || new URLSearchParams(urlObj.hash.slice(1)).get('access_token');
      const refreshToken = urlObj.searchParams.get('refresh_token')
                        || new URLSearchParams(urlObj.hash.slice(1)).get('refresh_token');

      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        if (error) console.error('[AuthProvider] setSession failed:', error.message);
      }
    };

    CapApp.addListener('appUrlOpen', handleDeepLink);
    return () => CapApp.removeAllListeners();
  }, []);

  // ── Sign in with Google ────────────────────────────────────────────────────────
  const signInWithGoogle = useCallback(async () => {
    const isNative = Capacitor?.isNativePlatform?.();

    if (isNative) {
      // Native Android: open system browser with skipBrowserRedirect
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: OAUTH_REDIRECT,
          skipBrowserRedirect: true,
        },
      });
      if (error) { console.error('[Auth] OAuth error:', error.message); return; }
      if (data?.url) await Browser?.open({ url: data.url, presentationStyle: 'popover' });
    } else {
      // Web: standard redirect — supabase handles everything
      await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin },
      });
    }
  }, []);

  // ── Sign out ───────────────────────────────────────────────────────────────────
  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const value = { user, session, loading, signInWithGoogle, signOut };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
*/

