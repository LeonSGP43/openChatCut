export type AIEditorIntentType =
	| "summarize-assets"
	| "summarize-timeline"
	| "generate-captions";

export interface AIEditorIntent {
	type: AIEditorIntentType;
}

const ASSET_SUMMARY_KEYWORDS = [
	"asset summary",
	"assets",
	"media summary",
	"素材概况",
	"素材信息",
	"素材列表",
	"媒体概况",
	"媒体信息",
];

const TIMELINE_SUMMARY_KEYWORDS = [
	"timeline summary",
	"timeline status",
	"track summary",
	"timeline info",
	"时间线概况",
	"时间线信息",
	"轨道概况",
	"轨道信息",
];

const CAPTION_KEYWORDS = [
	"caption",
	"captions",
	"subtitle",
	"subtitles",
	"transcript",
	"字幕",
	"转字幕",
	"转写",
];

const CAPTION_VERB_KEYWORDS = [
	"generate",
	"create",
	"make",
	"add",
	"生成",
	"创建",
	"添加",
	"自动",
];

function includesAny({
	input,
	keywords,
}: {
	input: string;
	keywords: string[];
}): boolean {
	return keywords.some((keyword) => input.includes(keyword.toLowerCase()));
}

export function detectAIEditorIntent({
	input,
}: {
	input: string;
}): AIEditorIntent | null {
	const normalizedInput = input.trim().toLowerCase();
	if (!normalizedInput) {
		return null;
	}

	const wantsCaptions =
		includesAny({ input: normalizedInput, keywords: CAPTION_KEYWORDS }) &&
		includesAny({ input: normalizedInput, keywords: CAPTION_VERB_KEYWORDS });

	if (wantsCaptions) {
		return { type: "generate-captions" };
	}

	if (includesAny({ input: normalizedInput, keywords: TIMELINE_SUMMARY_KEYWORDS })) {
		return { type: "summarize-timeline" };
	}

	if (includesAny({ input: normalizedInput, keywords: ASSET_SUMMARY_KEYWORDS })) {
		return { type: "summarize-assets" };
	}

	return null;
}

export function buildAssetSummaryText({
	totalAssets,
	videoAssets,
	imageAssets,
	audioAssets,
}: {
	totalAssets: number;
	videoAssets: number;
	imageAssets: number;
	audioAssets: number;
}): string {
	return `Asset summary: ${totalAssets} total (video: ${videoAssets}, image: ${imageAssets}, audio: ${audioAssets}).`;
}

export function buildTimelineSummaryText({
	totalTracks,
	videoTracks,
	audioTracks,
	textTracks,
	stickerTracks,
	effectTracks,
	totalElements,
	totalDurationSeconds,
	playheadSeconds,
	selectedElementCount,
}: {
	totalTracks: number;
	videoTracks: number;
	audioTracks: number;
	textTracks: number;
	stickerTracks: number;
	effectTracks: number;
	totalElements: number;
	totalDurationSeconds: number;
	playheadSeconds: number;
	selectedElementCount: number;
}): string {
	return `Timeline summary: ${totalTracks} tracks (video: ${videoTracks}, audio: ${audioTracks}, text: ${textTracks}, sticker: ${stickerTracks}, effect: ${effectTracks}), ${totalElements} elements, duration: ${totalDurationSeconds.toFixed(2)}s, playhead: ${playheadSeconds.toFixed(2)}s, selected: ${selectedElementCount}.`;
}
