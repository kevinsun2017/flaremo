import { apiRequest } from "./client";

export type AgentModelSettings = {
  revision: string | null;
  enabled: boolean;
  configured: boolean;
  source: "database" | "environment" | "none";
  provider: "openrouter" | "nvidia" | "custom" | null;
  baseUrl: string;
  model: string;
  apiKeyPreview: string;
  canEncrypt: boolean;
  unreadable: boolean;
};

export const getAgentModelSettings = () =>
  apiRequest<AgentModelSettings>("/api/app/agent-model-settings");

export const saveAgentModelSettings = (input: unknown) =>
  apiRequest<AgentModelSettings>("/api/app/agent-model-settings", {
    method: "PUT",
    body: JSON.stringify(input),
  });

export const deleteAgentModelSettings = (revision: string | null) =>
  apiRequest("/api/app/agent-model-settings", {
    method: "DELETE",
    body: JSON.stringify({ revision }),
  });