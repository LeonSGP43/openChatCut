import type { AuditMergeStrategy } from "./audit-merge";
import type { PlannedActionType } from "./planner";
import type { RiskLevel } from "./risk-policy";

export type AIEditorTelemetryEvent =
	| {
			type: "plan-generated";
			inputLength: number;
			actionCount: number;
			highestRiskLevel: RiskLevel;
			actions: PlannedActionType[];
	  }
	| {
			type: "plan-empty";
			inputLength: number;
			reason: "no-match" | "empty-input";
	  }
	| {
			type: "execute-result";
			attemptedCount: number;
			executedCount: number;
			failedCount: number;
			failedActions: PlannedActionType[];
	  }
	| {
			type: "audit-export-result";
			success: boolean;
			entryCount: number;
	  }
	| {
			type: "audit-import-result";
			success: boolean;
			entryCount: number;
			totalCount: number;
			strategy: AuditMergeStrategy;
	  };

export interface TelemetryEnvelope {
	domain: "ai-editor";
	timestamp: string;
	event: AIEditorTelemetryEvent;
}

export type TelemetrySink = (envelope: TelemetryEnvelope) => void;

let telemetrySink: TelemetrySink | null = null;

export function createTelemetryEnvelope({
	event,
	timestamp,
}: {
	event: AIEditorTelemetryEvent;
	timestamp?: string;
}): TelemetryEnvelope {
	return {
		domain: "ai-editor",
		timestamp: timestamp ?? new Date().toISOString(),
		event,
	};
}

export function setTelemetrySink({ sink }: { sink: TelemetrySink }): void {
	telemetrySink = sink;
}

export function clearTelemetrySink(): void {
	telemetrySink = null;
}

export function emitTelemetryEvent({
	event,
	timestamp,
}: {
	event: AIEditorTelemetryEvent;
	timestamp?: string;
}): TelemetryEnvelope {
	const envelope = createTelemetryEnvelope({ event, timestamp });
	telemetrySink?.(envelope);
	return envelope;
}
