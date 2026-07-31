import { Button, ColorInput, Group, SimpleGrid, Text, TextInput, Textarea } from "@mantine/core";

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
    <>
      <Text size="sm" c="dimmed">
        Preview colors client-side; nothing is written until Finish setup.
      </Text>
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
    </>
  );
}
