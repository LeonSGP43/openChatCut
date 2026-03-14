import type { PlannedAction, PlannedActionType } from "./planner";

export type OpenCutActionName =
	| "toggle-play"
	| "stop-playback"
	| "goto-start"
	| "goto-end"
	| "select-all"
	| "deselect-all"
	| "copy-selected"
	| "paste-copied"
	| "duplicate-selected"
	| "undo"
	| "redo"
	| "split"
	| "toggle-bookmark"
	| "delete-selected"
	| "toggle-elements-muted-selected"
	| "toggle-elements-visibility-selected"
	| "toggle-snapping"
	| "toggle-ripple-editing";

export interface ExecutionResult {
	executed: PlannedActionType[];
	failed: PlannedActionType[];
}

export function toOpenCutActionName(
	actionType: PlannedActionType,
): OpenCutActionName {
	switch (actionType) {
		case "toggle-play":
			return "toggle-play";
		case "stop-playback":
			return "stop-playback";
		case "goto-start":
			return "goto-start";
		case "goto-end":
			return "goto-end";
		case "select-all":
			return "select-all";
		case "deselect-all":
			return "deselect-all";
		case "copy-selected":
			return "copy-selected";
		case "paste-copied":
			return "paste-copied";
		case "duplicate-selected":
			return "duplicate-selected";
		case "undo":
			return "undo";
		case "redo":
			return "redo";
		case "split-at-playhead":
			return "split";
		case "add-bookmark":
			return "toggle-bookmark";
		case "delete-selected":
			return "delete-selected";
		case "toggle-elements-muted-selected":
			return "toggle-elements-muted-selected";
		case "toggle-elements-visibility-selected":
			return "toggle-elements-visibility-selected";
		case "toggle-snapping":
			return "toggle-snapping";
		case "toggle-ripple-editing":
			return "toggle-ripple-editing";
	}
}

export function executePlannedActions({
	plans,
	runAction,
}: {
	plans: PlannedAction[];
	runAction: (actionName: OpenCutActionName) => void;
}): ExecutionResult {
	const executed: PlannedActionType[] = [];
	const failed: PlannedActionType[] = [];

	for (const plan of plans) {
		try {
			runAction(toOpenCutActionName(plan.type));
			executed.push(plan.type);
		} catch {
			failed.push(plan.type);
		}
	}

	return { executed, failed };
}
