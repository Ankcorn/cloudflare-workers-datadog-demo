
import { instrument, type ResolveConfigFn } from '@microlabs/otel-cf-workers'
import { Metrics } from './metrics'
import api from "./api";
export { Counter } from './counter'


const handler =  {
	async fetch (request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const metrics = new Metrics()
		return metrics.run({
			apiKey: env.DATADOG_API_KEY,
			apiUrl: 'https://api.us3.datadoghq.com/api/v1/series',
		}, async () => {
			const response = await api.fetch(request, env, ctx);
			ctx.waitUntil(metrics.flush());
			return response;
		});
	}
};

const config: ResolveConfigFn = (env: Env) => {
	return {
		exporter: {
			url: 'https://trace.agent.us3.datadoghq.com/api/v0.2/traces',
			headers: { 'DD-API-KEY': env.DATADOG_API_KEY },
		},
		service: { name: 'greetings' },
	}
}

export default instrument(handler, config)
