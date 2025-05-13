
import api from "./api";


const handler =  {
	async fetch (request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		return api.fetch(request, env, ctx);
	}
};

export default handler;
