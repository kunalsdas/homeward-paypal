// PayPal sandbox check: create order -> buyer approves -> capture -> only if COMPLETED, release PYUSD (devnet).
// Usage: node scripts/paypal-check.mjs [amount] [--send-pyusd]
import "dotenv/config";
import { randomUUID } from "node:crypto";

const BASE = "https://api-m.sandbox.paypal.com";
const { PAYPAL_CLIENT_ID: ID, PAYPAL_CLIENT_SECRET: SECRET } = process.env;
if (!ID || !SECRET) {
  console.log("FAIL: set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in .env (sandbox app)");
  process.exit(1);
}
const amount = process.argv.slice(2).find((a) => /^\d+(\.\d+)?$/.test(a)) || "10.00";

async function token() {
  const r = await fetch(`${BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${ID}:${SECRET}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!r.ok) throw new Error(`OAuth failed ${r.status}: ${await r.text()}`);
  return (await r.json()).access_token;
}
const tk = await token();
console.log("PASS: sandbox OAuth");

const api = async (method, path, body, extra = {}) => {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${tk}`, "Content-Type": "application/json", ...extra },
    body: body && JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method} ${path} ${r.status}: ${JSON.stringify(j)}`);
  return j;
};

const order = await api(
  "POST",
  "/v2/checkout/orders",
  {
    intent: "CAPTURE",
    purchase_units: [
      { reference_id: "remit-check", description: "Remittance check", amount: { currency_code: "USD", value: amount } },
    ],
    payment_source: {
      paypal: {
        experience_context: {
          user_action: "PAY_NOW",
          return_url: "https://example.com/return",
          cancel_url: "https://example.com/cancel",
        },
      },
    },
  },
  { "PayPal-Request-Id": randomUUID() }
);
const approve = order.links.find((l) => l.rel === "payer-action" || l.rel === "approve")?.href;
console.log(`PASS: order created ${order.id} ($${amount})`);
console.log(
  `\nACTION: open this link, log in as your SANDBOX PERSONAL account, and approve:\n  ${approve}\n` +
    "(After approving you land on example.com - that's expected. Come back here.)\n"
);

const t0 = Date.now();
let status = order.status;
while (status !== "APPROVED" && Date.now() - t0 < 10 * 60_000) {
  await new Promise((r) => setTimeout(r, 4000));
  status = (await api("GET", `/v2/checkout/orders/${order.id}`)).status;
}
if (status !== "APPROVED") {
  console.log(`FAIL: order not approved within 10 min (status ${status})`);
  process.exit(1);
}
console.log("PASS: buyer approved");

const cap = await api("POST", `/v2/checkout/orders/${order.id}/capture`, undefined, {
  "PayPal-Request-Id": randomUUID(),
});
const capture = cap.purchase_units?.[0]?.payments?.captures?.[0];
console.log(`capture ${capture?.id} status=${capture?.status}`);

// Money invariant: never release funds on-chain unless PayPal says the capture is COMPLETED.
if (capture?.status !== "COMPLETED") {
  console.log("GATE: capture not COMPLETED -> PYUSD NOT released");
  process.exit(0);
}
console.log("PASS: capture COMPLETED -> gate open");

if (process.argv.includes("--send-pyusd")) {
  const { sendPyusd } = await import("./send-pyusd.mjs");
  const { explorer } = await import("./common.mjs");
  const sig = await sendPyusd(amount);
  console.log("PASS: PYUSD released to family wallet", explorer(sig));
}
