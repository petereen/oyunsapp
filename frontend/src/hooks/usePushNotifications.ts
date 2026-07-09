import { useCallback, useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { registerPushDevice, unregisterPushDevice } from "../api";
import { isNativePlatform } from "../platform";

export function usePushNotifications(userId?: number) {
  const tokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!userId || !isNativePlatform()) {
      return;
    }

    let cancelled = false;

    const setupPush = async () => {
      let permission = await PushNotifications.checkPermissions();
      if (permission.receive === "prompt") {
        permission = await PushNotifications.requestPermissions();
      }

      if (permission.receive !== "granted") {
        console.warn("Push notification permission not granted");
        return;
      }

      await PushNotifications.addListener("registration", (token) => {
        if (cancelled) {
          return;
        }

        tokenRef.current = token.value;
        const platform = Capacitor.getPlatform();
        if (platform !== "android" && platform !== "ios") {
          return;
        }

        void registerPushDevice({
          token: token.value,
          platform,
          locale: navigator.language,
        }).catch((error) => {
          console.error("Failed to register push token", error);
        });
      });

      await PushNotifications.addListener("registrationError", (error) => {
        console.error("Push registration failed", error);
      });

      await PushNotifications.register();
    };

    void setupPush();

    return () => {
      cancelled = true;
      void PushNotifications.removeAllListeners();
    };
  }, [userId]);

  const unregisterCurrentDevice = useCallback(async () => {
    if (!tokenRef.current) {
      return;
    }

    await unregisterPushDevice({ token: tokenRef.current });
  }, []);

  return {
    unregisterCurrentDevice,
  };
}