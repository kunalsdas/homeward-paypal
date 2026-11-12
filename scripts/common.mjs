import { Connection, PublicKey } from "@solana/web3.js";
import "dotenv/config";

export const RPC = process.env.SOLANA_RPC || "https://api.devnet.solana.com";
// Paxos PYUSD test token on Solana Devnet (docs.paxos.com/guides/stablecoin/pyusd/testnet)
export const PYUSD_DEVNET_MINT = new PublicKey("CXk2AMBfi3TwaEL2468s6zP8xq9NxTXjp9gjMgzeUynM");
export const connection = new Connection(RPC, "confirmed");
export const explorer = (sig) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
