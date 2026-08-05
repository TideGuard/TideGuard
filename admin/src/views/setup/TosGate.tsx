import { useState } from "react";
import { Button, Card, Stack, Text, Title } from "@mantine/core";
import { api } from "../../lib/api";
import { TosAckPanel } from "./TosAckPanel";

/** Full-screen gate when the signed-in admin must accept a new ToS version. */
export function TosGate({
  tosVersion,
  tosSummary,
  tosUrl,
  onAccepted,
}: {
  tosVersion: number;
  tosSummary: string;
  tosUrl: string;
  onAccepted: () => Promise<void> | void;
}) {
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <Card
      maw={520}
      mx="auto"
      withBorder
      bg="dark.7"
      mt="xl"
      style={{ borderColor: "rgba(232,241,245,0.14)" }}
    >
      <Stack>
        <Title order={3}>Updated terms</Title>
        <Text size="sm" c="dimmed">
          This TideGuard release includes updated operator terms. Accept them to open the control
          room.
        </Text>
        <TosAckPanel
          tosVersion={tosVersion}
          tosSummary={tosSummary}
          tosUrl={tosUrl}
          checked={checked}
          onCheckedChange={setChecked}
          updated
        />
        {msg ? (
          <Text size="sm" c="red">
            {msg}
          </Text>
        ) : null}
        <Button
          loading={busy}
          disabled={!checked}
          onClick={() => {
            setBusy(true);
            setMsg(null);
            void api("/api/admin/tos/accept", {
              method: "POST",
              body: JSON.stringify({ acceptedTosVersion: tosVersion }),
            })
              .then(() => onAccepted())
              .catch((e) => setMsg(e instanceof Error ? e.message : "Could not accept terms"))
              .finally(() => setBusy(false));
          }}
        >
          Accept and continue
        </Button>
      </Stack>
    </Card>
  );
}
