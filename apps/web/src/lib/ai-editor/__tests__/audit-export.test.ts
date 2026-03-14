import { describe, expect, test } from "bun:test";
import { createAuditEntry } from "../audit-log";
import {
	buildAuditExportPayload,
	parseAuditExportPayload,
	serializeAuditExportPayload,
} from "../audit-export";

describe("ai-editor audit-export", () => {
	test("build payload uses count and timestamp", () => {
		const exportedAt = "2026-03-13T12:00:00.000Z";
		const entries = [
			createAuditEntry({
				id: "audit-1",
				timestamp: "2026-03-13T10:00:00.000Z",
				input: "undo",
				actions: ["undo"],
				status: "planned",
			}),
			createAuditEntry({
				id: "audit-2",
				timestamp: "2026-03-13T11:00:00.000Z",
				input: "play",
				actions: ["toggle-play"],
				status: "executed",
			}),
		];

		const payload = buildAuditExportPayload({ entries, exportedAt });
		expect(payload.schemaVersion).toBe(1);
		expect(payload.exportedAt).toBe(exportedAt);
		expect(payload.entryCount).toBe(2);
		expect(payload.entries).toEqual(entries);
	});

	test("serialize and parse roundtrip", () => {
		const payload = buildAuditExportPayload({
			entries: [
				createAuditEntry({
					id: "audit-3",
					timestamp: "2026-03-13T12:01:00.000Z",
					input: "delete selected",
					actions: ["delete-selected"],
					status: "failed",
				}),
			],
			exportedAt: "2026-03-13T12:02:00.000Z",
		});

		const raw = serializeAuditExportPayload({ payload });
		const parsed = parseAuditExportPayload({ raw });
		expect(parsed).toEqual(payload);
	});

	test("rejects invalid json", () => {
		expect(parseAuditExportPayload({ raw: "{bad json" })).toBeNull();
	});

	test("rejects wrong schema", () => {
		const raw = JSON.stringify({
			schemaVersion: 2,
			exportedAt: "2026-03-13T12:00:00.000Z",
			entryCount: 0,
			entries: [],
		});

		expect(parseAuditExportPayload({ raw })).toBeNull();
	});

	test("rejects mismatched entryCount", () => {
		const raw = JSON.stringify({
			schemaVersion: 1,
			exportedAt: "2026-03-13T12:00:00.000Z",
			entryCount: 2,
			entries: [
				{
					id: "audit-4",
					timestamp: "2026-03-13T12:00:00.000Z",
					input: "redo",
					actions: ["redo"],
					status: "executed",
				},
			],
		});

		expect(parseAuditExportPayload({ raw })).toBeNull();
	});
});
