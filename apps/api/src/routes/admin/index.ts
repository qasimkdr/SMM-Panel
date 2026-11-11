import { Router } from "express";
import { requireAdmin } from "../../middleware/auth";
import { pricingRouter } from "./pricing";
import { adminUsersRouter } from "./users";

export const adminRouter = Router();
adminRouter.use(requireAdmin);
adminRouter.use("/pricing", pricingRouter);
adminRouter.use("/users", adminUsersRouter);
