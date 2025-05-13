import { DurableObject } from "cloudflare:workers";

export class Counter extends DurableObject<Env> {
	  async increment(amount: number, session: string) {
		let value = (await this.ctx.storage.get("value")) as number || 0;
		value += amount;

		console.info("Incremented Counter", { amount, value, session});
		await this.ctx.storage.put("value", value);
		return value;
  	}
}
