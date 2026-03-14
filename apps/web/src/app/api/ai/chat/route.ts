import { webEnv } from "@opencut/env/web";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/rate-limit";
import {
	PLANNED_ACTION_ORDER,
	type PlannedActionType,
} from "@/lib/ai-editor/planner";

type GrokRole = "system" | "user" | "assistant";

type GrokContentBlock =
	| { type: "text"; text: string }
	| { type: "image_url"; image_url: { url: string } };

interface GrokMessage {
	role: GrokRole;
	content: string | GrokContentBlock[];
}

const imageUrlSchema = z
	.string()
	.refine(
		(value) =>
			value.startsWith("https://") ||
			value.startsWith("http://") ||
			value.startsWith("data:image/"),
		"Invalid image url",
	);

const historyItemSchema = z.object({
	role: z.enum(["user", "assistant"]),
	content: z.string().min(1).max(8000),
});

const assetInputSchema = z.object({
	id: z.string().max(200).optional(),
	name: z.string().min(1).max(600),
	type: z.enum(["video", "image", "audio"]),
	duration: z
		.number()
		.min(0)
		.max(24 * 60 * 60)
		.optional(),
	width: z.number().int().min(1).max(16384).optional(),
	height: z.number().int().min(1).max(16384).optional(),
	fps: z.number().min(1).max(240).optional(),
	image: imageUrlSchema.optional(),
});

const requestSchema = z.object({
	mode: z.enum(["analysis", "plan"]).default("plan"),
	userInput: z.string().min(1).max(4000),
	projectPrompt: z.string().max(8000).optional().default(""),
	history: z.array(historyItemSchema).max(30).optional().default([]),
	analysis: z
		.object({
			maxConcurrency: z.coerce
				.number()
				.int()
				.min(1)
				.max(12)
				.optional()
				.default(3),
			prompt: z.string().max(12000).optional().default(""),
		})
		.optional()
		.default({}),
	context: z
		.object({
			assetSummary: z.string().max(20000).optional().default(""),
			timelineSummary: z.string().max(15000).optional().default(""),
			assetImages: z.array(imageUrlSchema).max(6).optional().default([]),
			assets: z.array(assetInputSchema).max(40).optional().default([]),
		})
		.optional()
		.default({}),
});

const normalizedOutputSchema = z.object({
	assistant_message: z.string().min(1).max(16000),
	planned_actions: z.array(z.enum(PLANNED_ACTION_ORDER)).max(30).default([]),
});

const DEFAULT_ASSET_ANALYSIS_PROMPT = [
	"You are a senior multimodal video editor analyst.",
	"Analyze exactly one media asset and prioritize practical editing decisions.",
	"Include both visual and audio observations when available.",
	"Respond in concise markdown with sections:",
	"1) Asset Intent",
	"2) Visual Analysis (subjects, framing, motion, camera, text-on-screen, lighting)",
	"3) Audio Analysis (speech/music/SFX/silence, quality, mood, usable cues)",
	"4) Timeline Utility (hook/body/bridge/outro/B-roll usage, in-out suggestions, transitions)",
	"5) Risks (continuity, quality, copyright, mismatch)",
	"6) Confidence (high/medium/low + reason)",
	"If data is missing, explicitly state unknown instead of guessing.",
].join("\n");

const DEFAULT_ANALYSIS_SYNTHESIS_PROMPT = [
	"You are OpenChatCut global AI editing orchestrator.",
	"Combine project prompt, timeline context, and per-asset insights into a practical edit strategy.",
	"Your response must be strict JSON only with this schema:",
	'{"assistant_message": string, "planned_actions": string[]}',
	"For analysis mode, planned_actions must be [].",
	"assistant_message must include:",
	"- Understanding summary",
	"- Timeline logic: beat/segment structure and ordering suggestions",
	"- Visual strategy (shot sequencing and continuity)",
	"- Audio strategy (dialogue/music/SFX layering and transitions)",
	"- Clarification questions that require user confirmation",
	"- Next-step checklist before execution",
].join("\n");

