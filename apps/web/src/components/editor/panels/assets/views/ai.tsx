"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PanelView } from "@/components/editor/panels/assets/views/base-view";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { useEditor } from "@/hooks/use-editor";
import { invokeAction } from "@/lib/actions";
import {
	AI_AUDIT_STORAGE_KEY,
	clearAuditEntries,
	loadAuditEntries,
	saveAuditEntries,
} from "@/lib/ai-editor/audit-storage";
import {
	buildAuditExportPayload,
	parseAuditExportPayload,
	serializeAuditExportPayload,
} from "@/lib/ai-editor/audit-export";
import type { AuditMergeStrategy } from "@/lib/ai-editor/audit-merge";
import {
	PLANNED_ACTION_ORDER,
	type PlannedAction,
} from "@/lib/ai-editor/planner";
import { appendAuditEntry, type AuditEntry } from "@/lib/ai-editor/audit-log";
import { executePlannedActions } from "@/lib/ai-editor/executor";
import {
	areAllRequiredConfirmed,
	buildConfirmationState,
	toggleActionConfirmation,
	type ConfirmationState,
} from "@/lib/ai-editor/risk-confirmation";
import {
	buildExecutionSummary,
	buildPlanSummary,
	createExecutionAuditEntry,
	createPlannedAuditEntry,
	type PlanSummary,
} from "@/lib/ai-editor/session";
import {
	emitTelemetryEvent,
	type AIEditorTelemetryEvent,
} from "@/lib/ai-editor/telemetry";
import {
	createBrowserAIEditorAnalyticsSender,
	installAIEditorTelemetryAnalyticsSink,
} from "@/lib/ai-editor/analytics-sink";
import {
	buildAssetSummaryText,
	buildTimelineSummaryText,
	detectAIEditorIntent,
} from "@/lib/ai-editor/intents";
import {
	buildAuditImportAppliedMessage,
	buildAuditImportPreview,
	buildAuditImportPreviewMessage,
} from "@/lib/ai-editor/ai-view-interaction";
import { extractTimelineAudio } from "@/lib/media/mediabunny";
import { decodeAudioToFloat32 } from "@/lib/media/audio";
import { transcriptionService } from "@/services/transcription/service";
import { buildCaptionChunks } from "@/lib/transcription/caption";
import { DEFAULT_TEXT_ELEMENT } from "@/constants/text-constants";
import { cn } from "@/utils/ui";

type MessageRole = "system" | "user" | "assistant";

interface AIMessage {
	id: number;
	role: MessageRole;
	content: string;
}

const INITIAL_MESSAGE: AIMessage = {
	id: 1,
	role: "system",
	content:
		"AI edit assistant is ready (Grok-backed). Follow Prompt -> Assets -> Analysis -> Confirm before planning and execution.",
};

const ROLE_LABELS: Record<MessageRole, string> = {
	system: "System",
	user: "You",
	assistant: "AI",
};

