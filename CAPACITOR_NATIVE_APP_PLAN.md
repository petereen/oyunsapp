# Capacitor Native App Plan

## Goal

Ship individual Android and iOS apps with minimal effort by reusing the existing React/Vite frontend and FastAPI backend, while replacing Telegram-first login with native-feeling auth and preserving legacy Telegram-linked accounts.

## Recommended Approach

Use Capacitor as the native shell for the existing frontend in [frontend](frontend).

Why this is the best minimal-effort path:

- The current app is already a Vite + React SPA with API-based backend access.
- Most business logic, onboarding, KYC, uploads, and admin review flows already live in the shared web app and backend.
- Capacitor lets the team keep one UI codebase and add only the native pieces that are actually needed.
- A Flutter or React Native rewrite would increase cost and delay without solving the core migration problem, which is identity and notifications rather than UI rendering.

## Current Architecture Summary

Based on [ARCHITECTURE.MD](ARCHITECTURE.MD):

- The frontend is a React 18 + TypeScript + Vite single-page app.
- The backend is a FastAPI monolith handling auth, transactions, profile data, uploads, KYC, gifts, fuel, and admin tools.
- Authentication today is centered on Telegram Mini App auth and Telegram browser login.
- User-facing registration and KYC flows already exist and are mostly reusable.
- File uploads already use backend-generated presigned URLs, which is compatible with mobile.
- Notifications currently rely on Telegram rather than native push.

## Product Direction Confirmed

The native app plan assumes these decisions:

- Android and iOS apps are separate native packages, but share the same frontend codebase through Capacitor.
- Native onboarding should feel like a real app, not just a wrapped Telegram Mini App.
- Users should sign in with email and password.
- Phone number should be collected during onboarding, but SMS OTP is not required in v1.
- Telegram should still be used to link and recover existing legacy accounts.
- Push notifications should be included in the internal-test build.
- Initial target is internal testing / TestFlight / closed testing, not immediate public release.

## Why a Pure Web Wrapper Is Not Enough

Capacitor remains the correct base, but a thin wrapper alone does not satisfy the product requirements.

The main blockers are:

- The current auth flow assumes every user starts from Telegram.
- Existing user identity is tightly coupled to Telegram IDs.
- Native push notifications do not exist yet.
- Native users need their own login flow before optional Telegram linking.

Because of that, the real minimal solution is:

- Keep the existing shared frontend.
- Keep the existing backend and data model where possible.
- Add a native auth layer.
- Add an account-linking layer for legacy Telegram users.
- Add push notification support.

## Phase Plan

### Phase 1: Add Capacitor Shell

Add Capacitor to the frontend and build Android and iOS shells around the existing app.

Scope:

- Add `@capacitor/core`, `@capacitor/cli`, `@capacitor/android`, and `@capacitor/ios`.
- Add `@capacitor/app`, `@capacitor/browser`, `@capacitor/preferences`, and `@capacitor/push-notifications`.
- Build the current Vite bundle locally into the native shells.
- Point mobile builds directly to the deployed backend API using `VITE_API_BASE=https://app.oyuns.mn/api`.

Result:

- One shared UI codebase continues to power web and native.
- Mobile builds no longer depend on Nginx `/api` proxy behavior.

### Phase 2: Separate Session Logic from Telegram Logic

Refactor the current auth bootstrap so session management is provider-agnostic.

Main targets:

- [frontend/src/hooks/useTelegramAuth.ts](frontend/src/hooks/useTelegramAuth.ts)
- [frontend/src/api.ts](frontend/src/api.ts)

Work:

- Keep JWT handling and API interceptors.
- Move mobile persistence from `localStorage` to Capacitor Preferences.
- Split Telegram-specific auth behavior from generic signed-in session behavior.

Result:

- Web and mobile can share session behavior while using different login sources.

### Phase 3: Add Native Email/Password Login

Use Supabase Auth for standalone native login.

Reason:

- The project already uses Supabase Auth for email OTP verification in [frontend/src/components/EmailVerificationModal.tsx](frontend/src/components/EmailVerificationModal.tsx).
- Reusing Supabase reduces new infrastructure work.

Frontend work:

- Extend [frontend/src/supabase.ts](frontend/src/supabase.ts) for sign-up, sign-in, sign-out, and session retrieval.
- Add native onboarding screens for email/password login.

Backend work:

- Add a new auth exchange endpoint in [backend/main.py](backend/main.py).
- The endpoint should validate a Supabase access token and issue the same app JWT currently used by API routes.

Result:

- Native users can authenticate without Telegram.
- The rest of the backend can continue using the existing JWT model.

### Phase 4: Decouple User Identity from Telegram ID

This is the most important backend change.

Current issue:

- The system effectively treats Telegram user IDs as primary identity.

Required change:

- Preserve the current integer `users.id` as the canonical internal app user ID.
- Add identity-link support so a user can have:
  - email/password identity
  - optional Telegram-linked identity
- Stop assuming every authenticated user is a Telegram user.

Likely storage changes:

- Add a mapping table or linked identity fields via SQL migrations under [database](database).
- Add push token storage for devices.

Result:

- Existing Telegram users remain valid.
- New native users can exist before linking Telegram.

### Phase 5: Add Telegram Linking After Login

After email/password login, show a dedicated account-link screen.

Desired UX:

- Primary action: link Telegram to preserve old account.
- Secondary action: subtle skip button for new users.

Implementation:

