import { apiRequest } from "./client";

export type PushConfig = {
  public_key: string | null;
  subscriptions: number;
};

export async function getPushConfig() {
  return apiRequest<PushConfig>("/api/app/push/config");
}

export async function subscribeToPush(input: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}) {
  return apiRequest<{ ok: true }>("/api/app/push/subscribe", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function unsubscribeFromPush(endpoint: string) {
  return apiRequest<{ ok: true }>("/api/app/push/unsubscribe", {
    method: "POST",
    body: JSON.stringify({ endpoint }),
  });
}
