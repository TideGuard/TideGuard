import { useEffect, useState } from "react";
import { Anchor, Button, Group, Stack, Text } from "@mantine/core";
import { api, ApiError } from "../../lib/api";
import { LINKS } from "../../lib/setup-guidance";
import { Panel } from "./Panel";

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
    <Panel
      id="updates"
      title="Updates"
      description={
        <Anchor href={LINKS.docsUpgrading} target="_blank" rel="noreferrer" size="sm">
          Upgrading guide
        </Anchor>
      }
      actions={
        <Button size="xs" variant="default" onClick={() => check(true)}>
          Check
        </Button>
      }
    >
      <Stack>
        <Group>
          <Text size="sm">{summary}</Text>
        </Group>
      </Stack>
    </Panel>
  );
}
