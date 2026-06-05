# "Not in CRM" → Google Sheet (service-account setup)

After every campaign, the console checks each recipient against the Audience CRM
and appends the ones that **aren't in the CRM** to a Google Sheet, with where
they came from — so you can add them later.

Your Workspace blocks public Apps Script web apps, so we use a **Google service
account** + the Sheets API instead. One-time, ~10 minutes.

## 1. Make the Sheet
1. Create a Google Sheet, e.g. **ERE WhatsApp — Not in CRM**.
2. Rename the first tab to exactly **Not in CRM**.
3. Row 1 headers: `Number | Name | How it entered | Campaign | Date | Replied?`
4. From the URL, copy the **spreadsheet ID** — the long part between `/d/` and `/edit`:
   `https://docs.google.com/spreadsheets/d/`**`THIS_IS_THE_ID`**`/edit`

## 2. Create the service account
1. Go to https://console.cloud.google.com → pick (or create) a project.
2. **APIs & Services → Library** → search **Google Sheets API** → **Enable**.
3. **APIs & Services → Credentials → Create credentials → Service account**.
   - Name it e.g. `whatsapp-sheet-writer`. Create → Done (no roles needed).
4. Open the new service account → **Keys → Add key → Create new key → JSON**.
   A `.json` file downloads. Keep it safe.

## 3. Share the Sheet with the service account
1. Open the JSON — copy the `client_email` (looks like
   `whatsapp-sheet-writer@your-project.iam.gserviceaccount.com`).
2. In the Sheet → **Share** → paste that email → give it **Editor** → Send.
   (It won't "accept" — that's normal for service accounts.)

## 4. Put the values in Vercel (WhatsApp project → Environment Variables)
From the JSON file:
- `GOOGLE_SA_EMAIL`        = the `client_email`
- `GOOGLE_SA_PRIVATE_KEY`  = the `private_key` value (the whole
  `-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n` string, quotes and
  `\n` escapes intact — paste it exactly as it appears in the JSON)
- `SHEETS_SPREADSHEET_ID`  = the ID from step 1.4
- `SHEETS_TAB`             = `Not in CRM`

Redeploy. Done — the next campaign starts filling the Sheet.

## Notes
- If those env vars are blank, the feature is simply off; sends are unaffected
  and the campaign summary says "Sheet not configured".
- "How it entered" = `Paste / CSV` or `From CRM segment` (a `From CRM segment`
  number showing here means the CRM phone-match missed — worth a look).
- Inbound-only repliers (people who message in but were never a recipient) are
  not captured here yet — a follow-up if you want it.