- Reuse the existing Telegram browser auth flow in [backend/main.py](backend/main.py).
- Open the Telegram flow with Capacitor Browser.
- Handle callback/deep-link return through Capacitor App URL handling.

Linking behavior:

- If Telegram matches an old legacy account, merge or reattach the session to that account.
- If the user is new, linking simply attaches Telegram to the current native account.

Result:

- Returning users keep their old history and balances.
- New users are not blocked by Telegram.

### Phase 6: Reuse Existing Registration and KYC Flows

Most onboarding after login can be reused with minor adaptation.

Reusable backend flows:

- `POST /api/register-basic`
- `POST /api/register`
- `POST /api/update-bank-info`
- existing `/api/me` profile flow

Reusable frontend surfaces:

- [frontend/src/components/QuickRegistrationModal.tsx](frontend/src/components/QuickRegistrationModal.tsx)
- [frontend/src/components/RegistrationModal.tsx](frontend/src/components/RegistrationModal.tsx)
- [frontend/src/pages/ProfilePage.tsx](frontend/src/pages/ProfilePage.tsx)

Change needed:

- For native email/password users, email is already known from login.
- The onboarding order becomes:
  1. create account
  2. collect profile basics and phone number
  3. optionally link Telegram
  4. complete KYC when needed

Result:

- The team avoids rebuilding profile and KYC flows from scratch.

### Phase 7: Add Push Notifications

Push is required for the native test build.

Current state:

- User and admin notifications are sent through Telegram helpers in [backend/telegram.py](backend/telegram.py).

Required change:

- Add device token registration from the mobile app.
- Store push tokens in the backend.
- Add a notification abstraction so key events can send native push.
- Keep Telegram notifications running in parallel during migration.

Suggested first push scope:

- registration approved / rejected
- transaction status changed
- fuel order status changed

Result:

- Native users receive app notifications without relying on Telegram chat delivery.

### Phase 8: Mobile UX Boundaries for v1

Keep v1 narrow.

Included:

- customer-facing mobile app
- native login
- Telegram account linking
- push notifications
- reused KYC and upload flows

Explicitly out of scope for v1:

- native admin app
- full offline-first mode
- complete camera/file-upload rewrite unless testing proves it is necessary
- large-scale backend domain refactor

Result:

- Delivery stays focused on the customer app and internal testing.

## Recommended Technical Choices

### Mobile Framework

Recommended: Capacitor

Not recommended for v1:

- Flutter rewrite
- React Native rewrite
- separate native implementations

### Auth Strategy

Recommended:

- Supabase email/password for primary native login
- backend-issued app JWT for API access
- Telegram browser auth reused only for linking legacy accounts

### Phone Strategy

Recommended for v1:

- collect phone number during onboarding
- do not require SMS OTP yet

Reason:

- lower cost
- fewer provider dependencies
- faster rollout

### Notifications Strategy

Recommended:

- add native push for mobile users
- keep Telegram notifications in parallel during migration

## Main Risks

### Identity Migration Risk

The biggest technical risk is preserving legacy users without corrupting account ownership.

Mitigation:

- keep current `users.id` stable
- add linked identity support instead of replacing the whole model
- make Telegram linking explicit and test it early

### Auth Complexity Risk

Trying to keep Telegram-first and native-first logic mixed in one hook will create fragile behavior.

Mitigation:

- split session management from Telegram integration early

### Notification Gap Risk

If push is postponed too long, the mobile app will feel incomplete.

Mitigation:

- deliver a narrow push scope in the first internal build

## Suggested File Anchors

Frontend:

- [frontend/src/App.tsx](frontend/src/App.tsx)
- [frontend/src/api.ts](frontend/src/api.ts)
- [frontend/src/hooks/useTelegramAuth.ts](frontend/src/hooks/useTelegramAuth.ts)
- [frontend/src/supabase.ts](frontend/src/supabase.ts)
- [frontend/src/components/QuickRegistrationModal.tsx](frontend/src/components/QuickRegistrationModal.tsx)
- [frontend/src/components/RegistrationModal.tsx](frontend/src/components/RegistrationModal.tsx)
- [frontend/src/components/EmailVerificationModal.tsx](frontend/src/components/EmailVerificationModal.tsx)

Backend:

- [backend/main.py](backend/main.py)
- [backend/models.py](backend/models.py)
- [backend/utils.py](backend/utils.py)
- [backend/telegram.py](backend/telegram.py)

Database:

- [database](database)

Architecture reference:

- [ARCHITECTURE.MD](ARCHITECTURE.MD)

## Validation Checklist

Before expanding scope, validate these on real devices:

1. Native app boots correctly with Capacitor on Android and iOS.
2. Email/password sign-up and sign-in work.
3. Backend token exchange returns the existing JWT format.
4. Returning users can link Telegram and recover their old account.
5. New users can skip linking and still complete onboarding.
6. Basic registration, KYC, and presigned uploads still work.
7. Push notifications are delivered for at least the first critical status changes.
8. Existing web and Telegram-based flows still work during migration.

## Final Recommendation

Build the native apps with Capacitor, but do not treat them as simple wrappers.

The lowest-effort successful plan is:

- keep the current shared frontend
- keep the current backend APIs where possible
- add Supabase email/password auth for native users
- issue the same backend JWT after auth
- add Telegram account linking for legacy-user recovery
- add push notifications for mobile
- reuse the existing registration and KYC flows instead of rebuilding them

This gives individual Android and iOS apps with minimal rewrite, while still meeting the requirement for native-feeling login and preserving existing Telegram-based users.