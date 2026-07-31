import { useEffect, useState } from "react";
import {
  Button,
  Card,
  Checkbox,
  Group,
  NumberInput,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { api } from "../../lib/api";
import type { AdminState, QueueMetrics } from "../../lib/types";
import { notifyError, notifyOk } from "./notify";

export function ScheduleHealthPanel({
  state,
  metrics,
  onSaved,
}: {
  state: AdminState;
  metrics: QueueMetrics;
  onSaved: () => Promise<void>;
}) {
  const hc = state.traffic.healthConfig as Record<string, unknown>;
  const [opensAt, setOpensAt] = useState("");
  const [paused, setPaused] = useState(metrics.paused);
  const [enabled, setEnabled] = useState(Boolean(hc.enabled));
  const [url, setUrl] = useState(String(hc.url ?? ""));
  const [interval, setIntervalSec] = useState(Number(hc.intervalSeconds ?? 30));
  const [latency, setLatency] = useState(Number(hc.maxLatencyMs ?? 2000));
  const [expectStatus, setExpectStatus] = useState(Number(hc.expectStatus ?? 200));
  const [slow, setSlow] = useState(Number(hc.slowRateMultiplier ?? 0.25));
  const [fail, setFail] = useState(Number(hc.failThreshold ?? 3));
  const [recover, setRecover] = useState(Number(hc.recoverThreshold ?? 2));

  useEffect(() => {
    setPaused(metrics.paused);
    if (metrics.opensAt) {
      const d = new Date(metrics.opensAt);
      const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
      setOpensAt(local);
    }
  }, [metrics.paused, metrics.opensAt]);

  return (
    <Card withBorder bg="dark.7" style={{ borderColor: "rgba(232,241,245,0.14)" }}>
      <Stack>
        <Title order={4}>Traffic controls</Title>
        <TextInput
          label="Opening time (local)"
          type="datetime-local"
          value={opensAt}
          onChange={(e) => setOpensAt(e.currentTarget.value)}
        />
        <Group>
          <Button
            onClick={() => {
              const iso = opensAt ? new Date(opensAt).toISOString() : null;
              void api("/api/admin/schedule", {
                method: "PUT",
                body: JSON.stringify({ queue: state.queue, opensAt: iso }),
              })
                .then(() => {
                  notifyOk("Schedule saved");
                  return onSaved();
                })
                .catch(notifyError);
            }}
          >
            Save opening time
          </Button>
          <Button
            variant="default"
            onClick={() => {
              void api("/api/admin/schedule", {
                method: "PUT",
                body: JSON.stringify({ queue: state.queue, opensAt: null }),
              })
                .then(() => {
                  setOpensAt("");
                  notifyOk("Opened now");
                  return onSaved();
                })
                .catch(notifyError);
            }}
          >
            Open now
          </Button>
        </Group>
        <Checkbox
          label="Silent pause (stop admissions)"
          checked={paused}
          onChange={(e) => setPaused(e.currentTarget.checked)}
        />
        <Button
          onClick={() => {
            if (!window.confirm(paused ? "Pause admissions?" : "Resume admissions?")) return;
            void api("/api/admin/pause", {
              method: "POST",
              body: JSON.stringify({ queue: state.queue, paused }),
            })
              .then(() => {
                notifyOk(paused ? "Paused" : "Resumed");
                return onSaved();
              })
              .catch(notifyError);
          }}
        >
          Apply pause
        </Button>

        <Title order={5} mt="sm">
          Origin health throttle
        </Title>
        <Text size="sm" c="dimmed">
          Health: {metrics.health.level}
          {metrics.health.lastLatencyMs != null ? ` · ${metrics.health.lastLatencyMs}ms` : ""}
          {metrics.health.autoPaused ? " · auto-paused" : ""}
        </Text>
        <Checkbox
          label="Enabled"
          checked={enabled}
          onChange={(e) => setEnabled(e.currentTarget.checked)}
        />
        <TextInput label="Health URL" value={url} onChange={(e) => setUrl(e.currentTarget.value)} />
        <SimpleGrid cols={{ base: 2, sm: 3 }}>
          <NumberInput
            label="Interval (s)"
            value={interval}
            onChange={(v) => setIntervalSec(Number(v) || 30)}
          />
          <NumberInput
            label="Max latency (ms)"
            value={latency}
            onChange={(v) => setLatency(Number(v) || 2000)}
          />
          <NumberInput
            label="Expect status"
            value={expectStatus}
            onChange={(v) => setExpectStatus(Number(v) || 200)}
          />
          <NumberInput
            label="Slow rate"
            value={slow}
            onChange={(v) => setSlow(Number(v) || 0.25)}
            step={0.05}
          />
          <NumberInput
            label="Fail threshold"
            value={fail}
            onChange={(v) => setFail(Number(v) || 3)}
          />
          <NumberInput
            label="Recover threshold"
            value={recover}
            onChange={(v) => setRecover(Number(v) || 2)}
          />
        </SimpleGrid>
        <Group>
          <Button
            onClick={() => {
              void api("/api/admin/health", {
                method: "PUT",
                body: JSON.stringify({
                  queue: state.queue,
                  enabled,
                  url,
                  intervalSeconds: interval,
                  maxLatencyMs: latency,
                  expectStatus,
                  slowRateMultiplier: slow,
                  failThreshold: fail,
                  recoverThreshold: recover,
                }),
              })
                .then(() => {
                  notifyOk("Health saved");
                  return onSaved();
                })
                .catch(notifyError);
            }}
          >
            Save health
          </Button>
          <Button
            variant="default"
            onClick={() => {
              void api("/api/admin/health", {
                method: "PUT",
                body: JSON.stringify({ queue: state.queue, overrideMinutes: 15 }),
              })
                .then(() => {
                  notifyOk("Override 15m");
                  return onSaved();
                })
                .catch(notifyError);
            }}
          >
            Ignore 15m
          </Button>
          <Button
            variant="default"
            onClick={() => {
              void api("/api/admin/health", {
                method: "PUT",
                body: JSON.stringify({ queue: state.queue, clearOverride: true }),
              })
                .then(() => {
                  notifyOk("Override cleared");
                  return onSaved();
                })
                .catch(notifyError);
            }}
          >
            Clear override
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}
