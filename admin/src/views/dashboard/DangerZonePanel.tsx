import { useState } from "react";
import { Alert, Button, PasswordInput, Stack, Text } from "@mantine/core";
import { api } from "../../lib/api";
import { Panel } from "./Panel";
import { notifyError, notifyOk } from "./notify";
import { TokenSecretAckModal } from "../setup/TokenSecretAckModal";

export function DangerZonePanel({ onReset }: { onReset: () => void }) {
  const [tokenSecret, setTokenSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [secretAcked, setSecretAcked] = useState(false);

  return (
    <Panel
      id="danger"
      title="Danger zone"
      description="Factory reset clears admin users, branding overrides, Cloudflare link, Turnstile, invites, and audit log. Requires TOKEN_SECRET."
    >
      <TokenSecretAckModal
        opened={unlocking && !secretAcked}
        onConfirm={() => {
          setSecretAcked(true);
          setUnlocking(false);
        }}
        onCancel={() => setUnlocking(false)}
      />
      <Stack>
        <Alert color="red" title="Irreversible">
          After reset you must claim the Worker again and complete the setup wizard. Waiting-room
          queue Durable Object state is not wiped by this action.
        </Alert>
        {!secretAcked ? (
          <Button variant="outline" color="red" onClick={() => setUnlocking(true)}>
            Unlock factory reset
          </Button>
        ) : (
          <>
            <PasswordInput
              label="TOKEN_SECRET"
              description="Same secret as the Worker binding"
              value={tokenSecret}
              onChange={(e) => setTokenSecret(e.currentTarget.value)}
              autoComplete="off"
            />
            <Button
              color="red"
              loading={busy}
              disabled={tokenSecret.length < 16}
              onClick={() => {
                if (
                  !window.confirm(
                    "Factory reset TideGuard admin? This cannot be undone from the UI.",
                  )
                ) {
                  return;
                }
                if (
                  !window.confirm("Type confirm mentally: you will re-run the full setup wizard.")
                ) {
                  return;
                }
                setBusy(true);
                void api("/api/admin/reset", {
                  method: "POST",
                  headers: { Authorization: `Bearer ${tokenSecret}` },
                  body: "{}",
                })
                  .then(() => {
                    notifyOk("Admin reset complete");
                    setTokenSecret("");
                    onReset();
                    window.location.assign("/admin/");
                  })
                  .catch(notifyError)
                  .finally(() => setBusy(false));
              }}
            >
              Factory reset
            </Button>
          </>
        )}
        <Text size="xs" c="dimmed">
          Lost a password? Use Forgot password on the sign-in screen with your 12-word BIP39
          recovery phrase (Turnstile required after setup). If you lose both passwords and recovery
          phrases, factory-reset with TOKEN_SECRET.
        </Text>
      </Stack>
    </Panel>
  );
}
