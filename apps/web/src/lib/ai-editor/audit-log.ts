import { PLANNED_ACTION_ORDER, type PlannedActionType } from "./planner";

export type AuditStatus = "planned" | "executed" | "failed";

export interface AuditEntry {
	id: string;
	timestamp: string;
	input: string;
	actions: PlannedActionType[];
	status: AuditStatus;
}

function generateAuditId(): string {
	const random = Math.random().toString(36).slice(2, 10);
	return `audit-${Date.now()}-${random}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function isAuditStatus(value: unknown): value is AuditStatus {
	return value === "planned" || value === "executed" || value === "failed";
}

const PLANNED_ACTION_TYPE_SET = new Set<string>(PLANNED_ACTION_ORDER);

function isPlannedActionType(value: unknown): value is PlannedActionType {
	return typeof value === "string" && PLANNED_ACTION_TYPE_SET.has(value);
}

function isAuditEntry(value: unknown): value is AuditEntry {
	if (!isRecord(value)) {
		return false;
	}

	if (
		typeof value.id !== "string" ||
		typeof value.timestamp !== "string" ||
		typeof value.input !== "string" ||
		!isAuditStatus(value.status)
	) {
		return false;
	}

	if (!Array.isArray(value.actions)) {
		return false;
	}

	return value.actions.every((item) => isPlannedActionType(item));
}

export function createAuditEntry({
	input,
	actions,
	status,
	id,
	timestamp,
}: {
	input: string;
	actions: PlannedActionType[];
	status: AuditStatus;
	id?: string;
	timestamp?: string;
}): AuditEntry {
	return {
		id: id ?? generateAuditId(),
		timestamp: timestamp ?? new Date().toISOString(),
		input,
		actions: [...actions],
		status,
	};
}

export function appendAuditEntry({
	entries,
	entry,
	maxEntries = 200,
}: {
	entries: AuditEntry[];
	entry: AuditEntry;
	maxEntries?: number;
}): AuditEntry[] {
	if (maxEntries <= 0) {
		return [entry];
	}

	const next = [...entries, entry];
	if (next.length <= maxEntries) {
		return next;
	}

	return next.slice(next.length - maxEntries);
}

export function serializeAuditEntries(entries: AuditEntry[]): string {
	return JSON.stringify(entries);
}

export function deserializeAuditEntries(raw: string): AuditEntry[] {
	try {
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed)) {
			return [];
		}

		return parsed.filter((item): item is AuditEntry => isAuditEntry(item));
	} catch {
		return [];
	}
}
