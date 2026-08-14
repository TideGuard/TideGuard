import { useEffect, useState } from "react";
import { Alert, Button, NumberInput, PasswordInput, Stack, Text, List } from "@mantine/core";
import { api } from "../../lib/api";
import { Panel } from "./Panel";
import { notifyError, notifyOk } from "./notify";
import { TokenSecretAckModal } from "../setup/TokenSecretAckModal";

type QueueLimits = {
  maxWaitingVisitors: number;
  missedSlotGraceSeconds: number;
  minMissedSlotGraceSeconds?: number;
  maxMissedSlotGraceSeconds?: number;
};

export function DangerZonePanel({ queue, onReset }: { queue: string; onReset: () => void }) {
  const [tokenSecret, setTokenSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [secretAcked, setSecretAcked] = useState(false);
  const [limits, setLimits] = useState<QueueLimits | null>(null);
  const [draftMaxWaiting, setDraftMaxWaiting] = useState<number | null>(null);
  const [draftGrace, setDraftGrace] = useState<number | null>(null);
  const [limitsBusy, setLimitsBusy] = useState(false);
  const [confirmAck, setConfirmAck] = useState(false);
  const [revokeBusy, setRevokeBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void api<QueueLimits>(`/api/admin/queue-limits?queue=${encodeURIComponent(queue)}`)
      .then((data) => {
        if (cancelled) return;
        setLimits(data);
        setDraftMaxWaiting(data.maxWaitingVisitors);
        setDraftGrace(data.missedSlotGraceSeconds);
      })
      .catch(() => {
        /* ignore — panel still usable for reset */
      });
    return () => {
      cancelled = true;
    };
  }, [queue]);

  const maxChanged =
    limits !== null &&
    draftMaxWaiting !== null &&
    Math.floor(draftMaxWaiting) !== limits.maxWaitingVisitors;
  const graceChanged =
    limits !== null &&
    draftGrace !== null &&
    Math.floor(draftGrace) !== limits.missedSlotGraceSeconds;
  const changed = maxChanged || graceChanged;
  const graceMin = limits?.minMissedSlotGraceSeconds ?? 30;
  const graceMax = limits?.maxMissedSlotGraceSeconds ?? 900;

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
          full. Lowering missed-slot grace expires silent waiters sooner (background tabs / flaky
          networks). Status RPS budget and check-in period are fixed in code and cannot be changed
          here.
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
        <NumberInput
          label="Missed-slot grace (seconds)"
          description={`After a waiter’s check-in timeslot is due, how long before they expire if silent (default 120; ${graceMin}–${graceMax}).`}
          value={draftGrace ?? undefined}
          onChange={(v) => {
            setDraftGrace(typeof v === "number" ? v : Number(v) || null);
            setConfirmAck(false);
          }}
          min={graceMin}
          max={graceMax}
          step={15}
        />
        {changed ? (
          <Alert color="red" title="Review changes (A → B)">
            <List size="sm">
              {maxChanged ? (
                <List.Item>
                  maxWaitingVisitors: {limits!.maxWaitingVisitors} → {Math.floor(draftMaxWaiting!)}
                </List.Item>
              ) : null}
              {graceChanged ? (
                <List.Item>
                  missedSlotGraceSeconds: {limits!.missedSlotGraceSeconds} →{" "}
                  {Math.floor(draftGrace!)}
                </List.Item>
              ) : null}
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
          disabled={!changed || !confirmAck || draftMaxWaiting === null || draftGrace === null}
          onClick={() => {
            if (!changed || limits === null || draftMaxWaiting === null || draftGrace === null)
              return;
            setLimitsBusy(true);
            void api("/api/admin/queue-limits", {
              method: "PUT",
              body: JSON.stringify({
                queue,
                maxWaitingVisitors: Math.floor(draftMaxWaiting),
                previousMaxWaitingVisitors: limits.maxWaitingVisitors,
                missedSlotGraceSeconds: Math.floor(draftGrace),
                previousMissedSlotGraceSeconds: limits.missedSlotGraceSeconds,
                confirmChanges: true,
              }),
            })
              .then((data) => {
                const nextMax = Number(
                  (data as { maxWaitingVisitors?: number }).maxWaitingVisitors ?? draftMaxWaiting,
                );
                const nextGrace = Number(
                  (data as { missedSlotGraceSeconds?: number }).missedSlotGraceSeconds ??
                    draftGrace,
                );
                setLimits({
                  ...limits,
                  maxWaitingVisitors: nextMax,
                  missedSlotGraceSeconds: nextGrace,
                });
                setDraftMaxWaiting(nextMax);
                setDraftGrace(nextGrace);
                setConfirmAck(false);
                notifyOk("Queue limits saved");
              })
              .catch(notifyError)
              .finally(() => setLimitsBusy(false));
          }}
        >
          Save capacity override
        </Button>

        <Alert color="red" title="Revoke all admissions">
          Immediately invalidates every admission token for this queue. Visitors must return through
          the waiting room; token TTLs do not change.
        </Alert>
        <Button
          color="red"
          variant="outline"
          loading={revokeBusy}
          onClick={() => {
            if (!window.confirm("Revoke every active admission for this queue?")) return;
            setRevokeBusy(true);
            void api("/api/admin/revoke-admissions", {
              method: "POST",
              body: JSON.stringify({ queue }),
            })
              .then(() => notifyOk("All admissions revoked"))
              .catch(notifyError)
              .finally(() => setRevokeBusy(false));
          }}
        >
          Revoke all admissions
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
