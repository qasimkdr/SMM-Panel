import { Router } from "express";
import { and, count, desc, eq, gte, inArray, schema, sql, sum } from "@smm/db";
import { db } from "../../lib/db";
import { cached } from "../../lib/cache";

export const dashboardRouter = Router();

const since = (days: number) => sql`NOW() - INTERVAL ${days} DAY`;

/** Admin dashboard numbers. Cached for 60s so many admins refreshing never hammers MySQL. */
dashboardRouter.get("/", async (req, res) => {
  const days = Math.min(90, Math.max(7, Number(req.query.days) || 30));
  const data = await cached(`admin:dashboard:${days}`, 60, async () => {
    const periodTotals = async (d: number) => {
      const [o] = await db
        .select({
          revenue: sql<string>`COALESCE(SUM(${schema.orders.charge} - ${schema.orders.refunded}), 0)`,
          profit: sql<string>`COALESCE(SUM(${schema.orders.profit}), 0)`,
          orders: count(),
        })
        .from(schema.orders)
        .where(gte(schema.orders.createdAt, since(d)));
      const [u] = await db.select({ n: count() }).from(schema.users).where(gte(schema.users.createdAt, since(d)));
      return { revenue: o!.revenue, profit: o!.profit, orders: o!.orders, newUsers: u!.n };
    };
    const [today, week, period] = await Promise.all([
      (async () => {
        const [o] = await db
          .select({
            revenue: sql<string>`COALESCE(SUM(${schema.orders.charge} - ${schema.orders.refunded}), 0)`,
            profit: sql<string>`COALESCE(SUM(${schema.orders.profit}), 0)`,
            orders: count(),
          })
          .from(schema.orders)
          .where(gte(schema.orders.createdAt, sql`CURDATE()`));
        const [u] = await db.select({ n: count() }).from(schema.users).where(gte(schema.users.createdAt, sql`CURDATE()`));
        return { revenue: o!.revenue, profit: o!.profit, orders: o!.orders, newUsers: u!.n };
      })(),
      periodTotals(7),
      periodTotals(days),
    ]);

    const daily = await db
      .select({
        day: sql<string>`DATE_FORMAT(${schema.orders.createdAt}, '%Y-%m-%d')`.as("day"),
        revenue: sql<string>`COALESCE(SUM(${schema.orders.charge} - ${schema.orders.refunded}), 0)`,
        profit: sql<string>`COALESCE(SUM(${schema.orders.profit}), 0)`,
        orders: count(),
      })
      .from(schema.orders)
      .where(gte(schema.orders.createdAt, sql`CURDATE() - INTERVAL ${days - 1} DAY`))
      .groupBy(sql`day`)
      .orderBy(sql`day`);

    const topServices = await db
      .select({
        serviceId: schema.orders.serviceId,
        name: schema.services.name,
        orders: count(),
        revenue: sql<string>`SUM(${schema.orders.charge} - ${schema.orders.refunded})`,
        profit: sum(schema.orders.profit),
      })
      .from(schema.orders)
      .leftJoin(schema.services, eq(schema.services.id, schema.orders.serviceId))
      .where(gte(schema.orders.createdAt, since(days)))
      .groupBy(schema.orders.serviceId, schema.services.name)
      .orderBy(desc(sql`SUM(${schema.orders.charge} - ${schema.orders.refunded})`))
      .limit(5);

    const [[attention], [manual], [active], [liability], providers] = await Promise.all([
      db.select({ n: count() }).from(schema.orders).where(eq(schema.orders.status, "fail")),
      db.select({ n: count() }).from(schema.orders).where(and(eq(schema.orders.mode, "manual"), inArray(schema.orders.status, ["pending", "in_progress"]))),
      db.select({ n: count() }).from(schema.orders).where(inArray(schema.orders.status, ["pending", "processing", "in_progress"])),
      db.select({ total: sql<string>`COALESCE(SUM(${schema.users.balance}), 0)` }).from(schema.users),
      db
        .select({ id: schema.providers.id, name: schema.providers.name, balance: schema.providers.balance, currency: schema.providers.currency, lowBalanceAlert: schema.providers.lowBalanceAlert, errorCount: schema.providers.errorCount })
        .from(schema.providers)
        .where(eq(schema.providers.status, "active")),
    ]);

    // Fill missing days with zeros so the chart's x-axis is continuous.
    const byDay = new Map(daily.map((d) => [d.day, d]));
    const series = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
      const r = byDay.get(d);
      series.push({ day: d, revenue: Number(r?.revenue ?? 0), profit: Number(r?.profit ?? 0), orders: Number(r?.orders ?? 0) });
    }

    return {
      days,
      today,
      week,
      period,
      series,
      topServices,
      attention: { failed: attention!.n, manualQueue: manual!.n, active: active!.n },
      customerBalances: liability!.total,
      providers,
    };
  });
  res.set("Cache-Control", "private, max-age=30");
  res.json(data);
});
