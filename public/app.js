const $ = (id) => document.getElementById(id);
const inr = (n) => "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd = (n) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
let quote = null;

async function api(path, body) {
  const r = await fetch(path, { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json" }, body: body && JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Something went wrong.");
  return j;
}

function show(id) {
  for (const s of ["compose", "review"]) $(s).classList.toggle("hide", s !== id);
  $(id).classList.remove("stagger"); void $(id).offsetWidth; $(id).classList.add("stagger");
}

api("/api/contacts").then((cs) => {
  $("saved").innerHTML = "<span>Saved</span>" + cs.map((c) => `<span class="dot"></span><b>${c.name}</b><span>${c.country}</span>`).join("");
}).catch(() => {});

$("text").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("composeForm").requestSubmit(); }
});

$("composeForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = $("text").value.trim();
  $("composeError").textContent = "";
  if (!text) { $("composeError").textContent = "Tell us who to send money to and how much."; return; }
  const btn = $("continue");
  btn.disabled = true;
  const stop = cycle(btn, ["Reading your request", "Checking for warning signs", "Working out the amount"]);
  try {
    quote = await api("/api/quote", { text });
    renderReview(quote);
    show("review");
  } catch (err) {
    $("composeError").textContent = err.message;
  } finally {
    stop();
    btn.disabled = false; btn.textContent = "Continue";
  }
});

// Cross-fades a short status line inside a button while work happens on the server.
function cycle(el, lines, every = 1800) {
  let i = 0;
  const paint = () => { el.innerHTML = `<span class="spinner"></span><span class="status-line">${lines[i % lines.length]}</span>`; i++; };
  paint();
  const t = setInterval(paint, every);
  return () => clearInterval(t);
}

function renderReview(q) {
  $("rAmount").textContent = inr(q.inr);
  $("rTo").textContent = `to ${q.recipient.name} · ${q.recipient.country}`;
  $("rUsd").textContent = usd(q.usd);
  $("rRate").textContent = `$1 = ₹${q.rate.toFixed(2)}`;
  $("rPurpose").textContent = q.purpose || "—";
  const flagged = q.risk && q.risk.level !== "low";
  $("notice").classList.toggle("hide", !flagged);
  $("reasons").innerHTML = flagged ? q.risk.reasons.map((r) => `<li>${escapeHtml(r)}</li>`).join("") : "";
  $("ack").checked = false;
  $("pay").disabled = flagged;
  $("reviewError").textContent = "";
}

$("ack").addEventListener("change", () => { $("pay").disabled = !$("ack").checked; });
$("edit").addEventListener("click", () => { show("compose"); $("text").focus(); });

$("pay").addEventListener("click", async () => {
  const btn = $("pay");
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span><span class="status-line">Opening PayPal</span>';
  try {
    const { approveUrl } = await api(`/api/transfers/${quote.id}/pay`, { acknowledged: $("ack").checked });
    window.location.href = approveUrl;
  } catch (err) {
    $("reviewError").textContent = err.message;
    btn.disabled = false; btn.textContent = "Pay with PayPal";
  }
});

if (new URLSearchParams(location.search).has("cancelled")) {
  $("composeError").textContent = "Payment cancelled. Nothing was sent.";
  history.replaceState(null, "", "/");
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
