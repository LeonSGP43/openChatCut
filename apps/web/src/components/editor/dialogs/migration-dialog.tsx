"use client";

import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { useEditor } from "@/hooks/use-editor";
import { Loader2 } from "lucide-react";
import { useI18n } from "@/components/providers/i18n-provider";

export function MigrationDialog() {
	const editor = useEditor();
	const { t } = useI18n();
	const migrationState = editor.project.getMigrationState();

	if (!migrationState.isMigrating) return null;

	const title = migrationState.projectName
		? t("dialogs.migration.updatingProject")
		: t("dialogs.migration.updatingProjects");
	const description = migrationState.projectName
		? t("dialogs.migration.descriptionSingle", {
				name: migrationState.projectName,
				fromVersion: migrationState.fromVersion ?? "-",
				toVersion: migrationState.toVersion ?? "-",
			})
		: t("dialogs.migration.descriptionMultiple", {
				fromVersion: migrationState.fromVersion ?? "-",
				toVersion: migrationState.toVersion ?? "-",
			});

	return (
		<Dialog open={true}>
			<DialogContent
				className="sm:max-w-md"
				onPointerDownOutside={(event) => event.preventDefault()}
				onEscapeKeyDown={(event) => event.preventDefault()}
			>
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>{description}</DialogDescription>
				</DialogHeader>

				<div className="flex items-center justify-center py-4">
					<Loader2 className="text-muted-foreground size-8 animate-spin" />
				</div>
			</DialogContent>
		</Dialog>
	);
}
