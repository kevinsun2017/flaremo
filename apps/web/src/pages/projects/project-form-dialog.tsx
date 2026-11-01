import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { createProject, type Project, updateProject } from "@/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/i18n";
import { errorMessage } from "@/lib/error";
import { stripResourceName } from "@/lib/utils";

export function ProjectFormDialog({
  open,
  project,
  onSaved,
  onOpenChange,
}: {
  open: boolean;
  project?: Project;
  onSaved: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(project?.name ?? "");
  const [description, setDescription] = useState(project?.description ?? "");

  const saveMutation = useMutation({
    mutationFn: () =>
      project
        ? updateProject(stripResourceName(project.id, "projects"), {
            name,
            description: description || null,
          })
        : createProject({ name, description: description || undefined }),
    onSuccess: () => {
      toast.success(
        t(project ? "toast.projectUpdated" : "toast.projectCreated"),
      );
      if (!project) {
        setName("");
        setDescription("");
      }
      onOpenChange(false);
      onSaved();
    },
    onError: (error) =>
      toast.error(
        errorMessage(
          error,
          t(
            project ? "toast.projectUpdateFailed" : "toast.projectCreateFailed",
          ),
        ),
      ),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {project ? t("projects.editProject") : t("projects.newProject")}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <Field label={t("projects.field.name")}>
            <Input
              value={name}
              placeholder={t("projects.namePlaceholder")}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field label={t("projects.field.description")}>
            <Textarea
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </Field>
        </div>
        <DialogFooter>
          <Button
            disabled={!name.trim() || saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
