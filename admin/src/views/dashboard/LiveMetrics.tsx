import { SimpleGrid, Text } from "@mantine/core";
import type { GeoBlockSettings, QueueMetrics } from "../../lib/types";

export function LiveMetrics({
  metrics,
  geoBlock,
}: {
  metrics: QueueMetrics;
  geoBlock?: GeoBlockSettings;
}) {
  const items = [
    ["Waiting", metrics.waiting],
    ["Admitted", metrics.admitted],
    ["In app", metrics.entered],
    ["Holding", metrics.holding],
    ["Open slots", metrics.openSlots],
    ["Capacity", metrics.capacity],
    ["Avg wait", `${metrics.averageWaitSeconds}s`],
    ["Oldest", `${metrics.oldestWaitSeconds}s`],
    ["ETA", `${metrics.estimatedWaitSeconds}s`],
    ["Admit / s", metrics.effectiveAdmitPerSecond],
  ] as const;

  const geoHits = geoBlock?.stats.totalHits ?? 0;

  return (
    <div className="tg-live-metrics" aria-label="Live queue metrics">
      <Text size="sm" c="dimmed" mb="sm">
        Live queue · auto-refresh 5s
        {metrics.paused ? " · PAUSED" : ""}
        {metrics.health.autoPaused ? " · health pause" : ""}
        {geoBlock?.active ? ` · geo blocks ${geoHits}` : ""}
      </Text>
      <SimpleGrid cols={{ base: 2, sm: 5 }} spacing="sm">
        {items.map(([label, value]) => (
          <div key={label} className="tg-live-metric">
            <Text size="xs" c="dimmed">
              {label}
            </Text>
            <Text fw={700} className="tg-live-metric-value">
              {value}
            </Text>
          </div>
        ))}
      </SimpleGrid>
      {geoBlock?.active && geoBlock.stats.byCountry.length > 0 ? (
        <Text size="xs" c="dimmed" mt="sm">
          Geo hits by country:{" "}
          {geoBlock.stats.byCountry
            .slice(0, 8)
            .map((c) => `${c.country} ${c.hits}`)
            .join(" · ")}
        </Text>
      ) : null}
    </div>
  );
}
