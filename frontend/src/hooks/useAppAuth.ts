import { prefersNativeAuth } from "../platform";
import { useNativeAuth } from "./useNativeAuth";
import { useTelegramAuth } from "./useTelegramAuth";

export function useAppAuth() {
  const nativeEnabled = prefersNativeAuth();
  const nativeAuth = useNativeAuth({ enabled: nativeEnabled });
  const telegramAuth = useTelegramAuth({ enabled: !nativeEnabled });

  if (nativeEnabled) {
    return {
      ...nativeAuth,
      needsBrowserLogin: false,
      startBrowserLogin: undefined,
    };
  }

  return {
    ...telegramAuth,
    isLinkingTelegram: false,
    needsNativeLogin: false,
    telegramLinkError: null,
    signInWithNativeCredentials: undefined,
    signUpWithNativeCredentials: undefined,
    linkTelegramAccount: undefined,
  };
}