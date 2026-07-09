# Android Push Notification Setup

## What Already Exists

The repo already has the client-side token registration foundation in place:

- Capacitor Push Notifications plugin is installed in [frontend/package.json](frontend/package.json).
- Android native project is generated under [frontend/android](frontend/android).
- Android Gradle already includes Google Services in [frontend/android/build.gradle](frontend/android/build.gradle).
- The Android app conditionally applies the Google Services plugin when `google-services.json` exists in [frontend/android/app/build.gradle](frontend/android/app/build.gradle).
- Native device-token registration is implemented in [frontend/src/hooks/usePushNotifications.ts](frontend/src/hooks/usePushNotifications.ts).
- Registered tokens are stored by the backend through [backend/main.py](backend/main.py).
- The database table for tokens is defined in [database/add_push_device_tokens.sql](database/add_push_device_tokens.sql).

What is not implemented yet is the actual server-side dispatch to Firebase Cloud Messaging.

## 1. Configure Android Firebase Project

1. Open Firebase Console and create or choose a project.
2. Add an Android app with package name `mn.oyuns.app`.
3. Download `google-services.json`.
4. Place it at [frontend/android/app](frontend/android/app).
   The final file path should be `frontend/android/app/google-services.json`.
5. Open [frontend/android](frontend/android) in Android Studio and let Gradle sync.

Why this works with the current codebase:

- [frontend/android/build.gradle](frontend/android/build.gradle) already includes `classpath 'com.google.gms:google-services:4.4.2'`.
- [frontend/android/app/build.gradle](frontend/android/app/build.gradle) already checks for `google-services.json` and applies `com.google.gms.google-services` automatically.

## 2. Verify Client Registration on Android

After placing `google-services.json`:

1. Build and run the Android app from [frontend/android](frontend/android).
2. Sign in to the app.
3. Grant notification permission when prompted.
4. Confirm the app reaches the push registration flow in [frontend/src/hooks/usePushNotifications.ts](frontend/src/hooks/usePushNotifications.ts).
5. Check Supabase for rows in `push_device_tokens`.

Expected result:

- `user_id` should match the authenticated app user.
- `platform` should be `android`.
- `token` should contain a valid FCM registration token.
- `is_active` should be `true`.

## 3. Service Account for Server Dispatch

For backend notification sending, use Firebase Cloud Messaging HTTP v1.

Create a Firebase service account:

1. In Firebase Console, open Project Settings.
2. Open the Service Accounts tab.
3. Generate a new private key JSON file.
4. Store the file securely on the backend host.

Recommended backend environment variables:

```env
FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_SERVICE_ACCOUNT_FILE=/secure/path/firebase-service-account.json
```

Alternative if you prefer JSON in env:

```env
FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_SERVICE_ACCOUNT_JSON={...full-json...}
```

Use one source only. File-based config is simpler and safer on a VPS.

## 4. Python Dependencies for Dispatch

The backend already uses `requests`, but for FCM v1 OAuth you should add Google auth libraries.

Recommended packages:

```txt
google-auth
google-auth-httplib2
```

If you want a minimal implementation, `google-auth` plus `requests` is enough.

## 5. Recommended Backend Dispatch Flow

Create a dedicated backend helper, for example in a new file such as `backend/push.py`.

The flow should be:

1. Load Firebase service account credentials.
2. Request an OAuth access token with scope:

```text
https://www.googleapis.com/auth/firebase.messaging
```

3. Query `push_device_tokens` for active Android tokens of the target user.
4. Send one FCM HTTP v1 request per token.
5. If Firebase returns `UNREGISTERED` or invalid-token errors, mark that token inactive in `push_device_tokens`.

### Query Pattern

For a single user:

```sql
SELECT token
FROM push_device_tokens
WHERE user_id = :user_id
  AND platform = 'android'
  AND is_active = true;
```

### Recommended FCM Endpoint

```text
https://fcm.googleapis.com/v1/projects/{FIREBASE_PROJECT_ID}/messages:send
```

### Minimal Python Example

```python
import json
import requests
from google.oauth2 import service_account
from google.auth.transport.requests import Request

FCM_SCOPE = ["https://www.googleapis.com/auth/firebase.messaging"]


def get_firebase_access_token(service_account_file: str) -> str:
    credentials = service_account.Credentials.from_service_account_file(
        service_account_file,
        scopes=FCM_SCOPE,
    )
    credentials.refresh(Request())
    return credentials.token


def send_android_push(project_id: str, access_token: str, device_token: str, title: str, body: str, data: dict | None = None):
    url = f"https://fcm.googleapis.com/v1/projects/{project_id}/messages:send"
    payload = {
        "message": {
            "token": device_token,
            "notification": {
                "title": title,
                "body": body,
            },
            "data": {k: str(v) for k, v in (data or {}).items()},
            "android": {
                "priority": "high",
                "notification": {
                    "channel_id": "oyuns_updates",
                    "sound": "default",
                },
            },
        }
    }
    response = requests.post(
        url,
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        },
        data=json.dumps(payload),
        timeout=10,
    )
    return response.status_code, response.text
```

## 6. Where to Call Dispatch in This Backend

Good first notification events in [backend/main.py](backend/main.py):

1. KYC approved / rejected.
2. Transaction status changed to completed or rejected.
3. Fuel order approved, completed, or rejected.

Practical rollout order:

1. Add one helper that sends a push by `user_id`.
2. Start with transaction completion and rejection.
3. Add KYC approval/rejection.
4. Add fuel-order updates.

That matches the highest-value events already being sent through Telegram helpers.

## 7. Token Cleanup Rules

When FCM responds with invalid-token style errors:

- `UNREGISTERED`
- invalid registration token
- malformed token

Update that row in `push_device_tokens`:

```sql
UPDATE push_device_tokens
SET is_active = false,
    updated_at = NOW()
WHERE token = :token;
```

Do not delete immediately. Keeping the row inactive is more useful for debugging.

## 8. Android Test Checklist

1. `google-services.json` exists at [frontend/android/app](frontend/android/app).
2. The app builds in Android Studio.
3. Login succeeds in the mobile app.
4. `push_device_tokens` receives an Android token row.
5. A manual backend test against that token reaches FCM successfully.
6. A real notification appears on the device while the app is backgrounded.
7. Invalid tokens are deactivated automatically after delivery failures.

## 9. Notes About the Current Repo State

Current status after the recent mobile work:

- Token registration is implemented.
- Android native project is scaffolded.
- Firebase client config is not yet committed because `google-services.json` should stay local or in secure CI secrets.
- Server-side push delivery helper is not yet implemented in Python.

This means the next concrete coding step is not more Android client work. It is a backend sender helper plus secure Firebase credential setup.