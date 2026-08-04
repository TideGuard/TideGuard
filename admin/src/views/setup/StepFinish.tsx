import {
  Alert,
  Button,
  ColorInput,
  Group,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Textarea,
} from "@mantine/core";
import { WaitingRoomPreview } from "../dashboard/WaitingRoomPreview";

export function StepFinish({
  title,
  message,
  primary,
  accent,
  bg,
  surface,
  text,
  muted,
  busy,
  onTitleChange,
  onMessageChange,
  onPrimaryChange,
  onAccentChange,
  onBgChange,
  onSurfaceChange,
  onTextChange,
  onMutedChange,
  onBack,
  onFinish,
}: {
  title: string;
  message: string;
  primary: string;
  accent: string;
  bg: string;
  surface: string;
  text: string;
  muted: string;
  busy: boolean;
  onTitleChange: (v: string) => void;
  onMessageChange: (v: string) => void;
  onPrimaryChange: (v: string) => void;
  onAccentChange: (v: string) => void;
  onBgChange: (v: string) => void;
  onSurfaceChange: (v: string) => void;
  onTextChange: (v: string) => void;
  onMutedChange: (v: string) => void;
  onBack: () => void;
  onFinish: () => void;
}) {
  return (
    <Stack>
      <Text size="sm" c="dimmed">
        Preview updates live. Nothing is written until Finish setup.
      </Text>
      <Alert color="teal" title="After Finish — time to green">
        <Text size="sm">
          You land in Demo mode (origin ungated). Smoke-test <code>/wait?return=/demo</code>, tune
          admit rate, then Go live from Access when the launch checklist is ready.
        </Text>
      </Alert>
      <div className="tg-branding-layout">
        <Stack>
          <TextInput
            label="Title"
            value={title}
            onChange={(e) => onTitleChange(e.currentTarget.value)}
          />
          <Textarea
            label="Message"
            value={message}
            onChange={(e) => onMessageChange(e.currentTarget.value)}
          />
          <SimpleGrid cols={2}>
            <ColorInput label="Primary" value={primary} onChange={onPrimaryChange} />
            <ColorInput label="Accent" value={accent} onChange={onAccentChange} />
            <ColorInput label="Background" value={bg} onChange={onBgChange} />
            <ColorInput label="Surface" value={surface} onChange={onSurfaceChange} />
            <ColorInput label="Text" value={text} onChange={onTextChange} />
            <ColorInput label="Muted" value={muted} onChange={onMutedChange} />
          </SimpleGrid>
          <Group>
            <Button variant="default" onClick={onBack}>
              Back
            </Button>
            <Button loading={busy} onClick={onFinish}>
              Finish setup
            </Button>
          </Group>
        </Stack>
        <WaitingRoomPreview
          branding={{
            title,
            message,
            primaryColor: primary,
            accentColor: accent,
            backgroundColor: bg,
            surfaceColor: surface,
            textColor: text,
            mutedColor: muted,
            fontFamily: '"Fraunces", "IBM Plex Serif", Georgia, serif',
            showWaitingCount: false,
            enterButtonLabel: "Continue",
            requireClickToEnter: false,
          }}
        />
      </div>
    </Stack>
  );
}
