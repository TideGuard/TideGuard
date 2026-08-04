import { useEffect, useState } from "react";
import { Button, Group, Stack, Text } from "@mantine/core";
import { api } from "../../lib/api";
import { Panel } from "./Panel";
import { notifyError } from "./notify";

export function ActivityPanel({ refreshKey = 0 }: { refreshKey?: number }) {
  const [events, setEvents] = useState<
    Array<{ summary: string; actorUsername: string; at: number }>
  >([]);

  const load = () => {
    void api<{ events: typeof events }>("/api/admin/audit")
      .then((data) => setEvents(data.events || []))
      .catch(notifyError);
  };

  useEffect(() => {
    load();
  }, [refreshKey]);

  return (
    <Panel
      id="activity"
      title="Activity"
      actions={
        <Button size="xs" variant="default" onClick={load}>
          Refresh
        </Button>
      }
    >
      <Stack gap="xs">
        {events.slice(0, 30).map((e, i) => (
          <Text key={`${e.at}-${i}`} size="sm" c="dimmed">
            {new Date(e.at).toLocaleString()} · {e.actorUsername} · {e.summary}
          </Text>
        ))}
        {events.length === 0 ? (
          <Text size="sm" c="dimmed">
            No activity yet. Saves and traffic controls will appear here.
          </Text>
        ) : null}
        {events.length > 0 ? (
          <Group>
            <Text size="xs" c="dimmed">
              Showing latest {Math.min(30, events.length)} events
            </Text>
          </Group>
        ) : null}
      </Stack>
    </Panel>
  );
}
