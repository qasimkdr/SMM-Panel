import { ProviderError } from "./types";

const UA = "Mozilla/5.0 (compatible; PanelSync/1.0)";

export async function providerRequest(opts: {
  url: string;
  method: "GET" | "POST";
  bodyType: "form" | "json";
  params: Record<string, string | number | undefined>;
  headers?: Record<string, string>;
  timeoutMs?: number;
}): Promise<unknown> {
  const clean = Object.fromEntries(
    Object.entries(opts.params).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => [k, String(v)]),
  );
  let url = opts.url;
  const init: RequestInit = {
    method: opts.method,
    headers: { "User-Agent": UA, Accept: "application/json", ...opts.headers },
    signal: AbortSignal.timeout(opts.timeoutMs ?? 25_000),
  };
  if (opts.method === "GET") {
    url += (url.includes("?") ? "&" : "?") + new URLSearchParams(clean).toString();
  } else if (opts.bodyType === "json") {
    init.body = JSON.stringify(clean);
    (init.headers as Record<string, string>)["Content-Type"] = "application/json";
  } else {
    init.body = new URLSearchParams(clean);
  }

  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (e) {
    const msg = e instanceof Error && e.name === "TimeoutError" ? "The provider took too long to respond. Try again in a minute." : "Couldn't reach the provider. Check the API URL.";
    throw new ProviderError(msg);
  }
  const text = await res.text();
  if (res.status === 401 || res.status === 403) throw new ProviderError("The provider rejected the API key. Paste a fresh key in the provider settings.", true);
  if (res.status >= 500) throw new ProviderError(`Provider server error (${res.status})`);
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ProviderError(`Provider returned an invalid response${res.ok ? "" : ` (${res.status})`}`, !res.ok);
  }
  if (data && typeof data === "object" && !Array.isArray(data) && "error" in data && (data as { error: unknown }).error) {
    const err = String((data as { error: unknown }).error);
    const permanent = /key|auth|incorrect|invalid|not found|disabled|balance|not enough/i.test(err);
    throw new ProviderError(err, permanent);
  }
  return data;
}

export const toInt = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
};

export const toBool = (v: unknown) => v === true || v === 1 || v === "1" || String(v).toLowerCase() === "true";

/** Accepts numbers or strings like "0.45", "1,20" → normalized decimal string. */
export const toRate = (v: unknown): string => {
  const s = String(v ?? "0").replace(",", ".").trim();
  return /^\d+(\.\d+)?$/.test(s) ? s : "0";
};
