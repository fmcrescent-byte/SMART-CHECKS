# Smart Check (Crescent Patrol · CBRE) — GitHub Pages + Apps Script

Why: Apps Script pages run in a sandboxed iframe, so the live QR camera is blocked.
GitHub Pages serves the page over HTTPS at top level, so the camera works.
Apps Script stays as the backend (Sheets, Drive photos, PDFs, alerts).

## 1. Apps Script (backend)
1. Open your existing Apps Script project.
2. Replace `Code.gs` with `apps-script/Code.gs`. Keep `Assets.html`. Delete the old `Index.html` (no longer used).
3. Project Settings > tick "Show appsscript.json" and make sure `webapp` is `USER_DEPLOYING` / `ANYONE_ANONYMOUS` (see `apps-script/appsscript.json`).
4. Deploy > Manage deployments > edit (pencil) > Version: New version > Deploy. The /exec URL stays the same.
5. Copy the Web app URL (ends with /exec).

## 2. GitHub (frontend)
1. Create a public repo, e.g. `smart-checks`.
2. Upload: `index.html`, `config.js`, `.nojekyll`, and the `assets/` folder (NOT the apps-script folder).
3. Edit `config.js` and paste the /exec URL as `API_URL`.
4. Repo Settings > Pages > Deploy from branch > `main` / root. Wait ~1 minute.
5. Your app: `https://YOURNAME.github.io/smart-checks/`

## 3. Link them
In `Code.gs` set `FRONTEND_URL = 'https://YOURNAME.github.io/smart-checks/'`, then redeploy a new version.
- New QR posters and checkpoint links use the GitHub address.
- Old printed posters (script URL ?cp=...) show an "Open Smart Check" page that forwards to GitHub.
- Re-generate checkpoint QR links in admin if you want the stored `qrUrl` values updated.

## Test
Open the GitHub URL on a phone > sign in > Scan. Allow camera when asked.
Server check: `<exec URL>?diag=1`
