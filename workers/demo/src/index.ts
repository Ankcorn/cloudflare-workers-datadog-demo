
import { instrument, type ResolveConfigFn } from '@microlabs/otel-cf-workers'
import api from "./api";


const handler =  {
	async fetch (request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		return api.fetch(request, env, ctx);
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
