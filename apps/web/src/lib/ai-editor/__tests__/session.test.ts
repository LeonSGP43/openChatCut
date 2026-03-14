import { describe, expect, test } from "bun:test";
import type { PlannedAction, PlannedActionType } from "../planner";
import {
	buildExecutionSummary,
	buildPlanSummary,
	createExecutionAuditEntry,
	createPlannedAuditEntry,
} from "../session";

const ACTION_LABELS: Record<PlannedActionType, string> = {
	"toggle-play": "Play/Pause",
	"stop-playback": "Stop Playback",
	"goto-start": "Go to Start",
	"goto-end": "Go to End",
	undo: "Undo",
	redo: "Redo",
	"split-at-playhead": "Split At Playhead",
	"select-all": "Select All",
	"deselect-all": "Deselect All",
	"copy-selected": "Copy Selected",
	"paste-copied": "Paste Copied",
	"duplicate-selected": "Duplicate Selected",
	"add-bookmark": "Toggle Bookmark",
	"delete-selected": "Delete Selected",
	"toggle-elements-muted-selected": "Toggle Mute Selected",
	"toggle-elements-visibility-selected": "Toggle Visibility Selected",
	"toggle-ripple-editing": "Toggle Ripple Editing",
	"toggle-snapping": "Toggle Snapping",
};

function buildPlan(type: PlannedActionType): PlannedAction {
	return {
		type,
		source: "keyword-match",
		matchedKeywords: [],
	};
}

describe("ai-editor session", () => {
	test("buildPlanSummary returns null when plans are empty", () => {
		expect(buildPlanSummary({ plans: [], actionLabels: ACTION_LABELS })).toBeNull();
	});

	test("buildPlanSummary returns deterministic summary for plans", () => {
		const plans = [buildPlan("toggle-play"), buildPlan("delete-selected")];
		const summary = buildPlanSummary({ plans, actionLabels: ACTION_LABELS });

		expect(summary).toEqual({
			text: "Dry-run plan (2, highest risk: high): Play/Pause, Delete Selected.",
			highestRiskLevel: "high",
			actionCount: 2,
		});
	});

	test("buildExecutionSummary returns success summary when no failures", () => {
		const summary = buildExecutionSummary({
			executed: ["toggle-play", "undo"],
			failed: [],
			actionLabels: ACTION_LABELS,
		});

		expect(summary).toBe("Executed 2 action(s): Play/Pause, Undo.");
	});

	test("buildExecutionSummary returns failure summary when failures exist", () => {
		const summary = buildExecutionSummary({
			executed: [],
			failed: ["delete-selected"],
			actionLabels: ACTION_LABELS,
		});

		expect(summary).toBe("Executed: none. Failed: Delete Selected.");
	});

	test("createPlannedAuditEntry creates planned status entry", () => {
		const entry = createPlannedAuditEntry({
			input: "plan this",
			plans: [buildPlan("split-at-playhead"), buildPlan("undo")],
		});

		expect(entry.status).toBe("planned");
		expect(entry.input).toBe("plan this");
		expect(entry.actions).toEqual(["split-at-playhead", "undo"]);
		expect(entry.id.startsWith("audit-")).toBe(true);
		expect(Number.isNaN(Date.parse(entry.timestamp))).toBe(false);
	});

	test("createExecutionAuditEntry marks failed when failed is non-empty", () => {
		const entry = createExecutionAuditEntry({
			input: "execute this",
			plans: [buildPlan("delete-selected")],
			failed: ["delete-selected"],
		});

		expect(entry.status).toBe("failed");
		expect(entry.actions).toEqual(["delete-selected"]);
	});

	test("createExecutionAuditEntry marks executed when failed is empty", () => {
		const entry = createExecutionAuditEntry({
			input: "execute this",
			plans: [buildPlan("toggle-play")],
			failed: [],
		});

		expect(entry.status).toBe("executed");
		expect(entry.actions).toEqual(["toggle-play"]);
	});
});
