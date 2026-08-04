import { useEffect, useMemo, useRef, useState } from "react";
import {
  Anchor,
  Button,
  Group,
  SegmentedControl,
  SimpleGrid,
  Text,
  Title,
  useMantineTheme,
} from "@mantine/core";
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
import { LINKS } from "../lib/setup-guidance";
import { Panel } from "../views/dashboard/Panel";
import { notifyError, notifyOk } from "../views/dashboard/notify";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler);

const RANGE_OPTIONS = [
  { label: "2h", value: String(2 * 60 * 60 * 1000) },
  { label: "12h", value: String(12 * 60 * 60 * 1000) },
  { label: "24h", value: String(24 * 60 * 60 * 1000) },
] as const;

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
}: {
  queue: string;
  metrics: QueueMetrics;
  onMetricsRefresh?: () => Promise<void>;
}) {
  const theme = useMantineTheme();
  const inflow = String(theme.other?.inflow ?? "#2bb0a6");
  const outflow = String(theme.other?.outflow ?? "#e07070");
  const waiting = String(theme.other?.waiting ?? "#9b8fd9");
  const waitTime = String(theme.other?.waitTime ?? "#e0a070");

  const [buckets, setBuckets] = useState<TrafficBucket[]>([]);
  const [totalInflow, setTotalInflow] = useState(metrics.totalInflow);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rangeMs, setRangeMs] = useState(String(2 * 60 * 60 * 1000));
  const chartRef = useRef<ChartJS<"line"> | null>(null);
  const reduceMotion =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    setTotalInflow(metrics.totalInflow);
  }, [metrics.totalInflow]);

  async function loadTraffic() {
    const data = await api<TrafficResponse>(
      `/api/admin/traffic?queue=${encodeURIComponent(queue)}&rangeMs=${rangeMs}`,
    );
    setBuckets(data.buckets);
    setTotalInflow(data.totalInflow);
    setLoadError(null);
  }

  async function exportCsv() {
    try {
      const res = await fetch(
        `/api/admin/traffic?queue=${encodeURIComponent(queue)}&rangeMs=${rangeMs}&format=csv`,
        { credentials: "same-origin" },
      );
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `tideguard-traffic-${queue}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      notifyOk("Traffic CSV downloaded");
    } catch (e) {
      notifyError(e);
    }
  }

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        if (!cancelled) await loadTraffic();
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : "Traffic load failed");
        }
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 5000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [queue, rangeMs]);

  const chartData: ChartData<"line"> = useMemo(() => {
    const labels = buckets.map((b) => formatTime(b.t));
    const joins = buckets.map((b) => b.joins);
    const maxOut = buckets.map((b) => b.maxOutflow);
    return {
      labels,
      datasets: [
        {
          label: "Total inflow",
          data: joins,
          borderColor: inflow,
          backgroundColor: `${inflow}26`,
          tension: 0.25,
          pointRadius: 0,
          borderWidth: 2,
          fill: true,
        },
        {
          label: "Max outflow",
          data: maxOut,
          borderColor: outflow,
          backgroundColor: "transparent",
          tension: 0,
          stepped: true,
          pointRadius: 0,
          borderWidth: 2,
        },
      ],
    };
  }, [buckets, inflow, outflow]);

  const chartOptions: ChartOptions<"line"> = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: reduceMotion
        ? false
        : {
            duration: 200,
          },
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
    [reduceMotion],
  );

  const hasTraffic = buckets.some((b) => b.joins > 0 || b.admits > 0 || b.waiting > 0);

  return (
    <Panel
      id="traffic"
      title="Traffic"
      description={
        <>
          Server-backed series (~15s buckets, up to 24h) ·{" "}
          <Anchor href={LINKS.docsAnalytics} target="_blank" rel="noreferrer" size="sm">
            Analytics guide
          </Anchor>
        </>
      }
    >
      <Group justify="space-between" mb="sm" wrap="wrap">
        <SegmentedControl
          size="xs"
          value={rangeMs}
          onChange={setRangeMs}
          data={[...RANGE_OPTIONS]}
        />
        <Button size="xs" variant="default" onClick={() => void exportCsv()}>
          Export CSV
        </Button>
      </Group>
      <div className="tg-chart-wrap" style={{ height: 280 }}>
        {!hasTraffic && buckets.length > 0 ? (
          <div className="tg-chart-empty">
            <Text size="sm" c="dimmed">
              No traffic yet. Visitors joining the waiting room will appear here.
            </Text>
          </div>
        ) : null}
        {loadError ? (
          <Text size="sm" c="orange" mb="xs">
            {loadError}
          </Text>
        ) : null}
        <Line ref={chartRef} data={chartData} options={chartOptions} />
      </div>

      <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm">
        <MetricTile
          label="Total inflow"
          value={formatCount(totalInflow)}
          sub={String(metrics.inflowCurrent)}
          color={inflow}
        />
        <MetricTile label="Waiting" value={formatCount(metrics.waiting)} color={waiting} />
        <MetricTile
          label="Wait time"
          value={formatWait(metrics.estimatedWaitSeconds)}
          color={waitTime}
        />
        <MetricTile
          label="Max outflow"
          value={`${metrics.admitPerSecond}/s`}
          sub={
            metrics.admitPerSecondOverride !== null
              ? `env ${metrics.admitPerSecondDefault}`
              : "env default"
          }
          color={outflow}
        />
      </SimpleGrid>
    </Panel>
  );
}

function MetricTile({
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
    <div className="tg-metric-tile" style={{ background: color, color: "#07151c" }}>
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
    </div>
  );
}
