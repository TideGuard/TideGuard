/**
 * OpenAPI 3.1 surface for TideGuard HTTP APIs.
 * Served at /openapi.yaml and /openapi.json; mirrored in docs/openapi.yaml.
 */

export const OPENAPI_DOCUMENT = {
  openapi: "3.1.0",
  info: {
    title: "TideGuard",
    version: "0.1.0",
    description:
      "Open-source waiting room for Cloudflare Workers. Queue join/status, admission tokens, and admin control plane.",
    license: { name: "MIT" },
  },
  servers: [{ url: "/", description: "This Worker" }],
  tags: [{ name: "Visitor" }, { name: "Operator" }, { name: "Admin" }, { name: "Meta" }],
  paths: {
    "/join": {
      post: {
        tags: ["Visitor"],
        summary: "Join or resume a queue seat",
        operationId: "joinQueue",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  queue: { type: "string" },
                  visitorId: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Visitor view; may include accessToken when admitted" },
        },
      },
    },
    "/status": {
      get: {
        tags: ["Visitor"],
        summary: "Poll visitor status",
        operationId: "getStatus",
        parameters: [
          { name: "queue", in: "query", schema: { type: "string" } },
          { name: "visitorId", in: "query", required: true, schema: { type: "string" } },
        ],
        responses: { "200": { description: "Status payload" } },
      },
    },
    "/heartbeat": {
      post: {
        tags: ["Visitor"],
        summary: "Keep a waiting seat alive",
        operationId: "heartbeat",
        responses: { "200": { description: "Updated visitor view" } },
      },
    },
    "/leave": {
      post: {
        tags: ["Visitor"],
        summary: "Leave the queue",
        operationId: "leaveQueue",
        responses: { "200": { description: "Leave result" } },
      },
    },
    "/enter": {
      post: {
        tags: ["Visitor"],
        summary: "Confirm entry after click-to-enter admit",
        operationId: "enterQueue",
        responses: { "200": { description: "Entered visitor + access token" } },
      },
    },
    "/admit": {
      post: {
        tags: ["Operator"],
        summary: "Force-admit up to N waiters into open slots",
        operationId: "forceAdmit",
        security: [{ adminSession: [] }, { bearerToken: [] }, { operatorHeader: [] }],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  queue: { type: "string" },
                  count: { type: "integer", minimum: 1, maximum: 100 },
                },
              },
            },
          },
        },
        responses: { "200": { description: "Admitted visitor ids + open slots" } },
      },
    },
    "/mode": {
      post: {
        tags: ["Operator"],
        summary: "Switch queue or lottery mode",
        operationId: "setMode",
        security: [{ adminSession: [] }, { bearerToken: [] }, { operatorHeader: [] }],
        responses: { "200": { description: "Updated mode" } },
      },
    },
    "/pause": {
      post: {
        tags: ["Operator"],
        summary: "Silent pause / resume admissions",
        operationId: "setPause",
        security: [{ adminSession: [] }, { bearerToken: [] }, { operatorHeader: [] }],
        responses: { "200": { description: "Pause state" } },
      },
    },
    "/metrics": {
      get: {
        tags: ["Operator"],
        summary: "Queue metrics snapshot",
        operationId: "getMetrics",
        security: [{ adminSession: [] }, { bearerToken: [] }, { operatorHeader: [] }],
        parameters: [{ name: "queue", in: "query", schema: { type: "string" } }],
        responses: { "200": { description: "Metrics" } },
      },
    },
    "/health": {
      get: {
        tags: ["Meta"],
        summary: "Liveness",
        operationId: "health",
        responses: { "200": { description: "OK" } },
      },
    },
    "/api/admin/admit": {
      post: {
        tags: ["Admin"],
        summary: "Force-admit from admin session",
        operationId: "adminAdmit",
        security: [{ adminSession: [] }],
        responses: { "200": { description: "Same as POST /admit" } },
      },
    },
    "/api/admin/capacity": {
      put: {
        tags: ["Admin"],
        summary: "Live capacity and admit-rate overrides",
        operationId: "adminCapacity",
        security: [{ adminSession: [] }],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  queue: { type: "string" },
                  maxConcurrentUsers: { type: "integer", minimum: 1 },
                  admitPerSecond: { type: "number", exclusiveMinimum: 0 },
                },
              },
            },
          },
        },
        responses: { "200": { description: "Effective capacity settings" } },
      },
    },
    "/api/admin/password": {
      post: {
        tags: ["Admin"],
        summary: "Change admin password while signed in",
        operationId: "adminPassword",
        security: [{ adminSession: [] }],
        responses: { "200": { description: "Password updated; session refreshed" } },
      },
    },
    "/api/admin/default-queue": {
      put: {
        tags: ["Admin"],
        summary: "Set default queue and remember it",
        operationId: "adminDefaultQueue",
        security: [{ adminSession: [] }],
        responses: { "200": { description: "Default queue + known queues" } },
      },
    },
    "/openapi.yaml": {
      get: {
        tags: ["Meta"],
        summary: "OpenAPI document (YAML)",
        operationId: "openapiYaml",
        responses: { "200": { description: "OpenAPI YAML" } },
      },
    },
  },
  components: {
    securitySchemes: {
      adminSession: {
        type: "apiKey",
        in: "cookie",
        name: "tg_admin",
      },
      bearerToken: {
        type: "http",
        scheme: "bearer",
        description: "TOKEN_SECRET",
      },
      operatorHeader: {
        type: "apiKey",
        in: "header",
        name: "X-TideGuard-Operator",
      },
    },
  },
} as const;

