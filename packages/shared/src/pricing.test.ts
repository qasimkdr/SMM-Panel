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
