import { describe, expect, test } from "bun:test";
import { createAuditEntry } from "../audit-log";
import {
	buildAuditImportAppliedMessage,
	buildAuditImportPreview,
	buildAuditImportPreviewMessage,
} from "../ai-view-interaction";

function entry({
	id,
	input,
}: {
	id: string;
	input: string;
}) {
	return createAuditEntry({
		id,
		timestamp: "2026-03-14T00:00:00.000Z",
		input,
		actions: ["undo"],
		status: "executed",
	});
}

describe("ai-editor ai-view interaction", () => {
	test("builds replace-mode import preview", () => {
		const preview = buildAuditImportPreview({
			fileName: "audit.json",
			currentEntries: [entry({ id: "c-1", input: "current" })],
			importedEntries: [
				entry({ id: "i-1", input: "imported-1" }),
				entry({ id: "i-2", input: "imported-2" }),
			],
			strategy: "replace",
		});

		expect(preview.currentEntryCount).toBe(1);
		expect(preview.incomingEntryCount).toBe(2);
		expect(preview.totalAfterApply).toBe(2);
		expect(preview.dedupedCount).toBe(0);
		expect(preview.mergedEntries.map((item) => item.id)).toEqual(["i-1", "i-2"]);
	});

	test("builds dedupe-mode import preview with conflict count", () => {
		const preview = buildAuditImportPreview({
			fileName: "audit.json",
			currentEntries: [
				entry({ id: "same", input: "current-same" }),
				entry({ id: "c-2", input: "current-2" }),
			],
			importedEntries: [
				entry({ id: "same", input: "imported-same" }),
				entry({ id: "i-2", input: "imported-2" }),
			],
			strategy: "dedupe",
		});

		expect(preview.totalAfterApply).toBe(3);
		expect(preview.dedupedCount).toBe(1);
		expect(preview.mergedEntries.find((item) => item.id === "same")?.input).toBe(
			"imported-same",
		);
	});

	test("formats preview and applied messages", () => {
		const preview = buildAuditImportPreview({
			fileName: "snapshot.json",
			currentEntries: [entry({ id: "c-1", input: "current" })],
			importedEntries: [entry({ id: "i-1", input: "imported" })],
			strategy: "append",
		});

		expect(buildAuditImportPreviewMessage({ preview })).toBe(
			"Import preview ready (snapshot.json): incoming 1, current 1, mode: append, total after apply: 2.",
		);
		expect(buildAuditImportAppliedMessage({ preview })).toBe(
			"Audit imported (1 entries, mode: append, total: 2).",
		);
	});
});
