import { Hono } from "hono";
import type { HonoBindings } from "../../context";
import { registerMeRoutes } from "./me";
import { registerMemoCrudRoutes, registerMemoListRoutes } from "./memos";
import { registerPushRoutes } from "./push";
import { registerReviewRoutes } from "./review";
import { registerTimelineRoutes } from "./timeline";
import { registerUsageRoutes } from "./usage";

export const appApi = new Hono<HonoBindings>();

// Registration order is the routing contract (Hono matches in registration
// order), so the calls below follow the historical single-file order exactly:
// me/health, memo list+stats, timeline, push, usage, review, memo CRUD+tags.
registerMeRoutes(appApi);
registerMemoListRoutes(appApi);
registerTimelineRoutes(appApi);
registerPushRoutes(appApi);
registerUsageRoutes(appApi);
registerReviewRoutes(appApi);
registerMemoCrudRoutes(appApi);
