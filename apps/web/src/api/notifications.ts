import type { ListAppNotificationsResponse } from "@flaremo/contracts";
import { apiRequest } from "./client";
import type { AppNotification } from "./types";

export async function listNotifications() {
  const query = new URLSearchParams({ page_size: "50" });
  return apiRequest<ListAppNotificationsResponse>(
    `/api/app/notifications?${query.toString()}`,
  );
}

export async function archiveNotification(name: string) {
  const id = name.split("/").pop() ?? name;
  return apiRequest<AppNotification>(
    `/api/app/notifications/${encodeURIComponent(id)}`,
    { method: "PATCH", body: JSON.stringify({ status: "archived" }) },
  );
}
