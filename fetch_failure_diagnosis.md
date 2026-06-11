# VocaFlow APK — "Failed to Fetch" Root Cause Analysis

## The Core Problem: CORS Mismatch

This is **almost certainly** a CORS rejection, not a network connectivity problem.

### How Capacitor serves pages on Android

When Capacitor runs on Android with `"androidScheme": "https"`, the WebView
loads your React app from:

```
https://localhost
```

That is the origin Android's WebView reports to your backend when making
`fetch()` requests. It is **not** `capacitor://localhost` — that was the old
Capacitor 3 behaviour. Capacitor 5+ uses `https://localhost` by default.

### What your backend CORS allows

Your `backend/main.py` has this hardcoded allow-list:

```python
_allowed_origins = [
    "http://localhost:5173",
    "http://localhost",
    "capacitor://localhost",       # ← old Capacitor 3 origin
    "http://192.168.1.5:5173",
    "http://192.168.1.5"
]
```

**`https://localhost` is NOT in this list.**

So when the APK makes a `fetch()` to `https://voca-8vwu.onrender.com/schedules/...`,
the browser pre-flight `OPTIONS` request arrives with:

```
Origin: https://localhost
```

Render's hosted FastAPI responds:
```
HTTP 400 Bad Request  (or the browser blocks the response due to missing CORS header)
```

The browser silently turns this into a **"Failed to fetch"** error — exactly what you see.

---

## Why It Works in Browser but Not the App

| Environment | Origin sent | In allow-list? | Result |
|---|---|---|---|
| Chrome on your laptop | `http://localhost:5173` | ✅ Yes | Works |
| Vercel deployed web | `https://voca-....vercel.app` | ✅ (via CLIENT_URL env) | Works |
| Android APK (Capacitor) | `https://localhost` | ❌ **No** | **BLOCKED** |

---

## Should You Change the Architecture? No.

You do **not** need to:
- Replace Supabase ❌
- Change FastAPI ❌
- Change the frontend service layer ❌

You only need **one backend fix** and **one optional improvement**.

---

## Fix 1 — Add `https://localhost` to Backend CORS (Required)

Edit `backend/main.py` and add `https://localhost` to the allowed origins list.
Also add a `CLIENT_URL` env var on Render pointing to your Vercel URL so the
web deploy works too.

### Change in `backend/main.py`

```diff
 _allowed_origins = [
     "http://localhost:5173",
     "http://localhost",
+    "https://localhost",           # Capacitor 5+ Android WebView origin
     "capacitor://localhost",       # keep for backward compatibility
     "http://192.168.1.5:5173",
     "http://192.168.1.5",
 ]
```

### Add Render env var

In Render Dashboard → your backend service → Environment:
```
CLIENT_URL = https://<your-vercel-domain>.vercel.app
```

---

## Fix 2 — Wildcard CORS as a Temporary Debug Option

If you want to confirm CORS is the issue quickly **before** deploying to Render,
temporarily change the backend to allow all origins:

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],        # ← temporary test only
    allow_credentials=False,    # must be False when using *
    allow_methods=["*"],
    allow_headers=["*"],
)
```

> [!WARNING]
> Do NOT leave `allow_origins=["*"]` in production. It exposes your API to
> any website. Revert to the specific list after confirming the issue.

---

## Secondary Issues (Won't Fix "Failed to Fetch" but will cause problems)

| Issue | Impact | Fix |
|---|---|---|
| Render free tier **spins down after 15 min** of inactivity | First request after idle takes 30–60 s to respond — looks like a fetch failure | Upgrade to paid Render tier, or add a keep-alive ping |
| `usesCleartextTraffic="true"` in Manifest | Allows HTTP but since you're using HTTPS Render URLs this doesn't block anything | Safe to leave for now |
| No error message shown to user | The app shows nothing on failure — user has no idea if it's a network problem | Add a visible error state in TodayView |

---

## Action Plan

### Step 1 — Fix backend (2 minutes)
Add `"https://localhost"` to `_allowed_origins` in `backend/main.py`
and push/deploy to Render.

### Step 2 — Set CLIENT_URL on Render (1 minute)
Add `CLIENT_URL=https://your-vercel-url.vercel.app` as an env var on the
Render backend service so the web version is also covered.

### Step 3 — Rebuild APK (no code change needed, backend change is server-side)
Since this is a backend-only fix you don't need a new APK — just redeploy
the backend on Render and the existing APK will start working.

### Step 4 — Test
Install the current `app-debug.apk` and try loading the schedule.
It should now work without any APK rebuild.
