// Creates (or loads) two DEVNET-ONLY test wallets: app treasury (sender) and family (receiver).
import { Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID, getAccount } from "@solana/spl-token";
import fs from "node:fs";
import { connection, PYUSD_DEVNET_MINT } from "./common.mjs";

import { load } from "./wallets-lib.mjs";
const treasury = load("treasury"), family = load("family");

async function pyusd(owner) {
  const ata = getAssociatedTokenAddressSync(PYUSD_DEVNET_MINT, owner, false, TOKEN_2022_PROGRAM_ID);
  try { const a = await getAccount(connection, ata, "confirmed", TOKEN_2022_PROGRAM_ID); return Number(a.amount) / 1e6; }
  catch { return 0; }
}
for (const [n, k] of [["treasury", treasury], ["family", family]]) {
  let sol = await connection.getBalance(k.publicKey) / LAMPORTS_PER_SOL;
  if (process.argv.includes("--airdrop") && n === "treasury" && sol < 0.5) {
    try {
      const sig = await connection.requestAirdrop(k.publicKey, 1 * LAMPORTS_PER_SOL);
      await connection.confirmTransaction(sig, "confirmed");
      sol = await connection.getBalance(k.publicKey) / LAMPORTS_PER_SOL;
      console.log(`airdrop ok -> ${n}`);
    } catch (e) { console.log(`airdrop FAILED for ${n}: ${e.message.split("\n")[0]}`); }
  }
  console.log(`${n.padEnd(8)} ${k.publicKey.toBase58()}  SOL=${sol}  PYUSD=${await pyusd(k.publicKey)}`);
}
