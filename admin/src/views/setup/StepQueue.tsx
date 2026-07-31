import {
  Button,
  Checkbox,
  Group,
  NumberInput,
  SegmentedControl,
  Text,
  TextInput,
} from "@mantine/core";

export function StepQueue({
  queue,
  mode,
  showWaiting,
  requireClick,
  hold,
  onQueueChange,
  onModeChange,
  onShowWaitingChange,
  onRequireClickChange,
  onHoldChange,
  onBack,
  onContinue,
}: {
  queue: string;
  mode: "queue" | "lottery";
  showWaiting: boolean;
  requireClick: boolean;
  hold: number;
  onQueueChange: (v: string) => void;
  onModeChange: (v: "queue" | "lottery") => void;
  onShowWaitingChange: (v: boolean) => void;
  onRequireClickChange: (v: boolean) => void;
  onHoldChange: (v: number) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  return (
    <>
      <Text size="sm" c="dimmed">
        Queue name and admission mode are stored when you finish setup (not at deploy time).
      </Text>
      <TextInput
        label="Queue name"
        value={queue}
        onChange={(e) => onQueueChange(e.currentTarget.value)}
      />
      <SegmentedControl
        value={mode}
        onChange={(v) => onModeChange(v as "queue" | "lottery")}
        data={[
          { label: "Queue", value: "queue" },
          { label: "Lottery", value: "lottery" },
        ]}
      />
      <Checkbox
        label="Show waiting count"
        checked={showWaiting}
        onChange={(e) => onShowWaitingChange(e.currentTarget.checked)}
      />
      <Checkbox
        label="Require click to enter"
        checked={requireClick}
        onChange={(e) => onRequireClickChange(e.currentTarget.checked)}
      />
      <NumberInput
        label="Admit hold (s)"
        value={hold}
        onChange={(v) => onHoldChange(Number(v) || 60)}
        min={15}
        max={900}
      />
      <Group>
        <Button variant="default" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onContinue}>Continue</Button>
      </Group>
    </>
  );
}
