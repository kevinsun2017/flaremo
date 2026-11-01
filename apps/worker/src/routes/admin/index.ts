import { Hono } from "hono";
import type { HonoBindings } from "../../context";
import { registerBrandingRoutes } from "./branding";
import { registerMaintenanceRoutes } from "./maintenance";
import { registerPluginsRoutes } from "./plugins";
import { registerReaderSeatsRoutes } from "./reader-seats";
import { registerSettingsRoutes } from "./settings";
import { registerUsersRoutes } from "./users";

export const adminApi = new Hono<HonoBindings>();

// Registration order is the routing contract (Hono matches in registration
// order), so the calls below follow the historical single-file order exactly:
// settings, branding, plugins, users, reader seats, maintenance.
registerSettingsRoutes(adminApi);
registerBrandingRoutes(adminApi);
registerPluginsRoutes(adminApi);
registerUsersRoutes(adminApi);
registerReaderSeatsRoutes(adminApi);
registerMaintenanceRoutes(adminApi);
