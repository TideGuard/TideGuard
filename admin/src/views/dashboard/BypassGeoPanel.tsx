import { useState } from "react";
import { Anchor, Button, Checkbox, Group, NumberInput, Stack, Text, Textarea } from "@mantine/core";
import { api } from "../../lib/api";
import type { AdminState } from "../../lib/types";
import { LINKS } from "../../lib/setup-guidance";
import { Panel } from "./Panel";
import { notifyError, notifyOk } from "./notify";

export function BypassGeoPanel({
  state,
  onSaved,
  showPassQueue = true,
}: {
  state: AdminState;
  onSaved: () => Promise<void>;
  showPassQueue?: boolean;
}) {
  const bypass = state.bypass;
  const geo = state.geoBlock;
  const [allowlist, setAllowlist] = useState(bypass.allowlistText ?? "");
  const [geoEnabled, setGeoEnabled] = useState(Boolean(geo.enabled));
  const [countries, setCountries] = useState(geo.countriesText ?? "");
  const [ttl, setTtl] = useState(
    geo.hoursRemaining != null && geo.hoursRemaining > 0 ? Math.ceil(geo.hoursRemaining) : 24,
  );

  return (
    <Panel
      id="access-gates"
      title="IP allowlist & country block"
      description={
        <>
          <Anchor href={LINKS.docsBypass} target="_blank" rel="noreferrer" size="sm">
            IP allowlist
          </Anchor>
          {" · "}
          <Anchor href={LINKS.docsGeo} target="_blank" rel="noreferrer" size="sm">
            Country block
          </Anchor>
        </>
      }
    >
      <Stack>
        <Text size="sm" c="dimmed">
          Your IP: {bypass.clientIp ?? "—"}
          {bypass.clientIpMatched ? " (matched)" : ""}
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
          {showPassQueue ? (
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
          ) : null}
        </Group>

        <Text fw={600} size="sm" mt="sm">
          Country block
        </Text>
        <Text size="sm" c="dimmed">
          Your country: {geo.clientCountry ?? "—"}
          {geo.active ? " · block active" : ""}
          {geo.stats.totalHits > 0 ? ` · ${geo.stats.totalHits} hits this window` : ""}
        </Text>
        {geo.stats.byCountry.length > 0 ? (
          <Text size="sm" c="dimmed">
            Hits: {geo.stats.byCountry.map((c) => `${c.country} ${c.hits}`).join(" · ")}
          </Text>
        ) : null}
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
    </Panel>
  );
}
