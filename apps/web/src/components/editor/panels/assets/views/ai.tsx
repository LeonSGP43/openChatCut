"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PanelView } from "@/components/editor/panels/assets/views/base-view";
import { Button } from "@/components/ui/button";
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
import { planEditorActions, type PlannedAction } from "@/lib/ai-editor/planner";
import {
	appendAuditEntry,
	type AuditEntry,
} from "@/lib/ai-editor/audit-log";
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
		"AI edit assistant is ready. Run creates a dry-run plan. Execute applies the plan.",
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

function formatAuditExportTimestamp(date: Date): string {
	const pad = (value: number) => value.toString().padStart(2, "0");
	return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function emitAIEditorTelemetry(event: AIEditorTelemetryEvent): void {
	emitTelemetryEvent({ event });
}

export function AIView() {
	const editor = useEditor();
	const [messages, setMessages] = useState<AIMessage[]>([INITIAL_MESSAGE]);
	const [draft, setDraft] = useState("");
	const [isRunning, setIsRunning] = useState(false);
	const [pendingPlans, setPendingPlans] = useState<PlannedAction[]>([]);
	const [pendingPlanSummary, setPendingPlanSummary] = useState<PlanSummary | null>(
		null,
	);
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
			const result = await transcriptionService.transcribe({ audioData: samples });
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

	const handleRun = () => {
		const input = draft.trim();
		if (!input) return;
		if (isRunning) return;

		const intent = detectAIEditorIntent({ input });
		if (intent) {
			clearPendingPlanState();
			setMessages((current) => [
				...current,
				createMessage({ role: "user", content: input }),
			]);

			if (intent.type === "summarize-assets") {
				const assets = editor.media.getAssets();
				const videoAssets = assets.filter((asset) => asset.type === "video").length;
				const imageAssets = assets.filter((asset) => asset.type === "image").length;
				const audioAssets = assets.filter((asset) => asset.type === "audio").length;
				const summary = buildAssetSummaryText({
					totalAssets: assets.length,
					videoAssets,
					imageAssets,
					audioAssets,
				});
				setMessages((current) => [
					...current,
					createMessage({ role: "assistant", content: summary }),
				]);
				setDraft("");
				return;
			}

			if (intent.type === "summarize-timeline") {
				const tracks = editor.timeline.getTracks();
				const totalElements = tracks.reduce(
					(sum, track) => sum + track.elements.length,
					0,
				);
				const summary = buildTimelineSummaryText({
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
				setMessages((current) => [
					...current,
					createMessage({ role: "assistant", content: summary }),
				]);
				setDraft("");
				return;
			}

			if (intent.type === "generate-captions") {
				void handleGenerateCaptionsIntent();
				return;
			}
		}

		const plans = planEditorActions({ input });
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
		const assistantMessage =
			planSummary === null
				? "No safe action matched. Try play/stop, go to start/end, select/copy/paste/duplicate, split, bookmark, delete selected, mute/visibility, snapping, or ripple editing."
				: `${planSummary.text} Click Execute to apply.`;

		setMessages((current) => {
			const next = [...current, createMessage({ role: "user", content: input })];
			next.push(createMessage({ role: "assistant", content: assistantMessage }));
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
		if (!areAllRequiredConfirmed({ state: confirmationState })) {
			const missingConfirmations = confirmationState.planActionTypes
				.filter(
					(actionType) =>
						!confirmationState.confirmed.includes(actionType),
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

	const handleInputKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
			event.preventDefault();
			handleRun();
		}
	};

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

	return (
		<PanelView title="AI">
			<div className="flex min-h-0 h-full flex-col gap-3 pb-2">
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
								<div className="leading-relaxed">{message.content}</div>
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
						placeholder="Describe the edit you want..."
						rows={4}
					/>
					<div className="flex items-center justify-between gap-2">
						<span className="text-muted-foreground text-xs">
							Press Ctrl/Cmd + Enter to run
						</span>
						<div className="flex items-center gap-2">
							<input
								ref={auditImportInputRef}
								type="file"
								accept="application/json,.json"
								className="hidden"
								onChange={handleImportAuditChange}
							/>
							<div className="flex items-center gap-1 rounded-md border border-border/70 bg-background/70 p-1">
								{AUDIT_MERGE_STRATEGY_OPTIONS.map((strategyOption) => {
									const isActive =
										importMergeStrategy === strategyOption.value;
									return (
										<Button
											key={strategyOption.value}
											type="button"
											size="sm"
											variant={isActive ? "secondary" : "ghost"}
											className="h-6 px-2 text-[11px]"
											onClick={() =>
												setImportMergeStrategy(strategyOption.value)
											}
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
							<Button size="sm" onClick={handleRun} disabled={!canRun || isRunning}>
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
		</PanelView>
	);
}
