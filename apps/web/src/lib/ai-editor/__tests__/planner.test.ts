import { describe, expect, test } from "bun:test";
import { planEditorActions } from "../planner";

describe("ai-editor planner", () => {
	test("returns empty actions for empty input", () => {
		expect(planEditorActions({ input: "" })).toEqual([]);
		expect(planEditorActions({ input: "   " })).toEqual([]);
	});

	test("returns empty actions for unknown input", () => {
		expect(
			planEditorActions({
				input: "please make it cinematic and emotional",
			}),
		).toEqual([]);
	});

	test("maps chinese keywords to whitelisted actions", () => {
		const plans = planEditorActions({
			input: "请播放，然后分割，再加书签，最后撤销",
		});

		expect(plans.map((plan) => plan.type)).toEqual([
			"toggle-play",
			"undo",
			"split-at-playhead",
			"add-bookmark",
		]);
	});

	test("maps english keywords to whitelisted actions", () => {
		const plans = planEditorActions({
			input: "play and split at playhead, then add bookmark and redo",
		});

		expect(plans.map((plan) => plan.type)).toEqual([
			"toggle-play",
			"redo",
			"split-at-playhead",
			"add-bookmark",
		]);
	});

	test("deduplicates repeated matches per action", () => {
		const plans = planEditorActions({
			input: "undo undo 撤销 撤销",
		});

		expect(plans).toHaveLength(1);
		expect(plans[0]?.type).toBe("undo");
		expect(plans[0]?.matchedKeywords).toEqual(["undo", "撤销"]);
	});

	test("keeps deterministic order regardless of input keyword order", () => {
		const plans = planEditorActions({
			input: "redo first, then play, then undo, finally snap",
		});

		expect(plans.map((plan) => plan.type)).toEqual([
			"toggle-play",
			"undo",
			"redo",
			"toggle-snapping",
		]);
	});

	test("matches delete-selected and snapping keywords", () => {
		const plans = planEditorActions({
			input: "删除所选并关闭吸附",
		});

		expect(plans.map((plan) => plan.type)).toEqual([
			"delete-selected",
			"toggle-snapping",
		]);
	});

	test("maps expanded english keywords to timeline orchestration actions", () => {
		const plans = planEditorActions({
			input:
				"go to end, duplicate selected, stop playback, paste, select all, copy selected, go to start, deselect all, mute selected, hide selected, and toggle ripple editing",
		});

		expect(plans.map((plan) => plan.type)).toEqual([
			"stop-playback",
			"goto-start",
			"goto-end",
			"select-all",
			"deselect-all",
			"copy-selected",
			"paste-copied",
			"duplicate-selected",
			"toggle-elements-muted-selected",
			"toggle-elements-visibility-selected",
			"toggle-ripple-editing",
		]);
	});

	test("maps expanded chinese keywords to timeline orchestration actions", () => {
		const plans = planEditorActions({
			input:
				"停止播放，回到开头，跳到结尾，全选，取消全选，拷贝选中，粘贴，克隆选中，静音选中，隐藏选中，切换波纹编辑",
		});

		expect(plans.map((plan) => plan.type)).toEqual([
			"stop-playback",
			"goto-start",
			"goto-end",
			"select-all",
			"deselect-all",
			"copy-selected",
			"paste-copied",
			"duplicate-selected",
			"toggle-elements-muted-selected",
			"toggle-elements-visibility-selected",
			"toggle-ripple-editing",
		]);
	});

	test("does not match play from playback word when only stop-playback is requested", () => {
		const plans = planEditorActions({
			input: "stop playback now",
		});

		expect(plans.map((plan) => plan.type)).toEqual(["stop-playback"]);
	});
});
