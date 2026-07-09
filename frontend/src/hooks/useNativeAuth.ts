import { useCallback, useEffect, useRef, useState } from "react";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import {
  authenticateWithNativeAccessToken,
  fetchTelegramBrowserAuthChallenge,
  linkTelegramBrowserCode,
  type AuthSession,
  type AuthenticatedUser,
  type TelegramBrowserAuthChallenge,
} from "../api";
import {
  clearAppAuthStorage,
  getLastActiveAt,
  loadStoredAuthSession,
  persistAuthSession,
  setLastActiveAt,
} from "../authStorage";
import {
  getSupabaseSession,
  signInWithEmailPassword,
  signOutSupabaseAuth,
  signUpWithEmailPassword,
} from "../supabase";

type NativeAuthMode = {
  enabled?: boolean;
};

type NativeSignUpInput = {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
};

interface AuthState {
  initData: string;
  user: AuthenticatedUser | null;
  isAuthenticating: boolean;
  isLinkingTelegram: boolean;
  authError: string | null;
  telegramLinkError: string | null;
  token: string | null;
  needsNativeLogin: boolean;
}

const MAX_INACTIVITY_MS = 30 * 24 * 60 * 60 * 1000;
const ACTIVITY_WRITE_THROTTLE_MS = 60 * 1000;
const TELEGRAM_LOGIN_URL = "https://oauth.telegram.org/auth";
const TELEGRAM_NATIVE_LINK_REDIRECT_URI = import.meta.env.VITE_TELEGRAM_NATIVE_LINK_REDIRECT_URI?.trim() || "https://app.oyuns.mn/telegram-link-callback.html";
const TELEGRAM_NATIVE_APP_REDIRECT_URI = "mn.oyuns.app://telegram-auth";

type NativeTelegramLinkResult = {
  code: string;
  codeVerifier: string;
  redirectUri: string;
};

function createSignedOutState(overrides: Partial<AuthState> = {}): AuthState {
  return {
    initData: "",
    user: null,
    isAuthenticating: false,
    isLinkingTelegram: false,
    authError: null,
    telegramLinkError: null,
    token: null,
    needsNativeLogin: false,
    ...overrides,
  };
}

function getReadableError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return fallback;
}

function getStoredLang(): "mn" | "ru" | undefined {
  const stored = localStorage.getItem("oyuns_lang");
  if (stored === "mn" || stored === "ru") {
    return stored;
  }
  return undefined;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function randomBase64Url(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

async function sha256Base64Url(input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return toBase64Url(new Uint8Array(digest));
}

async function createPkcePair(): Promise<{ codeVerifier: string; codeChallenge: string }> {
  const codeVerifier = randomBase64Url(64);
  const codeChallenge = await sha256Base64Url(codeVerifier);
  return { codeVerifier, codeChallenge };
}

function buildNativeTelegramLinkUrl(
  challenge: TelegramBrowserAuthChallenge,
  codeChallenge: string,
  state: string,
): { url: string; redirectUri: string } {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: challenge.client_id,
    redirect_uri: TELEGRAM_NATIVE_LINK_REDIRECT_URI,
    scope: "openid profile",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });
  params.set("nonce", challenge.nonce);

  const lang = getStoredLang();
  if (lang) {
    params.set("lang", lang);
  }

  return {
    url: `${TELEGRAM_LOGIN_URL}?${params.toString()}`,
    redirectUri: TELEGRAM_NATIVE_LINK_REDIRECT_URI,
  };
}

