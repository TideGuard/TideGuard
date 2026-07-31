import { useState } from "react";
import { Button, Card, Group, Stack, Text, TextInput, Title } from "@mantine/core";
import { api } from "../../lib/api";
import type { AdminState } from "../../lib/types";
import { notifyError, notifyOk } from "./notify";

export function TeamPanel({ state, onSaved }: { state: AdminState; onSaved: () => Promise<void> }) {
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  return (
    <Card withBorder bg="dark.7" style={{ borderColor: "rgba(232,241,245,0.14)" }}>
      <Stack>
        <Title order={4}>Team</Title>
        <Text size="sm" c="dimmed">
          You: {state.me.username}
        </Text>
        {state.team.users.map((u) => (
          <Text key={u.id} size="sm">
            {u.username}
          </Text>
        ))}
        <Button
          onClick={() => {
            void api<{ acceptUrl?: string }>("/api/admin/invites", {
              method: "POST",
              body: "{}",
            })
              .then((data) => {
                setInviteUrl(data.acceptUrl ?? null);
                notifyOk("Invite created — copy the link now");
                return onSaved();
              })
              .catch(notifyError);
          }}
        >
          Create invite
        </Button>
        {inviteUrl ? <TextInput label="Invite link" value={inviteUrl} readOnly /> : null}
        {state.team.invites.map((inv) => {
          const id = String(inv.id ?? "");
          return (
            <Group key={id} justify="space-between">
              <Text size="sm">Invite {id.slice(0, 8)}…</Text>
              <Button
                size="xs"
                variant="default"
                color="red"
                onClick={() => {
                  if (!window.confirm("Revoke invite?")) return;
                  void api(`/api/admin/invites/${encodeURIComponent(id)}`, {
                    method: "DELETE",
                  })
                    .then(() => onSaved())
                    .catch(notifyError);
                }}
              >
                Revoke
              </Button>
            </Group>
          );
        })}
      </Stack>
    </Card>
  );
}
