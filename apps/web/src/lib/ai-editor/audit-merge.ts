import type { AuditEntry } from "./audit-log";

export type AuditMergeStrategy = "replace" | "append" | "dedupe";

export function mergeAuditEntries({
	currentEntries,
	importedEntries,
	strategy,
}: {
	currentEntries: AuditEntry[];
	importedEntries: AuditEntry[];
	strategy: AuditMergeStrategy;
}): AuditEntry[] {
	if (strategy === "replace") {
		return [...importedEntries];
	}

	if (strategy === "append") {
		return [...currentEntries, ...importedEntries];
	}

	const order: string[] = [];
	const byId = new Map<string, AuditEntry>();

	for (const entry of currentEntries) {
		if (!byId.has(entry.id)) {
			order.push(entry.id);
			byId.set(entry.id, entry);
		}
	}

	for (const entry of importedEntries) {
		if (!byId.has(entry.id)) {
			order.push(entry.id);
		}
		byId.set(entry.id, entry);
	}

	return order.map((id) => byId.get(id) as AuditEntry);
}
