import { useState } from "react";
import { Alert, Anchor, Button, Checkbox, List, Stack, Text, TextInput } from "@mantine/core";
import { Panel } from "./Panel";
import { LINKS } from "../../lib/setup-guidance";

/** Docs-only checklist: rotating TOKEN_SECRET safely. */
export function SecretRotationPanel() {
  const [acked, setAcked] = useState(false);

  return (
    <Panel
      id="secret-rotation"
      title="TOKEN_SECRET rotation"
      description={
        <Anchor href={LINKS.docsSecurity} target="_blank" rel="noreferrer" size="sm">
          Security policy
        </Anchor>
      }
    >
      <Stack>
        <Alert color="orange" title="High blast radius">
          <Text size="sm">
            The same secret signs visitor tokens, admin sessions, seals Cloudflare/Turnstile
            secrets, and authorizes Bearer operator routes. Rotate only when you suspect a leak or
            are ready to re-claim the control room.
          </Text>
        </Alert>
        <Text size="sm" fw={600}>
          Rotation checklist
        </Text>
        <List size="sm" spacing="xs">
          <List.Item>
            Generate a new secret (<code>openssl rand -hex 32</code> or{" "}
            <Anchor href="https://tideguard.dev/token" target="_blank" rel="noreferrer" size="sm">
              tideguard.dev/token
            </Anchor>
            ).
          </List.Item>
          <List.Item>
            Put it on the Worker: <code>npx wrangler secret put TOKEN_SECRET</code> (or Redeploy
            secret field). Keep the old value until the cutover succeeds.
          </List.Item>
          <List.Item>
            Expect all outstanding <code>tg_access</code> / <code>tg_ticket</code> cookies and admin
            sessions to fail immediately after cutover.
          </List.Item>
          <List.Item>
            Re-seal Cloudflare API token + Turnstile in <strong>Access / Cloudflare</strong> (or
            factory-reset and re-run the wizard if seals cannot be opened).
          </List.Item>
          <List.Item>
            Sign in again, smoke-test <code>/wait?return=/demo</code>, then Pass queue / admit.
          </List.Item>
          <List.Item>
            Full steps:{" "}
            <Anchor href={LINKS.docsUpgrading} target="_blank" rel="noreferrer" size="sm">
              Upgrading
            </Anchor>{" "}
            and{" "}
            <Anchor href={LINKS.docsTokenRotation} target="_blank" rel="noreferrer" size="sm">
              TOKEN_SECRET rotation
            </Anchor>
            .
          </List.Item>
        </List>
        <Checkbox
          checked={acked}
          onChange={(e) => setAcked(e.currentTarget.checked)}
          label="I understand rotation invalidates live visitor tokens and admin sessions"
        />
        <TextInput
          label="Operator note (local only)"
          description="Optional reminder — not saved to the Worker."
          placeholder={acked ? "Rotated on …" : "Ack the checklist first"}
          disabled={!acked}
        />
        <Button
          component="a"
          href={LINKS.docsTokenRotation}
          target="_blank"
          rel="noreferrer"
          variant="default"
          disabled={!acked}
        >
          Open rotation guide
        </Button>
      </Stack>
    </Panel>
  );
}
