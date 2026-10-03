import { useEffect, useState } from "react";
import {
  Anchor,
  Button,
  Checkbox,
  Group,
  MultiSelect,
  NumberInput,
  Stack,
  Text,
  Textarea,
} from "@mantine/core";
import { api } from "../../lib/api";
import { ISO_COUNTRY_OPTIONS } from "../../lib/iso-countries";
import type { AdminState } from "../../lib/types";
import { LINKS } from "../../lib/setup-guidance";
import { Panel } from "./Panel";
import { notifyError, notifyOk } from "./notify";

function parseCountriesText(text: string): string[] {
  return text
    .split(/[\s,]+/)
    .map((c) => c.trim().toUpperCase())
    .filter((c) => /^[A-Z]{2}$/.test(c));
}

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
  const [countries, setCountries] = useState<string[]>(() =>
    geo.countries?.length ? [...geo.countries] : parseCountriesText(geo.countriesText ?? ""),
  );
  const [ttl, setTtl] = useState(
    geo.hoursRemaining != null && geo.hoursRemaining > 0 ? Math.ceil(geo.hoursRemaining) : 24,
  );
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    setGeoEnabled(Boolean(geo.enabled));
    setCountries(
      geo.countries?.length ? [...geo.countries] : parseCountriesText(geo.countriesText ?? ""),
    );
    setTtl(
      geo.hoursRemaining != null && geo.hoursRemaining > 0 ? Math.ceil(geo.hoursRemaining) : 24,
    );
  }, [geo.enabled, geo.countries, geo.countriesText, geo.hoursRemaining]);

  useEffect(() => {
    if (!geo.active || !geo.expiresAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [geo.active, geo.expiresAt]);

  const ttlCountdown =
    geo.active && geo.expiresAt
      ? (() => {
          const ms = Math.max(0, geo.expiresAt - now);
          const hours = Math.floor(ms / 3_600_000);
          const mins = Math.floor((ms % 3_600_000) / 60_000);
          return `Expires in ${hours}h ${String(mins).padStart(2, "0")}m (${new Date(geo.expiresAt).toLocaleString()})`;
        })()
      : null;

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
        {ttlCountdown ? (
          <Text size="sm" c="orange" fw={600}>
            {ttlCountdown}
          </Text>
        ) : null}
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
        <MultiSelect
          label="Blocked countries"
          description="Search by name or ISO code. Unknown codes can be typed as two letters."
          data={ISO_COUNTRY_OPTIONS}
          value={countries}
          onChange={setCountries}
          searchable
          clearable
          nothingFoundMessage="No match — type a 2-letter ISO code"
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
                  countriesText: countries.join(","),
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
                body: JSON.stringify({ enabled: false, countriesText: countries.join(",") }),
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
