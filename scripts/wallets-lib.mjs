import { Keypair } from "@solana/web3.js";
import fs from "node:fs";
export function load(name) {
  fs.mkdirSync(".wallets", { recursive: true });
  const p = `.wallets/${name}.json`;
  if (!fs.existsSync(p)) fs.writeFileSync(p, JSON.stringify(Array.from(Keypair.generate().secretKey)), { mode: 0o600 });
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(p))));
}
