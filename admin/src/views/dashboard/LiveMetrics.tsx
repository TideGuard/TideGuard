import { Card, SimpleGrid, Text } from "@mantine/core";
import type { QueueMetrics } from "../../lib/types";

export function LiveMetrics({ metrics }: { metrics: QueueMetrics }) {
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

  return (
    <Card withBorder bg="dark.7" style={{ borderColor: "rgba(232,241,245,0.14)" }}>
      <Text size="sm" c="dimmed" mb="sm">
        Live queue · auto-refresh 5s
        {metrics.paused ? " · PAUSED" : ""}
        {metrics.health.autoPaused ? " · health pause" : ""}
      </Text>
      <SimpleGrid cols={{ base: 2, sm: 5 }} spacing="sm">
        {items.map(([label, value]) => (
          <div key={label}>
            <Text size="xs" c="dimmed">
              {label}
            </Text>
            <Text fw={700}>{value}</Text>
          </div>
        ))}
      </SimpleGrid>
    </Card>
  );
}
