import { describe, expect, test } from "bun:test";
import {
	executePlannedActions,
	toOpenCutActionName,
	type OpenCutActionName,
} from "../executor";
import type { PlannedAction } from "../planner";

function plan(type: PlannedAction["type"]): PlannedAction {
	return {
		type,
		source: "keyword-match",
		matchedKeywords: ["mock"],
	};
}

describe("ai-editor executor", () => {
	test("preserves input order when executing actions", () => {
		const plans: PlannedAction[] = [
			plan("stop-playback"),
			plan("goto-start"),
			plan("select-all"),
			plan("toggle-play"),
			plan("split-at-playhead"),
			plan("copy-selected"),
			plan("paste-copied"),
		];
		const called: OpenCutActionName[] = [];

		const result = executePlannedActions({
			plans,
			runAction: (actionName) => {
				called.push(actionName);
			},
		});

		expect(called).toEqual([
			"stop-playback",
			"goto-start",
			"select-all",
			"toggle-play",
			"split",
			"copy-selected",
			"paste-copied",
		]);
		expect(result).toEqual({
			executed: [
				"stop-playback",
				"goto-start",
				"select-all",
				"toggle-play",
				"split-at-playhead",
				"copy-selected",
				"paste-copied",
			],
			failed: [],
		});
	});

	test("continues executing after failures", () => {
		const plans: PlannedAction[] = [
			plan("undo"),
			plan("duplicate-selected"),
			plan("redo"),
			plan("toggle-elements-muted-selected"),
		];
		const called: OpenCutActionName[] = [];

		const result = executePlannedActions({
			plans,
			runAction: (actionName) => {
				called.push(actionName);
				if (actionName === "duplicate-selected" || actionName === "redo") {
					throw new Error("forced");
				}
			},
		});

		expect(called).toEqual([
			"undo",
			"duplicate-selected",
			"redo",
			"toggle-elements-muted-selected",
		]);
		expect(result).toEqual({
			executed: ["undo", "toggle-elements-muted-selected"],
			failed: ["duplicate-selected", "redo"],
		});
	});

	test("maps planned actions to OpenCut action names correctly", () => {
		expect(toOpenCutActionName("toggle-play")).toBe("toggle-play");
		expect(toOpenCutActionName("stop-playback")).toBe("stop-playback");
		expect(toOpenCutActionName("goto-start")).toBe("goto-start");
		expect(toOpenCutActionName("goto-end")).toBe("goto-end");
		expect(toOpenCutActionName("select-all")).toBe("select-all");
		expect(toOpenCutActionName("deselect-all")).toBe("deselect-all");
		expect(toOpenCutActionName("copy-selected")).toBe("copy-selected");
		expect(toOpenCutActionName("paste-copied")).toBe("paste-copied");
		expect(toOpenCutActionName("duplicate-selected")).toBe("duplicate-selected");
		expect(toOpenCutActionName("undo")).toBe("undo");
		expect(toOpenCutActionName("redo")).toBe("redo");
		expect(toOpenCutActionName("split-at-playhead")).toBe("split");
		expect(toOpenCutActionName("add-bookmark")).toBe("toggle-bookmark");
		expect(toOpenCutActionName("delete-selected")).toBe("delete-selected");
		expect(toOpenCutActionName("toggle-elements-muted-selected")).toBe(
			"toggle-elements-muted-selected",
		);
		expect(toOpenCutActionName("toggle-elements-visibility-selected")).toBe(
			"toggle-elements-visibility-selected",
		);
		expect(toOpenCutActionName("toggle-snapping")).toBe("toggle-snapping");
		expect(toOpenCutActionName("toggle-ripple-editing")).toBe(
			"toggle-ripple-editing",
		);
	});

	test("handles empty plans", () => {
		const called: OpenCutActionName[] = [];
		const result = executePlannedActions({
			plans: [],
			runAction: (actionName) => {
				called.push(actionName);
			},
		});

		expect(called).toEqual([]);
		expect(result).toEqual({
			executed: [],
			failed: [],
		});
	});
});
