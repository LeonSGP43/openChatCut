import type { PlannedAction, PlannedActionType } from "./planner";
import { getActionRiskLevel } from "./risk-policy";

export interface ConfirmationState {
	planActionTypes: PlannedActionType[];
	confirmed: PlannedActionType[];
}

export function buildConfirmationState({
	plans,
}: {
	plans: PlannedAction[];
}): ConfirmationState {
	const seen = new Set<PlannedActionType>();
	const planActionTypes: PlannedActionType[] = [];

	for (const plan of plans) {
		if (getActionRiskLevel({ actionType: plan.type }) !== "high") {
			continue;
		}
		if (seen.has(plan.type)) {
			continue;
		}
		seen.add(plan.type);
		planActionTypes.push(plan.type);
	}

	return {
		planActionTypes,
		confirmed: [],
	};
}

export function toggleActionConfirmation({
	state,
	actionType,
}: {
	state: ConfirmationState;
	actionType: PlannedActionType;
}): ConfirmationState {
	if (!state.planActionTypes.includes(actionType)) {
		return {
			planActionTypes: [...state.planActionTypes],
			confirmed: [...state.confirmed],
		};
	}

	if (state.confirmed.includes(actionType)) {
		return {
			planActionTypes: [...state.planActionTypes],
			confirmed: state.confirmed.filter((item) => item !== actionType),
		};
	}

	return {
		planActionTypes: [...state.planActionTypes],
		confirmed: [...state.confirmed, actionType],
	};
}

export function areAllRequiredConfirmed({
	state,
}: {
	state: ConfirmationState;
}): boolean {
	return state.planActionTypes.every((actionType) =>
		state.confirmed.includes(actionType),
	);
}

export function isActionConfirmationRequired({
	state,
	actionType,
}: {
	state: ConfirmationState;
	actionType: PlannedActionType;
}): boolean {
	return state.planActionTypes.includes(actionType);
}
