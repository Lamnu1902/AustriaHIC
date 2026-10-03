# Alpenglow

A recently captured nature photo from **Austria** and one from **elsewhere in Europe**, refreshed automatically every 6 hours. Static site on GitHub Pages, updated by GitHub Actions. No server and no build step.

```
.github/workflows/update-photos.yml   ← runs every 6h: fetch → commit → deploy
scripts/fetch-photos.mjs              ← picks the photos, writes site/data/photos.json
scripts/lib/commons.mjs               ← Wikimedia Commons source (no key needed)
scripts/lib/unsplash.mjs              ← Unsplash source (optional, ranks by likes)
scripts/lib/core.mjs                  ← regions, date parsing, ranking & rotation
site/                                 ← the website (index.html, styles.css, app.js)
```

## How photos are chosen

| Source | When it's used | Recent means | Ranked by |
|---|---|---|---|
| **Unsplash** | If an `UNSPLASH_ACCESS_KEY` secret is set | Uploaded ≤ 7 days ago | **Likes** (+10 if an Unsplash editor promoted it) |
| **Wikimedia Commons** | Always available; fallback if Unsplash fails | **Captured** ≤ 7 days ago (EXIF date) | Curation status (Featured / Quality / Valued image), resolution, landscape keywords, freshness |

- If nothing qualifies in 7 days, the window widens to 14 days, then 30.
- Only landscape-format images ≥ 2400 px wide get in. Photos of graves, churches, streets, trains, specimens and similar are filtered out.
- Each 6-hour run shows the **next photo from the top 4**, with at most one photo per photographer. The page changes every run, and the rest of the shortlist appears as thumbnails you can click.
- If every source fails, the previous photo is kept.

> **Tip:** Commons works with no setup, but the photos are uneven: it is an archive, not a photo community. For consistently beautiful picks, add a free Unsplash key (step 5 below).

---

## Deploy on GitHub (about 10 minutes)

### 1. Create the repository
1. Go to <https://github.com/new>.
2. Name it, e.g. `alpenglow`, and make it **Public**. GitHub Pages on private repos needs a paid plan.
3. Don't add a README, .gitignore or license. Click **Create repository**.

### 2. Push the code
Unzip the project, open a terminal in the folder, and run:

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<your-username>/alpenglow.git
git push -u origin main
```

(No terminal? On the empty repo page, click **uploading an existing file** and drag in everything *inside* the folder. The hidden `.github` folder must be included. On macOS, press `Cmd+Shift+.` in Finder to show it.)

### 3. Turn on GitHub Pages
**Settings → Pages → Build and deployment → Source: _GitHub Actions_**

### 4. Let the workflow write and deploy
**Settings → Actions → General → Workflow permissions → _Read and write permissions_ → Save**

### 5. (Optional, recommended) Add an Unsplash key for like-based ranking
1. Sign up at <https://unsplash.com/developers>, click **New Application**, and accept the API terms.
2. Copy the **Access Key**. You don't need the Secret key.
3. In your repo, go to **Settings → Secrets and variables → Actions → New repository secret**.
   - Name: `UNSPLASH_ACCESS_KEY`
   - Value: your Access Key

Each run makes about 24 requests, well under the 50/hour limit of a demo-mode app.

### 6. Run it for the first time
**Actions → "Update photos & deploy" → Run workflow**. After about a minute the run turns green, and the deploy step shows your URL:

```
https://<your-username>.github.io/alpenglow/
```

After that it runs on its own at 00:17, 06:17, 12:17 and 18:17 UTC (08:17, 14:17, 20:17 and 02:17 in Singapore).

> If the very first run (triggered by your push) failed at the deploy step, that's because Pages wasn't enabled yet. Re-run it after step 3.

---

## Run locally

```bash
node scripts/fetch-photos.mjs                          # needs Node 18+
UNSPLASH_ACCESS_KEY=xxxx node scripts/fetch-photos.mjs # optional
npx serve site      # or: python3 -m http.server -d site 8000
```

## Customise
- **Countries for the Europe photo:** `EUROPE_COUNTRIES` in `scripts/lib/core.mjs`
- **Austria search terms:** `AUSTRIA_QUERIES` in `commons.mjs` / `unsplash.mjs`
- **Refresh schedule:** `cron` in the workflow (GitHub's minimum is every 5 minutes; runs can be delayed at busy times)
- **Recency window:** `RECENCY_WINDOWS_DAYS` in `core.mjs`

## Notes
- Images are hotlinked from Wikimedia/Unsplash, as Unsplash's API guidelines require, and every photo shows its photographer, license and a link to the original.
- The workflow commits `photos.json` on every run. This keeps a history of picks, and it keeps the repo "active" so GitHub doesn't pause the schedule after 60 days of inactivity.
