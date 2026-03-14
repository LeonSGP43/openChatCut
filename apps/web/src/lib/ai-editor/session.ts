import { createAuditEntry, type AuditEntry } from "./audit-log";
import type { PlannedAction, PlannedActionType } from "./planner";
import { summarizePlanRisk, type RiskLevel } from "./risk-policy";

export interface PlanSummary {
	text: string;
	highestRiskLevel: RiskLevel;
	actionCount: number;
}

function toActionList({
	actionTypes,
	actionLabels,
}: {
	actionTypes: PlannedActionType[];
	actionLabels: Record<PlannedActionType, string>;
}): string {
	if (actionTypes.length === 0) {
		return "none";
	}

	return actionTypes.map((type) => actionLabels[type]).join(", ");
}

export function buildPlanSummary({
	plans,
	actionLabels,
}: {
	plans: PlannedAction[];
	actionLabels: Record<PlannedActionType, string>;
}): PlanSummary | null {
	if (plans.length === 0) {
		return null;
	}

	const actionTypes = plans.map((plan) => plan.type);
	const riskSummary = summarizePlanRisk({ plans });
	const actionCount = plans.length;
	const text = `Dry-run plan (${actionCount}, highest risk: ${riskSummary.highestRiskLevel}): ${toActionList({ actionTypes, actionLabels })}.`;

	return {
		text,
		highestRiskLevel: riskSummary.highestRiskLevel,
		actionCount,
	};
}

export function buildExecutionSummary({
	executed,
	failed,
	actionLabels,
}: {
	executed: PlannedActionType[];
	failed: PlannedActionType[];
	actionLabels: Record<PlannedActionType, string>;
}): string {
	const executedText = toActionList({ actionTypes: executed, actionLabels });
	const failedText = toActionList({ actionTypes: failed, actionLabels });

	if (failed.length === 0) {
		return `Executed ${executed.length} action(s): ${executedText}.`;
	}

	return `Executed: ${executedText}. Failed: ${failedText}.`;
}

export function createPlannedAuditEntry({
	input,
	plans,
}: {
	input: string;
	plans: PlannedAction[];
}): AuditEntry {
	return createAuditEntry({
		input,
		actions: plans.map((plan) => plan.type),
		status: "planned",
	});
}

export function createExecutionAuditEntry({
	input,
	plans,
	failed,
}: {
	input: string;
	plans: PlannedAction[];
	failed: PlannedActionType[];
}): AuditEntry {
	return createAuditEntry({
		input,
		actions: plans.map((plan) => plan.type),
		status: failed.length > 0 ? "failed" : "executed",
	});
}
