import { test } from "node:test";
import assert from "node:assert/strict";
import { applyDiscount, applyMarkup, chargeFor, partialRefund, resolveMarkup, convert } from "./pricing";
import { toMicros, fromMicros } from "./money";

test("money round trip", () => {
  assert.equal(fromMicros(toMicros("12.3456785")), "12.345679");
  assert.equal(fromMicros(toMicros("-0.5")), "-0.500000");
});

test("markup priority", () => {
  assert.deepEqual(resolveMarkup({ service: null, category: "15", provider: "30", global: "20" }), {
    percent: "15",
    source: "category",
  });
  assert.equal(resolveMarkup({ global: "20" }).source, "global");
  assert.equal(resolveMarkup({ service: 0, global: "20" }).percent, "0");
});

test("applyMarkup: 20% on $1.00 = $1.20", () => {
  assert.equal(applyMarkup("1", "20"), "1.200000");
  assert.equal(applyMarkup("0.4321", "12.5"), "0.486113");
});

test("discount and charge", () => {
  assert.equal(applyDiscount("1.2", "10"), "1.080000");
  assert.equal(chargeFor("1.2", 2500), "3.000000");
  assert.equal(chargeFor("0.0123", 1), "0.000012");
  assert.equal(partialRefund("3", 2500, 500), "0.600000");
});

test("convert", () => {
  assert.equal(convert("10", "278.5"), "2785.00");
});

import { normalizeOrder, orderCharge, parseMassOrder } from "./orders";

test("normalizeOrder: default service", () => {
  const rule = { type: "default" as const, minQty: 100, maxQty: 1000, dripfeed: true };
  assert.deepEqual(normalizeOrder({ service: 1, link: "https://x.com/a", quantity: 50 }, rule), {
    ok: false,
    errors: { quantity: "Quantity must be between 100 and 1,000" },
  });
  const ok = normalizeOrder({ service: 1, link: "https://x.com/a", quantity: 500, runs: 3, interval: 30 }, rule);
  assert.equal(ok.ok && ok.order.totalQuantity, 1500);
});

test("normalizeOrder: custom comments count lines", () => {
  const r = normalizeOrder({ service: 1, link: "https://x", comments: "nice\n\ngreat\nwow" }, { type: "custom_comments", minQty: 1, maxQty: 10, dripfeed: false });
  assert.equal(r.ok && r.order.quantity, 3);
});

test("orderCharge + mass parse", () => {
  assert.equal(orderCharge("default", "1.2", 2500), "3.000000");
  assert.equal(orderCharge("package", "4.5", 1), "4.500000");
  assert.deepEqual(parseMassOrder("5 | https://a | 100\n\n6|b|200")[1], { line: 2, raw: "6|b|200", service: 6, link: "b", quantity: 200 });
});
