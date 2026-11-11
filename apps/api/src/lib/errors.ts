export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, fields?: Record<string, string>) =>
  new HttpError(400, "bad_request", message, fields);
export const unauthorized = (message = "Please sign in to continue") => new HttpError(401, "unauthorized", message);
export const forbidden = (message = "You don't have access to this") => new HttpError(403, "forbidden", message);
export const notFound = (message = "Not found") => new HttpError(404, "not_found", message);
export const conflict = (message: string, fields?: Record<string, string>) =>
  new HttpError(409, "conflict", message, fields);
export const tooMany = (retryAfter: number) =>
  new HttpError(429, "rate_limited", `Too many requests. Try again in ${retryAfter}s.`);
