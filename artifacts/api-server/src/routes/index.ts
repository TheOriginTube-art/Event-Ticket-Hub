import { Router, type IRouter } from "express";
import healthRouter from "./health";
import venuesRouter from "./venues";
import eventsRouter from "./events";
import checkoutRouter from "./checkout";
import ordersRouter from "./orders";
import homeRouter from "./home";
import authRouter from "./auth";
import paymentRouter from "./payment";
import adminRouter from "./admin";
import storageRouter from "./storage";
import { attachUser } from "../lib/auth";

const router: IRouter = Router();

router.use(attachUser);

router.use(healthRouter);
router.use(venuesRouter);
router.use(eventsRouter);
router.use(checkoutRouter);
router.use(ordersRouter);
router.use(homeRouter);
router.use(authRouter);
router.use(paymentRouter);
router.use(adminRouter);
router.use(storageRouter);

export default router;
