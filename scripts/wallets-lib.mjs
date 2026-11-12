// Devnet test wallets.
// Hosted: read from env WALLET_TREASURY / WALLET_FAMILY (JSON array of the 64-byte secret key).
// Local: read from .wallets/<name>.json, creating a new wallet the first time.
import { Keypair } from "@solana/web3.js";
import fs from "node:fs";

const cache = {};
export function load(name) {
  if (cache[name]) return cache[name];
  const fromEnv = process.env[`WALLET_${name.toUpperCase()}`];
  let secret;
  if (fromEnv) {
    secret = JSON.parse(fromEnv);
  } else {
    fs.mkdirSync(".wallets", { recursive: true });
    const p = `.wallets/${name}.json`;
    if (!fs.existsSync(p)) fs.writeFileSync(p, JSON.stringify(Array.from(Keypair.generate().secretKey)), { mode: 0o600 });
    secret = JSON.parse(fs.readFileSync(p, "utf8"));
  }
  return (cache[name] = Keypair.fromSecretKey(Uint8Array.from(secret)));
}
