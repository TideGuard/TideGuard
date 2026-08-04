import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  Group,
  NumberInput,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { api } from "../../lib/api";
import type { AdminState, QueueMetrics } from "../../lib/types";
import { Panel } from "./Panel";
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
  const hc = state.traffic.healthConfig;
  const [opensAt, setOpensAt] = useState("");
  const [enabled, setEnabled] = useState(Boolean(hc.enabled));
  const [url, setUrl] = useState(String(hc.url ?? ""));
  const [interval, setIntervalSec] = useState(Number(hc.intervalSeconds ?? 30));
  const [latency, setLatency] = useState(Number(hc.maxLatencyMs ?? 2000));
  const [expectStatus, setExpectStatus] = useState(Number(hc.expectStatus ?? 200));
  const [slow, setSlow] = useState(Number(hc.slowRateMultiplier ?? 0.25));
  const [fail, setFail] = useState(Number(hc.failThreshold ?? 3));
  const [recover, setRecover] = useState(Number(hc.recoverThreshold ?? 2));

  useEffect(() => {
    if (metrics.opensAt) {
      const d = new Date(metrics.opensAt);
      const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
      setOpensAt(local);
    } else {
      setOpensAt("");
    }
  }, [metrics.opensAt]);

  return (
    <Panel
      id="admission"
      title="Admission schedule & health"
      description="Schedule when the room opens for the public. Until then, /wait shows a countdown and admissions stay closed. Pause and admit rate live in the event toolbar."
    >
      <Stack>
        <Alert color="teal" title="Scheduled room open">
          <Text size="sm">
            Set a future opening time for drops and onsales. Visitors can join early and see the
            countdown; nobody is admitted until that moment (unless you clear the schedule). The
            event toolbar Status chip mirrors this schedule.
          </Text>
        </Alert>
        {metrics.opensAt && metrics.opensAt > Date.now() ? (
          <Alert color="orange" title="Currently scheduled">
            <Text size="sm">
              Admissions open at <strong>{new Date(metrics.opensAt).toLocaleString()}</strong>.
              Visitors on <code>/wait</code> see a countdown until then.
            </Text>
          </Alert>
        ) : null}
        <TextInput
          label="Opening time (local)"
          description="Leave empty and use Open now to admit immediately."
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

        <Text fw={600} size="sm" mt="sm">
          Origin health throttle
        </Text>
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
    </Panel>
  );
}
