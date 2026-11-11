// Local fake provider speaking API v2, for development and tests.
// Usage: node scripts/mock-provider.mjs [port]   → http://localhost:5055/api/v2 (key: test-key-123)
import http from "node:http";

const port = Number(process.argv[2] ?? 5055);
const KEY = "test-key-123";
let priceBump = 1; // POST action=bump multiplies prices (to test sync)
const services = [
  { service: 101, name: "Instagram Followers [Refill 30D]", type: "Default", category: "Instagram Followers", rate: "0.90", min: "50", max: "50000", refill: true, cancel: true },
  { service: 102, name: "Instagram Likes [Real]", type: "Default", category: "Instagram Likes", rate: "0.35", min: "20", max: "20000", refill: false, cancel: true },
  { service: 103, name: "Instagram Custom Comments", type: "Custom Comments", category: "Instagram Comments", rate: "6.50", min: "5", max: "1000", refill: false, cancel: false },
  { service: 201, name: "TikTok Views [Instant]", type: "Default", category: "TikTok Views", rate: "0.015", min: "100", max: "10000000", refill: false, cancel: true, dripfeed: true },
  { service: 202, name: "TikTok Followers [HQ]", type: "Default", category: "TikTok Followers", rate: "2.10", min: "100", max: "100000", refill: true, cancel: false },
  { service: 301, name: "YouTube Views [Non-drop]", type: "Default", category: "YouTube Views", rate: "1.25", min: "500", max: "1000000", refill: true, cancel: false },
  { service: 401, name: "Telegram Post Views", type: "Default", category: "Telegram", rate: "0.02", min: "100", max: "500000", refill: false, cancel: false },
];
const orders = new Map();
let nextOrder = 5000;

http
  .createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const p = Object.fromEntries(new URLSearchParams(body));
      const send = (obj) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(obj));
      };
      if (p.key !== KEY) return send({ error: "Invalid API key" });
      switch (p.action) {
        case "services":
          return send(services.map((s) => ({ ...s, rate: (Number(s.rate) * priceBump).toFixed(4) })));
        case "balance":
          return send({ balance: "152.40", currency: "USD" });
        case "bump":
          priceBump = Number(p.factor ?? 1.1);
          return send({ ok: true, priceBump });
        case "add": {
          const id = nextOrder++;
          orders.set(String(id), { status: "Pending", start: 1000, remains: Number(p.quantity ?? 0) });
          return send({ order: id });
        }
        case "status": {
          const one = (id) => {
            const o = orders.get(id);
            return o ? { charge: "0.5", start_count: String(o.start), status: o.status, remains: String(o.remains), currency: "USD" } : { error: "Incorrect order ID" };
          };
          if (p.orders) return send(Object.fromEntries(p.orders.split(",").map((id) => [id, one(id)])));
          return send(one(p.order));
        }
        default:
          return send({ error: "Incorrect request" });
      }
    });
  })
  .listen(port, () => console.log(`mock provider on http://localhost:${port}/api/v2`));
