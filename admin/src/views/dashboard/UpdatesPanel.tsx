import { useEffect, useState } from "react";
import { Button, Card, Group, Stack, Text, Title } from "@mantine/core";
import { api, ApiError } from "../../lib/api";

export function UpdatesPanel() {
  const [summary, setSummary] = useState("—");

  const check = (force = false) => {
    void api<{ summary?: string; updateAvailable?: boolean }>(
      `/api/admin/updates${force ? "?refresh=1" : ""}`,
    )
      .then((data) =>
        setSummary(data.summary || (data.updateAvailable ? "Update available" : "Up to date")),
      )
      .catch((e) => setSummary(e instanceof ApiError ? e.message : "Check failed"));
  };

  useEffect(() => {
    check(false);
  }, []);

  return (
    <Card withBorder bg="dark.7" style={{ borderColor: "rgba(232,241,245,0.14)" }}>
      <Stack>
        <Group justify="space-between">
          <Title order={4}>Updates</Title>
          <Button size="xs" variant="default" onClick={() => check(true)}>
            Check
          </Button>
        </Group>
        <Text size="sm">{summary}</Text>
      </Stack>
    </Card>
  );
}
