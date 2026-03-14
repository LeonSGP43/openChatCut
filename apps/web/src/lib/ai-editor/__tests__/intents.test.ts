import { describe, expect, test } from "bun:test";
import {
	buildAssetSummaryText,
	buildTimelineSummaryText,
	detectAIEditorIntent,
} from "../intents";

describe("ai-editor intents", () => {
	test("detects caption generation intent from chinese prompt", () => {
		const intent = detectAIEditorIntent({ input: "请自动生成字幕" });
		expect(intent).toEqual({ type: "generate-captions" });
	});

	test("detects timeline summary intent", () => {
		const intent = detectAIEditorIntent({ input: "show timeline summary" });
		expect(intent).toEqual({ type: "summarize-timeline" });
	});

	test("detects asset summary intent", () => {
		const intent = detectAIEditorIntent({ input: "给我素材概况" });
		expect(intent).toEqual({ type: "summarize-assets" });
	});

	test("returns null when no special intent matches", () => {
		const intent = detectAIEditorIntent({
			input: "play and split at playhead",
		});
		expect(intent).toBeNull();
	});

	test("buildAssetSummaryText formats deterministic output", () => {
		const text = buildAssetSummaryText({
			totalAssets: 12,
			videoAssets: 5,
			imageAssets: 4,
			audioAssets: 3,
		});

		expect(text).toBe(
			"Asset summary: 12 total (video: 5, image: 4, audio: 3).",
		);
	});

	test("buildTimelineSummaryText formats deterministic output", () => {
		const text = buildTimelineSummaryText({
			totalTracks: 6,
			videoTracks: 2,
			audioTracks: 2,
			textTracks: 1,
			stickerTracks: 0,
			effectTracks: 1,
			totalElements: 27,
			totalDurationSeconds: 120.5,
			playheadSeconds: 13.25,
			selectedElementCount: 2,
		});

		expect(text).toBe(
			"Timeline summary: 6 tracks (video: 2, audio: 2, text: 1, sticker: 0, effect: 1), 27 elements, duration: 120.50s, playhead: 13.25s, selected: 2.",
		);
	});
});
