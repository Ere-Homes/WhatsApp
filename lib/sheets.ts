// Append rows to a Google Sheet using a Google service account (Sheets API v4).
// No extra npm deps: we mint a JWT with Node's crypto and exchange it for an
// access token. Works around Workspace policy that blocks public Apps Script
// web apps. See docs/google-sheet-export.md for the one-time setup.
import { createSign } from "crypto";

const clean = (v?: string) => (v || "").replace(/^﻿/, "").trim();
const SA_EMAIL = () => clean(process.env.GOOGLE_SA_EMAIL);
const SA_KEY = () => clean(process.env.GOOGLE_SA_PRIVATE_KEY).replace(/\\n/g, "\n");
const SHEET_ID = () => clean(process.env.SHEETS_SPREADSHEET_ID);
const TAB = () => clean(process.env.SHEETS_TAB) || "Not in CRM";

export function sheetsConfigured(): boolean {
  return !!(SA_EMAIL() && SA_KEY() && SHEET_ID());
}

const b64url = (b: Buffer | string) =>
  Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

// Sign a service-account JWT and exchange it for an OAuth access token.
async function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({
    iss: SA_EMAIL(),
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const signature = b64url(createSign("RSA-SHA256").update(`${header}.${claim}`).sign(SA_KEY()));
  const assertion = `${header}.${claim}.${signature}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) throw new Error(`Google token ${res.status}: ${JSON.stringify(data).slice(0, 200)}`);
  return data.access_token as string;
}

// Append rows (array of string arrays) to the configured Sheet/tab.
// No-ops (returns false) when not configured, so sends never break.
export async function appendRows(rows: string[][]): Promise<boolean> {
  if (!sheetsConfigured() || rows.length === 0) return false;
  const token = await getAccessToken();
  const range = encodeURIComponent(`${TAB()}!A1`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID()}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ values: rows }),
  });
  if (!res.ok) throw new Error(`Sheets append ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return true;
}
