import { useState } from "react";
import { Loader2, LockKeyhole, Mail, UserRound, UserRoundPlus } from "lucide-react";
import { useLang } from "../i18n/useLang";

type SignInInput = {
  email: string;
  password: string;
};

type SignUpInput = SignInInput & {
  firstName: string;
  lastName: string;
};

interface Props {
  isLoading?: boolean;
  error?: string | null;
  onSignIn?: (payload: SignInInput) => Promise<unknown>;
  onSignUp?: (payload: SignUpInput) => Promise<unknown>;
}

export function NativeAuthCard({ isLoading = false, error, onSignIn, onSignUp }: Props) {
  const { t } = useLang();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setLocalError(null);

    if (mode === "sign-up") {
      if (password !== confirmPassword) {
        setLocalError(t("native_auth.password_mismatch"));
        return;
      }

      if (!onSignUp) {
        return;
      }

      await onSignUp({
        email: email.trim(),
        password,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      });
      return;
    }

    if (!onSignIn) {
      return;
    }

    await onSignIn({
      email: email.trim(),
      password,
    });
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[460px] gap-5 px-4 text-center">
      <div className="w-20 h-20 rounded-3xl bg-maroon-100 dark:bg-maroon-900/30 flex items-center justify-center shadow-card">
        {mode === "sign-in" ? (
          <LockKeyhole className="w-10 h-10 text-maroon-700 dark:text-maroon-300" />
        ) : (
          <UserRoundPlus className="w-10 h-10 text-maroon-700 dark:text-maroon-300" />
        )}
      </div>

      <div className="space-y-2 max-w-md">
        <div className="text-2xl font-bold text-dark-800 dark:text-ivory-100">
          {mode === "sign-in" ? t("native_auth.sign_in_title") : t("native_auth.sign_up_title")}
        </div>
        <div className="text-sm text-dark-600 dark:text-ivory-300">{t("native_auth.subtitle")}</div>
      </div>

      <div className="w-full max-w-md rounded-3xl border border-silver/60 dark:border-dark-600 bg-white dark:bg-dark-800 shadow-card p-5 space-y-3 text-left">
        {mode === "sign-up" && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm text-dark-700 dark:text-ivory-200">
              <span>{t("native_auth.first_name")}</span>
              <div className="flex items-center gap-2 rounded-2xl border border-silver/70 dark:border-dark-600 bg-surface-50 dark:bg-dark-700 px-3 py-3">
                <UserRound className="w-4 h-4 text-dark-500 dark:text-ivory-400" />
                <input
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                  className="w-full bg-transparent outline-none"
                  autoComplete="given-name"
                />
              </div>
            </label>
            <label className="space-y-1 text-sm text-dark-700 dark:text-ivory-200">
              <span>{t("native_auth.last_name")}</span>
              <div className="flex items-center gap-2 rounded-2xl border border-silver/70 dark:border-dark-600 bg-surface-50 dark:bg-dark-700 px-3 py-3">
                <UserRound className="w-4 h-4 text-dark-500 dark:text-ivory-400" />
                <input
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                  className="w-full bg-transparent outline-none"
                  autoComplete="family-name"
                />
              </div>
            </label>
          </div>
        )}

        <label className="space-y-1 text-sm text-dark-700 dark:text-ivory-200 block">
          <span>{t("native_auth.email")}</span>
          <div className="flex items-center gap-2 rounded-2xl border border-silver/70 dark:border-dark-600 bg-surface-50 dark:bg-dark-700 px-3 py-3">
            <Mail className="w-4 h-4 text-dark-500 dark:text-ivory-400" />
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full bg-transparent outline-none"
              autoComplete="email"
            />
          </div>
        </label>

        <label className="space-y-1 text-sm text-dark-700 dark:text-ivory-200 block">
          <span>{t("native_auth.password")}</span>
          <div className="flex items-center gap-2 rounded-2xl border border-silver/70 dark:border-dark-600 bg-surface-50 dark:bg-dark-700 px-3 py-3">
            <LockKeyhole className="w-4 h-4 text-dark-500 dark:text-ivory-400" />
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full bg-transparent outline-none"
              autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
            />
          </div>
        </label>

        {mode === "sign-up" && (
          <label className="space-y-1 text-sm text-dark-700 dark:text-ivory-200 block">
            <span>{t("native_auth.confirm_password")}</span>
            <div className="flex items-center gap-2 rounded-2xl border border-silver/70 dark:border-dark-600 bg-surface-50 dark:bg-dark-700 px-3 py-3">
              <LockKeyhole className="w-4 h-4 text-dark-500 dark:text-ivory-400" />
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="w-full bg-transparent outline-none"
                autoComplete="new-password"
              />
            </div>
          </label>
        )}

        {(localError || error) && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
            {localError || error}
          </div>
        )}

        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={isLoading}
          className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-maroon-700 px-5 py-3 text-sm font-semibold text-white shadow-card transition hover:bg-maroon-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              {t("native_auth.loading")}
            </>
          ) : mode === "sign-in" ? (
            t("native_auth.sign_in_button")
          ) : (
            t("native_auth.sign_up_button")
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            setLocalError(null);
            setMode((prev) => (prev === "sign-in" ? "sign-up" : "sign-in"));
          }}
          className="w-full rounded-2xl border border-silver/70 dark:border-dark-600 px-4 py-3 text-sm font-medium text-dark-700 dark:text-ivory-200 transition hover:bg-surface-50 dark:hover:bg-dark-700"
        >
          {mode === "sign-in" ? t("native_auth.switch_to_sign_up") : t("native_auth.switch_to_sign_in")}
        </button>
      </div>
    </div>
  );
}