import type { CustomDriverConfig } from "@smm/shared";
import { normalizeProviderStatus, type ProviderServiceItem } from "@smm/shared";
import { providerRequest } from "./http";
import { ProviderError, type ProviderOrderStatus } from "./types";
import { V2Driver } from "./v2";

const get = (obj: unknown, path: string): unknown =>
  path ? path.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), obj) : obj;

/**
 * Configurable driver for non-standard ("v3"/custom) APIs. It reuses the v2 logic and only
 * changes transport, auth, action names and field names as configured by the admin.
 */
export class CustomDriver extends V2Driver {
  constructor(
    url: string,
    key: string,
    private cfg: CustomDriverConfig,
  ) {
    super(url, key);
  }

  protected override call(action: string, params: Record<string, string | number | undefined> = {}) {
    const { cfg } = this;
    const body: Record<string, string | number | undefined> = {};
    for (const [k, v] of Object.entries(params)) body[cfg.requestFields[k] ?? k] = v;
    body[cfg.actionField] = cfg.actions[action] ?? action;

    const headers: Record<string, string> = { ...cfg.extraHeaders };
    let url = this.url;
    if (cfg.auth.in === "body") body[cfg.auth.name] = cfg.auth.prefix + this.key;
    else if (cfg.auth.in === "header") headers[cfg.auth.name] = cfg.auth.prefix + this.key;
    else url += (url.includes("?") ? "&" : "?") + `${encodeURIComponent(cfg.auth.name)}=${encodeURIComponent(cfg.auth.prefix + this.key)}`;

    return providerRequest({ url, method: cfg.method, bodyType: cfg.bodyType, params: body, headers });
  }

  /** Rename provider response fields back to v2 names before the shared mapping runs. */
  private rename(raw: Record<string, unknown>): Record<string, unknown> {
    const out = { ...raw };
    for (const [ours, theirs] of Object.entries(this.cfg.responseFields)) if (theirs in raw) out[ours] = raw[theirs];
    return out;
  }

  protected override mapService(raw: Record<string, unknown>): ProviderServiceItem {
    return super.mapService(this.rename(raw));
  }

  protected override mapStatus(raw: Record<string, unknown>): ProviderOrderStatus {
    const r = this.rename(raw);
    const mapped = this.cfg.statusMap[String(r.status ?? "")];
    const base = super.mapStatus(r);
    return mapped ? { ...base, status: normalizeProviderStatus(mapped) } : base;
  }

  override async services() {
    const data = get(await this.call("services"), this.cfg.servicesPath);
    if (!Array.isArray(data)) throw new ProviderError("Couldn't find the services list. Check the 'services path' setting.");
    return data.map((r) => this.mapService(r as Record<string, unknown>)).filter((s) => s.service && s.name);
  }

  override async balance() {
    const data = this.rename((await this.call("balance")) as Record<string, unknown>);
    if (data?.balance === undefined) throw new ProviderError("Provider didn't return a balance");
    return { balance: String(data.balance), currency: String(data.currency ?? "USD").toUpperCase().slice(0, 3) };
  }
}