export const OPENAPI_YAML = `# TideGuard OpenAPI 3.1
# Canonical machine-readable copy is also served at GET /openapi.yaml
openapi: 3.1.0
info:
  title: TideGuard
  version: 0.1.0
  description: Open-source waiting room for Cloudflare Workers.
  license:
    name: MIT
servers:
  - url: /
tags:
  - name: Visitor
  - name: Operator
  - name: Admin
  - name: Meta
paths:
  /join:
    post:
      tags: [Visitor]
      summary: Join or resume a queue seat
      operationId: joinQueue
      responses:
        "200":
          description: Visitor view
  /status:
    get:
      tags: [Visitor]
      summary: Poll visitor status
      operationId: getStatus
      responses:
        "200":
          description: Status payload
  /heartbeat:
    post:
      tags: [Visitor]
      summary: Keep a waiting seat alive
      operationId: heartbeat
      responses:
        "200":
          description: Updated visitor view
  /leave:
    post:
      tags: [Visitor]
      summary: Leave the queue
      operationId: leaveQueue
      responses:
        "200":
          description: Leave result
  /enter:
    post:
      tags: [Visitor]
      summary: Confirm entry after click-to-enter admit
      operationId: enterQueue
      responses:
        "200":
          description: Entered visitor
  /admit:
    post:
      tags: [Operator]
      summary: Force-admit up to N waiters
      operationId: forceAdmit
      responses:
        "200":
          description: Admitted ids
  /mode:
    post:
      tags: [Operator]
      summary: Switch queue or lottery mode
      operationId: setMode
      responses:
        "200":
          description: Updated mode
  /pause:
    post:
      tags: [Operator]
      summary: Silent pause or resume
      operationId: setPause
      responses:
        "200":
          description: Pause state
  /metrics:
    get:
      tags: [Operator]
      summary: Queue metrics snapshot
      operationId: getMetrics
      responses:
        "200":
          description: Metrics
  /health:
    get:
      tags: [Meta]
      summary: Liveness
      operationId: health
      responses:
        "200":
          description: OK
  /api/admin/admit:
    post:
      tags: [Admin]
      summary: Force-admit from admin session
      operationId: adminAdmit
      responses:
        "200":
          description: Same as POST /admit
  /api/admin/capacity:
    put:
      tags: [Admin]
      summary: Live capacity and admit-rate overrides
      operationId: adminCapacity
      responses:
        "200":
          description: Effective capacity settings
  /api/admin/password:
    post:
      tags: [Admin]
      summary: Change admin password
      operationId: adminPassword
      responses:
        "200":
          description: Password updated
  /api/admin/default-queue:
    put:
      tags: [Admin]
      summary: Set default queue
      operationId: adminDefaultQueue
      responses:
        "200":
          description: Default queue updated
  /openapi.yaml:
    get:
      tags: [Meta]
      summary: This document
      operationId: openapiYaml
      responses:
        "200":
          description: OpenAPI YAML
components:
  securitySchemes:
    adminSession:
      type: apiKey
      in: cookie
      name: tg_admin
    bearerToken:
      type: http
      scheme: bearer
    operatorHeader:
      type: apiKey
      in: header
      name: X-TideGuard-Operator
`;
