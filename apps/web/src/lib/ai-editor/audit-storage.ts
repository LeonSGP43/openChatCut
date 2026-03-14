import type { AuditEntry } from "./audit-log";
import { deserializeAuditEntries, serializeAuditEntries } from "./audit-log";

export interface StorageLike {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
	removeItem(key: string): void;
}

export const AI_AUDIT_STORAGE_KEY = "opencut:ai-editor:audit-entries";

export function loadAuditEntries({
	storage,
	key = AI_AUDIT_STORAGE_KEY,
}: {
	storage: StorageLike;
	key?: string;
}): AuditEntry[] {
	try {
		const raw = storage.getItem(key);
		if (!raw) {
			return [];
		}
		return deserializeAuditEntries(raw);
	} catch {
		return [];
	}
}

export function saveAuditEntries({
	storage,
	entries,
	key = AI_AUDIT_STORAGE_KEY,
}: {
	storage: StorageLike;
	entries: AuditEntry[];
	key?: string;
}): void {
	storage.setItem(key, serializeAuditEntries(entries));
}

export function clearAuditEntries({
	storage,
	key = AI_AUDIT_STORAGE_KEY,
}: {
	storage: StorageLike;
	key?: string;
}): void {
	storage.removeItem(key);
}
