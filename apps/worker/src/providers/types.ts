import type { OrderStatus, ProviderServiceItem } from "@smm/shared";

export class ProviderError extends Error {
  constructor(
    message: string,
    /** Retrying won't help (bad key, invalid service…). */
    public permanent = false,
  ) {
    super(message);
  }
}

export interface AddOrderParams {
  service: string;
  link: string;
  quantity?: number;
  runs?: number;
  interval?: number;
  comments?: string;
  usernames?: string;
  hashtags?: string;
  hashtag?: string;
  username?: string;
  media?: string;
  answer_number?: string;
  groups?: string;
  min?: number;
  max?: number;
  posts?: number;
  old_posts?: number;
  delay?: number;
  expiry?: string;
  [k: string]: string | number | undefined;
}

export interface ProviderOrderStatus {
  status: OrderStatus;
  charge: string | null;
  startCount: number | null;
  remains: number | null;
  currency: string | null;
  error?: string;
}

/** Every provider API (v2, custom/"v3") is adapted to this interface. */
export interface ProviderDriver {
  services(): Promise<ProviderServiceItem[]>;
  balance(): Promise<{ balance: string; currency: string }>;
  add(params: AddOrderParams): Promise<{ order: string }>;
  statuses(orderIds: string[]): Promise<Record<string, ProviderOrderStatus>>;
  refill(orderId: string): Promise<{ refill: string }>;
  refillStatus(refillId: string): Promise<{ status: string }>;
  cancel(orderIds: string[]): Promise<Record<string, { ok: boolean; error?: string }>>;
}
