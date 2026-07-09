import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;
let authClient: SupabaseClient | null = null;

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() || "";
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() || "";

export function isSupabaseAuthConfigured() {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

export function getSupabaseBrowserClient() {
  if (!isSupabaseAuthConfigured()) {
    throw new Error("Supabase authentication is not configured.");
  }

  if (!browserClient) {
    browserClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }

  return browserClient;
}

export function getSupabaseAuthClient() {
  if (!isSupabaseAuthConfigured()) {
    throw new Error("Supabase authentication is not configured.");
  }

  if (!authClient) {
    authClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
  }

  return authClient;
}

export async function getSupabaseSession() {
  const client = getSupabaseAuthClient();
  const { data, error } = await client.auth.getSession();
  if (error) {
    throw error;
  }
  return data;
}

export async function signInWithEmailPassword(email: string, password: string) {
  const client = getSupabaseAuthClient();
  const result = await client.auth.signInWithPassword({ email, password });
  if (result.error) {
    throw result.error;
  }
  return result;
}

export async function signUpWithEmailPassword(payload: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}) {
  const client = getSupabaseAuthClient();
  const result = await client.auth.signUp({
    email: payload.email,
    password: payload.password,
    options: {
      data: {
        first_name: payload.firstName,
        last_name: payload.lastName,
        full_name: `${payload.firstName} ${payload.lastName}`.trim(),
      },
    },
  });

  if (result.error) {
    throw result.error;
  }

  return result;
}

export async function signOutSupabaseAuth() {
  const client = getSupabaseAuthClient();
  const { error } = await client.auth.signOut();
  if (error) {
    throw error;
  }
}