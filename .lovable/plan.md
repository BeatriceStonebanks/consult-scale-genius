## What to try right now

1. **Reset the shared password secret**
   - The app currently has both required secrets configured: `SITE_PASSWORD` and `SESSION_SECRET`.
   - Because secret values are hidden, we can’t view the current password, but we can open the secure reset form so you can set a new one.
   - After resetting, use the new password on `/unlock`.

2. **Use a fresh browser session**
   - Open the preview in an incognito/private window or clear site data for the preview URL.
   - This avoids stale cookies from the previous reverted versions interfering with the gate.

3. **If reset still fails, add a temporary owner recovery bypass**
   - Add a short-lived `/unlock` recovery option that can be removed after you regain access.
   - Keep protected content gated; the bypass would only be for your project preview recovery path.

## What I recommend

Start with **resetting `SITE_PASSWORD`**, because the current code is checking that server-side secret and the secret survived the version revert. If you want, approve this plan and I’ll open the secure password reset form for you.

## Technical notes

- `/unlock` calls the `unlockSite` server function.
- `unlockSite` compares the typed password against the server-only `SITE_PASSWORD` secret.
- Successful unlock stores a 7-day encrypted session using `SESSION_SECRET`.
- Both required secrets exist, so this is most likely a mismatched password or stale browser session rather than missing backend configuration.