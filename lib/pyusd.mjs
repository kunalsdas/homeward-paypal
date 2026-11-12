// PYUSD on Solana devnet (Paxos test token, Token-2022).
import { Connection, PublicKey } from "@solana/web3.js";
import {
  getAccount,
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
  transferChecked,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import { load } from "../scripts/wallets-lib.mjs";

const RPC = process.env.SOLANA_RPC || "https://api.devnet.solana.com";
export const MINT = new PublicKey("CXk2AMBfi3TwaEL2468s6zP8xq9NxTXjp9gjMgzeUynM");
const connection = new Connection(RPC, "confirmed");

export const explorerTx = (sig) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
export const familyAddress = () => load("family").publicKey.toBase58();

export async function treasuryBalance() {
  const owner = load("treasury").publicKey;
  const ata = getAssociatedTokenAddressSync(MINT, owner, false, TOKEN_2022_PROGRAM_ID);
  try {
    const a = await getAccount(connection, ata, "confirmed", TOKEN_2022_PROGRAM_ID);
    return Number(a.amount) / 1e6;
  } catch {
    return 0;
  }
}

export async function sendPyusd(amount, toAddress) {
  const treasury = load("treasury");
  const units = BigInt(Math.round(amount * 1e6));
  const from = await getOrCreateAssociatedTokenAccount(
    connection, treasury, MINT, treasury.publicKey, false, "confirmed", undefined, TOKEN_2022_PROGRAM_ID
  );
  if (from.amount < units) throw new Error("Treasury balance too low");
  const to = await getOrCreateAssociatedTokenAccount(
    connection, treasury, MINT, new PublicKey(toAddress), false, "confirmed", undefined, TOKEN_2022_PROGRAM_ID
  );
  return transferChecked(
    connection, treasury, from.address, MINT, to.address, treasury, units, 6, [], undefined, TOKEN_2022_PROGRAM_ID
  );
}
