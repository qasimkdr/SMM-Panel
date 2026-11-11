import "./env";
import { migrate } from "drizzle-orm/mysql2/migrator";
import { createDb } from "./client";

const { db, pool } = createDb(undefined, 2);
await migrate(db, { migrationsFolder: new URL("../migrations", import.meta.url).pathname });
console.log("Migrations applied");
await pool.end();
