import { useState } from "react";
import {
  Button,
  Card,
  Checkbox,
  ColorInput,
  Group,
  NumberInput,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { api } from "../../lib/api";
import type { AdminState } from "../../lib/types";
import { notifyError, notifyOk } from "./notify";

export function BrandingPanel({
  state,
  onSaved,
}: {
  state: AdminState;
  onSaved: () => Promise<void>;
}) {
  const b = state.branding as Record<string, string | boolean | number>;
  const [queue, setQueue] = useState(state.queue);
  const [mode, setMode] = useState(state.admissionMode);
  const [title, setTitle] = useState(String(b.title ?? ""));
  const [message, setMessage] = useState(String(b.message ?? ""));
  const [primary, setPrimary] = useState(String(b.primaryColor ?? "#2bb0a6"));
  const [accent, setAccent] = useState(String(b.accentColor ?? "#3dd6c8"));
  const [bg, setBg] = useState(String(b.backgroundColor ?? "#07151c"));
  const [surface, setSurface] = useState(String(b.surfaceColor ?? "#0e2531"));
  const [text, setText] = useState(String(b.textColor ?? "#e8f1f5"));
  const [muted, setMuted] = useState(String(b.mutedColor ?? "#8aa4b0"));
  const [showWaiting, setShowWaiting] = useState(Boolean(b.showWaitingCount));
  const [requireClick, setRequireClick] = useState(Boolean(b.requireClickToEnter));
  const [playSound, setPlaySound] = useState(Boolean(b.playTurnSound));
  const [redirectUrl, setRedirectUrl] = useState(String(b.redirectUrl ?? ""));
  const [hold, setHold] = useState(Number(b.admitHoldSeconds ?? 60));
  const [enterLabel, setEnterLabel] = useState(String(b.enterButtonLabel ?? "Continue"));

  return (
    <Card withBorder bg="dark.7" style={{ borderColor: "rgba(232,241,245,0.14)" }}>
      <Stack>
        <Title order={4}>Branding & mode</Title>
        <TextInput label="Queue" value={queue} onChange={(e) => setQueue(e.currentTarget.value)} />
        <SegmentedControl
          value={mode}
          onChange={(v) => setMode(v as "queue" | "lottery")}
          data={[
            { label: "Queue (FIFO)", value: "queue" },
            { label: "Lottery", value: "lottery" },
          ]}
        />
        <TextInput label="Title" value={title} onChange={(e) => setTitle(e.currentTarget.value)} />
        <Textarea
          label="Message"
          value={message}
          onChange={(e) => setMessage(e.currentTarget.value)}
        />
        <SimpleGrid cols={{ base: 2, sm: 3 }}>
          <ColorInput label="Primary" value={primary} onChange={setPrimary} />
          <ColorInput label="Accent" value={accent} onChange={setAccent} />
          <ColorInput label="Background" value={bg} onChange={setBg} />
          <ColorInput label="Surface" value={surface} onChange={setSurface} />
          <ColorInput label="Text" value={text} onChange={setText} />
          <ColorInput label="Muted" value={muted} onChange={setMuted} />
        </SimpleGrid>
        <Checkbox
          label="Show waiting count"
          checked={showWaiting}
          onChange={(e) => setShowWaiting(e.currentTarget.checked)}
        />
        <Checkbox
          label="Require click to enter"
          checked={requireClick}
          onChange={(e) => setRequireClick(e.currentTarget.checked)}
        />
        <Checkbox
          label="Play turn sound"
          checked={playSound}
          onChange={(e) => setPlaySound(e.currentTarget.checked)}
        />
        <TextInput
          label="Redirect URL"
          value={redirectUrl}
          onChange={(e) => setRedirectUrl(e.currentTarget.value)}
        />
        <NumberInput
          label="Admit hold (s)"
          value={hold}
          onChange={(v) => setHold(Number(v) || 60)}
          min={15}
          max={900}
        />
        <TextInput
          label="Enter button label"
          value={enterLabel}
          onChange={(e) => setEnterLabel(e.currentTarget.value)}
        />
        <Group>
          <Button
            onClick={() => {
              void api("/api/admin/branding", {
                method: "PUT",
                body: JSON.stringify({
                  queue,
                  branding: {
                    title,
                    message,
                    primaryColor: primary,
                    accentColor: accent,
                    backgroundColor: bg,
                    surfaceColor: surface,
                    textColor: text,
                    mutedColor: muted,
                    showWaitingCount: showWaiting,
                    requireClickToEnter: requireClick,
                    playTurnSound: playSound,
                    redirectUrl,
                    admitHoldSeconds: hold,
                    enterButtonLabel: enterLabel,
                  },
                }),
              })
                .then(() => {
                  notifyOk("Branding saved");
                  return onSaved();
                })
                .catch(notifyError);
            }}
          >
            Save branding
          </Button>
          <Button
            variant="default"
            onClick={() => {
              if (!window.confirm(`Switch to ${mode} mode?`)) return;
              void api("/api/admin/mode", {
                method: "POST",
                body: JSON.stringify({ queue, mode }),
              })
                .then(() => {
                  notifyOk("Mode updated");
                  return onSaved();
                })
                .catch(notifyError);
            }}
          >
            Apply mode
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}
