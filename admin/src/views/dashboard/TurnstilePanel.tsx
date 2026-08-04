import { Alert, Code, Stack, Text } from "@mantine/core";
import type { AdminState } from "../../lib/types";
import { Panel } from "./Panel";

export function TurnstilePanel({ state }: { state: AdminState }) {
  const t = state.turnstile;

  return (
    <Panel
      id="turnstile"
      title="Turnstile"
      description="Bot protection for admin login and invite accept. Provisioned during first-time setup."
    >
      <Stack>
        {t.configured ? (
          <Alert color="teal" title="Configured">
            Sitekey <Code>{t.sitekey}</Code>
            {t.domains.length > 0 ? (
              <Text size="sm" mt="xs">
                Domains: {t.domains.join(", ")}
              </Text>
            ) : null}
          </Alert>
        ) : (
          <Alert color="orange" title="Not configured">
            Turnstile is missing. Use System → Danger zone to factory-reset and re-run setup, or
            finish the wizard if setup is incomplete.
          </Alert>
        )}
        <Text size="sm" c="dimmed">
          Rotating the widget requires a factory reset (or recreating the widget in Cloudflare and
          resetting TideGuard). There is no mid-flight rotate without clearing admin state.
        </Text>
      </Stack>
    </Panel>
  );
}
