# Google Sheet backend — setup

This makes your Google Sheet the database for the whole dashboard. You edit
data in the Sheet **or** from the website; the site reads/writes through a small
Google Apps Script web app. No server, works on GitHub Pages / any static host.

## 1. Create the Spreadsheet

1. Go to <https://sheets.new> — name it e.g. `Education Dashboard DB`.
2. Make one **tab per dataset**. Start with `Scholarships`.
   Rename `Sheet1` at the bottom → `Scholarships`.
3. In row 1 of `Scholarships`, paste these headers (exact spelling, `id` first):

   ```
   id | name | country | flag | degree | deadline | funding | status | amount | duration | link | summary | benefits | eligibility
   ```

   - `deadline` = `YYYY-MM-DD` (e.g. `2026-10-31`)
   - `funding`  = `full` | `partial` | `unknown`
   - `status`   = `researching` | `applied` | `accepted` | `rejected`
   - `benefits` / `eligibility` = list items separated by ` | ` (pipe). Example:
     `Monthly stipend | Insurance | Travel allowance`
   - Leave `id` blank when you type rows by hand — the web app fills it. Or use
     the website's **+ Add** button (it fills `id` for you).

   > Add more tabs later the same way (row 1 = headers, include an `id` column).
   > The backend is generic — any tab works automatically.

## 2. Add the Apps Script

1. In the Spreadsheet: **Extensions → Apps Script**.
2. Delete the sample code, paste the contents of `backend/Code.gs`.
3. Change `API_TOKEN` to a long random string. **Copy it.**
4. Save (disk icon).

## 3. Deploy as Web App

1. **Deploy → New deployment**.
2. Gear icon → **Web app**.
3. Description: `dashboard api`. Execute as: **Me**.
   Who has access: **Anyone**.
4. **Deploy** → authorize (allow the permissions on your own account).
5. Copy the **Web app URL** — ends in `/exec`.

## 4. Connect the website

Open `assets/sheet-api.js` and set:

```js
var API_URL   = 'https://script.google.com/macros/s/XXXX/exec';  // step 3 URL
var API_TOKEN = 'the-long-random-string-from-step-2';
```

Reload `scholarship.html`. Cards now come from the Sheet. Click **Admin** →
enter the token → you can Add / Edit / Delete rows from the page.

## Adding new datasets (e.g. Conferences)

`Code.gs` auto-creates a tab the first time the site writes to it (headers =
`id` + the record's fields). So on the Conferences page: **Admin → Import seed**
creates the `Conferences` tab and fills it — no manual Sheet work. Same for any
future dataset.

> **Auto-create needs a current deployment.** Tab auto-creation lives in
> `ensureSheet()`. If your deployed script predates it, writes to a new tab fail
> with `no tab named "…"` and the page falls back to saving on the device only.
> Fix it either way:
>
> - **Permanent:** redeploy `Code.gs` (see *Updating after code changes* below).
>   Every future tab is then created for you.
> - **Quick:** add the tab by hand and paste its header row into `A1`.

## Outreach tabs (universities + professors)

The Country tab's professor tracker uses two tabs. If they don't exist yet, the
page shows a setup box with a **Copy headers** button for each — paste into `A1`
of a tab with the matching name, then hit **Retry sync** and everything already
entered uploads.

`Universities`

```
id | country | name | location | website | status | notes | documents
```

`Professors`

```
id | uniId | uniName | name | email | mobile | subject | status | updates | notes
```

- `uniId` links a professor row to a university row's `id`.
- `updates` = dated log, entries separated by ` | `, each `YYYY-MM-DD::text`.
- `documents` = per-university checklist, entries separated by ` | `, each
  `text::1` (done) or `text::0` (pending).
- A literal `|` inside your text is stored as `&#124;` so it can't split an entry.

> The header row matters: the backend writes a row by matching column names, so
> a tab with no headers accepts writes but stores nothing. The page detects that
> case and tells you.

## Updating after code changes

If you edit `Code.gs` later: **Deploy → Manage deployments → edit (pencil) →
Version: New version → Deploy.** Same URL keeps working.

## Notes / limits
- Reads are public (anyone with the URL sees data). Don't store secrets in it.
- Writes need the token. Keep the token out of public repos if the data is private.
- Apps Script free quota is plenty for personal use.
