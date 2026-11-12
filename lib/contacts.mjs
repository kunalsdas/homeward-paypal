// Saved recipients. The demo has one: Mom in India, whose wallet is the devnet "family" wallet.
import { familyAddress } from "./pyusd.mjs";

// Indicative rate for display only (sandbox demo).
export const INR_PER_USD = Number(process.env.INR_PER_USD || 84);

export function contacts() {
  return [
    {
      id: "mom",
      name: "Mom",
      aliases: ["mom", "mother", "my mom", "maa", "amma", "mummy", "ma", "aai", "माँ", "मां", "मम्मी", "अम्मा"],
      country: "India",
      currency: "INR",
      wallet: familyAddress(),
    },
  ];
}

export function matchContact(name) {
  const n = (name || "").trim().toLowerCase();
  return contacts().find((c) => c.name.toLowerCase() === n || c.aliases.includes(n)) || null;
}
