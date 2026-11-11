import { adjustBalance as adjust, BalanceError, type BalanceChange } from "@smm/db";
import { db } from "../lib/db";
import { badRequest, notFound } from "../lib/errors";

/** API wrapper: maps ledger errors to HTTP errors. */
export async function adjustBalance(c: BalanceChange) {
  try {
    return await adjust(db, c);
  } catch (e) {
    if (e instanceof BalanceError) throw e.code === "not_found" ? notFound(e.message) : badRequest(e.message);
    throw e;
  }
}
