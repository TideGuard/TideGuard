import { useEffect, useState } from "react";
import { ActionIcon, Button, Group, NumberInput, Text, Tooltip } from "@mantine/core";
import { IconPlayerPause, IconPlayerPlay, IconTicket, IconUserPlus } from "@tabler/icons-react";
import { api } from "../lib/api";
import type { QueueMetrics } from "../lib/types";
import { notifyError, notifyOk } from "../views/dashboard/notify";

function formatSchedule(metrics: QueueMetrics): string {
  if (metrics.roomPhase === "closed") {
    return metrics.closeAction === "passthrough" ? "Closed · passthrough" : "Closed";
  }
  if (metrics.roomPhase === "scheduled" && metrics.opensAt) {
    return `Opens ${new Date(metrics.opensAt).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  }
  if (metrics.closesAt) {
    return `Closes ${new Date(metrics.closesAt).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  }
  return "Open now";
}

export function EventToolbar({
  queue,
  metrics,
  onRefresh,
}: {
  queue: string;
  metrics: QueueMetrics;
  onRefresh: () => Promise<void>;
}) {
  const [rateDraft, setRateDraft] = useState<number | string>(metrics.admitPerSecond);
  const [busy, setBusy] = useState(false);
  const [admitCount, setAdmitCount] = useState<number | string>(1);

  useEffect(() => {
    setRateDraft(metrics.admitPerSecond);
  }, [metrics.admitPerSecond]);

  async function setRate() {
    const value = typeof rateDraft === "number" ? rateDraft : Number(rateDraft);
    if (!Number.isFinite(value) || value <= 0) {
      notifyError(new Error("Enter a positive admit rate"));
      return;
    }
    setBusy(true);
    try {
      await api("/api/admin/rate", {
        method: "PUT",
        body: JSON.stringify({ queue, admitPerSecond: value }),
      });
      notifyOk(`Max outflow set to ${value}/s`);
      await onRefresh();
    } catch (e) {
      notifyError(e);
    } finally {
      setBusy(false);
    }
  }

  async function clearRate() {
    setBusy(true);
    try {
      await api(`/api/admin/rate?queue=${encodeURIComponent(queue)}`, { method: "DELETE" });
      notifyOk("Restored env default rate");
      await onRefresh();
    } catch (e) {
      notifyError(e);
    } finally {
      setBusy(false);
    }
  }

  async function togglePause() {
    const next = !metrics.paused;
    if (
      !window.confirm(
        next
          ? "Pause admissions? Waiting visitors stay in line but nobody is admitted."
          : "Resume admissions?",
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await api("/api/admin/pause", {
        method: "POST",
        body: JSON.stringify({ queue, paused: next }),
      });
      notifyOk(next ? "Admissions paused" : "Admissions resumed");
      await onRefresh();
    } catch (e) {
      notifyError(e);
    } finally {
      setBusy(false);
    }
  }

  async function forceAdmit() {
    const count = typeof admitCount === "number" ? admitCount : Number(admitCount);
    if (!Number.isFinite(count) || count < 1) {
      notifyError(new Error("Admit at least 1 visitor"));
      return;
    }
    if (!window.confirm(`Force-admit ${count} waiting visitor${count === 1 ? "" : "s"}?`)) {
      return;
    }
    setBusy(true);
    try {
      await api("/admit", {
        method: "POST",
        body: JSON.stringify({ queue, count }),
      });
      notifyOk(`Force-admitted ${count}`);
      await onRefresh();
    } catch (e) {
      notifyError(e);
    } finally {
      setBusy(false);
    }
  }

  async function passQueue() {
    if (!window.confirm("Issue an admission cookie for this browser and leave admin?")) return;
    setBusy(true);
    try {
      const data = await api<{ redirectTo?: string }>("/api/admin/pass", {
        method: "POST",
        body: JSON.stringify({ queue }),
      });
      window.location.assign(data.redirectTo || "/");
    } catch (e) {
      notifyError(e);
      setBusy(false);
    }
  }

  const paused = metrics.paused || metrics.health.autoPaused;

  return (
    <div className="tg-event-toolbar" role="region" aria-label="Event controls">
      <div className="tg-event-toolbar-metrics" aria-live="polite">
        <MetricChip
          label="Waiting"
          value={String(metrics.waiting)}
          tone={metrics.waiting > 0 ? "waiting" : undefined}
        />
        <MetricChip label="Admitted" value={String(metrics.admitted)} />
        <MetricChip label="In app" value={String(metrics.entered)} />
        <MetricChip
          label="Status"
          value={
            metrics.health.autoPaused
              ? "Health pause"
              : metrics.paused
                ? "Paused"
                : formatSchedule(metrics)
          }
          tone={paused ? "danger" : undefined}
        />
      </div>

      <Group gap="xs" wrap="wrap" className="tg-event-toolbar-controls">
        <Tooltip label={metrics.paused ? "Resume admissions" : "Pause admissions"}>
          <ActionIcon
            variant={metrics.paused ? "filled" : "default"}
            color={metrics.paused ? "teal" : "gray"}
            size="lg"
            onClick={() => void togglePause()}
            disabled={busy}
            aria-label={metrics.paused ? "Resume admissions" : "Pause admissions"}
            aria-pressed={metrics.paused}
          >
            {metrics.paused ? <IconPlayerPlay size={18} /> : <IconPlayerPause size={18} />}
          </ActionIcon>
        </Tooltip>

        <NumberInput
          value={rateDraft}
          onChange={setRateDraft}
          min={0.01}
          max={1000}
          step={0.5}
          decimalScale={2}
          w={100}
          aria-label="Max outflow per second"
          disabled={busy}
        />
        <Button size="sm" onClick={() => void setRate()} loading={busy} color="teal">
          Set rate
        </Button>
        {metrics.admitPerSecondOverride !== null ? (
          <Button size="sm" variant="default" onClick={() => void clearRate()} disabled={busy}>
            Clear override
          </Button>
        ) : (
          <Text size="xs" c="dimmed" visibleFrom="sm">
            env {metrics.admitPerSecondDefault}/s
          </Text>
        )}

        <NumberInput
          value={admitCount}
          onChange={setAdmitCount}
          min={1}
          max={100}
          w={72}
          aria-label="Force admit count"
          disabled={busy}
        />
        <Button
          size="sm"
          variant="light"
          leftSection={<IconUserPlus size={16} />}
          onClick={() => void forceAdmit()}
          disabled={busy}
        >
          Force admit
        </Button>
        <Button
          size="sm"
          variant="default"
          leftSection={<IconTicket size={16} />}
          onClick={() => void passQueue()}
          disabled={busy}
        >
          Pass queue
        </Button>
      </Group>
    </div>
  );
}

function MetricChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "waiting" | "danger";
}) {
  return (
    <div className={`tg-metric-chip${tone ? ` tg-metric-chip--${tone}` : ""}`}>
      <span className="tg-metric-chip-label">{label}</span>
      <span className="tg-metric-chip-value">{value}</span>
    </div>
  );
}
