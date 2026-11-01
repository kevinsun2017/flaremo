/**
 * UserService Connect methods. The implementation lives in `./user-methods/`,
 * split by resource family (users, settings, accounts, webhooks,
 * notifications); this module stays the stable import path and keeps the same
 * two exports it always had.
 */
export { connectUserMethod } from "./user-methods/index";
export { createConnectUser } from "./user-methods/members";
