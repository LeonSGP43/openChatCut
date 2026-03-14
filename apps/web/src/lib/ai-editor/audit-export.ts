import type { AuditEntry } from "./audit-log";
import { deserializeAuditEntries } from "./audit-log";

export interface AuditExportPayload {
	schemaVersion: 1;
	exportedAt: string;
	entryCount: number;
	entries: AuditEntry[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

export function buildAuditExportPayload({
	entries,
	exportedAt,
}: {
	entries: AuditEntry[];
	exportedAt?: string;
}): AuditExportPayload {
	const safeEntries = [...entries];

	return {
		schemaVersion: 1,
		exportedAt: exportedAt ?? new Date().toISOString(),
		entryCount: safeEntries.length,
		entries: safeEntries,
	};
}

export function serializeAuditExportPayload({
	payload,
}: {
	payload: AuditExportPayload;
}): string {
	return JSON.stringify(payload);
}

export function parseAuditExportPayload({
	raw,
}: {
	raw: string;
}): AuditExportPayload | null {
	try {
		const parsed: unknown = JSON.parse(raw);
		if (!isRecord(parsed)) {
			return null;
		}

		if (parsed.schemaVersion !== 1) {
			return null;
		}
		if (typeof parsed.exportedAt !== "string") {
			return null;
		}
		if (typeof parsed.entryCount !== "number") {
			return null;
		}
		if (!Array.isArray(parsed.entries)) {
			return null;
		}

		const entries = deserializeAuditEntries(JSON.stringify(parsed.entries));
		if (entries.length !== parsed.entries.length) {
			return null;
		}
		if (parsed.entryCount !== entries.length) {
			return null;
		}

		return {
			schemaVersion: 1,
			exportedAt: parsed.exportedAt,
			entryCount: parsed.entryCount,
			entries,
		};
	} catch {
		return null;
	}
}
