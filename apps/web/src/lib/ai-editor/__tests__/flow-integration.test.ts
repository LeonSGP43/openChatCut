import { describe, expect, test } from "bun:test";
import { appendAuditEntry, type AuditEntry } from "../audit-log";
import { executePlannedActions } from "../executor";
import { planEditorActions, type PlannedActionType } from "../planner";
import {
	areAllRequiredConfirmed,
	buildConfirmationState,
	toggleActionConfirmation,
} from "../risk-confirmation";
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

describe("ai-editor flow integration", () => {
	test("happy path: plan summary executes successfully and writes executed audit", () => {
		const input = "play then split and add bookmark";
		const plans = planEditorActions({ input });

		expect(plans.map((plan) => plan.type)).toEqual([
			"toggle-play",
			"split-at-playhead",
			"add-bookmark",
		]);

		const planSummary = buildPlanSummary({ plans, actionLabels: ACTION_LABELS });
		expect(planSummary).toEqual({
			text: "Dry-run plan (3, highest risk: medium): Play/Pause, Split At Playhead, Toggle Bookmark.",
			highestRiskLevel: "medium",
			actionCount: 3,
		});

		const confirmationState = buildConfirmationState({ plans });
		expect(confirmationState).toEqual({
			planActionTypes: [],
			confirmed: [],
		});
		expect(areAllRequiredConfirmed({ state: confirmationState })).toBe(true);

		const called: string[] = [];
		const execution = executePlannedActions({
			plans,
			runAction: (actionName) => {
				called.push(actionName);
			},
		});

		expect(called).toEqual(["toggle-play", "split", "toggle-bookmark"]);
		expect(execution).toEqual({
			executed: ["toggle-play", "split-at-playhead", "add-bookmark"],
			failed: [],
		});
		expect(
			buildExecutionSummary({
				executed: execution.executed,
				failed: execution.failed,
				actionLabels: ACTION_LABELS,
			}),
		).toBe("Executed 3 action(s): Play/Pause, Split At Playhead, Toggle Bookmark.");

		let audits: AuditEntry[] = [];
		audits = appendAuditEntry({
			entries: audits,
			entry: createPlannedAuditEntry({ input, plans }),
		});
		audits = appendAuditEntry({
			entries: audits,
			entry: createExecutionAuditEntry({
				input,
				plans,
				failed: execution.failed,
			}),
		});

		expect(audits.map((entry) => entry.status)).toEqual(["planned", "executed"]);
		expect(audits[1]?.actions).toEqual([
			"toggle-play",
			"split-at-playhead",
			"add-bookmark",
		]);
	});

	test("high-risk path: delete-selected requires confirmation before execute", () => {
		const input = "delete selected";
		const plans = planEditorActions({ input });

		expect(plans.map((plan) => plan.type)).toEqual(["delete-selected"]);

		const planSummary = buildPlanSummary({ plans, actionLabels: ACTION_LABELS });
		expect(planSummary).toEqual({
			text: "Dry-run plan (1, highest risk: high): Delete Selected.",
			highestRiskLevel: "high",
			actionCount: 1,
		});

		const initialConfirmationState = buildConfirmationState({ plans });
		expect(initialConfirmationState.planActionTypes).toEqual(["delete-selected"]);
		expect(initialConfirmationState.confirmed).toEqual([]);
		expect(areAllRequiredConfirmed({ state: initialConfirmationState })).toBe(
			false,
		);

		const confirmedState = toggleActionConfirmation({
			state: initialConfirmationState,
			actionType: "delete-selected",
		});
		expect(confirmedState.confirmed).toEqual(["delete-selected"]);
		expect(areAllRequiredConfirmed({ state: confirmedState })).toBe(true);

		const execution = executePlannedActions({
			plans,
			runAction: () => {},
		});
		expect(execution).toEqual({
			executed: ["delete-selected"],
			failed: [],
		});

		const executionAudit = createExecutionAuditEntry({
			input,
			plans,
			failed: execution.failed,
		});
		expect(executionAudit.status).toBe("executed");
		expect(executionAudit.actions).toEqual(["delete-selected"]);
	});

	test("partial failure path: execution summary includes failed and audit is failed", () => {
		const input = "undo redo snap";
		const plans = planEditorActions({ input });

		expect(plans.map((plan) => plan.type)).toEqual([
			"undo",
			"redo",
			"toggle-snapping",
		]);

		const execution = executePlannedActions({
			plans,
			runAction: (actionName) => {
				if (actionName === "redo") {
					throw new Error("forced redo failure");
				}
			},
		});

		expect(execution).toEqual({
			executed: ["undo", "toggle-snapping"],
			failed: ["redo"],
		});

		const summary = buildExecutionSummary({
			executed: execution.executed,
			failed: execution.failed,
			actionLabels: ACTION_LABELS,
		});
		expect(summary).toBe("Executed: Undo, Toggle Snapping. Failed: Redo.");

		const executionAudit = createExecutionAuditEntry({
			input,
			plans,
			failed: execution.failed,
		});
		expect(executionAudit.status).toBe("failed");
		expect(executionAudit.actions).toEqual([
			"undo",
			"redo",
			"toggle-snapping",
		]);
	});

	test("unknown input path: empty planner result yields null plan summary", () => {
		const input = "please make it cinematic and emotional";
		const plans = planEditorActions({ input });

		expect(plans).toEqual([]);
		expect(buildPlanSummary({ plans, actionLabels: ACTION_LABELS })).toBeNull();
	});
});
