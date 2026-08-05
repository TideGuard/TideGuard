import { useEffect, useState } from "react";
import { Alert, Button, NumberInput, PasswordInput, Stack, Text, List } from "@mantine/core";
import { api } from "../../lib/api";
import { Panel } from "./Panel";
import { notifyError, notifyOk } from "./notify";
import { TokenSecretAckModal } from "../setup/TokenSecretAckModal";

export function DangerZonePanel({ queue, onReset }: { queue: string; onReset: () => void }) {
  const [tokenSecret, setTokenSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [secretAcked, setSecretAcked] = useState(false);
  const [maxWaiting, setMaxWaiting] = useState<number | null>(null);
  const [draftMaxWaiting, setDraftMaxWaiting] = useState<number | null>(null);
  const [limitsBusy, setLimitsBusy] = useState(false);
  const [confirmAck, setConfirmAck] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void api<{ maxWaitingVisitors: number }>(
      `/api/admin/queue-limits?queue=${encodeURIComponent(queue)}`,
    )
      .then((data) => {
        if (cancelled) return;
        setMaxWaiting(data.maxWaitingVisitors);
        setDraftMaxWaiting(data.maxWaitingVisitors);
      })
      .catch(() => {
        /* ignore — panel still usable for reset */
      });
    return () => {
      cancelled = true;
    };
  }, [queue]);

  const changed =
    maxWaiting !== null && draftMaxWaiting !== null && Math.floor(draftMaxWaiting) !== maxWaiting;

  return (
    <Panel
      id="danger"
      title="Danger zone"
      description="Factory reset and capacity overrides that can break deep queues. Do not edit unless you know what you are doing."
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
        <Alert color="orange" title="DO NOT EDIT UNLESS YOU KNOW WHAT YOU ARE DOING">
          THESE CHANGES COULD BE BREAKING. Lowering max waiting visitors rejects new joins when
          full. Status RPS budget and check-in period are fixed in code and cannot be changed here.
        </Alert>

        <NumberInput
          label="Max waiting visitors"
          description="Hard cap on waiting rows in this queue’s Durable Object (default 1,000,000)."
          value={draftMaxWaiting ?? undefined}
          onChange={(v) => {
            setDraftMaxWaiting(typeof v === "number" ? v : Number(v) || null);
            setConfirmAck(false);
          }}
          min={1}
          max={50_000_000}
          step={1000}
        />
        {changed ? (
          <Alert color="red" title="Review changes (A → B)">
            <List size="sm">
              <List.Item>
                maxWaitingVisitors: {maxWaiting} → {Math.floor(draftMaxWaiting!)}
              </List.Item>
            </List>
            <Button
              mt="sm"
              variant="light"
              color="red"
              size="xs"
              onClick={() => setConfirmAck((v) => !v)}
            >
              {confirmAck ? "Acknowledged" : "I understand these changes"}
            </Button>
          </Alert>
        ) : null}
        <Button
          color="orange"
          loading={limitsBusy}
          disabled={!changed || !confirmAck || draftMaxWaiting === null}
          onClick={() => {
            if (!changed || maxWaiting === null || draftMaxWaiting === null) return;
            setLimitsBusy(true);
            void api("/api/admin/queue-limits", {
              method: "PUT",
              body: JSON.stringify({
                queue,
                maxWaitingVisitors: Math.floor(draftMaxWaiting),
                previousMaxWaitingVisitors: maxWaiting,
                confirmChanges: true,
              }),
            })
              .then((data) => {
                const next = Number(
                  (data as { maxWaitingVisitors?: number }).maxWaitingVisitors ?? draftMaxWaiting,
                );
                setMaxWaiting(next);
                setDraftMaxWaiting(next);
                setConfirmAck(false);
                notifyOk(`Max waiting visitors set to ${next}`);
              })
              .catch(notifyError)
              .finally(() => setLimitsBusy(false));
          }}
        >
          Save capacity override
        </Button>

        <Alert color="red" title="Irreversible factory reset">
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
          Lost a password? Use Forgot password on the sign-in screen with your 12-word recovery
          phrase (Turnstile required after setup). If you lose both passwords and recovery phrases,
          factory-reset with TOKEN_SECRET.
        </Text>
      </Stack>
    </Panel>
  );
}
