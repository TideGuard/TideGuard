import { useEffect, useState } from "react";
import {
  Anchor,
  Button,
  Checkbox,
  Group,
  NumberInput,
  Stack,
  Text,
  TextInput,
  Textarea,
} from "@mantine/core";
import { api } from "../../lib/api";
import type { AdminState, WebhookSettingsPublic } from "../../lib/types";
import { LINKS } from "../../lib/setup-guidance";
import { Panel } from "./Panel";
import { notifyError, notifyOk } from "./notify";

const EVENT_OPTIONS = [
  { value: "pause", label: "Silent pause on/off" },
  { value: "health", label: "Origin health config changes" },
  { value: "depth", label: "Waiting depth threshold" },
  { value: "opened", label: "Scheduled room opened" },
  { value: "origin_unhealthy", label: "Origin became unhealthy" },
  { value: "queue_full", label: "Queue rejected at capacity" },
  { value: "admit_rate_changed", label: "Admit rate changed" },
] as const;

export function WebhooksPanel({
  state,
  onSaved,
}: {
  state: AdminState;
  onSaved: () => Promise<void>;
}) {
  const w: WebhookSettingsPublic = state.webhooks ?? {
    enabled: false,
    url: null,
    events: ["pause", "health", "depth"],
    depthThreshold: 100,
    updatedAt: 0,
    hasSecret: false,
  };
  const [enabled, setEnabled] = useState(w.enabled);
  const [url, setUrl] = useState(w.url ?? "");
  const [events, setEvents] = useState<string[]>(w.events);
  const [depthThreshold, setDepth] = useState(w.depthThreshold);
  const [signingSecret, setSigningSecret] = useState("");
  const [clearSecret, setClearSecret] = useState(false);

  useEffect(() => {
    setEnabled(w.enabled);
    setUrl(w.url ?? "");
    setEvents(w.events);
    setDepth(w.depthThreshold);
  }, [w.enabled, w.url, w.events, w.depthThreshold]);

  return (
    <Panel
      id="webhooks"
      title="Operator webhooks"
      description={
        <Anchor href={LINKS.docsWebhooks} target="_blank" rel="noreferrer" size="sm">
          Webhooks guide
        </Anchor>
      }
    >
      <Text size="sm" c="dimmed">
        HTTPS callbacks are attempted immediately, then retried durably after failures.
      </Text>
      <Stack>
        <Checkbox
          label="Enable webhooks"
          checked={enabled}
          onChange={(e) => setEnabled(e.currentTarget.checked)}
        />
        <TextInput
          label="Webhook URL"
          description="Must be https://"
          value={url}
          onChange={(e) => setUrl(e.currentTarget.value)}
          placeholder="https://hooks.example.com/tideguard"
        />
        <Text size="sm" fw={600}>
          Events
        </Text>
        {EVENT_OPTIONS.map((opt) => (
          <Checkbox
            key={opt.value}
            label={opt.label}
            checked={events.includes(opt.value)}
            onChange={(e) => {
              const on = e.currentTarget.checked;
              setEvents((prev) =>
                on ? [...prev, opt.value] : prev.filter((x) => x !== opt.value),
              );
            }}
          />
        ))}
        <NumberInput
          label="Depth threshold"
          description="Fire once when waiting count reaches this (resets when waiting drops below)."
          value={depthThreshold}
          min={1}
          onChange={(v) => setDepth(Number(v) || 1)}
        />
        <TextInput
          label="Signing secret (optional)"
          description={
            w.hasSecret
              ? "A secret is already sealed. Leave blank to keep it, or replace."
              : "If set, TideGuard sends X-TideGuard-Signature (HMAC-SHA256 of the body)."
          }
          value={signingSecret}
          onChange={(e) => setSigningSecret(e.currentTarget.value)}
          autoComplete="off"
        />
        {w.hasSecret ? (
          <Checkbox
            label="Clear signing secret"
            checked={clearSecret}
            onChange={(e) => setClearSecret(e.currentTarget.checked)}
          />
        ) : null}
        <Textarea
          label="Payload shape"
          readOnly
          autosize
          minRows={3}
          value={`{ "event": "pause|health|depth|opened|origin_unhealthy|queue_full|admit_rate_changed", "queue": "…", "at": 0, "detail": { … } }`}
        />
        <Group>
          <Button
            onClick={() => {
              void api("/api/admin/webhooks", {
                method: "PUT",
                body: JSON.stringify({
                  enabled,
                  url,
                  events,
                  depthThreshold,
                  ...(signingSecret ? { signingSecret } : {}),
                  ...(clearSecret ? { clearSecret: true } : {}),
                }),
              })
                .then(() => {
                  setSigningSecret("");
                  setClearSecret(false);
                  notifyOk("Webhooks saved");
                  return onSaved();
                })
                .catch(notifyError);
            }}
          >
            Save webhooks
          </Button>
        </Group>
      </Stack>
    </Panel>
  );
}
