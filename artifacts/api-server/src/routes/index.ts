import { Router, type IRouter } from "express";
import healthRouter from "./health";
import venuesRouter from "./venues";
import eventsRouter from "./events";
import checkoutRouter from "./checkout";
import ordersRouter from "./orders";
import homeRouter from "./home";

const router: IRouter = Router();

router.use(healthRouter);
router.use(venuesRouter);
router.use(eventsRouter);
router.use(checkoutRouter);
router.use(ordersRouter);
router.use(homeRouter);

export default router;
