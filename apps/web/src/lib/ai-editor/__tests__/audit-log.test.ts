import { describe, expect, test } from "bun:test";
import {
	appendAuditEntry,
	createAuditEntry,
	deserializeAuditEntries,
	serializeAuditEntries,
} from "../audit-log";
import type { AuditEntry } from "../audit-log";

describe("ai-editor audit-log", () => {
	test("createAuditEntry returns a valid structure", () => {
		const entry = createAuditEntry({
			input: "播放并分割",
			actions: ["toggle-play", "split-at-playhead"],
			status: "planned",
			id: "audit-1",
			timestamp: "2026-03-13T12:00:00.000Z",
		});

		expect(entry).toEqual({
			id: "audit-1",
			timestamp: "2026-03-13T12:00:00.000Z",
			input: "播放并分割",
			actions: ["toggle-play", "split-at-playhead"],
			status: "planned",
		});
	});

	test("appendAuditEntry caps list to max entries", () => {
		let entries: AuditEntry[] = [];

		for (let i = 1; i <= 205; i++) {
			entries = appendAuditEntry({
				entries,
				entry: createAuditEntry({
					input: `input-${i}`,
					actions: ["undo"],
					status: "executed",
					id: `id-${i}`,
					timestamp: `2026-03-13T12:00:${String(i).padStart(2, "0")}Z`,
				}),
			});
		}

		expect(entries).toHaveLength(200);
		expect(entries[0]?.id).toBe("id-6");
		expect(entries.at(-1)?.id).toBe("id-205");
	});

	test("serialize/deserialize roundtrip works", () => {
		const source: AuditEntry[] = [
			createAuditEntry({
				input: "undo",
				actions: ["undo"],
				status: "executed",
				id: "id-1",
				timestamp: "2026-03-13T12:10:00.000Z",
			}),
			createAuditEntry({
				input: "redo",
				actions: ["redo"],
				status: "failed",
				id: "id-2",
				timestamp: "2026-03-13T12:11:00.000Z",
			}),
		];

		const serialized = serializeAuditEntries(source);
		const restored = deserializeAuditEntries(serialized);

		expect(restored).toEqual(source);
	});

	test("deserialize keeps expanded action types", () => {
		const raw = JSON.stringify([
			{
				id: "id-expanded",
				timestamp: "2026-03-13T12:12:00.000Z",
				input: "stop and duplicate",
				actions: ["stop-playback", "duplicate-selected"],
				status: "executed",
			},
		]);

		const restored = deserializeAuditEntries(raw);
		expect(restored).toHaveLength(1);
		expect(restored[0]?.actions).toEqual([
			"stop-playback",
			"duplicate-selected",
		]);
	});

	test("deserialize falls back to empty list for invalid payload", () => {
		expect(deserializeAuditEntries("not-json")).toEqual([]);
		expect(deserializeAuditEntries("{}")).toEqual([]);
		expect(
			deserializeAuditEntries(
				JSON.stringify([{ foo: "bar" }, { id: 1, status: "planned" }]),
			),
		).toEqual([]);
	});
});
