import { useState } from "react";
import {
  Button,
  Card,
  Checkbox,
  Group,
  NumberInput,
  Stack,
  Text,
  Textarea,
  Title,
} from "@mantine/core";
import { api } from "../../lib/api";
import type { AdminState } from "../../lib/types";
import { notifyError, notifyOk } from "./notify";

export function BypassGeoPanel({
  state,
  onSaved,
}: {
  state: AdminState;
  onSaved: () => Promise<void>;
}) {
  const bypass = state.bypass as Record<string, unknown>;
  const geo = state.geoBlock as Record<string, unknown>;
  const [allowlist, setAllowlist] = useState(String(bypass.allowlistText ?? ""));
  const [geoEnabled, setGeoEnabled] = useState(Boolean(geo.enabled));
  const [countries, setCountries] = useState(String(geo.countriesText ?? ""));
  const [ttl, setTtl] = useState(Number(geo.ttlHours ?? 24));

  return (
    <Card withBorder bg="dark.7" style={{ borderColor: "rgba(232,241,245,0.14)" }}>
      <Stack>
        <Title order={4}>IP allowlist & country block</Title>
        <Text size="sm" c="dimmed">
          Your IP: {String(bypass.clientIp ?? "—")}
          {bypass.clientMatched ? " (matched)" : ""}
        </Text>
        <Textarea
          label="Allowed IPs / CIDRs"
          minRows={3}
          value={allowlist}
          onChange={(e) => setAllowlist(e.currentTarget.value)}
        />
        <Group>
          <Button
            onClick={() => {
              void api("/api/admin/bypass", {
                method: "PUT",
                body: JSON.stringify({ allowlistText: allowlist }),
              })
                .then(() => {
                  notifyOk("Allowlist saved");
                  return onSaved();
                })
                .catch(notifyError);
            }}
          >
            Save allowlist
          </Button>
          <Button
            variant="default"
            onClick={() => {
              if (!window.confirm("Issue admission cookie for this browser?")) return;
              void api<{ redirectTo?: string }>("/api/admin/pass", {
                method: "POST",
                body: JSON.stringify({ queue: state.queue }),
              })
                .then((data) => {
                  window.location.assign(data.redirectTo || "/");
                })
                .catch(notifyError);
            }}
          >
            Pass queue
          </Button>
        </Group>

        <Title order={5} mt="sm">
          Country block
        </Title>
        <Text size="sm" c="dimmed">
          Your country: {String(geo.clientCountry ?? "—")}
        </Text>
        <Checkbox
          label="Enable country block"
          checked={geoEnabled}
          onChange={(e) => setGeoEnabled(e.currentTarget.checked)}
        />
        <Textarea
          label="Blocked countries"
          minRows={2}
          value={countries}
          onChange={(e) => setCountries(e.currentTarget.value)}
        />
        <NumberInput
          label="TTL (hours)"
          value={ttl}
          onChange={(v) => setTtl(Number(v) || 24)}
          min={0.25}
          max={720}
          step={0.25}
        />
        <Group>
          <Button
            onClick={() => {
              if (!window.confirm("Save country block?")) return;
              void api("/api/admin/geo-block", {
                method: "PUT",
                body: JSON.stringify({
                  enabled: geoEnabled,
                  countriesText: countries,
                  ttlHours: ttl,
                }),
              })
                .then(() => {
                  notifyOk("Country block saved");
                  return onSaved();
                })
                .catch(notifyError);
            }}
          >
            Save country block
          </Button>
          <Button
            variant="default"
            onClick={() => {
              void api("/api/admin/geo-block", {
                method: "PUT",
                body: JSON.stringify({ enabled: false, countriesText: countries }),
              })
                .then(() => {
                  setGeoEnabled(false);
                  notifyOk("Country block disabled");
                  return onSaved();
                })
                .catch(notifyError);
            }}
          >
            Disable now
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}
