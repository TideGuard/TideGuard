import { useEffect, useState } from "react";
import {
  Alert,
  Anchor,
  Button,
  Checkbox,
  Group,
  PasswordInput,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { api } from "../../lib/api";
import type { AdminState } from "../../lib/types";
import { FIELD_HELP, LINKS } from "../../lib/setup-guidance";
import { Panel } from "./Panel";
import { notifyError, notifyOk } from "./notify";

interface WorkerDomain {
  id?: string;
  hostname?: string;
}

export function CloudflarePanel({
  state,
  onSaved,
}: {
  state: AdminState;
  onSaved: () => Promise<void>;
}) {
  const link = state.bypass;
  const [zoneId, setZoneId] = useState(link.zoneId ?? "");
  const [token, setToken] = useState("");
  const [hostname, setHostname] = useState(link.hostname ?? "");
  const [workerService, setWorkerService] = useState(link.workerService ?? "tideguard");
  const [checkMsg, setCheckMsg] = useState("");
  const [domains, setDomains] = useState<WorkerDomain[]>([]);
  const [ipGeoOn, setIpGeoOn] = useState(true);
  const [domainsError, setDomainsError] = useState<string | null>(null);

  useEffect(() => {
    setZoneId(link.zoneId ?? "");
    setHostname(link.hostname ?? "");
    setWorkerService(link.workerService ?? "tideguard");
  }, [link.zoneId, link.hostname, link.workerService]);

  function loadDomains() {
    if (!link.hasApiToken) return;
    void api<{ domains?: WorkerDomain[] }>("/api/admin/cloudflare/domains")
      .then((data) => {
        setDomains(data.domains ?? []);
        setDomainsError(null);
      })
      .catch((e) => {
        setDomainsError(e instanceof Error ? e.message : "Could not list domains");
      });
  }

  useEffect(() => {
    loadDomains();
  }, [link.hasApiToken]);

  return (
    <Panel
      id="cloudflare"
      title="Cloudflare access"
      description={
        <>
          Connect once with an API token. Check DNS, SSL, domains, and IP Geolocation here.{" "}
          <Anchor href={LINKS.docsAdmin} target="_blank" rel="noreferrer" size="sm">
            Admin guide
          </Anchor>
          {" · "}
          <Anchor href={LINKS.docsCustomDomain} target="_blank" rel="noreferrer" size="sm">
            Custom domain
          </Anchor>
        </>
      }
    >
      <Stack>
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
          autoComplete="off"
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
              void api<{
                ok?: boolean;
                summary?: string;
                check?: { summary?: string; ok?: boolean };
              }>("/api/admin/cloudflare/check", {
                method: "POST",
                body: JSON.stringify({ zoneId, hostname }),
              })
                .then((data) => {
                  setCheckMsg(
                    data.summary ||
                      data.check?.summary ||
                      (data.ok || data.check?.ok ? "OK" : "Check complete"),
                  );
                })
                .catch(notifyError);
            }}
          >
            Check setup
          </Button>
          <Button
            variant="default"
            onClick={() => {
              if (
                !window.confirm("Enable orange-cloud proxy and IP Geolocation for this hostname?")
              )
                return;
              void api<{ check?: { summary?: string } }>("/api/admin/cloudflare/fix-proxy", {
                method: "POST",
                body: JSON.stringify({ zoneId, hostname }),
              })
                .then((data) => {
                  notifyOk(data.check?.summary || "Proxy fixed");
                  setCheckMsg(data.check?.summary || "Proxy fixed");
                })
                .catch(notifyError);
            }}
          >
            Fix proxy
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

        <Text fw={600} size="sm" mt="sm">
          IP Geolocation
        </Text>
        <Text size="sm" c="dimmed">
          Required for country block (CF-IPCountry header).
        </Text>
        <Group>
          <Checkbox
            label="Enable IP Geolocation"
            checked={ipGeoOn}
            onChange={(e) => setIpGeoOn(e.currentTarget.checked)}
          />
          <Button
            size="sm"
            onClick={() => {
              void api("/api/admin/cloudflare/ip-geolocation", {
                method: "PUT",
                body: JSON.stringify({ enabled: ipGeoOn }),
              })
                .then(() => {
                  notifyOk(ipGeoOn ? "IP Geolocation enabled" : "IP Geolocation disabled");
                  return onSaved();
                })
                .catch(notifyError);
            }}
          >
            Apply IP Geolocation
          </Button>
        </Group>

        <Text fw={600} size="sm" mt="sm">
          Worker custom domains
        </Text>
        {domainsError ? (
          <Text size="sm" c="orange">
            {domainsError}
          </Text>
        ) : null}
        {domains.length === 0 && !domainsError ? (
          <Text size="sm" c="dimmed">
            No domains listed yet. Save Cloudflare access, then refresh.
          </Text>
        ) : null}
        {domains.map((d) => (
          <Group key={d.id ?? d.hostname} justify="space-between">
            <Text size="sm">{d.hostname ?? d.id}</Text>
            {d.id ? (
              <Button
                size="xs"
                variant="default"
                color="red"
                onClick={() => {
                  if (!window.confirm(`Detach domain ${d.hostname}?`)) return;
                  void api("/api/admin/cloudflare/domains", {
                    method: "DELETE",
                    body: JSON.stringify({ domainId: d.id }),
                  })
                    .then(() => {
                      notifyOk("Domain detached");
                      loadDomains();
                    })
                    .catch(notifyError);
                }}
              >
                Detach
              </Button>
            ) : null}
          </Group>
        ))}
        <Group>
          <Button
            variant="default"
            size="sm"
            onClick={() => {
              const host = hostname.trim();
              if (!host) {
                notifyError(new Error("Set hostname first"));
                return;
              }
              void api("/api/admin/cloudflare/domains", {
                method: "PUT",
                body: JSON.stringify({ hostname: host }),
              })
                .then(() => {
                  notifyOk(`Attached ${host}`);
                  loadDomains();
                  return onSaved();
                })
                .catch(notifyError);
            }}
          >
            Attach hostname
          </Button>
          <Button size="sm" variant="subtle" onClick={loadDomains}>
            Refresh domains
          </Button>
        </Group>
      </Stack>
    </Panel>
  );
}
