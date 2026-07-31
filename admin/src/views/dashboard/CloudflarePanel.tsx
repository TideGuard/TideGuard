import { useState } from "react";
import {
  Alert,
  Anchor,
  Button,
  Card,
  Group,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { api } from "../../lib/api";
import type { AdminState } from "../../lib/types";
import { FIELD_HELP, LINKS } from "../../lib/setup-guidance";
import { notifyError, notifyOk } from "./notify";

export function CloudflarePanel({
  state,
  onSaved,
}: {
  state: AdminState;
  onSaved: () => Promise<void>;
}) {
  const bypass = state.bypass as Record<string, unknown>;
  const link = (bypass.cloudflare ?? {}) as Record<string, unknown>;
  const [zoneId, setZoneId] = useState(String(link.zoneId ?? ""));
  const [token, setToken] = useState("");
  const [hostname, setHostname] = useState(String(link.hostname ?? ""));
  const [workerService, setWorkerService] = useState(String(link.workerService ?? "tideguard"));
  const [checkMsg, setCheckMsg] = useState("");

  return (
    <Card withBorder bg="dark.7" style={{ borderColor: "rgba(232,241,245,0.14)" }}>
      <Stack>
        <Title order={4}>Cloudflare access</Title>
        <Text size="sm" c="dimmed">
          Connect once with an API token. After that, check DNS, SSL, and domains here — without
          living in the Cloudflare dashboard.
        </Text>
        <PasswordInput
          label={FIELD_HELP.apiToken.label}
          description={
            link.hasApiToken ? (
              "Token saved — leave blank to keep"
            ) : (
              <>
                Create a Custom Token with DNS Edit, Zone Read, Zone Settings Edit, Turnstile Edit,
                and Workers Scripts Edit.{" "}
                <Anchor href={LINKS.apiTokens} target="_blank" rel="noreferrer" size="sm">
                  Open API Tokens
                </Anchor>
              </>
            )
          }
          value={token}
          onChange={(e) => setToken(e.currentTarget.value)}
        />
        <TextInput
          label={FIELD_HELP.hostname.label}
          description={FIELD_HELP.hostname.hint}
          value={hostname}
          onChange={(e) => setHostname(e.currentTarget.value)}
        />
        <TextInput
          label={FIELD_HELP.zoneId.label}
          description={
            <>
              {FIELD_HELP.zoneId.hint}{" "}
              <Anchor href={LINKS.findIds} target="_blank" rel="noreferrer" size="sm">
                Find Zone ID
              </Anchor>
            </>
          }
          value={zoneId}
          onChange={(e) => setZoneId(e.currentTarget.value)}
        />
        <TextInput
          label={FIELD_HELP.workerService.label}
          description={FIELD_HELP.workerService.hint}
          value={workerService}
          onChange={(e) => setWorkerService(e.currentTarget.value)}
        />
        <Group>
          <Button
            onClick={() => {
              const body: Record<string, unknown> = { zoneId, hostname, workerService };
              if (token) body.apiToken = token;
              void api("/api/admin/cloudflare", {
                method: "PUT",
                body: JSON.stringify(body),
              })
                .then(() => {
                  setToken("");
                  notifyOk("Cloudflare access saved");
                  return onSaved();
                })
                .catch(notifyError);
            }}
          >
            Save
          </Button>
          <Button
            variant="default"
            onClick={() => {
              void api<{ ok?: boolean; summary?: string }>("/api/admin/cloudflare/check", {
                method: "POST",
                body: JSON.stringify({ zoneId, hostname }),
              })
                .then((data) => {
                  setCheckMsg(data.summary || (data.ok ? "OK" : "Check complete"));
                })
                .catch(notifyError);
            }}
          >
            Check setup
          </Button>
          <Button
            variant="default"
            onClick={() => {
              void api("/api/admin/cloudflare/ssl", { method: "PUT", body: "{}" })
                .then(() => notifyOk("SSL set to Full (strict)"))
                .catch(notifyError);
            }}
          >
            Set Full (strict)
          </Button>
        </Group>
        {checkMsg ? <Alert color="teal">{checkMsg}</Alert> : null}
      </Stack>
    </Card>
  );
}
