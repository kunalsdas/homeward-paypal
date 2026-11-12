const $ = (id) => document.getElementById(id);
const id = location.pathname.split("/").pop();
const inr = (n) => "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd = (n) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const time = (iso) => (iso ? new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" }) : "");
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

const check = (size, w) =>
  `<svg class="draw" width="${size}" height="${size}" viewBox="0 0 12 12" fill="none"><path d="M2.5 6.2 5 8.5l4.5-5" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const CROSS = '<svg width="16" height="16" viewBox="0 0 12 12" fill="none"><path d="M3.5 3.5l5 5m0-5-5 5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';
const SMALL_SPIN = '<span class="spinner" style="width:10px;height:10px;border-width:1.5px"></span>';

// How far the real transfer has got: 0 nothing, 1 paid, 2 sent, 3 delivered.
function progress(t) {
  if (t.status === "delivered") return 3;
  if (t.txUrl) return 2;
  if (t.paidAt) return 1;
  return 0;
}
const FAIL = {
  payment_pending: "Payment pending at PayPal. Nothing sent yet.",
  payment_failed: "Payment didn't go through. Nothing was sent.",
  send_failed: "Paid, but delivery failed. We'll retry or refund.",
};
const WAIT = {
  quoted: "Not paid yet",
  awaiting_payment: "Waiting for PayPal",
  capturing: "Confirming payment",
};

let data = null;   // latest server state
let shown = -1;    // how many steps are visibly complete (revealed one at a time)
let timer = null;

function setStep(n, state, detail, t) {
  const el = $("s" + n);
  const prev = el.dataset.state;
  if (prev === state) return;
  el.dataset.state = state;
  el.className = "step " + state;
  el.querySelector(".tick").innerHTML = state === "done" ? check(11, 1.6) : state === "now" ? SMALL_SPIN : "";
  $(`s${n}d`).textContent = detail || "";
  $(`s${n}t`).textContent = t || "";
}

function paint() {
  const t = data;
  const failed = FAIL[t.status];
  const delivered = shown >= 3;
  const name = t.recipient.name;

  // Header
  const state = $("state");
  const want = delivered ? "ok" : failed ? "bad" : "wait";
  if (state.dataset.v !== want) {
    state.dataset.v = want;
    state.className = "state" + (delivered ? " ok" : failed ? " bad" : "");
    state.innerHTML = delivered ? check(18, 1.4) : failed ? CROSS : '<span class="spinner"></span>';
  }
  $("headline").textContent = delivered ? `Delivered to ${name}` : failed || (shown >= 1 ? `Sending to ${name}` : WAIT[t.status] || "Confirming payment");
  if (delivered && !$("amount").classList.contains("settle")) $("amount").classList.add("settle");

  // Timeline
  setStep(1, shown >= 1 ? "done" : !failed ? "now" : "", t.captureId ? `Capture ${t.captureId}` : "", shown >= 1 ? time(t.paidAt) : "");
  setStep(2, shown >= 2 ? "done" : shown === 1 && !failed ? "now" : "", `${t.usd.toFixed(2)} PYUSD`, shown >= 2 ? time(t.deliveredAt) : "");
  setStep(3, shown >= 3 ? "done" : shown === 2 ? "now" : "",
    shown >= 3 ? `${name}'s wallet · ${t.recipient.wallet.slice(0, 4)}…${t.recipient.wallet.slice(-4)}` : "", shown >= 3 ? time(t.deliveredAt) : "");

  const link = $("explorerWrap");
  if (delivered && t.txUrl && link.classList.contains("hide")) {
    $("explorer").href = t.txUrl;
    link.classList.remove("hide");
    link.classList.add("fade");
  }
  document.title = `${delivered ? "Delivered" : "Transfer"} · Homeward`;
}

// Reveal real progress one step at a time so each stage is readable.
function advance() {
  const target = progress(data);
  if (shown < target) shown = reduced ? target : shown + 1;
  paint();
  if (shown < target) timer = setTimeout(advance, 750);
  else timer = null;
}

function first(t) {
  $("amount").textContent = inr(t.inr);
  $("sub").textContent = `to ${t.recipient.name} · ${t.recipient.country}`;
  $("dUsd").textContent = usd(t.usd);
  $("dPyusd").innerHTML = `${t.usd.toFixed(2)} PYUSD<small>≈ ${inr(t.inr)}</small>`;
  $("dPurpose").textContent = t.purpose || "—";
  $("dRef").textContent = t.id;
  $("headline").textContent = "Confirming payment";
  shown = 0;
}

async function poll() {
  try {
    const r = await fetch(`/api/transfers/${id}`);
    if (!r.ok) throw new Error();
    const t = await r.json();
    if (!data) first(t);
    data = t;
    if (!timer) timer = setTimeout(advance, shown === 0 ? 350 : 0);
    if (progress(t) === 3 || FAIL[t.status]) return;
  } catch {
    $("headline").textContent = "Transfer not found";
    return;
  }
  setTimeout(poll, 1200);
}
poll();

$("copy").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(location.href); $("copy").textContent = "Link copied"; } catch { $("copy").textContent = location.href; }
  setTimeout(() => ($("copy").textContent = "Copy link for family"), 2000);
});
