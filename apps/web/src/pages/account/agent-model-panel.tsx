import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  deleteAgentModelSettings,
  getAgentModelSettings,
  saveAgentModelSettings,
  type AgentModelSettings,
} from "@/api";
import { QueryErrorState } from "@/components/query-error-state";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useI18n } from "@/i18n";
import { SettingsRow, SettingsSectionGroup } from "./apple-settings-ui";

const PROVIDERS = ["openrouter", "nvidia", "custom"] as const;
type Provider = (typeof PROVIDERS)[number];

export function AgentModelPanel() {
  const cache = useQueryClient();
  const { t } = useI18n();
  const mounted = useRef(false);
  const [config, setConfig] = useState<AgentModelSettings | null>(null);
  const [provider, setProvider] = useState<Provider>("openrouter");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pendingAction, setPendingAction] = useState<
    "save" | "toggle" | "delete" | null
  >(null);
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const settingsQuery = useQuery({
    queryKey: ["agent-model-settings"],
    queryFn: getAgentModelSettings,
  });

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    const value = settingsQuery.data;
    if (!value) return;
    setConfig(value);
    setProvider((value.provider as Provider) ?? "openrouter");
    setEnabled(value.enabled);
  }, [settingsQuery.data]);

  // env is always the fallback in prod, so it must never lock editing: the
  // owner can always save a DB config (or clear it) to control which model
  // routes. `envManaged` here only labels the currently-active source.
  const envManaged = config?.source === "environment";
  const dbManaged = config?.source === "database";
  const editingDisabled =
    busy || !config || Boolean(config.unreadable);

  async function run(
    action: "save" | "toggle" | "delete",
    task: () => Promise<unknown>,
    success: string,
  ) {
    setBusy(true);
    setPendingAction(action);
    try {
      await task();
      if (!mounted.current) return;
      const value = await cache.fetchQuery({
        queryKey: ["agent-model-settings"],
        queryFn: getAgentModelSettings,
        staleTime: 0,
      });
      if (!mounted.current) return;
      setConfig(value);
      setEnabled(value.enabled);
      setProvider((value.provider as Provider) ?? "openrouter");
      setBaseUrl("");
      setApiKey("");
      toast.success(success);
      if (action === "save") {
        setConfigDialogOpen(false);
      }
    } catch {
      if (!mounted.current) return;
      toast.error(t("agentModel.error"));
    } finally {
      if (mounted.current) {
        setBusy(false);
        setPendingAction(null);
      }
    }
  }

  const handleToggleEnabled = (nextEnabled: boolean) => {
    if (!config?.revision) return; // nothing saved yet; configure first
    setEnabled(nextEnabled);
    void run(
      "toggle",
      () =>
        saveAgentModelSettings({
          revision: config.revision,
          enabled: nextEnabled,
          config: {
            provider,
            baseUrl: config.baseUrl,
            apiKey: "", // blank keeps the stored key
            model: config.model,
          },
        }),
      t("agentModel.saved"),
    );
  };

  const providerNames: Record<Provider, string> = {
    openrouter: t("agentModel.providerOpenrouter"),
    nvidia: t("agentModel.providerNvidia"),
    custom: t("agentModel.providerCustom"),
  };

  const configuredLabel = dbManaged
    ? t("agentModel.statusConfigured")
    : config?.configured
      ? t("settings.status.envManaged")
      : t("settings.status.notConfigured");

  if (!config && settingsQuery.isPending) {
    return (
      <div className="flex flex-col gap-3 p-4">
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-28 w-full rounded-xl" />
      </div>
    );
  }
  if (!config && settingsQuery.isError) {
    return (
      <QueryErrorState
        isRetrying={settingsQuery.isFetching}
        onRetry={() => void settingsQuery.refetch()}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <SettingsSectionGroup
        footer={
          dbManaged
            ? undefined
            : envManaged
              ? t("agentModel.envManaged")
              : !config?.canEncrypt
                ? t("agentModel.plainStore")
                : config?.unreadable
                  ? t("agentModel.unreadable")
                  : undefined
        }
      >
        <SettingsRow
          label={t("agentModel.enabled")}
          action={
            <Switch
              checked={enabled}
              disabled={editingDisabled || !config?.revision}
              onCheckedChange={handleToggleEnabled}
            />
          }
        />
        <SettingsRow
          label={t("agentModel.provider")}
          value={providerNames[provider] ?? provider}
          chevron={!editingDisabled}
          onClick={
            editingDisabled ? undefined : () => setConfigDialogOpen(true)
          }
        />
        <SettingsRow
          label={t("agentModel.baseUrl")}
          value={config?.baseUrl || t("agentModel.modelDefault")}
          chevron={!editingDisabled}
          onClick={
            editingDisabled ? undefined : () => setConfigDialogOpen(true)
          }
        />
        <SettingsRow
          label={t("agentModel.apiKey")}
          value={config?.apiKeyPreview || t("agentModel.statusNotConfigured")}
          chevron={!editingDisabled}
          onClick={
            editingDisabled ? undefined : () => setConfigDialogOpen(true)
          }
        />
        <SettingsRow
          label={t("agentModel.configStatus")}
          value={configuredLabel}
        />
      </SettingsSectionGroup>

      {config?.revision && (
        <SettingsSectionGroup>
          <SettingsRow
            destructive
            label={t("agentModel.clearConfig")}
            onClick={() => setConfirmDelete(true)}
          />
        </SettingsSectionGroup>
      )}

      <Dialog open={configDialogOpen} onOpenChange={setConfigDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("agentModel.configure")}</DialogTitle>
            <DialogDescription>{t("agentModel.description")}</DialogDescription>
          </DialogHeader>

          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!config) return;
              void run(
                "save",
                () =>
                  saveAgentModelSettings({
                    revision: config.revision,
                    enabled,
                    config: { provider, baseUrl, apiKey, model },
                  }),
                t("agentModel.saved"),
              );
            }}
          >
            <div className="flex flex-col gap-1.5 text-sm font-medium">
              <span>{t("agentModel.provider")}</span>
              <ToggleGroup
                variant="outline"
                value={provider ? [provider] : []}
                disabled={editingDisabled}
                onValueChange={(values) => {
                  if (values.length === 0) return;
                  setProvider(values[values.length - 1] as Provider);
                }}
              >
                <ToggleGroupItem value="openrouter">
                  {t("agentModel.providerOpenrouter")}
                </ToggleGroupItem>
                <ToggleGroupItem value="nvidia">
                  {t("agentModel.providerNvidia")}
                </ToggleGroupItem>
                <ToggleGroupItem value="custom">
                  {t("agentModel.providerCustom")}
                </ToggleGroupItem>
              </ToggleGroup>
            </div>

            <label
              className="flex flex-col gap-1.5 text-sm font-medium"
              htmlFor="agent-model-base-url"
            >
              {t("agentModel.baseUrl")}
              <Input
                autoComplete="off"
                disabled={editingDisabled}
                id="agent-model-base-url"
                value={baseUrl}
                placeholder={t("agentModel.baseUrlPlaceholder")}
                onChange={(event) => setBaseUrl(event.target.value)}
              />
            </label>

            <label
              className="flex flex-col gap-1.5 text-sm font-medium"
              htmlFor="agent-model-api-key"
            >
              {t("agentModel.apiKey")}
              <Input
                autoComplete="new-password"
                disabled={editingDisabled}
                id="agent-model-api-key"
                type="password"
                value={apiKey}
                placeholder={config?.apiKeyPreview || t("agentModel.apiKeyPlaceholder")}
                onChange={(event) => setApiKey(event.target.value)}
              />
            </label>

            <label
              className="flex flex-col gap-1.5 text-sm font-medium"
              htmlFor="agent-model-id"
            >
              {t("agentModel.model")}
              <Input
                autoComplete="off"
                disabled={editingDisabled}
                id="agent-model-id"
                value={model}
                placeholder={t("agentModel.modelPlaceholder")}
                onChange={(event) => setModel(event.target.value)}
              />
            </label>

            <DialogFooter className="mt-2">
              <Button
                variant="outline"
                type="button"
                onClick={() => setConfigDialogOpen(false)}
              >
                {t("common.cancel")}
              </Button>
              <Button disabled={editingDisabled} type="submit">
                {pendingAction === "save" && (
                  <Spinner data-icon="inline-start" />
                )}
                {t("common.save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog onOpenChange={setConfirmDelete} open={confirmDelete}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("agentModel.clearConfig")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("agentModel.clearConfirm")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="ghost">
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (config)
                  void run(
                    "delete",
                    () => deleteAgentModelSettings(config.revision),
                    t("agentModel.deleted"),
                  );
              }}
            >
              {t("agentModel.clearConfig")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}