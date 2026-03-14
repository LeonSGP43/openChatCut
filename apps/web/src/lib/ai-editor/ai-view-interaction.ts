import type { AuditEntry } from "./audit-log";
import { mergeAuditEntries, type AuditMergeStrategy } from "./audit-merge";

export interface AuditImportPreview {
	fileName: string;
	strategy: AuditMergeStrategy;
	currentEntryCount: number;
	incomingEntryCount: number;
	totalAfterApply: number;
	dedupedCount: number;
	mergedEntries: AuditEntry[];
}

export function buildAuditImportPreview({
	fileName,
	currentEntries,
	importedEntries,
	strategy,
}: {
	fileName: string;
	currentEntries: AuditEntry[];
	importedEntries: AuditEntry[];
	strategy: AuditMergeStrategy;
}): AuditImportPreview {
	const mergedEntries = mergeAuditEntries({
		currentEntries,
		importedEntries,
		strategy,
	});
	const currentEntryCount = currentEntries.length;
	const incomingEntryCount = importedEntries.length;
	const totalAfterApply = mergedEntries.length;
	const dedupedCount =
		strategy === "dedupe"
			? Math.max(0, currentEntryCount + incomingEntryCount - totalAfterApply)
			: 0;

	return {
		fileName,
		strategy,
		currentEntryCount,
		incomingEntryCount,
		totalAfterApply,
		dedupedCount,
		mergedEntries,
	};
}

export function buildAuditImportPreviewMessage({
	preview,
}: {
	preview: AuditImportPreview;
}): string {
	return `Import preview ready (${preview.fileName}): incoming ${preview.incomingEntryCount}, current ${preview.currentEntryCount}, mode: ${preview.strategy}, total after apply: ${preview.totalAfterApply}.`;
}

export function buildAuditImportAppliedMessage({
	preview,
}: {
	preview: AuditImportPreview;
}): string {
	return `Audit imported (${preview.incomingEntryCount} entries, mode: ${preview.strategy}, total: ${preview.totalAfterApply}).`;
}
