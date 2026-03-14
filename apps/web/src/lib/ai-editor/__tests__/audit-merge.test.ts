import { describe, expect, test } from "bun:test";
import { createAuditEntry } from "../audit-log";
import { mergeAuditEntries } from "../audit-merge";

function entry({
	id,
	input,
	timestamp,
}: {
	id: string;
	input: string;
	timestamp: string;
}) {
	return createAuditEntry({
		id,
		timestamp,
		input,
		actions: ["undo"],
		status: "executed",
	});
}

describe("ai-editor audit-merge", () => {
	test("replace returns only imported entries", () => {
		const currentEntries = [
			entry({
				id: "id-1",
				input: "current-1",
				timestamp: "2026-03-13T10:00:00.000Z",
			}),
		];
		const importedEntries = [
			entry({
				id: "id-2",
				input: "imported-1",
				timestamp: "2026-03-13T11:00:00.000Z",
			}),
		];

		const merged = mergeAuditEntries({
			currentEntries,
			importedEntries,
			strategy: "replace",
		});

		expect(merged).toEqual(importedEntries);
		expect(merged).not.toBe(importedEntries);
		expect(currentEntries).toHaveLength(1);
	});

	test("append concatenates current and imported in order", () => {
		const currentEntries = [
			entry({
				id: "id-1",
				input: "current-1",
				timestamp: "2026-03-13T10:00:00.000Z",
			}),
			entry({
				id: "id-2",
				input: "current-2",
				timestamp: "2026-03-13T10:01:00.000Z",
			}),
		];
		const importedEntries = [
			entry({
				id: "id-3",
				input: "imported-1",
				timestamp: "2026-03-13T11:00:00.000Z",
			}),
		];

		const merged = mergeAuditEntries({
			currentEntries,
			importedEntries,
			strategy: "append",
		});

		expect(merged.map((item) => item.id)).toEqual(["id-1", "id-2", "id-3"]);
		expect(currentEntries.map((item) => item.id)).toEqual(["id-1", "id-2"]);
		expect(importedEntries.map((item) => item.id)).toEqual(["id-3"]);
	});

	test("dedupe keeps first-seen order and imported overrides current on conflicts", () => {
		const currentEntries = [
			entry({
				id: "id-1",
				input: "current-1",
				timestamp: "2026-03-13T10:00:00.000Z",
			}),
			entry({
				id: "id-2",
				input: "current-2",
				timestamp: "2026-03-13T10:01:00.000Z",
			}),
			entry({
				id: "id-3",
				input: "current-3",
				timestamp: "2026-03-13T10:02:00.000Z",
			}),
		];
		const importedEntries = [
			entry({
				id: "id-2",
				input: "imported-2",
				timestamp: "2026-03-13T11:00:00.000Z",
			}),
			entry({
				id: "id-4",
				input: "imported-4",
				timestamp: "2026-03-13T11:01:00.000Z",
			}),
			entry({
				id: "id-1",
				input: "imported-1",
				timestamp: "2026-03-13T11:02:00.000Z",
			}),
		];

		const merged = mergeAuditEntries({
			currentEntries,
			importedEntries,
			strategy: "dedupe",
		});

		expect(merged.map((item) => item.id)).toEqual(["id-1", "id-2", "id-3", "id-4"]);
		expect(merged[0]?.input).toBe("imported-1");
		expect(merged[1]?.input).toBe("imported-2");
		expect(merged[2]?.input).toBe("current-3");
		expect(merged[3]?.input).toBe("imported-4");
	});

	test("dedupe keeps deterministic order with duplicate ids inside imported list", () => {
		const currentEntries = [
			entry({
				id: "id-1",
				input: "current-1",
				timestamp: "2026-03-13T10:00:00.000Z",
			}),
		];
		const importedEntries = [
			entry({
				id: "id-1",
				input: "imported-1a",
				timestamp: "2026-03-13T11:00:00.000Z",
			}),
			entry({
				id: "id-2",
				input: "imported-2",
				timestamp: "2026-03-13T11:01:00.000Z",
			}),
			entry({
				id: "id-1",
				input: "imported-1b",
				timestamp: "2026-03-13T11:02:00.000Z",
			}),
		];

		const merged = mergeAuditEntries({
			currentEntries,
			importedEntries,
			strategy: "dedupe",
		});

		expect(merged.map((item) => item.id)).toEqual(["id-1", "id-2"]);
		expect(merged[0]?.input).toBe("imported-1b");
		expect(merged[1]?.input).toBe("imported-2");
	});
});
