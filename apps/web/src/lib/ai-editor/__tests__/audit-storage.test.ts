import { describe, expect, test } from "bun:test";
import { createAuditEntry } from "../audit-log";
import {
	AI_AUDIT_STORAGE_KEY,
	clearAuditEntries,
	loadAuditEntries,
	saveAuditEntries,
	type StorageLike,
} from "../audit-storage";

class MemoryStorage implements StorageLike {
	private data = new Map<string, string>();

	getItem(key: string): string | null {
		return this.data.get(key) ?? null;
	}

	setItem(key: string, value: string): void {
		this.data.set(key, value);
	}

	removeItem(key: string): void {
		this.data.delete(key);
	}
}

describe("ai-editor audit-storage", () => {
	test("save/load roundtrip works", () => {
		const storage = new MemoryStorage();
		const entries = [
			createAuditEntry({
				id: "a1",
				timestamp: "2026-03-13T00:00:00.000Z",
				input: "play and split",
				actions: ["toggle-play", "split-at-playhead"],
				status: "planned",
			}),
		];

		saveAuditEntries({ storage, entries });
		const loaded = loadAuditEntries({ storage });

		expect(loaded).toEqual(entries);
	});

	test("invalid payload falls back to empty array", () => {
		const storage = new MemoryStorage();
		storage.setItem(AI_AUDIT_STORAGE_KEY, "{this-is-not-json");

		expect(loadAuditEntries({ storage })).toEqual([]);
	});

	test("clear removes key", () => {
		const storage = new MemoryStorage();
		storage.setItem(AI_AUDIT_STORAGE_KEY, "[]");

		clearAuditEntries({ storage });

		expect(storage.getItem(AI_AUDIT_STORAGE_KEY)).toBeNull();
		expect(loadAuditEntries({ storage })).toEqual([]);
	});

	test("custom key is supported", () => {
		const storage = new MemoryStorage();
		const customKey = "custom-ai-audit-key";
		const entries = [
			createAuditEntry({
				id: "a2",
				timestamp: "2026-03-13T00:01:00.000Z",
				input: "undo",
				actions: ["undo"],
				status: "executed",
			}),
		];

		saveAuditEntries({ storage, entries, key: customKey });

		expect(loadAuditEntries({ storage })).toEqual([]);
		expect(loadAuditEntries({ storage, key: customKey })).toEqual(entries);
	});
});
