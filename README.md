# ERE WhatsApp CRM (prototype)

Minimal custom WhatsApp inbox on **Twilio + Supabase + Next.js (Vercel)**.
Phase 1: send + log + inbox UI. Inbound webhook + auto-reply included but only switch
Twilio's inbound to it once you retire Ulgebra.

## 1. Supabase (project `kvmkwxyjyrpergqojmgr`)

1. Open the project → **SQL Editor** → paste the contents of `lib/schema.sql` → **Run**.
2. **Settings → API** → copy these 3 values:
   - Project URL: `https://kvmkwxyjyrpergqojmgr.supabase.co`
   - `anon` public key
   - `service_role` secret key

## 2. Local run (optional)

```
cd whatsapp-crm
npm install
copy .env.example .env.local   # then fill in the values
npm run dev                     # http://localhost:3000
```

## 3. Deploy to Vercel

1. Push this `whatsapp-crm` folder to a GitHub repo.
2. Vercel → **New Project** → import the repo → root = `whatsapp-crm`.
3. Add **Environment Variables** (from `.env.example`):
   - `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM=whatsapp:+12202424577`
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
4. Deploy. You get a URL like `https://ere-whatsapp.vercel.app`.

## 4. Test sending

- Open the deployed URL → "Start a conversation" → your number (must have messaged the
  Twilio sender within 24h, or it needs an approved template) → send.
- It sends via Twilio and logs into Supabase; the inbox updates live.

## 5. Inbound (LATER — only when retiring Ulgebra)

Point Twilio's WhatsApp **inbound webhook** to:
`https://<your-vercel-url>/api/twilio/inbound`
Then incoming replies log here, and `MANAGE` auto-replies + `STOP` auto-blocks.
Do NOT do this while Ulgebra still owns the inbound webhook — only one can handle incoming.

## Files
- `app/page.tsx` — inbox UI
- `app/api/send/route.ts` — send via Twilio + log
- `app/api/twilio/inbound/route.ts` — incoming webhook + MANAGE/STOP automation
- `lib/twilio.ts`, `lib/supabase.ts`, `lib/schema.sql`
