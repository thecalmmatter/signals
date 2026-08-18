#!/usr/bin/env node
// One-off helper: generates a Fyers FYERS_ACCESS_TOKEN and prints it so you
// can paste it into .env.local. Fyers tokens expire daily, so you'll re-run
// this each trading day (or wire it into a cron with a stored refresh_token
// later — this script only does the manual auth-code exchange for now).
//
// Uses FYERS_APP_ID / FYERS_SECRET_ID / FYERS_REDIRECT_URI already in
// .env.local — run with:  node --env-file=.env.local scripts/fyers-get-token.mjs

import { createHash } from "node:crypto";
import { createInterface } from "node:readline/promises";

const appId = process.env.FYERS_APP_ID;
const secretId = process.env.FYERS_SECRET_ID;
const redirectUri = process.env.FYERS_REDIRECT_URI;

if (!appId || !secretId || !redirectUri) {
  console.error(
    "Missing FYERS_APP_ID / FYERS_SECRET_ID / FYERS_REDIRECT_URI.\n" +
      "Run this with:  node --env-file=.env.local scripts/fyers-get-token.mjs"
  );
  process.exit(1);
}

const loginUrl = new URL("https://api-t1.fyers.in/api/v3/generate-authcode");
loginUrl.searchParams.set("client_id", appId);
loginUrl.searchParams.set("redirect_uri", redirectUri);
loginUrl.searchParams.set("response_type", "code");
loginUrl.searchParams.set("state", "signal_app");

console.log("\n1. Open this URL, log in with your Fyers credentials:\n");
console.log(`   ${loginUrl.toString()}\n`);
console.log(
  `2. You'll be redirected to ${redirectUri}?...&auth_code=XXXX (page may fail to load — that's fine, just copy the auth_code from the address bar).\n`
);

const rl = createInterface({ input: process.stdin, output: process.stdout });
const pasted = (
  await rl.question("3. Paste the auth_code (or the whole redirect URL) here: ")
).trim();
rl.close();

if (!pasted) {
  console.error("No auth_code provided.");
  process.exit(1);
}

// Accept either the raw code or the full redirected URL — extract auth_code
// either way, so pasting too much doesn't silently produce a bad code.
let authCode = pasted;
if (pasted.includes("auth_code=")) {
  try {
    const parsed = new URL(pasted.includes("://") ? pasted : `http://x/?${pasted.split("?").pop()}`);
    authCode = parsed.searchParams.get("auth_code") ?? pasted;
  } catch {
    const match = pasted.match(/auth_code=([^&]+)/);
    authCode = match ? decodeURIComponent(match[1]) : pasted;
  }
}

const appIdHash = createHash("sha256").update(`${appId}:${secretId}`).digest("hex");

const res = await fetch("https://api-t1.fyers.in/api/v3/validate-authcode", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    grant_type: "authorization_code",
    appIdHash,
    code: authCode,
  }),
});

const data = await res.json();

if (!res.ok || data.s !== "ok" || !data.access_token) {
  console.error("\nFailed:", JSON.stringify(data, null, 2));
  process.exit(1);
}

console.log("\nSuccess. Add this to .env.local:\n");
console.log(`FYERS_ACCESS_TOKEN=${data.access_token}\n`);
