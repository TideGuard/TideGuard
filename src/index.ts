import { QueueRoom } from "./durable-object/queue-room";
import { handleRequest } from "./routes/router";

export { QueueRoom };

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    return handleRequest(request, env);
  },
} satisfies ExportedHandler<Env>;
