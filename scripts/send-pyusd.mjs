// Sends PYUSD (devnet) from treasury to family. Usage: node scripts/send-pyusd.mjs 5.00
import { getOrCreateAssociatedTokenAccount, transferChecked, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { connection, PYUSD_DEVNET_MINT, explorer } from "./common.mjs";
import { load } from "./wallets-lib.mjs";

export async function sendPyusd(amount) {
  const treasury = load("treasury"), family = load("family");
  const units = BigInt(Math.round(Number(amount) * 1e6));
  const from = await getOrCreateAssociatedTokenAccount(connection, treasury, PYUSD_DEVNET_MINT, treasury.publicKey, false, "confirmed", undefined, TOKEN_2022_PROGRAM_ID);
  if (from.amount < units) throw new Error(`treasury has ${Number(from.amount) / 1e6} PYUSD, needs ${amount}`);
  const to = await getOrCreateAssociatedTokenAccount(connection, treasury, PYUSD_DEVNET_MINT, family.publicKey, false, "confirmed", undefined, TOKEN_2022_PROGRAM_ID);
  const sig = await transferChecked(connection, treasury, from.address, PYUSD_DEVNET_MINT, to.address, treasury, units, 6, [], undefined, TOKEN_2022_PROGRAM_ID);
  return sig;
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const sig = await sendPyusd(process.argv[2] || "1.00");
  console.log("PASS: PYUSD sent on devnet", explorer(sig));
}
