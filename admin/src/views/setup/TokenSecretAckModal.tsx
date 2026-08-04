import { useEffect, useState } from "react";
import { Anchor, Button, Checkbox, Group, Modal, Stack, Text } from "@mantine/core";
import { LINKS } from "../../lib/setup-guidance";

/**
 * Blocks TOKEN_SECRET entry until the operator acknowledges custody of the Worker secret.
 * Keep autocomplete off on the secret field itself — never let the browser save it.
 */
export function TokenSecretAckModal({
  opened,
  onConfirm,
  onCancel,
}: {
  opened: boolean;
  onConfirm: () => void;
  /** Optional dismiss (e.g. danger zone unlock). Claim step omits this — ack is required. */
  onCancel?: () => void;
}) {
  const [stored, setStored] = useState(false);

  useEffect(() => {
    if (opened) setStored(false);
  }, [opened]);

  return (
    <Modal
      opened={opened}
      onClose={() => onCancel?.()}
      closeOnClickOutside={Boolean(onCancel)}
      closeOnEscape={Boolean(onCancel)}
      withCloseButton={Boolean(onCancel)}
      title="Before you paste TOKEN_SECRET"
      centered
    >
      <Stack gap="md">
        <Text size="sm">
          You are about to enter <strong>TOKEN_SECRET</strong>. This is the Worker master secret —
          keep it private and do not store it in plain text (chat, screenshots, tickets, shared
          notes). Prefer a password manager or your Wrangler / Deploy secrets store.
        </Text>
        <Text size="sm" c="dimmed">
          If you ever doubt whether it leaked, rotate it via Cloudflare (
          <Anchor href={LINKS.docsUpgrading} target="_blank" rel="noreferrer" size="sm">
            Wrangler secret put TOKEN_SECRET
          </Anchor>
          ). Rotation invalidates admission tokens and admin sessions.
        </Text>
        <Checkbox
          checked={stored}
          onChange={(e) => setStored(e.currentTarget.checked)}
          label="I have securely stored this key and will not leave it in plain text"
        />
        <Group justify="flex-end">
          {onCancel ? (
            <Button variant="default" onClick={onCancel}>
              Cancel
            </Button>
          ) : null}
          <Button disabled={!stored} onClick={onConfirm}>
            Continue
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
