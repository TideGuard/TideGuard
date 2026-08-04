import { useState } from "react";
import {
  Alert,
  Anchor,
  Button,
  Checkbox,
  Code,
  ColorInput,
  Group,
  NumberInput,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Textarea,
} from "@mantine/core";
import { api } from "../../lib/api";
import type { AdminState, WaitingRoomBranding } from "../../lib/types";
import { LINKS } from "../../lib/setup-guidance";
import { Panel } from "./Panel";
import { WaitingRoomPreview } from "./WaitingRoomPreview";
import { notifyError, notifyOk } from "./notify";

const FONT_PRESETS = [
  { label: "Fraunces (default)", value: '"Fraunces", "IBM Plex Serif", Georgia, serif' },
  { label: "Source Sans 3", value: '"Source Sans 3", "Segoe UI", system-ui, sans-serif' },
  { label: "System UI", value: "system-ui, -apple-system, Segoe UI, sans-serif" },
  { label: "Georgia", value: "Georgia, Times New Roman, serif" },
] as const;

export function BrandingPanel({
  state,
  onSaved,
}: {
  state: AdminState;
  onSaved: () => Promise<void>;
}) {
  const b = state.branding;
  const [queue, setQueue] = useState(state.queue);
  const [mode, setMode] = useState(state.admissionMode);
  const [title, setTitle] = useState(b.title ?? "");
  const [message, setMessage] = useState(b.message ?? "");
  const [primary, setPrimary] = useState(b.primaryColor ?? "#2bb0a6");
  const [accent, setAccent] = useState(b.accentColor ?? "#3dd6c8");
  const [bg, setBg] = useState(b.backgroundColor ?? "#07151c");
  const [surface, setSurface] = useState(b.surfaceColor ?? "#0e2531");
  const [text, setText] = useState(b.textColor ?? "#e8f1f5");
  const [muted, setMuted] = useState(b.mutedColor ?? "#8aa4b0");
  const [fontFamily, setFontFamily] = useState(b.fontFamily ?? FONT_PRESETS[0].value);
  const [showWaiting, setShowWaiting] = useState(Boolean(b.showWaitingCount));
  const [requireClick, setRequireClick] = useState(Boolean(b.requireClickToEnter));
  const [playSound, setPlaySound] = useState(Boolean(b.playTurnSound));
  const [redirectUrl, setRedirectUrl] = useState(b.redirectUrl ?? "");
  const [hold, setHold] = useState(Number(b.admitHoldSeconds ?? 60));
  const [enterLabel, setEnterLabel] = useState(b.enterButtonLabel ?? "Continue");

  const draft: WaitingRoomBranding = {
    title,
    message,
    primaryColor: primary,
    accentColor: accent,
    backgroundColor: bg,
    surfaceColor: surface,
    textColor: text,
    mutedColor: muted,
    fontFamily,
    showWaitingCount: showWaiting,
    requireClickToEnter: requireClick,
    playTurnSound: playSound,
    redirectUrl,
    admitHoldSeconds: hold,
    enterButtonLabel: enterLabel,
  };

  return (
    <Panel
      id="branding"
      title="Branding & mode"
      description={
        <Anchor href={LINKS.docsAdmin} target="_blank" rel="noreferrer" size="sm">
          Admin guide
        </Anchor>
      }
    >
      <div className="tg-branding-layout">
        <Stack className="tg-branding-form">
          <TextInput
            label="Queue"
            value={queue}
            onChange={(e) => setQueue(e.currentTarget.value)}
          />
          <SegmentedControl
            value={mode}
            onChange={(v) => setMode(v as "queue" | "lottery")}
            data={[
              { label: "Queue (FIFO)", value: "queue" },
              { label: "Lottery", value: "lottery" },
            ]}
          />
          <TextInput
            label="Title"
            value={title}
            onChange={(e) => setTitle(e.currentTarget.value)}
          />
          <Textarea
            label="Message"
            value={message}
            onChange={(e) => setMessage(e.currentTarget.value)}
          />
          <TextInput
            label="Font family"
            description="CSS font-family stack for the waiting room"
            value={fontFamily}
            onChange={(e) => setFontFamily(e.currentTarget.value)}
          />
          <Group gap="xs">
            {FONT_PRESETS.map((p) => (
              <Button
                key={p.label}
                size="xs"
                variant={fontFamily === p.value ? "light" : "default"}
                onClick={() => setFontFamily(p.value)}
              >
                {p.label}
              </Button>
            ))}
          </Group>
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
                    branding: draft,
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
            <Button
              variant="subtle"
              component="a"
              href={`/wait?queue=${encodeURIComponent(queue)}&embed=1`}
              target="_blank"
              rel="noreferrer"
            >
              Open embed preview
            </Button>
          </Group>
          <Alert color="gray" title="Embed widget">
            <Text size="sm" mb="xs">
              Iframe the waiting room on a marketing page. The embed posts{" "}
              <Code>tideguard-embed-height</Code> so the parent can resize. Optional{" "}
              <Code>?lang=en</Code> selects locale stubs (English today).
            </Text>
            <Code block>
              {`<iframe\n  src="/wait?embed=1&return=/checkout&queue=${queue}"\n  title="Waiting room"\n  style="width:100%;border:0;min-height:28rem"\n></iframe>\n<script>\nwindow.addEventListener("message", (e) => {\n  if (e.data?.type === "tideguard-embed-height") {\n    const el = document.querySelector("iframe[title='Waiting room']");\n    if (el) el.style.height = e.data.height + "px";\n  }\n});\n</script>`}
            </Code>
            <Anchor href={LINKS.docsEmbed} target="_blank" rel="noreferrer" size="sm" mt="xs">
              Verifying admission →
            </Anchor>
          </Alert>
        </Stack>
        <WaitingRoomPreview branding={draft} />
      </div>
    </Panel>
  );
}
