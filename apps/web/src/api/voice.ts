import { apiRequest } from "./client";

export type VoiceSettings = {
  revision: string | null;
  enabled: boolean;
  configured: boolean;
  source: "database" | "environment" | "none";
  provider: "tencent" | "dashscope" | "volcengine" | "minimax" | null;
  model: string;
  unreadable: boolean;
  previews: {
    appId: string;
    secretId: string;
    secretKey: string;
    apiKey: string;
    volcAppId: string;
    volcAccessToken: string;
    volcBoostingTable: string;
    volcCorrectTable: string;
    minimaxBaseUrl: string;
  } | null;
  encrypted: boolean;
  canEncrypt: boolean;
};
export const getVoiceSettings = () =>
  apiRequest<VoiceSettings>("/api/app/voice-settings");
export const saveVoiceSettings = (input: unknown) =>
  apiRequest("/api/app/voice-settings", {
    method: "PUT",
    body: JSON.stringify(input),
  });
export const deleteVoiceSettings = (revision: string | null) =>
  apiRequest("/api/app/voice-settings", {
    method: "DELETE",
    body: JSON.stringify({ revision }),
  });
export const testVoiceSettings = () =>
  apiRequest("/api/app/voice-settings/test", { method: "POST" });
