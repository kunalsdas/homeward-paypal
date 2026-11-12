import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseRequest } from "./lib/ai.mjs";
import { contacts, matchContact, INR_PER_USD } from "./lib/contacts.mjs";
import { createOrder, captureOrder, newId } from "./lib/paypal.mjs";
import { sendPyusd, treasuryBalance, explorerTx } from "./lib/pyusd.mjs";
import * as store from "./lib/store.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
// Render sets RENDER_EXTERNAL_URL automatically; BASE_URL overrides it.
const BASE_URL = process.env.BASE_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
const MAX_USD = 50; // per-transfer demo limit

const app = express();
app.use(express.json());
app.use(express.static(path.join(here, "public")));

const round2 = (n) => Math.round(n * 100) / 100;

// 1) Understand the request (AI), then price it (code).
app.post("/api/quote", async (req, res) => {
  const text = String(req.body?.text || "").trim().slice(0, 500);
  if (!text) return res.status(400).json({ error: "Tell us who to send money to and how much." });
  try {
    const p = await parseRequest(text);
    if (!p.understood || !p.amount) return res.status(422).json({ error: "Try something like “Send ₹2,000 to Mom for medicine.”" });
    const contact = matchContact(p.recipient);
    if (!contact) return res.status(422).json({ error: `We don't have “${p.recipient}” saved yet. Try sending to Mom.` });

    // Rupee requests: show exactly what was asked and round the dollar charge up to the cent,
    // so the family never receives less than requested.
    const usd = p.currency === "USD" ? round2(p.amount) : Math.ceil((p.amount / INR_PER_USD) * 100) / 100;
    const inr = p.currency === "USD" ? round2(usd * INR_PER_USD) : round2(p.amount);
    if (usd < 1) return res.status(422).json({ error: "The minimum is $1." });
    if (usd > MAX_USD) return res.status(422).json({ error: `This demo sends up to $${MAX_USD} per transfer.` });
    if (usd > (await treasuryBalance())) return res.status(503).json({ error: "The demo treasury is low. Try a smaller amount." });

    const t = store.save({
      id: newId(),
      status: "quoted",
      text,
      recipient: { id: contact.id, name: contact.name, country: contact.country, wallet: contact.wallet },
      usd,
      inr,
      rate: INR_PER_USD,
      purpose: p.purpose ? p.purpose[0].toUpperCase() + p.purpose.slice(1) : "",
      language: p.language,
      risk: p.risk,
      createdAt: new Date().toISOString(),
    });
    res.json(publicView(t));
  } catch (e) {
    console.error("quote failed:", e.message);
    if (e.code === "NO_KEY") return res.status(503).json({ error: "AI isn't set up yet. Add OPENROUTER_API_KEY to .env and restart." });
    res.status(500).json({ error: "Something went wrong reading that. Please try again." });
  }
});

// 2) Create the PayPal order for an accepted quote.
app.post("/api/transfers/:id/pay", async (req, res) => {
  const t = store.get(req.params.id);
  if (!t || t.status !== "quoted") return res.status(404).json({ error: "This quote is no longer available." });
  if (t.risk?.level !== "low" && !req.body?.acknowledged) return res.status(400).json({ error: "Please confirm you know this person." });
  try {
    const { orderId, approveUrl } = await createOrder({
      usd: t.usd,
      description: `To ${t.recipient.name} · ${t.purpose}`,
      referenceId: t.id,
      returnUrl: `${BASE_URL}/return`,
      cancelUrl: `${BASE_URL}/?cancelled=${t.id}`,
    });
    store.save({ id: t.id, orderId, status: "awaiting_payment" });
    res.json({ approveUrl });
  } catch (e) {
    console.error("order failed:", e.message);
    res.status(502).json({ error: "PayPal is unavailable right now. Please try again." });
  }
});

// 3) PayPal returns here. Capture, then release PYUSD only if the capture is COMPLETED.
const inFlight = new Set();
app.get("/return", async (req, res) => {
  const orderId = String(req.query.token || "");
  const t = store.findByOrder(orderId);
  if (!t) return res.redirect("/");
  res.redirect(`/t/${t.id}`);
  if (inFlight.has(t.id) || ["sending", "delivered"].includes(t.status)) return;
  inFlight.add(t.id);
  try {
    store.save({ id: t.id, status: "capturing" });
    const cap = await captureOrder(orderId);
    store.save({ id: t.id, captureId: cap.captureId, captureStatus: cap.status });
    if (cap.status !== "COMPLETED") {
      store.save({ id: t.id, status: cap.status === "PENDING" ? "payment_pending" : "payment_failed" });
      return;
    }
    store.save({ id: t.id, status: "sending", paidAt: new Date().toISOString() });
    const sig = await sendPyusd(t.usd, t.recipient.wallet);
    store.save({ id: t.id, status: "delivered", txSig: sig, deliveredAt: new Date().toISOString() });
  } catch (e) {
    console.error("settlement failed:", e.message);
    const cur = store.get(t.id);
    store.save({ id: t.id, status: cur.status === "sending" ? "send_failed" : "payment_failed" });
  } finally {
    inFlight.delete(t.id);
  }
});

app.get("/api/transfers/:id", (req, res) => {
  const t = store.get(req.params.id);
  if (!t) return res.status(404).json({ error: "Not found" });
  res.json(publicView(t));
});

app.get("/api/contacts", (_req, res) => res.json(contacts().map(({ id, name, country }) => ({ id, name, country }))));

app.get("/healthz", (_req, res) => res.send("ok"));

app.get("/t/:id", (_req, res) => res.sendFile(path.join(here, "public", "receipt.html")));

function publicView(t) {
  return {
    id: t.id,
    status: t.status,
    recipient: { name: t.recipient.name, country: t.recipient.country, wallet: t.recipient.wallet },
    usd: t.usd,
    inr: t.inr,
    rate: t.rate,
    purpose: t.purpose,
    language: t.language,
    risk: t.risk,
    orderId: t.orderId || null,
    captureId: t.captureId || null,
    txUrl: t.txSig ? explorerTx(t.txSig) : null,
    createdAt: t.createdAt,
    paidAt: t.paidAt || null,
    deliveredAt: t.deliveredAt || null,
  };
}

app.listen(PORT, () => console.log(`Homeward running at ${BASE_URL}`));
