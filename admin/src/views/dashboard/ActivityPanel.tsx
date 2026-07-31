import { useEffect, useState } from "react";
import { Button, Card, Group, Stack, Text, Title } from "@mantine/core";
import { api } from "../../lib/api";
import { notifyError } from "./notify";

export function ActivityPanel() {
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
  }, []);

  return (
    <Card withBorder bg="dark.7" style={{ borderColor: "rgba(232,241,245,0.14)" }}>
      <Stack>
        <Group justify="space-between">
          <Title order={4}>Activity</Title>
          <Button size="xs" variant="default" onClick={load}>
            Refresh
          </Button>
        </Group>
        {events.slice(0, 30).map((e, i) => (
          <Text key={`${e.at}-${i}`} size="sm" c="dimmed">
            {new Date(e.at).toLocaleString()} · {e.actorUsername} · {e.summary}
          </Text>
        ))}
        {events.length === 0 ? (
          <Text size="sm" c="dimmed">
            No activity yet
          </Text>
        ) : null}
      </Stack>
    </Card>
  );
}
