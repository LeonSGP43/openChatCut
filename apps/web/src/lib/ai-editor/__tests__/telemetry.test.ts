import { afterEach, describe, expect, test } from "bun:test";
import {
	clearTelemetrySink,
	createTelemetryEnvelope,
	emitTelemetryEvent,
	setTelemetrySink,
	type TelemetryEnvelope,
} from "../telemetry";

describe("ai-editor telemetry", () => {
	afterEach(() => {
		clearTelemetrySink();
	});

	test("createTelemetryEnvelope builds envelope and respects timestamp override", () => {
		const event = {
			type: "plan-empty",
			inputLength: 18,
			reason: "no-match",
		} as const;

		const envelope = createTelemetryEnvelope({
			event,
			timestamp: "2026-03-13T12:00:00.000Z",
		});

		expect(envelope).toEqual({
			domain: "ai-editor",
			timestamp: "2026-03-13T12:00:00.000Z",
			event,
		});
	});

	test("emitTelemetryEvent triggers registered sink and returns envelope", () => {
		const received: TelemetryEnvelope[] = [];
		setTelemetrySink({
			sink: (envelope) => {
				received.push(envelope);
			},
		});

		const envelope = emitTelemetryEvent({
			event: {
				type: "execute-result",
				attemptedCount: 3,
				executedCount: 2,
				failedCount: 1,
				failedActions: ["redo"],
			},
			timestamp: "2026-03-13T12:01:00.000Z",
		});

		expect(received).toEqual([envelope]);
		expect(received[0]?.event.type).toBe("execute-result");
	});

	test("clearTelemetrySink prevents later sink calls", () => {
		const received: TelemetryEnvelope[] = [];
		setTelemetrySink({
			sink: (envelope) => {
				received.push(envelope);
			},
		});

		emitTelemetryEvent({
			event: {
				type: "audit-export-result",
				success: true,
				entryCount: 12,
			},
			timestamp: "2026-03-13T12:02:00.000Z",
		});

		clearTelemetrySink();

		const afterClearEnvelope = emitTelemetryEvent({
			event: {
				type: "audit-import-result",
				success: false,
				entryCount: 0,
				totalCount: 12,
				strategy: "dedupe",
			},
			timestamp: "2026-03-13T12:03:00.000Z",
		});

		expect(received).toHaveLength(1);
		expect(received[0]?.event.type).toBe("audit-export-result");
		expect(afterClearEnvelope.event.type).toBe("audit-import-result");
	});
});
