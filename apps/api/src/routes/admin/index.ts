import { Router } from "express";
import { requireAdmin } from "../../middleware/auth";
import { pricingRouter } from "./pricing";
import { adminUsersRouter } from "./users";
import { providersRouter } from "./providers";
import { categoriesRouter, servicesRouter } from "./catalog";

export const adminRouter = Router();
adminRouter.use(requireAdmin);
adminRouter.use("/pricing", pricingRouter);
adminRouter.use("/users", adminUsersRouter);
adminRouter.use("/providers", providersRouter);
adminRouter.use("/categories", categoriesRouter);
adminRouter.use("/services", servicesRouter);
