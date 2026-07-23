# Education Dashboard

Personal dashboard for Bangladesh → Masters abroad: conferences, IELTS,
universities, documents, research, and scholarships. Data lives in a Google
Sheet you edit yourself (directly or from the website).

## Structure

```
/                     ← FRONTEND (open/host these)
  index.html          landing → redirects to the dashboard
  conferences.html    main dashboard (Overview / IELTS / Universities / Docs / Research)
  scholarship.html    Scholarship Tracker (reads + edits the Google Sheet)
  assets/
    sheet-api.js      shared frontend ↔ Sheet helper (holds API_URL + token)

/backend              ← BACKEND (not served; lives in Google, kept here for reference)
  Code.gs             Google Apps Script web app (CRUD over the Sheet)
  SETUP.md            how to deploy Code.gs and connect the site
```

- **Frontend** = the HTML pages the browser shows.
- **Backend** = the Google Apps Script web app (`Code.gs`) deployed inside the
  Google Sheet. The Sheet itself is the database.

## Navigation
- `index.html` → `conferences.html` (the hub).
- Conferences page has a **🎓 Scholarships** link (top-right of the tab bar).
- Scholarship page has a **← Education Dashboard** link (top-left).

## Editing data
Open `scholarship.html` → **Admin** → enter the token → Add / Edit / Delete
rows; changes write straight to the Google Sheet. Or edit the Sheet directly.

## Backend
Deploy / redeploy instructions: [backend/SETUP.md](backend/SETUP.md).
The live web-app URL and token are set in [assets/sheet-api.js](assets/sheet-api.js).

> **Security:** the write token is in `assets/sheet-api.js`. Do not push this
> repo public with the token live, or blank it there (Admin will prompt for it).
