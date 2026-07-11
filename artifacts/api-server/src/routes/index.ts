import { Router, type IRouter } from "express";
import healthRouter from "./health";
import venuesRouter from "./venues";
import eventsRouter from "./events";
import checkoutRouter from "./checkout";
import ordersRouter from "./orders";
import homeRouter from "./home";
import authRouter from "./auth";
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

export default router;