const DEFAULT_PLAN_PROMPT = [
	"You are OpenChatCut global AI editing orchestrator.",
	"You convert user requests into safe executable action plans.",
	`You must only return planned_actions from this allowlist: ${PLANNED_ACTION_ORDER.join(", ")}.`,
	"When information is insufficient or confirmation is pending, planned_actions must be [].",
	"Output strict JSON only with schema:",
	'{"assistant_message": string, "planned_actions": string[]}',
].join("\n");

function resolveGrokChatEndpoint({ baseUrl }: { baseUrl: string }): string {
	const normalized = baseUrl.replace(/\/+$/, "");
	if (normalized.endsWith("/grok/v1")) {
		return `${normalized}/chat/completions`;
	}
	return `${normalized}/grok/v1/chat/completions`;
}

function extractTextContent(content: unknown): string {
	if (typeof content === "string") {
		return content;
	}

	if (Array.isArray(content)) {
		return content
			.map((item) => {
				if (!item || typeof item !== "object") {
					return "";
				}
				const block = item as Record<string, unknown>;
				if (typeof block.text === "string") {
					return block.text;
				}
				const inputText = block.input_text;
				if (typeof inputText === "string") {
					return inputText;
				}
				return "";
			})
			.filter(Boolean)
			.join("\n");
	}

	return "";
}

function extractJsonObject(raw: string): string | null {
	const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
	const candidate = fencedMatch?.[1]?.trim() || raw.trim();
	const start = candidate.indexOf("{");
	const end = candidate.lastIndexOf("}");
	if (start === -1 || end === -1 || end <= start) {
		return null;
	}
	return candidate.slice(start, end + 1);
}

function mapHistory({
	history,
}: {
	history: Array<z.infer<typeof historyItemSchema>>;
}): GrokMessage[] {
	return history.map((item) => ({
		role: item.role,
		content: item.content,
	}));
}

function toPlannedActions(value: unknown): PlannedActionType[] {
	const parsed = z.array(z.enum(PLANNED_ACTION_ORDER)).safeParse(value);
	if (!parsed.success) {
		return [];
	}
	return parsed.data;
}

function parseModelOutput({ assistantText }: { assistantText: string }): {
	assistantMessage: string;
	plannedActions: PlannedActionType[];
} {
	const jsonCandidate = extractJsonObject(assistantText);
	if (!jsonCandidate) {
		return {
			assistantMessage: assistantText || "No model content returned.",
			plannedActions: [],
		};
	}

	try {
		const decoded = JSON.parse(jsonCandidate) as Record<string, unknown>;
		const normalized = normalizedOutputSchema.safeParse({
			assistant_message:
				typeof decoded.assistant_message === "string"
					? decoded.assistant_message
					: assistantText || "No model content returned.",
			planned_actions: toPlannedActions(decoded.planned_actions),
		});

		if (!normalized.success) {
			return {
				assistantMessage: assistantText || "No model content returned.",
				plannedActions: [],
			};
		}

		return {
			assistantMessage: normalized.data.assistant_message,
			plannedActions: normalized.data.planned_actions,
		};
	} catch {
		return {
			assistantMessage: assistantText || "No model content returned.",
			plannedActions: [],
		};
	}
}

async function callGrokChat({
	endpoint,
	model,
	messages,
}: {
	endpoint: string;
	model: string;
	messages: GrokMessage[];
}): Promise<string> {
	const response = await fetch(endpoint, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${webEnv.GROK_API_KEY}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			model,
			stream: false,
			reasoning_effort: webEnv.GROK_REASONING_EFFORT,
			temperature: 0.2,
			top_p: 0.95,
			messages,
		}),
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`Grok request failed (${response.status}): ${errorText}`);
	}

	const raw = await response.json();
	const messageContentRaw = raw?.choices?.[0]?.message?.content;
	return extractTextContent(messageContentRaw);
}

