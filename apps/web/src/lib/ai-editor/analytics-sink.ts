import {
	clearTelemetrySink,
	setTelemetrySink,
	type TelemetryEnvelope,
	type AIEditorTelemetryEvent,
} from "./telemetry";

type AnalyticsPayload = Record<string, unknown>;

export type AIEditorAnalyticsSender = ({
	eventName,
	payload,
}: {
	eventName: string;
	payload: AnalyticsPayload;
}) => void;

interface DatabuddyObjectLike {
	track?: (eventName: string, payload?: AnalyticsPayload) => void;
	event?: (eventName: string, payload?: AnalyticsPayload) => void;
	capture?: (eventName: string, payload?: AnalyticsPayload) => void;
}

type DatabuddyLike =
	| ((...args: unknown[]) => void)
	| DatabuddyObjectLike
	| undefined;

interface BrowserWindowLike {
	databuddy?: DatabuddyLike;
	dispatchEvent?: (event: Event) => boolean;
}

export function toAIEditorAnalyticsEventName({
	eventType,
}: {
	eventType: AIEditorTelemetryEvent["type"];
}): string {
	return `ai_editor_${eventType.replace(/-/g, "_")}`;
}

export function buildAIEditorAnalyticsPayload({
	envelope,
}: {
	envelope: TelemetryEnvelope;
}): AnalyticsPayload {
	return {
		domain: envelope.domain,
		timestamp: envelope.timestamp,
		...envelope.event,
	};
}

export function emitAIEditorAnalyticsFromEnvelope({
	envelope,
	send,
}: {
	envelope: TelemetryEnvelope;
	send: AIEditorAnalyticsSender;
}): void {
	send({
		eventName: toAIEditorAnalyticsEventName({ eventType: envelope.event.type }),
		payload: buildAIEditorAnalyticsPayload({ envelope }),
	});
}

function sendToDatabuddy({
	databuddy,
	eventName,
	payload,
}: {
	databuddy: DatabuddyLike;
	eventName: string;
	payload: AnalyticsPayload;
}): void {
	if (!databuddy) {
		return;
	}

	if (typeof databuddy === "function") {
		try {
			databuddy("track", eventName, payload);
			return;
		} catch {
			// Fallback below.
		}
		try {
			databuddy(eventName, payload);
		} catch {
			// Ignore analytics transport errors.
		}
		return;
	}

	const sender =
		databuddy.track ?? databuddy.event ?? databuddy.capture ?? undefined;

	if (!sender) {
		return;
	}

	try {
		sender(eventName, payload);
	} catch {
		// Ignore analytics transport errors.
	}
}

export function createBrowserAIEditorAnalyticsSender({
	windowRef,
}: {
	windowRef: BrowserWindowLike;
}): AIEditorAnalyticsSender {
	return ({ eventName, payload }) => {
		sendToDatabuddy({
			databuddy: windowRef.databuddy,
			eventName,
			payload,
		});

		if (typeof CustomEvent !== "function" || !windowRef.dispatchEvent) {
			return;
		}

		try {
			windowRef.dispatchEvent(
				new CustomEvent("ai-editor-analytics", {
					detail: { eventName, payload },
				}),
			);
		} catch {
			// Ignore event dispatch errors.
		}
	};
}

export function installAIEditorTelemetryAnalyticsSink({
	send,
}: {
	send: AIEditorAnalyticsSender;
}): () => void {
	setTelemetrySink({
		sink: (envelope) => {
			emitAIEditorAnalyticsFromEnvelope({ envelope, send });
		},
	});

	return () => {
		clearTelemetrySink();
	};
}