const ACTION_LABELS: Record<PlannedAction["type"], string> = {
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

const AUDIT_MERGE_STRATEGY_OPTIONS: {
	value: AuditMergeStrategy;
	label: string;
}[] = [
	{ value: "replace", label: "Replace" },
	{ value: "append", label: "Append" },
	{ value: "dedupe", label: "Dedupe" },
];

const PROJECT_PROMPT_STORAGE_PREFIX = "opencut:ai-editor:project-prompt:";
const ANALYSIS_SETTINGS_STORAGE_PREFIX = "opencut:ai-editor:analysis-settings:";
const AI_HISTORY_LIMIT = 14;
const ASSET_DETAIL_LIMIT = 20;
const ASSET_IMAGE_LIMIT = 3;
const ASSET_IMAGE_MAX_LENGTH = 180_000;
const DEFAULT_ANALYSIS_MAX_CONCURRENCY = 3;

interface AIChatRouteResponse {
	source: "grok";
	model: string;
	assistantMessage: string;
	plannedActions: PlannedAction["type"][];
}

interface AIAssetContextInput {
	id?: string;
	name: string;
	type: "video" | "image" | "audio";
	duration?: number;
	width?: number;
	height?: number;
	fps?: number;
	image?: string;
}

function formatAuditExportTimestamp(date: Date): string {
	const pad = (value: number) => value.toString().padStart(2, "0");
	return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function emitAIEditorTelemetry(event: AIEditorTelemetryEvent): void {
	emitTelemetryEvent({ event });
}

interface AIViewProps {
	embedded?: boolean;
}

export function AIView({ embedded = false }: AIViewProps) {
	const editor = useEditor();
	const activeProjectId = editor.project.getActive()?.metadata.id;
	const [messages, setMessages] = useState<AIMessage[]>([INITIAL_MESSAGE]);
	const [draft, setDraft] = useState("");
	const [projectPromptDraft, setProjectPromptDraft] = useState("");
	const [projectPrompt, setProjectPrompt] = useState("");
	const [isProjectPromptHydrated, setIsProjectPromptHydrated] = useState(false);
	const [analysisPrompt, setAnalysisPrompt] = useState("");
	const [analysisMaxConcurrency, setAnalysisMaxConcurrency] = useState(
		DEFAULT_ANALYSIS_MAX_CONCURRENCY,
	);
	const [isAnalysisSettingsHydrated, setIsAnalysisSettingsHydrated] =
		useState(false);
	const [analysisGenerated, setAnalysisGenerated] = useState(false);
	const [analysisConfirmed, setAnalysisConfirmed] = useState(false);
	const [isRunning, setIsRunning] = useState(false);
	const [pendingPlans, setPendingPlans] = useState<PlannedAction[]>([]);
	const [pendingPlanSummary, setPendingPlanSummary] =
		useState<PlanSummary | null>(null);
	const [lastPlannedInput, setLastPlannedInput] = useState("");
	const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
	const [importMergeStrategy, setImportMergeStrategy] =
		useState<AuditMergeStrategy>("replace");
	const [pendingImportSource, setPendingImportSource] = useState<{
		fileName: string;
		importedEntries: AuditEntry[];
	} | null>(null);
	const [isAuditHydrated, setIsAuditHydrated] = useState(false);
	const [confirmationState, setConfirmationState] = useState<ConfirmationState>(
		() => buildConfirmationState({ plans: [] }),
	);
	const nextMessageIdRef = useRef(2);
	const auditImportInputRef = useRef<HTMLInputElement | null>(null);
	const workflowFingerprintRef = useRef<string | null>(null);
	const mediaAssets = editor.media.getAssets();
	const hasProjectPrompt = projectPrompt.trim().length > 0;
	const hasAssets = mediaAssets.length > 0;
	const workflowReady = hasProjectPrompt && hasAssets && analysisConfirmed;
	const promptStorageKey = activeProjectId
		? `${PROJECT_PROMPT_STORAGE_PREFIX}${activeProjectId}`
		: null;
	const analysisSettingsStorageKey = activeProjectId
		? `${ANALYSIS_SETTINGS_STORAGE_PREFIX}${activeProjectId}`
		: null;
	const assetsSignature = useMemo(
		() => mediaAssets.map((asset) => `${asset.id}:${asset.type}`).join("|"),
		[mediaAssets],
	);
	const workflowFingerprint = useMemo(
		() =>
			`${projectPrompt.trim()}::${assetsSignature}::${analysisPrompt.trim()}`,
		[projectPrompt, assetsSignature, analysisPrompt],
	);
	const requiresActionConfirmation = useMemo(
		() => confirmationState.planActionTypes.length > 0,
		[confirmationState.planActionTypes.length],
	);
	const importPreview = useMemo(() => {
		if (!pendingImportSource) {
			return null;
		}

		return buildAuditImportPreview({
			fileName: pendingImportSource.fileName,
			currentEntries: auditEntries,
			importedEntries: pendingImportSource.importedEntries,
			strategy: importMergeStrategy,
		});
	}, [pendingImportSource, auditEntries, importMergeStrategy]);

	const canRun = draft.trim().length > 0;
	const canExecute =
		pendingPlans.length > 0 &&
		!isRunning &&
		workflowReady &&
		areAllRequiredConfirmed({ state: confirmationState });
	const canClear =
		messages.length > 1 ||
		draft.trim().length > 0 ||
		pendingPlans.length > 0 ||
		auditEntries.length > 0 ||
		pendingImportSource !== null;
	const canExportAudit = auditEntries.length > 0;

	const createMessage = ({
		role,
		content,
	}: {
		role: MessageRole;
		content: string;
	}): AIMessage => ({
		id: nextMessageIdRef.current++,
		role,
		content,
	});

	const clearPendingPlanState = () => {
		setPendingPlans([]);
		setPendingPlanSummary(null);
		setLastPlannedInput("");
		setConfirmationState(buildConfirmationState({ plans: [] }));
	};

	const buildAssetSummaryForModel = () => {
		const topLevelSummary = buildAssetSummaryText({
			totalAssets: mediaAssets.length,
			videoAssets: mediaAssets.filter((asset) => asset.type === "video").length,
			imageAssets: mediaAssets.filter((asset) => asset.type === "image").length,
			audioAssets: mediaAssets.filter((asset) => asset.type === "audio").length,
		});

		const detailedLines = mediaAssets
			.slice(0, ASSET_DETAIL_LIMIT)
			.map((asset) => {
				const parts = [
					`type=${asset.type}`,
					`name=${asset.name}`,
					typeof asset.duration === "number"
						? `duration=${asset.duration.toFixed(2)}s`
						: null,
					typeof asset.width === "number" && typeof asset.height === "number"
						? `resolution=${asset.width}x${asset.height}`
						: null,
					typeof asset.fps === "number" ? `fps=${asset.fps}` : null,
				].filter(Boolean);
				return `- ${parts.join(", ")}`;
			});

		const extraCount = Math.max(0, mediaAssets.length - ASSET_DETAIL_LIMIT);
		return [
			topLevelSummary,
			detailedLines.length > 0
				? `Asset details:\n${detailedLines.join("\n")}`
				: "",
			extraCount > 0 ? `Additional assets not listed: ${extraCount}` : "",
		]
			.filter(Boolean)
			.join("\n\n");
	};

	const buildTimelineSummaryForModel = () => {
		const tracks = editor.timeline.getTracks();
		const totalElements = tracks.reduce(
			(sum, track) => sum + track.elements.length,
			0,
		);

		const topLevelSummary = buildTimelineSummaryText({
			totalTracks: tracks.length,
			videoTracks: tracks.filter((track) => track.type === "video").length,
			audioTracks: tracks.filter((track) => track.type === "audio").length,
			textTracks: tracks.filter((track) => track.type === "text").length,
			stickerTracks: tracks.filter((track) => track.type === "sticker").length,
			effectTracks: tracks.filter((track) => track.type === "effect").length,
			totalElements,
			totalDurationSeconds: editor.timeline.getTotalDuration(),
			playheadSeconds: editor.playback.getCurrentTime(),
			selectedElementCount: editor.selection.getSelectedElements().length,
		});

		const trackLines = tracks.map(
			(track, index) =>
				`- Track ${index + 1}: type=${track.type}, elements=${track.elements.length}`,
		);

		return [topLevelSummary, trackLines.join("\n")]
			.filter(Boolean)
			.join("\n\n");
	};

	const getAssetImagesForModel = () => {
		return mediaAssets
			.map((asset) => asset.thumbnailUrl)
			.filter((thumbnail): thumbnail is string => Boolean(thumbnail))
			.filter(
				(thumbnail) =>
					(thumbnail.startsWith("data:image/") ||
						thumbnail.startsWith("https://") ||
						thumbnail.startsWith("http://")) &&
					thumbnail.length <= ASSET_IMAGE_MAX_LENGTH,
			)
			.slice(0, ASSET_IMAGE_LIMIT);
	};

	const buildAssetsForModel = (): AIAssetContextInput[] => {
		return mediaAssets.slice(0, ASSET_DETAIL_LIMIT).map((asset) => {
			const imageCandidate = asset.thumbnailUrl;
			const image =
				typeof imageCandidate === "string" &&
				(imageCandidate.startsWith("data:image/") ||
					imageCandidate.startsWith("https://") ||
					imageCandidate.startsWith("http://")) &&
				imageCandidate.length <= ASSET_IMAGE_MAX_LENGTH
					? imageCandidate
					: undefined;

			return {
				id: asset.id,
				name: asset.name,
				type: asset.type,
				duration: asset.duration,
				width: asset.width,
				height: asset.height,
				fps: asset.fps,
				image,
			};
		});
	};

	const buildHistoryForModel = () => {
		return messages
			.filter(
				(message) => message.role === "user" || message.role === "assistant",
			)
			.slice(-AI_HISTORY_LIMIT)
			.map((message) => ({
				role: message.role,
				content: message.content.slice(0, 6000),
			}));
	};

	const requestGrokChat = async ({
		mode,
		userInput,
	}: {
		mode: "analysis" | "plan";
		userInput: string;
	}): Promise<AIChatRouteResponse> => {
		const normalizedConcurrency = Number.isFinite(analysisMaxConcurrency)
			? Math.min(12, Math.max(1, Math.round(analysisMaxConcurrency)))
			: DEFAULT_ANALYSIS_MAX_CONCURRENCY;

		const response = await fetch("/api/ai/chat", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				mode,
				userInput,
				projectPrompt,
				history: buildHistoryForModel(),
				analysis: {
					maxConcurrency: normalizedConcurrency,
					prompt: analysisPrompt.trim(),
				},
				context: {
					assetSummary: buildAssetSummaryForModel(),
					timelineSummary: buildTimelineSummaryForModel(),
					assetImages: getAssetImagesForModel(),
					assets: buildAssetsForModel(),
				},
			}),
		});

		const payload = (await response.json().catch(() => ({}))) as Partial<
			AIChatRouteResponse & { error?: string; message?: string }
		>;
		if (!response.ok) {
			const errorMessage =
				typeof payload.error === "string"
					? payload.error
					: typeof payload.message === "string"
						? payload.message
						: `AI request failed (${response.status})`;
			throw new Error(errorMessage);
		}

		const allowedActionSet = new Set<string>(PLANNED_ACTION_ORDER);
		const plannedActionsRaw = Array.isArray(payload.plannedActions)
			? payload.plannedActions
			: [];
		const plannedActions = plannedActionsRaw.filter(
			(action): action is PlannedAction["type"] =>
				typeof action === "string" && allowedActionSet.has(action),
		);

		return {
			source: "grok",
			model: typeof payload.model === "string" ? payload.model : "grok",
			assistantMessage:
				typeof payload.assistantMessage === "string" &&
				payload.assistantMessage.trim().length > 0
					? payload.assistantMessage
					: "No assistant message returned.",
			plannedActions,
		};
	};

	const handleSaveProjectPrompt = () => {
		const normalizedPrompt = projectPromptDraft.trim();
		if (!normalizedPrompt) {
			setMessages((current) => [
				...current,
				createMessage({
					role: "assistant",
					content: "Project prompt is empty. Add your editing goal first.",
				}),
			]);
			return;
		}

		setProjectPrompt(normalizedPrompt);
		setAnalysisGenerated(false);
		setAnalysisConfirmed(false);
		setMessages((current) => [
			...current,
			createMessage({
				role: "assistant",
				content:
					"Project prompt saved. Next step: add media assets, then click Analyze Prompt + Assets.",
			}),
		]);
	};

	const handleAnalyzeContext = async () => {
		if (!hasProjectPrompt) {
			setMessages((current) => [
				...current,
				createMessage({
					role: "assistant",
					content: "Save a project prompt first, then run context analysis.",
				}),
			]);
			return;
		}
		if (!hasAssets) {
			setMessages((current) => [
				...current,
				createMessage({
					role: "assistant",
					content:
						"No assets found. Add video/audio/image assets first, then analyze.",
				}),
			]);
			return;
		}

		setIsRunning(true);
		try {
			const response = await requestGrokChat({
				mode: "analysis",
				userInput:
					"Analyze current project prompt and media/timeline context. Provide understanding, editing strategy, and concise clarification questions for confirmation.",
			});
			setAnalysisGenerated(true);
			setAnalysisConfirmed(false);
			setMessages((current) => [
				...current,
				createMessage({
					role: "assistant",
					content: response.assistantMessage,
				}),
			]);
		} catch (error) {
			setAnalysisGenerated(false);
			setAnalysisConfirmed(false);
			setMessages((current) => [
				...current,
				createMessage({
					role: "assistant",
					content: `Grok analysis failed: ${error instanceof Error ? error.message : "unknown error"}. Please fix Grok configuration/network and retry.`,
				}),
			]);
		} finally {
			setIsRunning(false);
		}
	};

	const handleConfirmAnalysis = () => {
		if (!analysisGenerated) {
			setMessages((current) => [
				...current,
				createMessage({
					role: "assistant",
					content:
						"Run Analyze Prompt + Assets first. Confirmation is enabled after analysis output is generated.",
				}),
			]);
			return;
		}

		setAnalysisConfirmed(true);
		setMessages((current) => [
			...current,
			createMessage({
				role: "assistant",
				content:
					"Analysis confirmed. You can now run multi-round edit instructions and execute the planned actions.",
			}),
		]);
	};

	const handleApplyImportPreview = () => {
		if (!importPreview) {
			return;
		}

		setAuditEntries(importPreview.mergedEntries);
		setPendingImportSource(null);
		setMessages((current) => [
			...current,
			createMessage({
				role: "assistant",
				content: buildAuditImportAppliedMessage({ preview: importPreview }),
			}),
		]);
		emitAIEditorTelemetry({
			type: "audit-import-result",
			success: true,
			entryCount: importPreview.incomingEntryCount,
			strategy: importPreview.strategy,
			totalCount: importPreview.totalAfterApply,
		});
	};

	const handleCancelImportPreview = () => {
		setPendingImportSource(null);
	};

	const handleGenerateCaptionsIntent = async () => {
		const tracks = editor.timeline.getTracks();
		const mediaAssets = editor.media.getAssets();
		const totalDuration = editor.timeline.getTotalDuration();

		if (tracks.length === 0 || mediaAssets.length === 0 || totalDuration <= 0) {
			setMessages((current) => [
				...current,
				createMessage({
					role: "assistant",
					content:
						"Caption generation skipped: timeline has no usable media/audio content.",
				}),
			]);
			return;
		}

		setIsRunning(true);
		setMessages((current) => [
			...current,
			createMessage({
				role: "assistant",
				content: "Generating captions from timeline audio...",
			}),
		]);

		try {
			const audioBlob = await extractTimelineAudio({
				tracks,
				mediaAssets,
				totalDuration,
			});
			const { samples } = await decodeAudioToFloat32({ audioBlob });
			const result = await transcriptionService.transcribe({
				audioData: samples,
			});
			const captionChunks = buildCaptionChunks({ segments: result.segments });

			if (captionChunks.length === 0) {
				throw new Error("No caption segments generated");
			}

			const captionTrackId = editor.timeline.addTrack({
				type: "text",
				index: 0,
			});

			for (let i = 0; i < captionChunks.length; i++) {
				const caption = captionChunks[i];
				if (!caption) continue;
				editor.timeline.insertElement({
					placement: { mode: "explicit", trackId: captionTrackId },
					element: {
						...DEFAULT_TEXT_ELEMENT,
						name: `Caption ${i + 1}`,
						content: caption.text,
						duration: caption.duration,
						startTime: caption.startTime,
						fontSize: 65,
						fontWeight: "bold",
					},
				});
			}

			setMessages((current) => [
				...current,
				createMessage({
					role: "assistant",
					content: `Generated captions on a new text track (${captionChunks.length} clips).`,
				}),
			]);
			emitAIEditorTelemetry({
				type: "execute-result",
				attemptedCount: 1,
				executedCount: 1,
				failedCount: 0,
				failedActions: [],
			});
		} catch {
			setMessages((current) => [
				...current,
				createMessage({
					role: "assistant",
					content: "Caption generation failed.",
				}),
			]);
			emitAIEditorTelemetry({
				type: "execute-result",
				attemptedCount: 1,
				executedCount: 0,
				failedCount: 1,
				failedActions: [],
			});
		} finally {
			setIsRunning(false);
			setDraft("");
		}
	};

	const handleRun = async () => {
		const input = draft.trim();
		if (!input) return;
		if (isRunning) return;

		const intent = detectAIEditorIntent({ input });
		if (intent?.type === "generate-captions") {
			clearPendingPlanState();
			setMessages((current) => [
				...current,
				createMessage({ role: "user", content: input }),
			]);
			void handleGenerateCaptionsIntent();
			return;
		}

		if (!hasProjectPrompt) {
			setMessages((current) => [
				...current,
				createMessage({ role: "user", content: input }),
				createMessage({
					role: "assistant",
					content:
						"Project prompt is required before planning. Fill in Project Prompt and click Save Prompt.",
				}),
			]);
			return;
		}

		if (!hasAssets) {
			setMessages((current) => [
				...current,
				createMessage({ role: "user", content: input }),
				createMessage({
					role: "assistant",
					content:
						"No media assets detected. Add assets first, then run Analyze Prompt + Assets.",
				}),
			]);
			return;
		}

		if (!analysisConfirmed) {
			setMessages((current) => [
				...current,
				createMessage({ role: "user", content: input }),
				createMessage({
					role: "assistant",
					content:
						"Analysis is not confirmed yet. Run Analyze Prompt + Assets, review with user, then click Confirm Analysis.",
				}),
			]);
			return;
		}

		setIsRunning(true);
		let plans: PlannedAction[] = [];
		let assistantMessage = "";

		try {
			const grokResponse = await requestGrokChat({
				mode: "plan",
				userInput: input,
			});
			plans = grokResponse.plannedActions.map((actionType) => ({
				type: actionType,
				source: "grok",
				matchedKeywords: [`grok:${grokResponse.model}`],
			}));
			assistantMessage = grokResponse.assistantMessage;
		} catch (error) {
			const fallbackMessage =
				error instanceof Error ? error.message : "unknown error";
			assistantMessage = `Grok plan request failed (${fallbackMessage}). Please fix Grok configuration/network and retry.`;
		} finally {
			setIsRunning(false);
		}

		const planSummary = buildPlanSummary({
			plans,
			actionLabels: ACTION_LABELS,
		});
		if (plans.length === 0) {
			emitAIEditorTelemetry({
				type: "plan-empty",
				inputLength: input.length,
				reason: "no-match",
			});
		} else {
			emitAIEditorTelemetry({
				type: "plan-generated",
				inputLength: input.length,
				actionCount: plans.length,
				highestRiskLevel: planSummary?.highestRiskLevel ?? "low",
				actions: plans.map((plan) => plan.type),
			});
		}
		const normalizedAssistantMessage = (() => {
			const baseMessage =
				assistantMessage.trim().length > 0
					? assistantMessage
					: planSummary === null
						? "No safe action matched. Try play/stop, go to start/end, select/copy/paste/duplicate, split, bookmark, delete selected, mute/visibility, snapping, or ripple editing."
						: planSummary.text;

			if (planSummary === null) {
				return baseMessage;
			}

			return `${baseMessage}\n\n${planSummary.text}\nClick Execute to apply.`;
		})();

		setMessages((current) => {
			const next = [
				...current,
				createMessage({ role: "user", content: input }),
			];
			next.push(
				createMessage({
					role: "assistant",
					content: normalizedAssistantMessage,
				}),
			);
			return next;
		});
		setPendingPlanSummary(planSummary);
		if (plans.length > 0) {
			setLastPlannedInput(input);
		}
		setPendingPlans(plans);
		setConfirmationState(buildConfirmationState({ plans }));
		setAuditEntries((current) =>
			appendAuditEntry({
				entries: current,
				entry: createPlannedAuditEntry({ input, plans }),
			}),
		);
		setDraft("");
	};

	const handleExecute = () => {
		if (pendingPlans.length === 0) {
			return;
		}
		if (!workflowReady) {
			setMessages((current) => [
				...current,
				createMessage({
					role: "assistant",
					content:
						"Workflow is not ready for execution. Complete Prompt + Assets + Analysis confirmation first.",
				}),
			]);
			return;
		}
		if (!areAllRequiredConfirmed({ state: confirmationState })) {
			const missingConfirmations = confirmationState.planActionTypes
				.filter(
					(actionType) => !confirmationState.confirmed.includes(actionType),
				)
				.map((actionType) => ACTION_LABELS[actionType]);

			setMessages((current) => [
				...current,
				createMessage({
					role: "assistant",
					content: `High-risk confirmations missing: ${missingConfirmations.join(", ")}. Confirm each required action before execute.`,
				}),
			]);
			return;
		}

		setIsRunning(true);
		const result = executePlannedActions({
			plans: pendingPlans,
			runAction: (actionName) => {
				invokeAction(actionName, undefined, "mouseclick");
			},
		});
		emitAIEditorTelemetry({
			type: "execute-result",
			attemptedCount: pendingPlans.length,
			executedCount: result.executed.length,
			failedCount: result.failed.length,
			failedActions: result.failed,
		});

		const assistantMessage = buildExecutionSummary({
			executed: result.executed,
			failed: result.failed,
			actionLabels: ACTION_LABELS,
		});

		setMessages((current) => [
			...current,
			createMessage({ role: "assistant", content: assistantMessage }),
		]);

		setAuditEntries((current) =>
			appendAuditEntry({
				entries: current,
				entry: createExecutionAuditEntry({
					input: lastPlannedInput,
					plans: pendingPlans,
					failed: result.failed,
				}),
			}),
		);
		setPendingPlans([]);
		setPendingPlanSummary(null);
		setConfirmationState(buildConfirmationState({ plans: [] }));
		setIsRunning(false);
	};

	const handleClear = () => {
		if (typeof window !== "undefined") {
			try {
				clearAuditEntries({ storage: window.localStorage });
			} catch {
				// Ignore storage errors and keep in-memory clear behavior.
			}
		}
		setMessages([INITIAL_MESSAGE]);
		setDraft("");
		setPendingPlans([]);
		setPendingPlanSummary(null);
		setLastPlannedInput("");
		setAuditEntries([]);
		setPendingImportSource(null);
		setAnalysisGenerated(false);
		setAnalysisConfirmed(false);
		setConfirmationState(buildConfirmationState({ plans: [] }));
		nextMessageIdRef.current = 2;
	};

	const handleExportAudit = () => {
		if (auditEntries.length === 0) {
			return;
		}

		try {
			const payload = buildAuditExportPayload({ entries: auditEntries });
			const raw = serializeAuditExportPayload({ payload });
			const blob = new Blob([raw], {
				type: "application/json;charset=utf-8",
			});
			const downloadUrl = window.URL.createObjectURL(blob);
			const anchor = document.createElement("a");
			anchor.href = downloadUrl;
			anchor.download = `ai-audit-${formatAuditExportTimestamp(new Date())}.json`;
			document.body.append(anchor);
			anchor.click();
			anchor.remove();
			window.URL.revokeObjectURL(downloadUrl);

			setMessages((current) => [
				...current,
				createMessage({
					role: "assistant",
					content: `Audit exported (${payload.entryCount} entries).`,
				}),
			]);
			emitAIEditorTelemetry({
				type: "audit-export-result",
				success: true,
				entryCount: payload.entryCount,
			});
		} catch {
			emitAIEditorTelemetry({
				type: "audit-export-result",
				success: false,
				entryCount: 0,
			});
			setMessages((current) => [
				...current,
				createMessage({
					role: "assistant",
					content: "Audit export failed.",
				}),
			]);
		}
	};

	const handleImportAuditClick = () => {
		auditImportInputRef.current?.click();
	};

	const handleImportAuditChange = async (
		event: React.ChangeEvent<HTMLInputElement>,
	) => {
		const file = event.target.files?.[0];
		if (!file) {
			return;
		}
		const currentEntryCount = auditEntries.length;

		try {
			const raw = await file.text();
			const payload = parseAuditExportPayload({ raw });
			if (!payload) {
				throw new Error("Invalid audit payload");
			}
			const preview = buildAuditImportPreview({
				fileName: file.name,
				currentEntries: auditEntries,
				importedEntries: payload.entries,
				strategy: importMergeStrategy,
			});
			setPendingImportSource({
				fileName: file.name,
				importedEntries: payload.entries,
			});
			setMessages((current) => [
				...current,
				createMessage({
					role: "assistant",
					content: buildAuditImportPreviewMessage({ preview }),
				}),
			]);
		} catch {
			emitAIEditorTelemetry({
				type: "audit-import-result",
				success: false,
				entryCount: 0,
				strategy: importMergeStrategy,
				totalCount: currentEntryCount,
			});
			setMessages((current) => [
				...current,
				createMessage({
					role: "assistant",
					content: "Audit import failed.",
				}),
			]);
		} finally {
			event.target.value = "";
		}
	};

	const handleInputKeyDown = (
		event: React.KeyboardEvent<HTMLTextAreaElement>,
	) => {
		if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
			event.preventDefault();
			void handleRun();
		}
	};

	useEffect(() => {
		if (typeof window === "undefined" || promptStorageKey === null) {
			setProjectPrompt("");
			setProjectPromptDraft("");
			setIsProjectPromptHydrated(true);
			return;
		}

		try {
			const savedPrompt = window.localStorage.getItem(promptStorageKey) ?? "";
			setProjectPrompt(savedPrompt);
			setProjectPromptDraft(savedPrompt);
		} catch {
			setProjectPrompt("");
			setProjectPromptDraft("");
		} finally {
			setIsProjectPromptHydrated(true);
		}
	}, [promptStorageKey]);

	useEffect(() => {
		if (
			!isProjectPromptHydrated ||
			typeof window === "undefined" ||
			promptStorageKey === null
		) {
			return;
		}

		try {
			const normalizedPrompt = projectPrompt.trim();
			if (!normalizedPrompt) {
				window.localStorage.removeItem(promptStorageKey);
				return;
			}
			window.localStorage.setItem(promptStorageKey, normalizedPrompt);
		} catch {
			// Ignore storage errors to avoid blocking editor flow.
		}
	}, [projectPrompt, isProjectPromptHydrated, promptStorageKey]);

	useEffect(() => {
		setIsAnalysisSettingsHydrated(false);
		if (typeof window === "undefined" || analysisSettingsStorageKey === null) {
			setAnalysisPrompt("");
			setAnalysisMaxConcurrency(DEFAULT_ANALYSIS_MAX_CONCURRENCY);
			setIsAnalysisSettingsHydrated(true);
			return;
		}

		try {
			const raw = window.localStorage.getItem(analysisSettingsStorageKey);
			if (!raw) {
				setAnalysisPrompt("");
				setAnalysisMaxConcurrency(DEFAULT_ANALYSIS_MAX_CONCURRENCY);
			} else {
				const parsed = JSON.parse(raw) as {
					prompt?: string;
					maxConcurrency?: number;
				};
				const parsedConcurrency = Number.isFinite(parsed.maxConcurrency)
					? Math.min(12, Math.max(1, Math.round(parsed.maxConcurrency ?? 0)))
					: DEFAULT_ANALYSIS_MAX_CONCURRENCY;
				setAnalysisPrompt(
					typeof parsed.prompt === "string" ? parsed.prompt : "",
				);
				setAnalysisMaxConcurrency(parsedConcurrency);
			}
		} catch {
			setAnalysisPrompt("");
			setAnalysisMaxConcurrency(DEFAULT_ANALYSIS_MAX_CONCURRENCY);
		} finally {
			setIsAnalysisSettingsHydrated(true);
		}
	}, [analysisSettingsStorageKey]);

	useEffect(() => {
		if (
			!isAnalysisSettingsHydrated ||
			typeof window === "undefined" ||
			analysisSettingsStorageKey === null
		) {
			return;
		}

		try {
			window.localStorage.setItem(
				analysisSettingsStorageKey,
				JSON.stringify({
					prompt: analysisPrompt,
					maxConcurrency: analysisMaxConcurrency,
				}),
			);
		} catch {
			// Ignore storage errors to avoid blocking editor flow.
		}
	}, [
		analysisPrompt,
		analysisMaxConcurrency,
		analysisSettingsStorageKey,
		isAnalysisSettingsHydrated,
	]);

	useEffect(() => {
		const previousFingerprint = workflowFingerprintRef.current;
		workflowFingerprintRef.current = workflowFingerprint;
		if (
			previousFingerprint === null ||
			previousFingerprint === workflowFingerprint
		) {
			return;
		}
		setAnalysisGenerated(false);
		setAnalysisConfirmed(false);
	}, [workflowFingerprint]);

	useEffect(() => {
		if (typeof window === "undefined") {
			return;
		}

		const dispose = installAIEditorTelemetryAnalyticsSink({
			send: createBrowserAIEditorAnalyticsSender({ windowRef: window }),
		});
		return dispose;
	}, []);

	useEffect(() => {
		if (typeof window === "undefined") {
			return;
		}
		try {
			const loadedEntries = loadAuditEntries({
				storage: window.localStorage,
				key: AI_AUDIT_STORAGE_KEY,
			});
			setAuditEntries(loadedEntries);
		} catch {
			setAuditEntries([]);
		} finally {
			setIsAuditHydrated(true);
		}
	}, []);

	useEffect(() => {
		if (!isAuditHydrated || typeof window === "undefined") {
			return;
		}
		try {
			saveAuditEntries({
				storage: window.localStorage,
				entries: auditEntries,
				key: AI_AUDIT_STORAGE_KEY,
			});
		} catch {
			// Ignore storage errors to avoid breaking the editing flow.
		}
	}, [auditEntries, isAuditHydrated]);

	const content = (
		<div className="flex min-h-0 h-full flex-col gap-3 pb-2">
			<div className="bg-accent/20 border rounded-md p-2">
				<div className="text-xs text-muted-foreground mb-1.5">
					New project workflow: Prompt - Assets - Analysis - Confirm - Plan -
					Execute
				</div>
				<Textarea
					value={projectPromptDraft}
					onChange={(event) => setProjectPromptDraft(event.target.value)}
					placeholder="Describe your editing objective, audience, style, pacing, and constraints..."
					rows={3}
				/>
				<div className="mt-2 flex items-center gap-2">
					<span className="text-muted-foreground text-xs">
						Asset analysis concurrency
					</span>
					<Input
						type="number"
						min={1}
						max={12}
						step={1}
						value={analysisMaxConcurrency}
						onChange={(event) => {
							const parsed = Number.parseInt(event.target.value, 10);
							if (!Number.isFinite(parsed)) {
								setAnalysisMaxConcurrency(DEFAULT_ANALYSIS_MAX_CONCURRENCY);
								return;
							}
							setAnalysisMaxConcurrency(Math.min(12, Math.max(1, parsed)));
						}}
						className="h-7 w-20"
					/>
				</div>
				<Textarea
					value={analysisPrompt}
					onChange={(event) => setAnalysisPrompt(event.target.value)}
					placeholder="Optional custom prompt for asset understanding (leave empty to use best-practice default)."
					rows={2}
					className="mt-2"
				/>
				<div className="mt-2 flex flex-wrap items-center gap-2">
					<Button size="sm" onClick={handleSaveProjectPrompt}>
						Save Prompt
					</Button>
					<Button
						size="sm"
						variant="outline"
						onClick={() => void handleAnalyzeContext()}
						disabled={!hasProjectPrompt || !hasAssets || isRunning}
					>
						Analyze Prompt + Assets
					</Button>
					<Button
						size="sm"
						variant={analysisConfirmed ? "secondary" : "default"}
						onClick={handleConfirmAnalysis}
						disabled={!analysisGenerated}
					>
						{analysisConfirmed ? "Analysis Confirmed" : "Confirm Analysis"}
					</Button>
				</div>
				<div className="mt-2 text-xs text-muted-foreground">
					Workflow status: Prompt {hasProjectPrompt ? "done" : "pending"} |
					Assets {hasAssets ? `${mediaAssets.length} loaded` : "pending"} |
					Analysis {analysisConfirmed ? "confirmed" : "pending"}
				</div>
			</div>

			<ScrollArea className="bg-accent/20 border rounded-md min-h-0 flex-1 p-2">
				<div className="space-y-2">
					{messages.map((message) => (
						<div
							key={message.id}
							className={cn(
								"rounded-md border px-3 py-2 text-sm",
								message.role === "user"
									? "bg-background border-border"
									: "bg-accent border-border/70",
							)}
						>
							<div className="text-muted-foreground text-xs mb-1">
								{ROLE_LABELS[message.role]}
							</div>
							<div className="leading-relaxed whitespace-pre-wrap">
								{message.content}
							</div>
						</div>
					))}
				</div>
			</ScrollArea>

			<div className="space-y-2">
				{pendingPlans.length > 0 && (
					<div className="bg-accent/30 border border-border/70 rounded-md p-2">
						<div className="text-xs text-muted-foreground mb-1">
							Dry-run plan (highest risk:{" "}
							{pendingPlanSummary?.highestRiskLevel ?? "low"})
						</div>
						<div className="flex flex-wrap gap-1.5">
							{pendingPlans.map((plan) => (
								<span
									key={`${plan.type}-${plan.matchedKeywords.join("-")}`}
									className="rounded bg-background px-2 py-1 text-xs border"
								>
									{ACTION_LABELS[plan.type]}
								</span>
							))}
						</div>
						{requiresActionConfirmation && (
							<div className="mt-2 border border-destructive/30 rounded-md bg-destructive/10 p-2">
								<div className="text-xs text-destructive mb-1">
									High-risk actions require per-action confirmation.
								</div>
								<div className="flex flex-wrap gap-2">
									{confirmationState.planActionTypes.map((actionType) => {
										const isConfirmed =
											confirmationState.confirmed.includes(actionType);
										return (
											<Button
												key={actionType}
												size="sm"
												variant={isConfirmed ? "secondary" : "destructive"}
												onClick={() =>
													setConfirmationState((current) =>
														toggleActionConfirmation({
															state: current,
															actionType,
														}),
													)
												}
											>
												{isConfirmed ? "Confirmed" : "Confirm"}{" "}
												{ACTION_LABELS[actionType]}
											</Button>
										);
									})}
								</div>
							</div>
						)}
					</div>
				)}
				{importPreview && (
					<div className="bg-accent/30 border border-border/70 rounded-md p-2">
						<div className="text-xs text-muted-foreground">
							{buildAuditImportPreviewMessage({ preview: importPreview })}
						</div>
						{importPreview.dedupedCount > 0 && (
							<div className="text-xs text-muted-foreground mt-1">
								Dedupe will remove {importPreview.dedupedCount} duplicate
								entry(ies).
							</div>
						)}
						<div className="mt-2 flex items-center gap-2">
							<Button
								size="sm"
								variant="secondary"
								onClick={handleApplyImportPreview}
								disabled={isRunning}
							>
								Apply Import
							</Button>
							<Button
								size="sm"
								variant="ghost"
								onClick={handleCancelImportPreview}
								disabled={isRunning}
							>
								Cancel Import
							</Button>
						</div>
					</div>
				)}
				<Textarea
					value={draft}
					onChange={(event) => setDraft(event.target.value)}
					onKeyDown={handleInputKeyDown}
					placeholder="Describe the edit task you want to plan..."
					rows={4}
				/>
				<div className="flex flex-wrap items-center justify-between gap-2">
					<span className="text-muted-foreground text-xs">
						Press Ctrl/Cmd + Enter to run
					</span>
					<div className="flex flex-wrap items-center justify-end gap-2">
						<input
							ref={auditImportInputRef}
							type="file"
							accept="application/json,.json"
							className="hidden"
							onChange={handleImportAuditChange}
						/>
						<div className="flex items-center gap-1 rounded-md border border-border/70 bg-background/70 p-1">
							{AUDIT_MERGE_STRATEGY_OPTIONS.map((strategyOption) => {
								const isActive = importMergeStrategy === strategyOption.value;
								return (
									<Button
										key={strategyOption.value}
										type="button"
										size="sm"
										variant={isActive ? "secondary" : "ghost"}
										className="h-6 px-2 text-[11px]"
										onClick={() => setImportMergeStrategy(strategyOption.value)}
									>
										{strategyOption.label}
									</Button>
								);
							})}
						</div>
						<Button variant="ghost" size="sm" onClick={handleImportAuditClick}>
							Import Audit
						</Button>
						<Button
							variant="ghost"
							size="sm"
							onClick={handleExportAudit}
							disabled={!canExportAudit}
						>
							Export Audit
						</Button>
						<Button
							variant="ghost"
							size="sm"
							onClick={handleClear}
							disabled={!canClear || isRunning}
						>
							Clear
						</Button>
						<Button
							size="sm"
							onClick={() => void handleRun()}
							disabled={!canRun || isRunning}
						>
							Run (Plan)
						</Button>
						<Button
							size="sm"
							variant="secondary"
							onClick={handleExecute}
							disabled={!canExecute}
						>
							{isRunning ? "Executing..." : "Execute"}
						</Button>
					</div>
				</div>
				<div className="text-xs text-muted-foreground">
					Audit entries: {auditEntries.length}
				</div>
			</div>
		</div>
	);

	if (embedded) {
		return <div className="h-full p-2">{content}</div>;
	}

	return <PanelView title="AI">{content}</PanelView>;
}