async function mapWithConcurrency<T, R>({
	items,
	concurrency,
	mapper,
}: {
	items: T[];
	concurrency: number;
	mapper: (item: T, index: number) => Promise<R>;
}): Promise<R[]> {
	if (items.length === 0) {
		return [];
	}

	const results = new Array<R>(items.length);
	let nextIndex = 0;

	const worker = async () => {
		while (true) {
			const currentIndex = nextIndex;
			nextIndex += 1;
			if (currentIndex >= items.length) {
				return;
			}

			const item = items[currentIndex];
			if (!item) {
				continue;
			}
			results[currentIndex] = await mapper(item, currentIndex);
		}
	};

	const workerCount = Math.min(concurrency, items.length);
	await Promise.all(Array.from({ length: workerCount }, () => worker()));
	return results;
}

function buildAssetMetadataText({
	asset,
}: {
	asset: z.infer<typeof assetInputSchema>;
}): string {
	const parts = [
		`name: ${asset.name}`,
		`type: ${asset.type}`,
		typeof asset.duration === "number"
			? `duration_seconds: ${asset.duration.toFixed(3)}`
			: null,
		typeof asset.width === "number" && typeof asset.height === "number"
			? `resolution: ${asset.width}x${asset.height}`
			: null,
		typeof asset.fps === "number" ? `fps: ${asset.fps}` : null,
	];
	return parts.filter(Boolean).join("\n");
}

function resolveAssetAnalysisModel({
	assetType,
}: {
	assetType: z.infer<typeof assetInputSchema>["type"];
}): string {
	if (assetType === "video") {
		return webEnv.GROK_VIDEO_ANALYSIS_MODEL;
	}
	return webEnv.GROK_ASSET_ANALYSIS_MODEL;
}

