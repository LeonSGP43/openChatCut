import { describe, expect, test } from "bun:test";
import type { PlannedAction } from "../planner";
import { getActionRiskLevel, summarizePlanRisk } from "../risk-policy";

function buildPlan(type: PlannedAction["type"]): PlannedAction {
	return {
		type,
		source: "keyword-match",
		matchedKeywords: [],
	};
}

describe("ai-editor risk-policy", () => {
	test("maps all action types to expected risk level", () => {
		expect(getActionRiskLevel({ actionType: "toggle-play" })).toBe("low");
		expect(getActionRiskLevel({ actionType: "stop-playback" })).toBe("low");
		expect(getActionRiskLevel({ actionType: "goto-start" })).toBe("low");
		expect(getActionRiskLevel({ actionType: "goto-end" })).toBe("low");
		expect(getActionRiskLevel({ actionType: "select-all" })).toBe("low");
		expect(getActionRiskLevel({ actionType: "deselect-all" })).toBe("low");
		expect(getActionRiskLevel({ actionType: "copy-selected" })).toBe("low");
		expect(getActionRiskLevel({ actionType: "add-bookmark" })).toBe("low");
		expect(getActionRiskLevel({ actionType: "toggle-snapping" })).toBe("low");
		expect(getActionRiskLevel({ actionType: "split-at-playhead" })).toBe(
			"medium",
		);
		expect(getActionRiskLevel({ actionType: "paste-copied" })).toBe("medium");
		expect(getActionRiskLevel({ actionType: "duplicate-selected" })).toBe(
			"medium",
		);
		expect(
			getActionRiskLevel({ actionType: "toggle-elements-muted-selected" }),
		).toBe("medium");
		expect(
			getActionRiskLevel({ actionType: "toggle-elements-visibility-selected" }),
		).toBe("medium");
		expect(getActionRiskLevel({ actionType: "toggle-ripple-editing" })).toBe(
			"medium",
		);
		expect(getActionRiskLevel({ actionType: "undo" })).toBe("medium");
		expect(getActionRiskLevel({ actionType: "redo" })).toBe("medium");
		expect(getActionRiskLevel({ actionType: "delete-selected" })).toBe("high");
	});

	test("aggregates highest risk and preserves action order", () => {
		const summary = summarizePlanRisk({
			plans: [
				buildPlan("goto-start"),
				buildPlan("paste-copied"),
				buildPlan("toggle-elements-visibility-selected"),
				buildPlan("delete-selected"),
				buildPlan("copy-selected"),
			],
		});

		expect(summary.highestRiskLevel).toBe("high");
		expect(summary.requiresConfirmation).toBe(true);
		expect(summary.actionRisks).toEqual([
			{ type: "goto-start", level: "low" },
			{ type: "paste-copied", level: "medium" },
			{ type: "toggle-elements-visibility-selected", level: "medium" },
			{ type: "delete-selected", level: "high" },
			{ type: "copy-selected", level: "low" },
		]);
	});

	test("requires confirmation only when highest risk is high", () => {
		const mediumSummary = summarizePlanRisk({
			plans: [buildPlan("paste-copied"), buildPlan("toggle-ripple-editing")],
		});
		expect(mediumSummary.highestRiskLevel).toBe("medium");
		expect(mediumSummary.requiresConfirmation).toBe(false);

		const lowSummary = summarizePlanRisk({
			plans: [buildPlan("goto-end"), buildPlan("deselect-all")],
		});
		expect(lowSummary.highestRiskLevel).toBe("low");
		expect(lowSummary.requiresConfirmation).toBe(false);
	});

	test("returns low risk defaults for empty plans", () => {
		const summary = summarizePlanRisk({ plans: [] });
		expect(summary).toEqual({
			highestRiskLevel: "low",
			requiresConfirmation: false,
			actionRisks: [],
		});
	});
});
