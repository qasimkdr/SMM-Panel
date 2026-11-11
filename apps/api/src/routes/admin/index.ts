import { Router } from "express";
import { requireAdmin, requirePerm } from "../../middleware/auth";
import { pricingRouter } from "./pricing";
import { adminUsersRouter } from "./users";
import { providersRouter } from "./providers";
import { categoriesRouter, servicesRouter } from "./catalog";
import { adminOrdersRouter } from "./orders";
import { dashboardRouter } from "./dashboard";
import { contentRouter, currenciesRouter, logsRouter, settingsRouter, vipRouter } from "./config";

/** Every admin route needs an admin-host session; staff additionally need the matching permission. */
export const adminRouter = Router();
adminRouter.use(requireAdmin);
adminRouter.use("/dashboard", dashboardRouter);
adminRouter.use("/orders", requirePerm("orders"), adminOrdersRouter);
adminRouter.use("/users", requirePerm("users"), adminUsersRouter);
adminRouter.use("/providers", requirePerm("catalog"), providersRouter);
adminRouter.use("/categories", requirePerm("catalog"), categoriesRouter);
adminRouter.use("/services", requirePerm("catalog"), servicesRouter);
adminRouter.use("/pricing", requirePerm("pricing"), pricingRouter);
adminRouter.use("/vip-tiers", requirePerm("pricing"), vipRouter);
adminRouter.use("/settings", requirePerm("settings"), settingsRouter);
adminRouter.use("/currencies", requirePerm("settings"), currenciesRouter);
adminRouter.use("/content", requirePerm("content"), contentRouter);
adminRouter.use("/logs", requirePerm("logs"), logsRouter);
