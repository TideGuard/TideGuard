import { useEffect, useState } from "react";
import { Alert, Button, Code, Group, PasswordInput, Stack, Text, TextInput } from "@mantine/core";
import { IconCopy, IconMail } from "@tabler/icons-react";
import { api } from "../../lib/api";
import type { AdminState } from "../../lib/types";
import { isPasswordReady } from "../../lib/setup-guidance";
import { RecoveryPhraseModal } from "../setup/RecoveryPhraseModal";
import { Panel } from "./Panel";
import { PasswordChecklist } from "./PasswordChecklist";
import { notifyError, notifyOk } from "./notify";

export function TeamPanel({ state, onSaved }: { state: AdminState; onSaved: () => Promise<void> }) {
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [inviteExpiresAt, setInviteExpiresAt] = useState<number | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [inviteNote, setInviteNote] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirm] = useState("");
  const [recoveryPassword, setRecoveryPassword] = useState("");
  const [recoveryMnemonic, setRecoveryMnemonic] = useState<string | null>(null);

  useEffect(() => {
    if (!inviteUrl || inviteCopied) return;
    const onLeave = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [inviteUrl, inviteCopied]);

  return (
    <Panel
      id="team"
      title="Team"
      description={`Signed in as ${state.me.username}. Invites expire in 72 hours and are shown once.`}
    >
      <RecoveryPhraseModal
        opened={Boolean(recoveryMnemonic)}
        mnemonic={recoveryMnemonic ?? ""}
        title="New recovery phrase"
        onConfirm={() => setRecoveryMnemonic(null)}
      />
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

        <TextInput
          label="Note for invitee (optional)"
          description="Included in the mailto body only — not stored on the server."
          value={inviteNote}
          onChange={(e) => setInviteNote(e.currentTarget.value)}
          placeholder="e.g. Day-of ops for Friday drop"
        />
        <Button
          onClick={() => {
            void api<{ acceptUrl?: string; expiresAt?: number }>("/api/admin/invites", {
              method: "POST",
              body: "{}",
            })
              .then((data) => {
                setInviteUrl(data.acceptUrl ?? null);
                setInviteExpiresAt(data.expiresAt ?? Date.now() + 72 * 3600_000);
                setInviteCopied(false);
                notifyOk("Invite created — copy the link now");
                return onSaved();
              })
              .catch(notifyError);
          }}
        >
          Create invite
        </Button>
        {inviteUrl ? (
          <Stack gap="xs">
            <Alert color="orange" title="Copy this link now">
              <Text size="sm">
                It is shown once.{" "}
                {inviteExpiresAt
                  ? `Expires ${new Date(inviteExpiresAt).toLocaleString()}.`
                  : "Expires in 72 hours."}{" "}
                {!inviteCopied ? "Leaving the page may lose it." : "Copied — safe to leave."}
              </Text>
            </Alert>
            <Group align="flex-end" wrap="wrap">
              <TextInput label="Invite link" value={inviteUrl} readOnly style={{ flex: 1 }} />
              <Button
                variant="default"
                leftSection={<IconCopy size={16} />}
                onClick={() => {
                  void navigator.clipboard.writeText(inviteUrl).then(
                    () => {
                      setInviteCopied(true);
                      notifyOk("Invite link copied");
                    },
                    () => notifyError(new Error("Could not copy")),
                  );
                }}
              >
                Copy
              </Button>
              <Button
                variant="default"
                leftSection={<IconMail size={16} />}
                component="a"
                href={`mailto:?subject=${encodeURIComponent("TideGuard admin invite")}${inviteNote ? encodeURIComponent(` — ${inviteNote}`) : ""}&body=${encodeURIComponent(
                  [
                    "You have been invited to the TideGuard control room.",
                    inviteNote ? `\nNote: ${inviteNote}\n` : "",
                    `Accept link (expires soon):\n${inviteUrl}`,
                  ].join("\n"),
                )}`}
                onClick={() => setInviteCopied(true)}
              >
                Email link
              </Button>
            </Group>
          </Stack>
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

        <Text fw={600} size="sm" mt="md">
          Recovery phrase
        </Text>
        <Text size="sm" c="dimmed">
          Regenerate your 12-word recovery phrase. The old phrase stops working immediately.
        </Text>
        <PasswordInput
          label="Current password"
          value={recoveryPassword}
          onChange={(e) => setRecoveryPassword(e.currentTarget.value)}
          autoComplete="current-password"
        />
        <Button
          variant="default"
          disabled={recoveryPassword.length < 8}
          onClick={() => {
            if (!window.confirm("Regenerate recovery phrase? The old phrase will stop working.")) {
              return;
            }
            void api<{ recoveryMnemonic: string }>("/api/admin/recovery/regenerate", {
              method: "POST",
              body: JSON.stringify({ currentPassword: recoveryPassword }),
            })
              .then((result) => {
                setRecoveryPassword("");
                setRecoveryMnemonic(result.recoveryMnemonic);
                notifyOk("Recovery phrase regenerated — save it now");
                return onSaved();
              })
              .catch(notifyError);
          }}
        >
          Regenerate recovery phrase
        </Button>
      </Stack>
    </Panel>
  );
}
