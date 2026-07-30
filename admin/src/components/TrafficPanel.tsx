import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActionIcon,
  Button,
  Card,
  Group,
  NumberInput,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { IconPlayerPlay, IconPlayerPause } from "@tabler/icons-react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
  type ChartData,
  type ChartOptions,
} from "chart.js";
import { Line } from "react-chartjs-2";
import { api } from "../lib/api";
import type { QueueMetrics, TrafficBucket, TrafficResponse } from "../lib/types";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler);

function formatWait(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h:${String(m).padStart(2, "0")}m`;
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function formatTime(t: number): string {
  return new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function TrafficPanel({
  queue,
  metrics,
  onMetricsRefresh,
}: {
  queue: string;
  metrics: QueueMetrics;
  onMetricsRefresh: () => Promise<void>;
}) {
  const [buckets, setBuckets] = useState<TrafficBucket[]>([]);
  const [totalInflow, setTotalInflow] = useState(metrics.totalInflow);
  const [rateDraft, setRateDraft] = useState<number | string>(metrics.admitPerSecond);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const chartRef = useRef<ChartJS<"line"> | null>(null);

  useEffect(() => {
    setRateDraft(metrics.admitPerSecond);
    setTotalInflow(metrics.totalInflow);
  }, [metrics.admitPerSecond, metrics.totalInflow]);

  async function loadTraffic() {
    const data = await api<TrafficResponse>(
      `/api/admin/traffic?queue=${encodeURIComponent(queue)}&rangeMs=${2 * 60 * 60 * 1000}`,
    );
    setBuckets(data.buckets);
    setTotalInflow(data.totalInflow);
  }

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        if (!cancelled) await loadTraffic();
      } catch {
        /* ignore poll errors */
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 5000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [queue]);

  const chartData: ChartData<"line"> = useMemo(() => {
    const labels = buckets.map((b) => formatTime(b.t));
    // Convert joins per bucket to approx rate/sec for display consistency with outflow setpoint
    const inflow = buckets.map((b) => b.joins);
    const outflow = buckets.map((b) => b.maxOutflow);
    return {
      labels,
      datasets: [
        {
          label: "Total inflow",
          data: inflow,
          borderColor: "#2bb0a6",
          backgroundColor: "rgba(43, 176, 166, 0.15)",
          tension: 0.25,
          pointRadius: 0,
          borderWidth: 2,
          fill: true,
        },
        {
          label: "Max outflow",
          data: outflow,
          borderColor: "#e07070",
          backgroundColor: "transparent",
          tension: 0,
          stepped: true,
          pointRadius: 0,
          borderWidth: 2,
        },
      ],
    };
  }, [buckets]);

  const chartOptions: ChartOptions<"line"> = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          labels: { color: "#8aa4b0", boxWidth: 12 },
        },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const label = ctx.dataset.label ?? "";
              const v = ctx.parsed.y ?? 0;
              if (label === "Max outflow") return `${label}: ${v}/s`;
              return `${label}: ${v} joins / interval`;
            },
          },
        },
      },
      scales: {
        x: {
          ticks: { color: "#8aa4b0", maxTicksLimit: 8 },
          grid: { color: "rgba(232, 241, 245, 0.06)" },
        },
        y: {
          beginAtZero: true,
          ticks: { color: "#8aa4b0" },
          grid: { color: "rgba(232, 241, 245, 0.06)" },
        },
      },
    }),
    [],
  );

  async function updateRate() {
    const value = typeof rateDraft === "number" ? rateDraft : Number(rateDraft);
    if (!Number.isFinite(value) || value <= 0) {
      setStatus("Enter a positive admit rate");
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      await api("/api/admin/rate", {
        method: "PUT",
        body: JSON.stringify({ queue, admitPerSecond: value }),
      });
      setStatus(`Max outflow set to ${value}/s`);
      await onMetricsRefresh();
      await loadTraffic();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Failed to update rate");
    } finally {
      setBusy(false);
    }
  }

  async function togglePause() {
    setBusy(true);
    setStatus(null);
    try {
      const next = !metrics.paused;
      await api("/api/admin/pause", {
        method: "POST",
        body: JSON.stringify({ queue, paused: next }),
      });
      setStatus(next ? "Paused admissions" : "Resumed admissions");
      await onMetricsRefresh();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Failed to update pause");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      withBorder
      padding="lg"
      radius="md"
      bg="dark.7"
      style={{ borderColor: "rgba(232,241,245,0.14)" }}
    >
      <Stack gap="md">
        <Group justify="space-between" align="center" wrap="wrap">
          <Group gap="xs">
            <ActionIcon
              variant={metrics.paused ? "filled" : "default"}
              color={metrics.paused ? "teal" : "gray"}
              size="lg"
              onClick={() => void togglePause()}
              disabled={busy}
              aria-label={metrics.paused ? "Resume admissions" : "Pause admissions"}
            >
              {metrics.paused ? <IconPlayerPlay size={18} /> : <IconPlayerPause size={18} />}
            </ActionIcon>
            <NumberInput
              value={rateDraft}
              onChange={setRateDraft}
              min={0.01}
              max={1000}
              step={0.5}
              decimalScale={2}
              w={120}
              aria-label="Max outflow"
            />
            <Button onClick={() => void updateRate()} loading={busy} color="teal">
              Update
            </Button>
          </Group>
          <Text size="sm" c="dimmed">
            Adaptive max outflow · live traffic
          </Text>
        </Group>

        <div style={{ height: 280 }}>
          <Line ref={chartRef} data={chartData} options={chartOptions} />
        </div>

        <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm">
          <MetricCard
            label="Total inflow"
            value={formatCount(totalInflow)}
            sub={String(metrics.inflowCurrent)}
            color="#2bb0a6"
          />
          <MetricCard label="Waiting" value={formatCount(metrics.waiting)} color="#9b8fd9" />
          <MetricCard
            label="Wait time"
            value={formatWait(metrics.estimatedWaitSeconds)}
            color="#e0a070"
          />
          <MetricCard
            label="Max outflow"
            value={String(metrics.admitPerSecond)}
            sub={
              metrics.admitPerSecondOverride !== null
                ? `env ${metrics.admitPerSecondDefault}`
                : "env default"
            }
            color="#e07070"
          />
        </SimpleGrid>

        {status ? (
          <Text size="sm" c="dimmed">
            {status}
          </Text>
        ) : null}
      </Stack>
    </Card>
  );
}

function MetricCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color: string;
}) {
  return (
    <Card padding="md" radius="md" style={{ background: color, color: "#07151c" }}>
      <Text size="xs" fw={600} style={{ opacity: 0.85 }}>
        {label}
      </Text>
      <Title order={3} style={{ color: "inherit", lineHeight: 1.2 }}>
        {value}
      </Title>
      {sub ? (
        <Text size="sm" style={{ opacity: 0.85 }}>
          {sub}
        </Text>
      ) : null}
    </Card>
  );
}