export async function POST(request: NextRequest) {
	try {
		const { limited } = await checkRateLimit({ request });
		if (limited) {
			return NextResponse.json({ error: "Too many requests" }, { status: 429 });
		}

		if (!webEnv.GROK_API_BASE_URL || !webEnv.GROK_API_KEY) {
			return NextResponse.json(
				{
					error:
						"Grok is not configured. Set GROK_API_BASE_URL and GROK_API_KEY in env.",
				},
				{ status: 503 },
			);
		}

		const body = await request.json();
		const parsedInput = requestSchema.safeParse(body);
		if (!parsedInput.success) {
			return NextResponse.json(
				{
					error: "Invalid AI chat request",
					details: parsedInput.error.flatten().fieldErrors,
				},
				{ status: 400 },
			);
		}

		const input = parsedInput.data;
		const endpoint = resolveGrokChatEndpoint({
			baseUrl: webEnv.GROK_API_BASE_URL,
		});

		if (input.mode === "analysis") {
			const assetAnalysisPrompt =
				input.analysis.prompt.trim() ||
				webEnv.GROK_ASSET_ANALYSIS_PROMPT?.trim() ||
				DEFAULT_ASSET_ANALYSIS_PROMPT;
			const synthesisPrompt =
				webEnv.GROK_ANALYSIS_SYNTHESIS_PROMPT?.trim() ||
				DEFAULT_ANALYSIS_SYNTHESIS_PROMPT;

			const assetConcurrency = Math.max(
				1,
				Math.min(
					input.analysis.maxConcurrency,
					webEnv.GROK_ASSET_ANALYSIS_MAX_CONCURRENCY,
					Math.max(1, input.context.assets.length),
				),
			);

			const assetInsights = await mapWithConcurrency({
				items: input.context.assets,
				concurrency: assetConcurrency,
				mapper: async (asset, index) => {
					const userBlocks: GrokContentBlock[] = [
						{
							type: "text",
							text: [
								`Asset index: ${index + 1}`,
								`Project prompt:\n${input.projectPrompt || "(empty)"}`,
								`Timeline summary:\n${input.context.timelineSummary || "(empty)"}`,
								`Asset metadata:\n${buildAssetMetadataText({ asset })}`,
								"Focus on editability and timeline placement.",
							].join("\n\n"),
						},
					];
					if (asset.image) {
						userBlocks.push({
							type: "image_url",
							image_url: { url: asset.image },
						});
					}

					try {
						const assistantText = await callGrokChat({
							endpoint,
							model: resolveAssetAnalysisModel({ assetType: asset.type }),
							messages: [
								{
									role: "system",
									content: assetAnalysisPrompt,
								},
								{
									role: "user",
									content: userBlocks,
								},
							],
						});

						return {
							name: asset.name,
							type: asset.type,
							error: null as string | null,
							insight:
								assistantText.trim().slice(0, 4000) || "No insight returned.",
						};
					} catch (error) {
						return {
							name: asset.name,
							type: asset.type,
							error: error instanceof Error ? error.message : "unknown error",
							insight: "",
						};
					}
				},
			});

			const assetInsightText =
				assetInsights.length === 0
					? "No per-asset detail was provided."
					: assetInsights
							.map((item, index) => {
								const prefix = `Asset ${index + 1} (${item.type}): ${item.name}`;
								if (item.error) {
									return `${prefix}\nERROR: ${item.error}`;
								}
								return `${prefix}\n${item.insight}`;
							})
							.join("\n\n---\n\n");

			const synthesisUserText = [
				`User request:\n${input.userInput}`,
				`Project prompt:\n${input.projectPrompt || "(empty)"}`,
				`Asset summary:\n${input.context.assetSummary || "(empty)"}`,
				`Timeline summary:\n${input.context.timelineSummary || "(empty)"}`,
				`Asset analysis concurrency used: ${assetConcurrency}`,
				`Per-asset insights:\n${assetInsightText}`,
			].join("\n\n");

			const synthesisAssistantText = await callGrokChat({
				endpoint,
				model: webEnv.GROK_MODEL,
				messages: [
					{
						role: "system",
						content: synthesisPrompt,
					},
					...mapHistory({ history: input.history }),
					{
						role: "user",
						content: [{ type: "text", text: synthesisUserText }],
					},
				],
			});

			const parsed = parseModelOutput({
				assistantText: synthesisAssistantText,
			});
			return NextResponse.json({
				source: "grok",
				model: webEnv.GROK_MODEL,
				assistantMessage: parsed.assistantMessage,
				plannedActions: [],
			});
		}

		const planImageUrls = [
			...input.context.assetImages,
			...input.context.assets
				.map((asset) => asset.image)
				.filter((url): url is string => Boolean(url)),
		]
			.filter((url, index, list) => list.indexOf(url) === index)
			.slice(0, 3);

		const planBlocks: GrokContentBlock[] = [
			{
				type: "text",
				text: [
					`Project prompt:\n${input.projectPrompt || "(empty)"}`,
					`Asset summary:\n${input.context.assetSummary || "(empty)"}`,
					`Timeline summary:\n${input.context.timelineSummary || "(empty)"}`,
					`Current user message:\n${input.userInput}`,
				].join("\n\n"),
			},
		];

		for (const imageUrl of planImageUrls) {
			planBlocks.push({
				type: "image_url",
				image_url: { url: imageUrl },
			});
		}

		const planAssistantText = await callGrokChat({
			endpoint,
			model: webEnv.GROK_MODEL,
			messages: [
				{
					role: "system",
					content: DEFAULT_PLAN_PROMPT,
				},
				...mapHistory({ history: input.history }),
				{
					role: "user",
					content: planBlocks,
				},
			],
		});

		const parsedPlan = parseModelOutput({ assistantText: planAssistantText });
		return NextResponse.json({
			source: "grok",
			model: webEnv.GROK_MODEL,
			assistantMessage: parsedPlan.assistantMessage,
			plannedActions: parsedPlan.plannedActions,
		});
	} catch (error) {
		console.error("AI chat route error:", error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}
