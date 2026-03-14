import { describe, expect, test } from "bun:test";
import type { PlannedAction, PlannedActionType } from "../planner";
import {
	areAllRequiredConfirmed,
	buildConfirmationState,
	isActionConfirmationRequired,
	toggleActionConfirmation,
} from "../risk-confirmation";

function buildPlan(type: PlannedActionType): PlannedAction {
	return {
		type,
		source: "keyword-match",
		matchedKeywords: [],
	};
}

describe("ai-editor risk-confirmation", () => {
	test("buildConfirmationState extracts only high-risk action types", () => {
		const state = buildConfirmationState({
			plans: [
				buildPlan("toggle-play"),
				buildPlan("split-at-playhead"),
				buildPlan("delete-selected"),
			],
		});

		expect(state.planActionTypes).toEqual(["delete-selected"]);
		expect(state.confirmed).toEqual([]);
	});

	test("buildConfirmationState dedupes while preserving first-seen order", () => {
		const state = buildConfirmationState({
			plans: [
				buildPlan("delete-selected"),
				buildPlan("delete-selected"),
			],
		});

		expect(state.planActionTypes).toEqual(["delete-selected"]);
	});

	test("toggleActionConfirmation toggles on and off", () => {
		const initialState = buildConfirmationState({
			plans: [buildPlan("delete-selected")],
		});

		const toggledOn = toggleActionConfirmation({
			state: initialState,
			actionType: "delete-selected",
		});
		expect(toggledOn.confirmed).toEqual(["delete-selected"]);

		const toggledOff = toggleActionConfirmation({
			state: toggledOn,
			actionType: "delete-selected",
		});
		expect(toggledOff.confirmed).toEqual([]);
		// Ensure input state arrays were not mutated.
		expect(initialState.confirmed).toEqual([]);
		expect(initialState.planActionTypes).toEqual(["delete-selected"]);
	});

	test("toggleActionConfirmation is no-op for non-required action", () => {
		const state = buildConfirmationState({
			plans: [buildPlan("delete-selected")],
		});

		const next = toggleActionConfirmation({
			state,
			actionType: "undo",
		});

		expect(next).toEqual(state);
		expect(next).not.toBe(state);
	});

	test("areAllRequiredConfirmed true only when all required confirmed", () => {
		const state = buildConfirmationState({
			plans: [buildPlan("delete-selected")],
		});

		expect(areAllRequiredConfirmed({ state })).toBe(false);

		const confirmed = toggleActionConfirmation({
			state,
			actionType: "delete-selected",
		});
		expect(areAllRequiredConfirmed({ state: confirmed })).toBe(true);
	});

	test("isActionConfirmationRequired reflects required list", () => {
		const state = buildConfirmationState({
			plans: [buildPlan("delete-selected")],
		});

		expect(
			isActionConfirmationRequired({
				state,
				actionType: "delete-selected",
			}),
		).toBe(true);
		expect(
			isActionConfirmationRequired({
				state,
				actionType: "split-at-playhead",
			}),
		).toBe(false);
	});
});
