import { parseQueueConfig } from "../core/config";
import type { QueueConfig } from "../core/types";
import type { QueueRoom } from "../durable-object/queue-room";

/** Resolve the Durable Object stub for a named queue. */
export function getQueueRoom(env: Env, queueName: string): DurableObjectStub<QueueRoom> {
  return env.QUEUE_ROOM.getByName(queueName);
}

/** Parse Worker env vars into a queue config for DO RPC calls. */
export function configFromEnv(env: Env): QueueConfig {
  return parseQueueConfig(env);
}