async function openNativeTelegramLinkFlow(challenge: TelegramBrowserAuthChallenge): Promise<NativeTelegramLinkResult> {
  if (!challenge.challenge_token) {
    throw new Error("Telegram link challenge is missing");
  }

  const { codeVerifier, codeChallenge } = await createPkcePair();
  const state = randomBase64Url(24);
  const { url, redirectUri } = buildNativeTelegramLinkUrl(challenge, codeChallenge, state);

  return new Promise(async (resolve, reject) => {
    let settled = false;
    const callbackHandle = await App.addListener("appUrlOpen", ({ url: callbackUrl }) => {
      if (!callbackUrl || !callbackUrl.startsWith(TELEGRAM_NATIVE_APP_REDIRECT_URI)) {
        return;
      }

      const finish = async (result?: NativeTelegramLinkResult, error?: Error) => {
        if (settled) {
          return;
        }

        settled = true;
        await callbackHandle.remove();
        await browserFinishedHandle.remove();
        await Browser.close().catch(() => undefined);

        if (error) {
          reject(error);
          return;
        }

        resolve(result as NativeTelegramLinkResult);
      };

      try {
        const parsed = new URL(callbackUrl);
        const callbackError = parsed.searchParams.get("error");
        if (callbackError) {
          void finish(undefined, new Error(parsed.searchParams.get("error_description") || callbackError));
          return;
        }

        const authCode = parsed.searchParams.get("code");
        const returnedState = parsed.searchParams.get("state");
        if (!authCode) {
          return;
        }
        if (returnedState && returnedState !== state) {
          void finish(undefined, new Error("Telegram link state mismatch"));
          return;
        }

        void finish({
          code: authCode,
          codeVerifier,
          redirectUri,
        });
      } catch (error) {
        void finish(undefined, error instanceof Error ? error : new Error("Invalid Telegram callback URL"));
      }
    });

    const browserFinishedHandle = await Browser.addListener("browserFinished", () => {
      if (settled) {
        return;
      }

      settled = true;
      void callbackHandle.remove();
      void browserFinishedHandle.remove();
      reject(new Error("Telegram login was cancelled. Please try again."));
    });

    await Browser.open({ url });
  });
}

