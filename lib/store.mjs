// Tiny JSON-file store for transfers (local demo).
import fs from "node:fs";

const FILE = "data/transfers.json";
fs.mkdirSync("data", { recursive: true });
const read = () => (fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, "utf8")) : {});
const write = (all) => fs.writeFileSync(FILE, JSON.stringify(all, null, 2));

export const get = (id) => read()[id] || null;
export const findByOrder = (orderId) => Object.values(read()).find((t) => t.orderId === orderId) || null;
export function save(t) {
  const all = read();
  all[t.id] = { ...all[t.id], ...t, updatedAt: new Date().toISOString() };
  write(all);
  return all[t.id];
}
