import type { RefObject } from "react";
import { Button, Group, Text } from "@mantine/core";

export function StepTurnstile({
  busy,
  tsToken,
  tsVerified,
  widgetRef,
  onProvision,
  onVerify,
  onBack,
  onContinue,
}: {
  busy: boolean;
  tsToken: string | null;
  tsVerified: boolean;
  widgetRef: RefObject<HTMLDivElement | null>;
  onProvision: () => void;
  onVerify: () => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  return (
    <>
      <Text size="sm" c="dimmed">
        TideGuard creates a Turnstile widget with your verified API token. Complete the challenge,
        then verify — required for admin login after setup.
      </Text>
      <Group>
        <Button loading={busy} onClick={onProvision}>
          Create widget
        </Button>
        <Button loading={busy} disabled={!tsToken} onClick={onVerify}>
          Verify challenge
        </Button>
      </Group>
      <div ref={widgetRef} />
      <Group>
        <Button variant="default" onClick={onBack}>
          Back
        </Button>
        <Button disabled={!tsVerified} onClick={onContinue}>
          Continue
        </Button>
      </Group>
    </>
  );
}