export function useNativeAuth(options?: NativeAuthMode) {
  const enabled = options?.enabled ?? true;
  const lastActivityWriteRef = useRef(0);
  const [state, setState] = useState<AuthState>({
    ...createSignedOutState(),
    isAuthenticating: enabled,
  });

  const touchActivity = useCallback((force = false) => {
    const now = Date.now();
    if (!force && now - lastActivityWriteRef.current < ACTIVITY_WRITE_THROTTLE_MS) {
      return;
    }

    lastActivityWriteRef.current = now;
    void setLastActiveAt(now);
  }, []);

  const applyAuthenticatedState = useCallback(async (authData: AuthSession) => {
    await persistAuthSession(authData);
    setState(
      createSignedOutState({
        user: authData.user,
        token: authData.token,
      }),
    );
    touchActivity(true);
  }, [touchActivity]);

  const requireNativeLogin = useCallback((authError: string | null = null) => {
    setState(
      createSignedOutState({
        authError,
        needsNativeLogin: true,
      }),
    );
  }, []);

  const exchangeSupabaseSession = useCallback(async (accessToken: string) => {
    const authData = await authenticateWithNativeAccessToken(accessToken);
    await applyAuthenticatedState(authData);
    return authData;
  }, [applyAuthenticatedState]);

  const validateStoredToken = useCallback(async (token: string) => {
    const apiBase = import.meta.env.VITE_API_BASE || "/api";
    const response = await fetch(`${apiBase}/me`, {
      headers: { Authorization: `Bearer ${token}` },
      credentials: "same-origin",
    });
    return response.ok;
  }, []);

  useEffect(() => {
    if (!enabled) {
      setState(createSignedOutState());
      return;
    }

    const initAuth = async () => {
      const storedSession = await loadStoredAuthSession();
      if (storedSession?.token && storedSession.user) {
        const lastActiveRaw = await getLastActiveAt();
        const lastActiveAt = lastActiveRaw ? Number(lastActiveRaw) : Date.now();
        if (Number.isFinite(lastActiveAt) && Date.now() - lastActiveAt <= MAX_INACTIVITY_MS) {
          try {
            const isValid = await validateStoredToken(storedSession.token);
            if (isValid) {
              setState(
                createSignedOutState({
                  user: storedSession.user,
                  token: storedSession.token,
                }),
              );
              touchActivity(true);
              return;
            }
          } catch {
            setState(
              createSignedOutState({
                user: storedSession.user,
                token: storedSession.token,
              }),
            );
            touchActivity(true);
            return;
          }
        }

        await clearAppAuthStorage();
      }

      try {
        const { session } = await getSupabaseSession();
        if (session?.access_token) {
          await exchangeSupabaseSession(session.access_token);
          return;
        }
      } catch (error) {
        console.warn("Unable to restore native Supabase session:", error);
      }

      requireNativeLogin();
    };

    void initAuth();
  }, [enabled, exchangeSupabaseSession, requireNativeLogin, touchActivity, validateStoredToken]);

  const signInWithNativeCredentials = useCallback(async (email: string, password: string) => {
    setState((prev) => ({
      ...prev,
      isAuthenticating: true,
      authError: null,
      needsNativeLogin: true,
    }));

    try {
      const { data } = await signInWithEmailPassword(email, password);
      const accessToken = data.session?.access_token;
      if (!accessToken) {
        throw new Error("Native sign-in did not return a valid session.");
      }

      return await exchangeSupabaseSession(accessToken);
    } catch (error) {
      const authError = getReadableError(error, "Unable to sign in with email and password.");
      requireNativeLogin(authError);
      throw error;
    }
  }, [exchangeSupabaseSession, requireNativeLogin]);

  const signUpWithNativeCredentials = useCallback(async (payload: NativeSignUpInput) => {
    setState((prev) => ({
      ...prev,
      isAuthenticating: true,
      authError: null,
      needsNativeLogin: true,
    }));

    try {
      const { data } = await signUpWithEmailPassword(payload);
      const accessToken = data.session?.access_token;
      if (accessToken) {
        return await exchangeSupabaseSession(accessToken);
      }

      requireNativeLogin("Account created. Confirm your email, then sign in.");
      return null;
    } catch (error) {
      const authError = getReadableError(error, "Unable to create a native account.");
      requireNativeLogin(authError);
      throw error;
    }
  }, [exchangeSupabaseSession, requireNativeLogin]);

  const linkTelegramAccount = useCallback(async () => {
    setState((prev) => ({
      ...prev,
      isLinkingTelegram: true,
      telegramLinkError: null,
    }));

    try {
      const challenge = await fetchTelegramBrowserAuthChallenge();
      const callbackData = await openNativeTelegramLinkFlow(challenge);
      const authData = await linkTelegramBrowserCode({
        code: callbackData.code,
        code_verifier: callbackData.codeVerifier,
        redirect_uri: callbackData.redirectUri,
        challenge_token: challenge.challenge_token || "",
      });
      await applyAuthenticatedState(authData);
      return authData;
    } catch (error) {
      setState((prev) => ({
        ...prev,
        isLinkingTelegram: false,
        telegramLinkError: getReadableError(error, "Unable to link the Telegram account right now."),
      }));
      return null;
    }
  }, [applyAuthenticatedState]);

  const clearAuthInternal = useCallback(async () => {
    await signOutSupabaseAuth().catch(() => undefined);
    await clearAppAuthStorage();
    requireNativeLogin();
  }, [requireNativeLogin]);

  const clearAuth = useCallback(() => {
    void clearAuthInternal();
  }, [clearAuthInternal]);

  useEffect(() => {
    if (!enabled || !state.token) {
      return;
    }

    const onActivity = () => touchActivity();
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        touchActivity();
      }
    };

    window.addEventListener("click", onActivity);
    window.addEventListener("keydown", onActivity);
    window.addEventListener("touchstart", onActivity);
    window.addEventListener("mousemove", onActivity);
    document.addEventListener("visibilitychange", onVisibility);

    touchActivity(true);

    return () => {
      window.removeEventListener("click", onActivity);
      window.removeEventListener("keydown", onActivity);
      window.removeEventListener("touchstart", onActivity);
      window.removeEventListener("mousemove", onActivity);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled, state.token, touchActivity]);

  const refreshAuthInternal = useCallback(async () => {
    const storedSession = await loadStoredAuthSession();
    if (storedSession?.token) {
      try {
        const isValid = await validateStoredToken(storedSession.token);
        if (isValid) {
          setState(
            createSignedOutState({
              user: storedSession.user,
              token: storedSession.token,
            }),
          );
          touchActivity(true);
          return;
        }
      } catch {
        setState(
          createSignedOutState({
            user: storedSession.user,
            token: storedSession.token,
          }),
        );
        touchActivity(true);
        return;
      }
    }

    const { session } = await getSupabaseSession();
    if (session?.access_token) {
      await exchangeSupabaseSession(session.access_token);
      return;
    }

    await clearAuthInternal();
  }, [clearAuthInternal, exchangeSupabaseSession, touchActivity, validateStoredToken]);

  const refreshAuth = useCallback(() => {
    if (!enabled) {
      return;
    }

    setState((prev) => ({ ...prev, isAuthenticating: true }));
    void refreshAuthInternal().catch((error) => {
      console.error("Native auth refresh failed:", error);
      requireNativeLogin(getReadableError(error, "Session expired. Sign in again."));
    });
  }, [enabled, refreshAuthInternal, requireNativeLogin]);

  return {
    initData: state.initData,
    user: state.user,
    isAuthenticating: state.isAuthenticating,
    isLinkingTelegram: state.isLinkingTelegram,
    authError: state.authError,
    telegramLinkError: state.telegramLinkError,
    token: state.token,
    needsNativeLogin: state.needsNativeLogin,
    clearAuth,
    refreshAuth,
    signInWithNativeCredentials,
    signUpWithNativeCredentials,
    linkTelegramAccount,
  };
}