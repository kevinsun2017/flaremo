import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  deleteAgentModelSettings,
  getAgentModelSettings,
  previewAgentModelCatalog,
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
import { Badge } from "@/components/ui/badge";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useI18n } from "@/i18n";
import { SettingsRow, SettingsSectionGroup } from "./apple-settings-ui";

const PROVIDERS = ["openrouter", "nvidia", "custom"] as const;
type Provider = (typeof PROVIDERS)[number];

type ModelEntry = { id: string; displayName: string };

export function AgentModelPanel() {
  const cache = useQueryClient();
  const { t } = useI18n();
  const mounted = useRef(false);
  const [config, setConfig] = useState<AgentModelSettings | null>(null);
  const [provider, setProvider] = useState<Provider>("openrouter");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [models, setModels] = useState<ModelEntry[]>([]);
  const [currentModel, setCurrentModel] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pendingAction, setPendingAction] = useState<
    "save" | "toggle" | "delete" | null
  >(null);
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmRemoveAll, setConfirmRemoveAll] = useState(false);

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
    setModels(value.models ?? []);
    setCurrentModel(value.model ?? "");
    setBaseUrl(value.baseUrl ?? "");
  }, [settingsQuery.data]);

  const envManaged = config?.source === "environment";
  const dbManaged = config?.source === "database";
  const editingDisabled = busy || !config || Boolean(config.unreadable);
  // A saved DB config is what the switch controls; until one exists the
  // switch row is replaced by an explicit "configure" action so there is no
  // dead toggle that implies off-but-usable.
  const hasConfig = Boolean(config?.revision);

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
      setModels(value.models ?? []);
      setCurrentModel(value.model ?? "");
      setBaseUrl(value.baseUrl ?? "");
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
    if (!config?.revision) return; // no saved config yet; use config dialog
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
            apiKey: "",
            model: config.model,
            models: config.models,
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
        {hasConfig ? (
          <SettingsRow
            label={t("agentModel.enabled")}
            action={
              <Switch
                checked={enabled}
                disabled={editingDisabled}
                onCheckedChange={handleToggleEnabled}
              />
            }
          />
        ) : (
          <SettingsRow
            label={t("agentModel.enabled")}
            value={t("agentModel.emptyCta")}
            chevron={!editingDisabled}
            onClick={
              editingDisabled ? undefined : () => setConfigDialogOpen(true)
            }
          />
        )}
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

      {hasConfig && (
        <SettingsSectionGroup>
          <SettingsRow
            destructive
            label={t("agentModel.clearConfig")}
            onClick={() => setConfirmDelete(true)}
          />
        </SettingsSectionGroup>
      )}

      <ConfigDialog
        open={configDialogOpen}
        onOpenChange={setConfigDialogOpen}
        config={config}
        editingDisabled={editingDisabled}
        pendingSave={pendingAction === "save"}
        provider={provider}
        onProviderChange={setProvider}
        baseUrl={baseUrl}
        onBaseUrlChange={setBaseUrl}
        apiKey={apiKey}
        onApiKeyChange={setApiKey}
        models={models}
        onModelsChange={setModels}
        currentModel={currentModel}
        onCurrentModelChange={setCurrentModel}
        enabled={enabled}
        pickerOpen={pickerOpen}
        onPickerOpenChange={setPickerOpen}
        onRequestRemoveAll={() => setConfirmRemoveAll(true)}
        onSave={(value) =>
          void run("save", () => saveAgentModelSettings(value), t("agentModel.saved"))
        }
      />

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

      <AlertDialog
        onOpenChange={setConfirmRemoveAll}
        open={confirmRemoveAll}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("agentModel.removeAll")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("agentModel.removeAllConfirm")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="ghost">
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setModels([]);
                setCurrentModel("");
              }}
            >
              {t("agentModel.removeAll")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ConfigDialog({
  open,
  onOpenChange,
  config,
  editingDisabled,
  pendingSave,
  provider,
  onProviderChange,
  baseUrl,
  onBaseUrlChange,
  apiKey,
  onApiKeyChange,
  models,
  onModelsChange,
  currentModel,
  onCurrentModelChange,
  enabled,
  pickerOpen,
  onPickerOpenChange,
  onSave,
  onRequestRemoveAll,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  config: AgentModelSettings | null;
  editingDisabled: boolean;
  pendingSave: boolean;
  provider: Provider;
  onProviderChange: (p: Provider) => void;
  baseUrl: string;
  onBaseUrlChange: (v: string) => void;
  apiKey: string;
  onApiKeyChange: (v: string) => void;
  models: ModelEntry[];
  onModelsChange: (v: ModelEntry[]) => void;
  currentModel: string;
  onCurrentModelChange: (v: string) => void;
  enabled: boolean;
  pickerOpen: boolean;
  onPickerOpenChange: (v: boolean) => void;
  onSave: (value: {
    revision: string | null;
    enabled: boolean;
    config: {
      provider: Provider;
      baseUrl: string;
      apiKey: string;
      model: string;
      models: ModelEntry[];
    };
  }) => void;
  onRequestRemoveAll: () => void;
}) {
  const { t } = useI18n();
  const [manualModel, setManualModel] = useState("");
  const removeFromList = (id: string) => {
    const next = models.filter((m) => m.id !== id);
    onModelsChange(next);
    if (currentModel === id) onCurrentModelChange(next[0]?.id ?? "");
  };
  const addManual = () => {
    const id = manualModel.trim();
    if (!id || models.some((m) => m.id === id)) return;
    onModelsChange([...models, { id, displayName: id }]);
    if (!currentModel) onCurrentModelChange(id);
    setManualModel("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("agentModel.configure")}</DialogTitle>
          <DialogDescription>{t("agentModel.description")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5 text-sm font-medium">
            <span>{t("agentModel.provider")}</span>
            <ToggleGroup
              variant="outline"
              value={[provider]}
              disabled={editingDisabled}
              onValueChange={(values) => {
                if (values.length === 0) return;
                onProviderChange(values[values.length - 1] as Provider);
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
              onChange={(event) => onBaseUrlChange(event.target.value)}
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
              onChange={(event) => onApiKeyChange(event.target.value)}
            />
          </label>

          <div className="flex flex-col gap-1.5 text-sm font-medium">
            <div className="flex items-center justify-between">
              <span>{t("agentModel.modelList")}</span>
              <div className="flex gap-1.5">
                <Button
                  size="xs"
                  variant="outline"
                  type="button"
                  disabled={editingDisabled || !baseUrl.trim()}
                  onClick={() => onPickerOpenChange(true)}
                >
                  <RefreshCw data-icon="inline-start" />
                  {t("agentModel.fetchModels")}
                </Button>
                <Button
                  size="xs"
                  variant="outline"
                  type="button"
                  disabled={editingDisabled}
                  onClick={addManual}
                >
                  <Plus data-icon="inline-start" />
                  {t("agentModel.addManual")}
                </Button>
                {models.length > 0 && (
                  <Button
                    size="xs"
                    variant="ghost"
                    type="button"
                    disabled={editingDisabled}
                    onClick={onRequestRemoveAll}
                  >
                    <Trash2 data-icon="inline-start" />
                  </Button>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Input
                autoComplete="off"
                disabled={editingDisabled}
                value={manualModel}
                placeholder={t("agentModel.modelPlaceholder")}
                onChange={(event) => setManualModel(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addManual();
                  }
                }}
              />
              {models.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("agentModel.modelListEmpty")}
                </p>
              ) : (
                <div className="flex max-h-52 flex-col overflow-y-auto rounded-lg border border-border/60">
                  {models.map((m) => {
                    const isCurrent = m.id === currentModel;
                    return (
                      <div
                        key={m.id}
                        className={`flex items-center gap-2 border-b border-border/40 px-3 py-2 text-sm last:border-b-0 ${
                          isCurrent
                            ? "bg-primary/5"
                            : "hover:bg-muted/40"
                        }`}
                      >
                        <button
                          type="button"
                          className={`flex min-w-0 flex-1 items-center gap-2 text-start ${
                            isCurrent
                              ? ""
                              : "text-muted-foreground"
                          }`}
                          disabled={editingDisabled}
                          onClick={() => onCurrentModelChange(m.id)}
                          title={
                            isCurrent
                              ? t("agentModel.modelCurrent")
                              : t("agentModel.modelSetCurrent")
                          }
                        >
                          <span className="truncate font-medium">
                            {m.displayName}
                          </span>
                          <span className="truncate text-xs text-muted-foreground">
                            {m.id}
                          </span>
                          {isCurrent && (
                            <Badge variant="success">
                              <Check data-icon="inline-start" />
                              {t("agentModel.modelCurrent")}
                            </Badge>
                          )}
                        </button>
                        <button
                          type="button"
                          className="shrink-0 text-muted-foreground hover:text-destructive"
                          disabled={editingDisabled}
                          aria-label={t("agentModel.modelRemove")}
                          onClick={() => removeFromList(m.id)}
                        >
                          <X className="size-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="mt-2">
            <Button
              variant="outline"
              type="button"
              onClick={() => onOpenChange(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              disabled={editingDisabled || !currentModel || !config}
              type="button"
              onClick={() => {
                if (!config) return;
                onSave({
                  revision: config.revision,
                  enabled,
                  config: {
                    provider,
                    baseUrl,
                    apiKey,
                    model: currentModel,
                    models,
                  },
                });
              }}
            >
              {pendingSave && <Spinner data-icon="inline-start" />}
              {t("common.save")}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>

      <ModelPickerSheet
        open={pickerOpen}
        onOpenChange={onPickerOpenChange}
        baseUrl={baseUrl}
        apiKey={apiKey}
        models={models}
        onConfirm={onModelsChange}
        disabled={editingDisabled}
      />
    </Dialog>
  );
}

// model remove-all confirm (routed through parent AlertDialog)

function ModelPickerSheet({
  open,
  onOpenChange,
  baseUrl,
  apiKey,
  models,
  onConfirm,
  disabled,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  baseUrl: string;
  apiKey: string;
  models: ModelEntry[];
  onConfirm: (v: ModelEntry[]) => void;
  disabled: boolean;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [catalog, setCatalog] = useState<ModelEntry[]>([]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const existingIds = useMemo(() => new Set(models.map((m) => m.id)), [models]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter(
      (m) =>
        m.id.toLowerCase().includes(q) ||
        m.displayName.toLowerCase().includes(q),
    );
  }, [catalog, query]);

  const load = async () => {
    if (!baseUrl.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await previewAgentModelCatalog({ baseUrl, apiKey });
      const fresh = (res.models ?? []).filter(
        (m) => !existingIds.has(m.id),
      );
      setCatalog(fresh);
      setSelected(new Set());
    } catch {
      setError(t("agentModel.fetchError"));
    } finally {
      setLoading(false);
    }
  };

  const toggleAll = () => {
    const all = new Set(filtered.map((m) => m.id));
    setSelected((prev) =>
      prev.size === filtered.length && filtered.length > 0
        ? new Set()
        : all,
    );
  };

  const addSelected = () => {
    const chosen = catalog.filter((m) => selected.has(m.id));
    if (chosen.length === 0) return;
    onConfirm([...models, ...chosen]);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-md w-full">
        <SheetHeader>
          <SheetTitle>{t("agentModel.fetchDialogTitle")}</SheetTitle>
          <SheetDescription>{t("agentModel.fetchDialogDesc")}</SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-3">
          <div className="flex gap-1.5">
            <Button
              size="sm"
              variant="outline"
              type="button"
              disabled={loading || disabled}
              onClick={() => void load()}
            >
              {loading ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <RefreshCw data-icon="inline-start" />
              )}
              {t("agentModel.fetchModels")}
            </Button>
            {catalog.length > 0 && (
              <Button
                size="sm"
                variant="ghost"
                type="button"
                onClick={toggleAll}
              >
                {selected.size === catalog.length && catalog.length > 0
                  ? t("agentModel.fetchDeselectAll")
                  : t("agentModel.fetchSelectAll")}
              </Button>
            )}
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          {catalog.length > 0 && (
            <>
              <div className="relative">
                <Search
                  className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  className="pl-8"
                  value={query}
                  placeholder={t("common.search")}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
              <span className="text-xs text-muted-foreground">
                {t("agentModel.fetchCount", { count: selected.size })}
              </span>
              <div className="flex max-h-96 flex-col overflow-y-auto rounded-lg border border-border/60">
                {filtered.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground">
                    {t("search.noResultsHint")}
                  </p>
                ) : (
                  filtered.map((m) => {
                    const checked = selected.has(m.id);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        className="flex items-center gap-2 border-b border-border/40 px-3 py-2 text-start text-sm last:border-b-0 hover:bg-muted/40"
                        onClick={() => {
                          const next = new Set(selected);
                          if (checked) next.delete(m.id);
                          else next.add(m.id);
                          setSelected(next);
                        }}
                      >
                        <span
                          className={`flex size-4 shrink-0 items-center justify-center rounded-sm border ${
                            checked
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-muted-foreground/40"
                          }`}
                        >
                          {checked && <Check className="size-3" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">
                            {m.displayName}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {m.id}
                          </span>
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </>
          )}

          {!loading && catalog.length === 0 && !error && (
            <p className="text-sm text-muted-foreground">
              {t("agentModel.fetchEmpty")}
            </p>
          )}
        </div>

        <SheetFooter>
          <Button
            variant="outline"
            type="button"
            onClick={() => onOpenChange(false)}
          >
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            disabled={selected.size === 0}
            onClick={addSelected}
          >
            {t("agentModel.fetchConfirm", { count: selected.size })}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}