import { useEffect, useState } from "react";
import { Alert, Button, Code, Stack, Text, TextInput } from "@mantine/core";
import { api } from "../../lib/api";
import type { AdminState, TurnstileSettings } from "../../lib/types";
import { Panel } from "./Panel";
import { notifyError, notifyOk } from "./notify";

export function TurnstilePanel({
  state,
  onSaved,
}: {
  state: AdminState;
  onSaved: () => Promise<void>;
}) {
  const t = state.turnstile;
  const [domainsText, setDomainsText] = useState(t.domains.join(", "));
  const [rotating, setRotating] = useState(false);

  useEffect(() => {
    setDomainsText(t.domains.join(", "));
  }, [t.domains]);

  return (
    <Panel
      id="turnstile"
      title="Turnstile"
      description="Bot protection for admin login and invite accept. Provisioned during first-time setup; rotatable here without factory reset."
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
            Turnstile is missing. Finish the wizard, or rotate below once a Cloudflare API token is
            saved under Cloudflare.
          </Alert>
        )}
        <TextInput
          label="Domains"
          description="Comma-separated hostnames for the new widget (include localhost for local admin)."
          value={domainsText}
          onChange={(e) => setDomainsText(e.currentTarget.value)}
        />
        <Text size="sm" c="dimmed">
          Rotate creates a new Cloudflare Turnstile widget and replaces the stored sitekey/secret.
          Requires a Cloudflare API token under the Cloudflare panel. Old widgets are not deleted
          automatically.
        </Text>
        <Button
          loading={rotating}
          onClick={() => {
            if (
              !window.confirm(
                "Rotate Turnstile? This creates a new Cloudflare widget and replaces the stored sitekey/secret used for admin login.",
              )
            ) {
              return;
            }
            setRotating(true);
            void api<{ turnstile: TurnstileSettings }>("/api/admin/turnstile/rotate", {
              method: "POST",
              body: JSON.stringify({ domainsText }),
            })
              .then((res) => {
                setDomainsText(res.turnstile.domains.join(", "));
                notifyOk("Turnstile rotated");
                return onSaved();
              })
              .catch(notifyError)
              .finally(() => setRotating(false));
          }}
        >
          Rotate Turnstile
        </Button>
      </Stack>
    </Panel>
  );
}
