import type { PlannedAction, PlannedActionType } from "./planner";

export type RiskLevel = "low" | "medium" | "high";

interface ActionRisk {
	type: PlannedActionType;
	level: RiskLevel;
}

export interface PlanRiskSummary {
	highestRiskLevel: RiskLevel;
	requiresConfirmation: boolean;
	actionRisks: ActionRisk[];
}

const ACTION_RISK_LEVEL: Record<PlannedActionType, RiskLevel> = {
	"toggle-play": "low",
	"stop-playback": "low",
	"goto-start": "low",
	"goto-end": "low",
	"select-all": "low",
	"deselect-all": "low",
	"copy-selected": "low",
	"paste-copied": "medium",
	"duplicate-selected": "medium",
	undo: "medium",
	redo: "medium",
	"split-at-playhead": "medium",
	"add-bookmark": "low",
	"delete-selected": "high",
	"toggle-elements-muted-selected": "medium",
	"toggle-elements-visibility-selected": "medium",
	"toggle-snapping": "low",
	"toggle-ripple-editing": "medium",
};

const RISK_RANK: Record<RiskLevel, number> = {
	low: 1,
	medium: 2,
	high: 3,
};

export function getActionRiskLevel({
	actionType,
}: {
	actionType: PlannedActionType;
}): RiskLevel {
	return ACTION_RISK_LEVEL[actionType];
}

export function summarizePlanRisk({
	plans,
}: {
	plans: PlannedAction[];
}): PlanRiskSummary {
	if (plans.length === 0) {
		return {
			highestRiskLevel: "low",
			requiresConfirmation: false,
			actionRisks: [],
		};
	}

	let highestRiskLevel: RiskLevel = "low";
	const actionRisks: ActionRisk[] = [];

	for (const plan of plans) {
		const level = getActionRiskLevel({ actionType: plan.type });
		actionRisks.push({ type: plan.type, level });
		if (RISK_RANK[level] > RISK_RANK[highestRiskLevel]) {
			highestRiskLevel = level;
		}
	}

	return {
		highestRiskLevel,
		requiresConfirmation: highestRiskLevel === "high",
		actionRisks,
	};
}
