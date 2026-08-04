import { useState } from "react";
import { Button, Code, Group, PasswordInput, Stack, Text, TextInput } from "@mantine/core";
import { IconCopy } from "@tabler/icons-react";
import { api } from "../../lib/api";
import type { AdminState } from "../../lib/types";
import { isPasswordReady } from "../../lib/setup-guidance";
import { Panel } from "./Panel";
import { PasswordChecklist } from "./PasswordChecklist";
import { notifyError, notifyOk } from "./notify";

export function TeamPanel({ state, onSaved }: { state: AdminState; onSaved: () => Promise<void> }) {
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirm] = useState("");

  return (
    <Panel
      id="team"
      title="Team"
      description={`Signed in as ${state.me.username}. Invites expire in 72 hours and are shown once.`}
    >
      <Stack>
        <Text fw={600} size="sm">
          Members
        </Text>
        {state.team.users.map((u) => (
          <Group key={u.id} justify="space-between">
            <div>
              <Text size="sm">
                {u.username}
                {u.id === state.me.id ? " (you)" : ""}
              </Text>
              <Text size="xs" c="dimmed">
                Joined {new Date(u.createdAt).toLocaleDateString()}
              </Text>
            </div>
            {u.id !== state.me.id ? (
              <Button
                size="xs"
                variant="default"
                color="red"
                onClick={() => {
                  if (!window.confirm(`Remove admin “${u.username}”?`)) return;
                  void api(`/api/admin/users/${encodeURIComponent(u.id)}`, {
                    method: "DELETE",
                  })
                    .then(() => {
                      notifyOk("User removed");
                      return onSaved();
                    })
                    .catch(notifyError);
                }}
              >
                Remove
              </Button>
            ) : null}
          </Group>
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
        {inviteUrl ? (
          <Group align="flex-end" wrap="nowrap">
            <TextInput label="Invite link" value={inviteUrl} readOnly style={{ flex: 1 }} />
            <Button
              variant="default"
              leftSection={<IconCopy size={16} />}
              onClick={() => {
                void navigator.clipboard.writeText(inviteUrl).then(
                  () => notifyOk("Invite link copied"),
                  () => notifyError(new Error("Could not copy")),
                );
              }}
            >
              Copy
            </Button>
          </Group>
        ) : null}

        {state.team.invites.length > 0 ? (
          <>
            <Text fw={600} size="sm" mt="sm">
              Pending invites
            </Text>
            {state.team.invites.map((inv) => (
              <Group key={inv.id} justify="space-between">
                <div>
                  <Text size="sm">
                    Invite <Code>{inv.id.slice(0, 8)}</Code>
                  </Text>
                  <Text size="xs" c="dimmed">
                    By {inv.createdByUsername} · expires {new Date(inv.expiresAt).toLocaleString()}
                  </Text>
                </div>
                <Button
                  size="xs"
                  variant="default"
                  color="red"
                  onClick={() => {
                    if (!window.confirm("Revoke invite?")) return;
                    void api(`/api/admin/invites/${encodeURIComponent(inv.id)}`, {
                      method: "DELETE",
                    })
                      .then(() => {
                        notifyOk("Invite revoked");
                        return onSaved();
                      })
                      .catch(notifyError);
                  }}
                >
                  Revoke
                </Button>
              </Group>
            ))}
          </>
        ) : null}

        <Text fw={600} size="sm" mt="md">
          Change your password
        </Text>
        <PasswordInput
          label="Current password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.currentTarget.value)}
          autoComplete="current-password"
        />
        <PasswordInput
          label="New password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.currentTarget.value)}
          autoComplete="new-password"
        />
        <PasswordInput
          label="Confirm new password"
          value={confirmPassword}
          onChange={(e) => setConfirm(e.currentTarget.value)}
          autoComplete="new-password"
        />
        <PasswordChecklist password={newPassword} confirm={confirmPassword} />
        <Button
          disabled={!currentPassword || !isPasswordReady(newPassword, confirmPassword)}
          onClick={() => {
            void api("/api/admin/password", {
              method: "PUT",
              body: JSON.stringify({
                currentPassword,
                password: newPassword,
                confirmPassword,
              }),
            })
              .then(() => {
                setCurrentPassword("");
                setNewPassword("");
                setConfirm("");
                notifyOk("Password updated");
                return onSaved();
              })
              .catch(notifyError);
          }}
        >
          Update password
        </Button>
      </Stack>
    </Panel>
  );
}
