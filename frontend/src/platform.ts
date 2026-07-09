import { Capacitor } from "@capacitor/core";

export function isNativePlatform() {
  return Capacitor.isNativePlatform();
}

export function prefersNativeAuth() {
  return isNativePlatform() || import.meta.env.VITE_ENABLE_NATIVE_AUTH === "true";
}