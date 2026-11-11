import { normalizeProviderStatus, normalizeServiceType, type ProviderServiceItem } from "@smm/shared";
import { providerRequest, toBool, toInt, toRate } from "./http";
import { ProviderError, type AddOrderParams, type ProviderDriver, type ProviderOrderStatus } from "./types";

/**
 * The de-facto standard "API v2": POST form data with key + action.
 * Covers the large majority of panels.
 */
export class V2Driver implements ProviderDriver {
  constructor(
    protected url: string,
    protected key: string,
  ) {}

  protected call(action: string, params: Record<string, string | number | undefined> = {}) {
    return providerRequest({ url: this.url, method: "POST", bodyType: "form", params: { key: this.key, action, ...params } });
  }

  protected mapService(raw: Record<string, unknown>): ProviderServiceItem {
    return {
      service: String(raw.service ?? raw.id ?? ""),
      name: String(raw.name ?? "").trim(),
      type: normalizeServiceType(raw.type),
      category: String(raw.category ?? "Other").trim(),
      rate: toRate(raw.rate),
      min: toInt(raw.min) ?? 1,
      max: toInt(raw.max) ?? 1,
      refill: toBool(raw.refill),
      cancel: toBool(raw.cancel),
      dripfeed: toBool(raw.dripfeed),
      description: raw.description ? String(raw.description) : null,
    };
  }

  async services() {
    const data = await this.call("services");
    if (!Array.isArray(data)) throw new ProviderError("Provider's service list isn't in the expected format");
    return data.map((r) => this.mapService(r as Record<string, unknown>)).filter((s) => s.service && s.name);
  }

  async balance() {
    const data = (await this.call("balance")) as Record<string, unknown>;
    if (data?.balance === undefined) throw new ProviderError("Provider didn't return a balance");
    return { balance: toRate(data.balance), currency: String(data.currency ?? "USD").toUpperCase().slice(0, 3) };
  }

  async add(params: AddOrderParams) {
    const data = (await this.call("add", params)) as Record<string, unknown>;
    if (!data?.order) throw new ProviderError("Provider didn't return an order ID");
    return { order: String(data.order) };
  }

  protected mapStatus(raw: Record<string, unknown>): ProviderOrderStatus {
    if (raw?.error) return { status: "pending", charge: null, startCount: null, remains: null, currency: null, error: String(raw.error) };
    return {
      status: normalizeProviderStatus(String(raw.status ?? "pending")),
      charge: raw.charge !== undefined ? toRate(raw.charge) : null,
      startCount: toInt(raw.start_count),
      remains: toInt(raw.remains),
      currency: raw.currency ? String(raw.currency) : null,
    };
  }

  async statuses(orderIds: string[]) {
    if (orderIds.length === 1) {
      return { [orderIds[0]!]: this.mapStatus((await this.call("status", { order: orderIds[0] })) as Record<string, unknown>) };
    }
    const data = (await this.call("status", { orders: orderIds.join(",") })) as Record<string, Record<string, unknown>>;
    const out: Record<string, ProviderOrderStatus> = {};
    for (const id of orderIds) if (data?.[id]) out[id] = this.mapStatus(data[id]!);
    return out;
  }

  async refill(orderId: string) {
    const data = (await this.call("refill", { order: orderId })) as Record<string, unknown>;
    if (!data?.refill) throw new ProviderError("Provider didn't accept the refill");
    return { refill: String(data.refill) };
  }

  async refillStatus(refillId: string) {
    const data = (await this.call("refill_status", { refill: refillId })) as Record<string, unknown>;
    return { status: String(data?.status ?? "Pending") };
  }

  async cancel(orderIds: string[]) {
    const data = await this.call("cancel", { orders: orderIds.join(",") });
    const out: Record<string, { ok: boolean; error?: string }> = {};
    for (const row of Array.isArray(data) ? data : []) {
      const r = row as Record<string, unknown>;
      const c = r.cancel as unknown;
      out[String(r.order)] =
        c && typeof c === "object" && "error" in (c as object)
          ? { ok: false, error: String((c as { error: unknown }).error) }
          : { ok: Boolean(c) };
    }
    return out;
  }
}
