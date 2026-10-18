# Optional automation of the weekly build

By default you build each release in the admin page (Admin → Release → "Build the release" → "Stage for Friday"). If you would rather have it built automatically every Friday morning from the approved working dataset, use `tools/release.mjs` — on any computer with Node.js 20+, or with GitHub Actions.

## How it works

1. `tools/release.mjs` reads the approved working dataset from your site (`api/ingest.php?a=state`).
2. It runs the model for all eight scenarios with the same code as the admin page.
3. It uploads the files as the staged release (`api/ingest.php?a=stage`). The Friday 13:00 run publishes it.

Both requests are signed with the **ingest secret** (Admin → Settings → Automation). Keep it secret; anyone with it can stage a release (but cannot read settings, keys or subscribers).

## From a computer

```bash
node tools/release.mjs --site https://aiforecastatlas.com/ --secret <ingest secret>
node tools/release.mjs --site https://aiforecastatlas.com/ --secret <ingest secret> --dry-run   # only writes files to ./release-out
```

## With GitHub Actions

1. The repository is on GitHub (see [LICENSING.md](LICENSING.md)).
2. In the repository: Settings → Secrets and variables → Actions → add `AIM_SITE` (`https://aiforecastatlas.com/`) and `AIM_INGEST_SECRET`.
3. Enable the workflow `.github/workflows/weekly-release.yml`. It runs every Friday at 11:30 Swiss time (GitHub's `timezone` setting), so the staged build is ready for 13:00. You can also start it by hand ("Run workflow").

Notes: GitHub may start scheduled jobs a few minutes late at busy times, and it switches off schedules in public repositories after 60 days without any activity — a commit or a manual run keeps it alive. Only values you approved (and, if you enabled it, official-API values) are in the working dataset, so nothing unreviewed from AI research is published.
