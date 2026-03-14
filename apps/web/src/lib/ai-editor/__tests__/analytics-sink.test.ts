import { afterEach, describe, expect, test } from "bun:test";
import { emitTelemetryEvent } from "../telemetry";
import {
	buildAIEditorAnalyticsPayload,
	createBrowserAIEditorAnalyticsSender,
	installAIEditorTelemetryAnalyticsSink,
	toAIEditorAnalyticsEventName,
} from "../analytics-sink";

describe("ai-editor analytics-sink", () => {
	afterEach(() => {
		// Reset sink between tests by reinstalling a no-op and removing it.
		const dispose = installAIEditorTelemetryAnalyticsSink({
			send: () => {},
		});
		dispose();
	});

	test("maps telemetry event type to analytics event name", () => {
		expect(
			toAIEditorAnalyticsEventName({
				eventType: "audit-import-result",
			}),
		).toBe("ai_editor_audit_import_result");
	});

	test("builds analytics payload from envelope", () => {
		const envelope = emitTelemetryEvent({
			event: {
				type: "plan-empty",
				inputLength: 8,
				reason: "no-match",
			},
			timestamp: "2026-03-14T08:00:00.000Z",
		});

		expect(buildAIEditorAnalyticsPayload({ envelope })).toEqual({
			domain: "ai-editor",
			timestamp: "2026-03-14T08:00:00.000Z",
			type: "plan-empty",
			inputLength: 8,
			reason: "no-match",
		});
	});

	test("routes telemetry events into installed analytics sink", () => {
		const sent: Array<{ eventName: string; payload: Record<string, unknown> }> = [];

		const dispose = installAIEditorTelemetryAnalyticsSink({
			send: ({ eventName, payload }) => {
				sent.push({ eventName, payload });
			},
		});

		emitTelemetryEvent({
			event: {
				type: "execute-result",
				attemptedCount: 2,
				executedCount: 1,
				failedCount: 1,
				failedActions: ["redo"],
			},
			timestamp: "2026-03-14T08:01:00.000Z",
		});

		expect(sent).toHaveLength(1);
		expect(sent[0]?.eventName).toBe("ai_editor_execute_result");
		expect(sent[0]?.payload).toMatchObject({
			type: "execute-result",
			failedCount: 1,
		});

		dispose();
		emitTelemetryEvent({
			event: {
				type: "plan-empty",
				inputLength: 10,
				reason: "no-match",
			},
		});
		expect(sent).toHaveLength(1);
	});

	test("browser sender forwards to databuddy track api", () => {
		const tracked: Array<{ eventName: string; payload?: Record<string, unknown> }> =
			[];

		const sender = createBrowserAIEditorAnalyticsSender({
			windowRef: {
				databuddy: {
					track: (eventName, payload) => {
						tracked.push({ eventName, payload });
					},
				},
			},
		});

		sender({
			eventName: "ai_editor_plan_generated",
			payload: { actionCount: 3 },
		});

		expect(tracked).toEqual([
			{
				eventName: "ai_editor_plan_generated",
				payload: { actionCount: 3 },
			},
		]);
	});
});
