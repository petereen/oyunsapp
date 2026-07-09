import { Preferences } from "@capacitor/preferences";
import type { AuthSession } from "./api";
import { isNativePlatform } from "./platform";

export const JWT_STORAGE_KEY = "oyuns_jwt_v2";
export const USER_STORAGE_KEY = "oyuns_user_v2";
export const INIT_DATA_STORAGE_KEY = "oyuns_init_data_v2";
export const LAST_ACTIVE_AT_STORAGE_KEY = "oyuns_last_active_at_v1";

async function getValue(key: string) {
  if (!isNativePlatform()) {
    return localStorage.getItem(key);
  }

  const { value } = await Preferences.get({ key });
  if (value === null) {
    localStorage.removeItem(key);
    return null;
  }

  localStorage.setItem(key, value);
  return value;
}

async function setValue(key: string, value: string) {
  if (isNativePlatform()) {
    await Preferences.set({ key, value });
  }
  localStorage.setItem(key, value);
}

async function removeValue(key: string) {
  if (isNativePlatform()) {
    await Preferences.remove({ key });
  }
  localStorage.removeItem(key);
}

export async function clearAppAuthStorage() {
  await Promise.all([
    removeValue(JWT_STORAGE_KEY),
    removeValue(USER_STORAGE_KEY),
    removeValue(INIT_DATA_STORAGE_KEY),
    removeValue(LAST_ACTIVE_AT_STORAGE_KEY),
  ]);
}

export async function loadStoredAuthSession(): Promise<AuthSession | null> {
  const [token, rawUser] = await Promise.all([
    getValue(JWT_STORAGE_KEY),
    getValue(USER_STORAGE_KEY),
  ]);

  if (!token || !rawUser) {
    return null;
  }

  try {
    return {
      token,
      user: JSON.parse(rawUser),
    };
  } catch {
    await clearAppAuthStorage();
    return null;
  }
}

export async function persistAuthSession(authData: AuthSession, initData = "") {
  const writes = [
    setValue(JWT_STORAGE_KEY, authData.token),
    setValue(USER_STORAGE_KEY, JSON.stringify(authData.user)),
  ];

  if (initData && !initData.startsWith("dev_mode_bypass")) {
    writes.push(setValue(INIT_DATA_STORAGE_KEY, initData));
  }

  await Promise.all(writes);
}

export async function getLastActiveAt() {
  return getValue(LAST_ACTIVE_AT_STORAGE_KEY);
}

export async function setLastActiveAt(timestamp: number) {
  await setValue(LAST_ACTIVE_AT_STORAGE_KEY, String(timestamp));
}