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
import adminVenuesRouter from "./adminVenues";
import adminEventsRouter from "./adminEvents";
import adminSessionsRouter from "./adminSessions";
import adminUsersRouter from "./adminUsers";
import adminAnalyticsRouter from "./adminAnalytics";
import storageRouter from "./storage";
import openaiRouter from "./openai/conversations";
import dpsRadarRouter from "./dpsRadar";
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
router.use(adminVenuesRouter);
router.use(adminEventsRouter);
router.use(adminSessionsRouter);
router.use(adminUsersRouter);
router.use(adminAnalyticsRouter);
router.use(storageRouter);
router.use(openaiRouter);
router.use(dpsRadarRouter);

export default router;
