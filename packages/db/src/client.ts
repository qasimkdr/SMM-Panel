import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "./schema";

export type Database = ReturnType<typeof createDb>["db"];

export function createDb(url = process.env.DATABASE_URL, poolSize = Number(process.env.DB_POOL_SIZE ?? 20)) {
  if (!url) throw new Error("DATABASE_URL is not set");
  const pool = mysql.createPool({
    uri: url,
    connectionLimit: poolSize,
    waitForConnections: true,
    enableKeepAlive: true,
    decimalNumbers: false, // keep DECIMAL as strings — never floats for money
    supportBigNumbers: true,
    timezone: "Z",
  });
  const db = drizzle(pool, { schema, mode: "default" });
  return { db, pool };
}
