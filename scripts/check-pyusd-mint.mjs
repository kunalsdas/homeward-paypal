import { getMint, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { connection, PYUSD_DEVNET_MINT } from "./common.mjs";

const info = await connection.getAccountInfo(PYUSD_DEVNET_MINT);
if (!info) { console.log("FAIL: PYUSD mint not found on devnet"); process.exit(1); }
const program = info.owner.equals(TOKEN_2022_PROGRAM_ID) ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
const mint = await getMint(connection, PYUSD_DEVNET_MINT, "confirmed", program);
console.log("PASS: PYUSD devnet mint exists");
console.log("  program :", program.equals(TOKEN_2022_PROGRAM_ID) ? "Token-2022" : "SPL Token");
console.log("  decimals:", mint.decimals);
console.log("  supply  :", Number(mint.supply) / 10 ** mint.decimals, "PYUSD");
