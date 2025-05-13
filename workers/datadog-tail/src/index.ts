/**
 * Datadog Tail Worker
 *
 * This worker receives trace data from Cloudflare and forwards it to Datadog.
 * It formats the TraceItem[] data to be compatible with Datadog's logs API.
 */
import { randomUUID } from 'node:crypto';

export default {
	async tail(events: TraceItem[], env: Env, ctx: ExecutionContext) {
		if (!events || events.length === 0) return;

		const requestId = randomUUID();
		// Format trace items for Datadog
		const formattedLogs = events.flatMap((event) => {
			const ddsource = 'cloudflare-worker';
			const worker = event.scriptName || 'unknown';
			const executionModel = event.executionModel || 'unknown';
			const outcome = event.outcome || 'unknown';
			const entrypoint = event.entrypoint || 'default';
			const ddtags = `worker:${worker},execution_model:${executionModel},outcome:${outcome},entrypoint:${entrypoint}`;

			const miniInvocation = {
				...event,
				event: undefined,
				cpuTime: undefined,
				wallTime: undefined,
				logs: undefined,
				exceptions: undefined,
				diagnosticsChannelEvents: undefined
			}
			const logs = event.logs.map((log) => {
				return {
					ddsource,
					ddtags,
					service: worker,
					hostname: env.DATADOG_HOST,
					timestamp: log.timestamp,
					message: JSON.stringify({
						...log,
						message: messageArrayToStructuredLog(log.message),
						requestId,
						...miniInvocation
					}),
				};
			});

			const exceptions = event.exceptions.map((exception) => {
				return {
					ddsource,
					ddtags,
					service: worker,
					hostname: env.DATADOG_HOST,
					timestamp: exception.timestamp,
					message: JSON.stringify({
						requestId,
						level: 'error',
						...exception
					})
				}

			});

			const invocationLog = {
				ddsource,
				ddtags,
				service: worker,
				hostname: env.DATADOG_HOST,
				timestamp: event.eventTimestamp,
				message: JSON.stringify({
					...event,
					requestId,
					message: eventToMessage(event),
					logs: undefined,
				}),
			};

			return [invocationLog, ...logs, ...exceptions];
		});

		try {
			// Send data to Datadog logs API
			const response = await fetch(env.DATADOG_URL, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'DD-API-KEY': env.DATADOG_API_KEY,
				},
				body: JSON.stringify(formattedLogs),
			});

			if (!response.ok) {
				const errorText = await response.text();
				console.error({
					message: 'Failed to send logs to Datadog',
					status: response.status,
					error: safeJsonParse(errorText),
				});
			}
		} catch (error) {
			console.error('Error sending logs to Datadog:', error);
		}
	},
} satisfies ExportedHandler<Env>;

function safeJsonParse<T>(jsonString: string): T | string {
	try {
		return JSON.parse(jsonString);
	} catch (error) {
		console.error('Failed to parse JSON:', error);
		return jsonString;
	}
}

function eventToMessage(traceItem: TraceItem): string {
	const event = traceItem.event
	if (!event) {
		return 'No event data available';
	}
	if("request" in (event)) {
		return `${event.request.method} ${event.request.url}`;
	}

	if("rpcMethod" in event) {
		return `RPC: ${event.rpcMethod}`;
	}

	if("webSocketEventType" in event) {
		return `WebSocket: ${event.webSocketEventType}`;
	}

	if("mailFrom" in event) {
		return `Email: ${event.mailFrom}`;
	}

	if("queue" in event) {
		return `Queue: ${event.queue}`;
	}

	if("cron" in event) {
		return `Cron: ${event.cron}`;
	}
	if("scheduled" in event) {
		return `Scheduled: ${event.scheduled}`;
	}

	return "Worker Invocation"
}

function messageArrayToStructuredLog(input: (unknown[])): { message: string, attributes: Record<string, unknown> } {
	let message = '';
	let attributes: Record<string, unknown> = {};
	for(const part of input) {
		if (typeof part === 'string' || typeof part === 'number') {
			message = message ? `${message} ${part}` : `${part}`;
		}
		else if (typeof part === 'object' && part !== null) {
			attributes = { ...attributes, ...part };
		}
	}

	return {
		message,
		attributes
	}
}


function formatTimestamp(timestamp: number): string {
	const date = new Date(timestamp);
	return date.toISOString();
}
