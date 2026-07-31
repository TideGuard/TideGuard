import { useCallback, useEffect, useState } from "react";
import { Button, Code, Group, Stack, Text, Title } from "@mantine/core";
import { api } from "../lib/api";
import type { AdminState, QueueMetrics } from "../lib/types";
import { TrafficPanel } from "./TrafficPanel";
import { ActivityPanel } from "../views/dashboard/ActivityPanel";
import { BrandingPanel } from "../views/dashboard/BrandingPanel";
import { BypassGeoPanel } from "../views/dashboard/BypassGeoPanel";
import { CloudflarePanel } from "../views/dashboard/CloudflarePanel";
import { LiveMetrics } from "../views/dashboard/LiveMetrics";
import { OriginPanel } from "../views/dashboard/OriginPanel";
import { ScheduleHealthPanel } from "../views/dashboard/ScheduleHealthPanel";
import { TeamPanel } from "../views/dashboard/TeamPanel";
import { UpdatesPanel } from "../views/dashboard/UpdatesPanel";
import { notifyError } from "../views/dashboard/notify";

export function Dashboard({ initial, onLogout }: { initial: AdminState; onLogout: () => void }) {
  const [state, setState] = useState(initial);
  const [metrics, setMetrics] = useState<QueueMetrics>(initial.metrics);
  const queue = state.queue;

  const refreshMetrics = useCallback(async () => {
    const data = await api<{ metrics: QueueMetrics }>(
      `/api/admin/metrics?queue=${encodeURIComponent(queue)}`,
    );
    setMetrics(data.metrics);
  }, [queue]);

  const refreshState = useCallback(async () => {
    const data = await api<AdminState>(`/api/admin/state?queue=${encodeURIComponent(queue)}`);
    setState(data);
    setMetrics(data.metrics);
  }, [queue]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void refreshMetrics().catch(() => {});
    }, 5000);
    return () => window.clearInterval(id);
  }, [refreshMetrics]);

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-start">
        <div>
          <Title order={2}>Control room</Title>
          <Text c="dimmed" size="sm">
            Signed in as {state.me.username} · v{state.version} · queue <Code>{queue}</Code>
          </Text>
        </div>
        <Button
          variant="default"
          onClick={() => {
            void api("/api/admin/logout", { method: "POST", body: "{}" })
              .then(onLogout)
              .catch(notifyError);
          }}
        >
          Log out
        </Button>
      </Group>

      <LiveMetrics metrics={metrics} />
      <TrafficPanel queue={queue} metrics={metrics} onMetricsRefresh={refreshMetrics} />
      <BrandingPanel state={state} onSaved={refreshState} />
      <ScheduleHealthPanel state={state} metrics={metrics} onSaved={refreshState} />
      <OriginPanel state={state} onSaved={refreshState} />
      <BypassGeoPanel state={state} onSaved={refreshState} />
      <CloudflarePanel state={state} onSaved={refreshState} />
      <TeamPanel state={state} onSaved={refreshState} />
      <ActivityPanel />
      <UpdatesPanel />
    </Stack>
  );
}
