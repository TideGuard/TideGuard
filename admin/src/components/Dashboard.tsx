import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Anchor,
  Button,
  Card,
  Checkbox,
  Code,
  ColorInput,
  Group,
  NumberInput,
  PasswordInput,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { api, ApiError } from "../lib/api";
import type { AdminState, QueueMetrics } from "../lib/types";
import { FIELD_HELP, LINKS } from "../lib/setup-guidance";
import { TrafficPanel } from "./TrafficPanel";

function notifyError(err: unknown) {
  notifications.show({
    color: "red",
    title: "Error",
    message: err instanceof Error ? err.message : "Request failed",
  });
}

function notifyOk(message: string) {
  notifications.show({ color: "teal", message });
}

export function Dashboard({ initial, onLogout }: { initial: AdminState; onLogout: () => void }) {
  const [state, setState] = useState(initial);
  const [metrics, setMetrics] = useState<QueueMetrics>(initial.metrics);
  const queue = state.queue;

  const refreshMetrics = useCallback(async () => {
    const data = await api<{ metrics: QueueMetrics }>(
      `/api/admin/metrics?queue=${encodeURIComponent(queue)}`,
    );
    setMetrics(data.metrics);
  }, [queue]);

  const refreshState = useCallback(async () => {
    const data = await api<AdminState>(`/api/admin/state?queue=${encodeURIComponent(queue)}`);
    setState(data);
    setMetrics(data.metrics);
  }, [queue]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void refreshMetrics().catch(() => {});
    }, 5000);
    return () => window.clearInterval(id);
  }, [refreshMetrics]);

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-start">
        <div>
          <Title order={2}>Control room</Title>
          <Text c="dimmed" size="sm">
            Signed in as {state.me.username} · v{state.version} · queue <Code>{queue}</Code>
          </Text>
        </div>
        <Button
          variant="default"
          onClick={() => {
            void api("/api/admin/logout", { method: "POST", body: "{}" })
              .then(onLogout)
              .catch(notifyError);
          }}
        >
          Log out
        </Button>
      </Group>

      <LiveMetrics metrics={metrics} />
      <TrafficPanel queue={queue} metrics={metrics} onMetricsRefresh={refreshMetrics} />
      <BrandingPanel state={state} onSaved={refreshState} />
      <ScheduleHealthPanel state={state} metrics={metrics} onSaved={refreshState} />
      <OriginPanel state={state} onSaved={refreshState} />
      <BypassGeoPanel state={state} onSaved={refreshState} />
      <CloudflarePanel state={state} onSaved={refreshState} />
      <TeamPanel state={state} onSaved={refreshState} />
      <ActivityPanel />
      <UpdatesPanel />
    </Stack>
  );
}

function LiveMetrics({ metrics }: { metrics: QueueMetrics }) {
  const items = [
    ["Waiting", metrics.waiting],
    ["Admitted", metrics.admitted],
    ["In app", metrics.entered],
    ["Holding", metrics.holding],
    ["Open slots", metrics.openSlots],
    ["Capacity", metrics.capacity],
    ["Avg wait", `${metrics.averageWaitSeconds}s`],
    ["Oldest", `${metrics.oldestWaitSeconds}s`],
    ["ETA", `${metrics.estimatedWaitSeconds}s`],
    ["Admit / s", metrics.effectiveAdmitPerSecond],
  ] as const;

  return (
    <Card withBorder bg="dark.7" style={{ borderColor: "rgba(232,241,245,0.14)" }}>
      <Text size="sm" c="dimmed" mb="sm">
        Live queue · auto-refresh 5s
        {metrics.paused ? " · PAUSED" : ""}
        {metrics.health.autoPaused ? " · health pause" : ""}
      </Text>
      <SimpleGrid cols={{ base: 2, sm: 5 }} spacing="sm">
        {items.map(([label, value]) => (
          <div key={label}>
            <Text size="xs" c="dimmed">
              {label}
            </Text>
            <Text fw={700}>{value}</Text>
          </div>
        ))}
      </SimpleGrid>
    </Card>
  );
}

function BrandingPanel({ state, onSaved }: { state: AdminState; onSaved: () => Promise<void> }) {
  const b = state.branding as Record<string, string | boolean | number>;
  const [queue, setQueue] = useState(state.queue);
  const [mode, setMode] = useState(state.admissionMode);
  const [title, setTitle] = useState(String(b.title ?? ""));
  const [message, setMessage] = useState(String(b.message ?? ""));
  const [primary, setPrimary] = useState(String(b.primaryColor ?? "#2bb0a6"));
  const [accent, setAccent] = useState(String(b.accentColor ?? "#3dd6c8"));
  const [bg, setBg] = useState(String(b.backgroundColor ?? "#07151c"));
  const [surface, setSurface] = useState(String(b.surfaceColor ?? "#0e2531"));
  const [text, setText] = useState(String(b.textColor ?? "#e8f1f5"));
  const [muted, setMuted] = useState(String(b.mutedColor ?? "#8aa4b0"));
  const [showWaiting, setShowWaiting] = useState(Boolean(b.showWaitingCount));
  const [requireClick, setRequireClick] = useState(Boolean(b.requireClickToEnter));
  const [playSound, setPlaySound] = useState(Boolean(b.playTurnSound));
  const [redirectUrl, setRedirectUrl] = useState(String(b.redirectUrl ?? ""));
  const [hold, setHold] = useState(Number(b.admitHoldSeconds ?? 60));
  const [enterLabel, setEnterLabel] = useState(String(b.enterButtonLabel ?? "Continue"));

  return (
    <Card withBorder bg="dark.7" style={{ borderColor: "rgba(232,241,245,0.14)" }}>
      <Stack>
        <Title order={4}>Branding & mode</Title>
        <TextInput label="Queue" value={queue} onChange={(e) => setQueue(e.currentTarget.value)} />
        <SegmentedControl
          value={mode}
          onChange={(v) => setMode(v as "queue" | "lottery")}
          data={[
            { label: "Queue (FIFO)", value: "queue" },
            { label: "Lottery", value: "lottery" },
          ]}
        />
        <TextInput label="Title" value={title} onChange={(e) => setTitle(e.currentTarget.value)} />
        <Textarea
          label="Message"
          value={message}
          onChange={(e) => setMessage(e.currentTarget.value)}
        />
        <SimpleGrid cols={{ base: 2, sm: 3 }}>
          <ColorInput label="Primary" value={primary} onChange={setPrimary} />
          <ColorInput label="Accent" value={accent} onChange={setAccent} />
          <ColorInput label="Background" value={bg} onChange={setBg} />
          <ColorInput label="Surface" value={surface} onChange={setSurface} />
          <ColorInput label="Text" value={text} onChange={setText} />
          <ColorInput label="Muted" value={muted} onChange={setMuted} />
        </SimpleGrid>
        <Checkbox
          label="Show waiting count"
          checked={showWaiting}
          onChange={(e) => setShowWaiting(e.currentTarget.checked)}
        />
        <Checkbox
          label="Require click to enter"
          checked={requireClick}
          onChange={(e) => setRequireClick(e.currentTarget.checked)}
        />
        <Checkbox
          label="Play turn sound"
          checked={playSound}
          onChange={(e) => setPlaySound(e.currentTarget.checked)}
        />
        <TextInput
          label="Redirect URL"
          value={redirectUrl}
          onChange={(e) => setRedirectUrl(e.currentTarget.value)}
        />
        <NumberInput
          label="Admit hold (s)"
          value={hold}
          onChange={(v) => setHold(Number(v) || 60)}
          min={15}
          max={900}
        />
        <TextInput
          label="Enter button label"
          value={enterLabel}
          onChange={(e) => setEnterLabel(e.currentTarget.value)}
        />
        <Group>
          <Button
            onClick={() => {
              void api("/api/admin/branding", {
                method: "PUT",
                body: JSON.stringify({
                  queue,
                  branding: {
                    title,
                    message,
                    primaryColor: primary,
                    accentColor: accent,
                    backgroundColor: bg,
                    surfaceColor: surface,
                    textColor: text,
                    mutedColor: muted,
                    showWaitingCount: showWaiting,
                    requireClickToEnter: requireClick,
                    playTurnSound: playSound,
                    redirectUrl,
                    admitHoldSeconds: hold,
                    enterButtonLabel: enterLabel,
                  },
                }),
              })
                .then(() => {
                  notifyOk("Branding saved");
                  return onSaved();
                })
                .catch(notifyError);
            }}
          >
            Save branding
          </Button>
          <Button
            variant="default"
            onClick={() => {
              if (!window.confirm(`Switch to ${mode} mode?`)) return;
              void api("/api/admin/mode", {
                method: "POST",
                body: JSON.stringify({ queue, mode }),
              })
                .then(() => {
                  notifyOk("Mode updated");
                  return onSaved();
                })
                .catch(notifyError);
            }}
          >
            Apply mode
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}

function ScheduleHealthPanel({
  state,
  metrics,
  onSaved,
}: {
  state: AdminState;
  metrics: QueueMetrics;
  onSaved: () => Promise<void>;
}) {
  const hc = state.traffic.healthConfig as Record<string, unknown>;
  const [opensAt, setOpensAt] = useState("");
  const [paused, setPaused] = useState(metrics.paused);
  const [enabled, setEnabled] = useState(Boolean(hc.enabled));
  const [url, setUrl] = useState(String(hc.url ?? ""));
  const [interval, setIntervalSec] = useState(Number(hc.intervalSeconds ?? 30));
  const [latency, setLatency] = useState(Number(hc.maxLatencyMs ?? 2000));
  const [expectStatus, setExpectStatus] = useState(Number(hc.expectStatus ?? 200));
  const [slow, setSlow] = useState(Number(hc.slowRateMultiplier ?? 0.25));
  const [fail, setFail] = useState(Number(hc.failThreshold ?? 3));
  const [recover, setRecover] = useState(Number(hc.recoverThreshold ?? 2));

  useEffect(() => {
    setPaused(metrics.paused);
    if (metrics.opensAt) {
      const d = new Date(metrics.opensAt);
      const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
      setOpensAt(local);
    }
  }, [metrics.paused, metrics.opensAt]);

  return (
    <Card withBorder bg="dark.7" style={{ borderColor: "rgba(232,241,245,0.14)" }}>
      <Stack>
        <Title order={4}>Traffic controls</Title>
        <TextInput
          label="Opening time (local)"
          type="datetime-local"
          value={opensAt}
          onChange={(e) => setOpensAt(e.currentTarget.value)}
        />
        <Group>
          <Button
            onClick={() => {
              const iso = opensAt ? new Date(opensAt).toISOString() : null;
              void api("/api/admin/schedule", {
                method: "PUT",
                body: JSON.stringify({ queue: state.queue, opensAt: iso }),
              })
                .then(() => {
                  notifyOk("Schedule saved");
                  return onSaved();
                })
                .catch(notifyError);
            }}
          >
            Save opening time
          </Button>
          <Button
            variant="default"
            onClick={() => {
              void api("/api/admin/schedule", {
                method: "PUT",
                body: JSON.stringify({ queue: state.queue, opensAt: null }),
              })
                .then(() => {
                  setOpensAt("");
                  notifyOk("Opened now");
                  return onSaved();
                })
                .catch(notifyError);
            }}
          >
            Open now
          </Button>
        </Group>
        <Checkbox
          label="Silent pause (stop admissions)"
          checked={paused}
          onChange={(e) => setPaused(e.currentTarget.checked)}
        />
        <Button
          onClick={() => {
            if (!window.confirm(paused ? "Pause admissions?" : "Resume admissions?")) return;
            void api("/api/admin/pause", {
              method: "POST",
              body: JSON.stringify({ queue: state.queue, paused }),
            })
              .then(() => {
                notifyOk(paused ? "Paused" : "Resumed");
                return onSaved();
              })
              .catch(notifyError);
          }}
        >
          Apply pause
        </Button>

        <Title order={5} mt="sm">
          Origin health throttle
        </Title>
        <Text size="sm" c="dimmed">
          Health: {metrics.health.level}
          {metrics.health.lastLatencyMs != null ? ` · ${metrics.health.lastLatencyMs}ms` : ""}
          {metrics.health.autoPaused ? " · auto-paused" : ""}
        </Text>
        <Checkbox
          label="Enabled"
          checked={enabled}
          onChange={(e) => setEnabled(e.currentTarget.checked)}
        />
        <TextInput label="Health URL" value={url} onChange={(e) => setUrl(e.currentTarget.value)} />
        <SimpleGrid cols={{ base: 2, sm: 3 }}>
          <NumberInput
            label="Interval (s)"
            value={interval}
            onChange={(v) => setIntervalSec(Number(v) || 30)}
          />
          <NumberInput
            label="Max latency (ms)"
            value={latency}
            onChange={(v) => setLatency(Number(v) || 2000)}
          />
          <NumberInput
            label="Expect status"
            value={expectStatus}
            onChange={(v) => setExpectStatus(Number(v) || 200)}
          />
          <NumberInput
            label="Slow rate"
            value={slow}
            onChange={(v) => setSlow(Number(v) || 0.25)}
            step={0.05}
          />
          <NumberInput
            label="Fail threshold"
            value={fail}
            onChange={(v) => setFail(Number(v) || 3)}
          />
          <NumberInput
            label="Recover threshold"
            value={recover}
            onChange={(v) => setRecover(Number(v) || 2)}
          />
        </SimpleGrid>
        <Group>
          <Button
            onClick={() => {
              void api("/api/admin/health", {
                method: "PUT",
                body: JSON.stringify({
                  queue: state.queue,
                  enabled,
                  url,
                  intervalSeconds: interval,
                  maxLatencyMs: latency,
                  expectStatus,
                  slowRateMultiplier: slow,
                  failThreshold: fail,
                  recoverThreshold: recover,
                }),
              })
                .then(() => {
                  notifyOk("Health saved");
                  return onSaved();
                })
                .catch(notifyError);
            }}
          >
            Save health
          </Button>
          <Button
            variant="default"
            onClick={() => {
              void api("/api/admin/health", {
                method: "PUT",
                body: JSON.stringify({ queue: state.queue, overrideMinutes: 15 }),
              })
                .then(() => {
                  notifyOk("Override 15m");
                  return onSaved();
                })
                .catch(notifyError);
            }}
          >
            Ignore 15m
          </Button>
          <Button
            variant="default"
            onClick={() => {
              void api("/api/admin/health", {
                method: "PUT",
                body: JSON.stringify({ queue: state.queue, clearOverride: true }),
              })
                .then(() => {
                  notifyOk("Override cleared");
                  return onSaved();
                })
                .catch(notifyError);
            }}
          >
            Clear override
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}

function OriginPanel({ state, onSaved }: { state: AdminState; onSaved: () => Promise<void> }) {
  const o = state.origin as Record<string, unknown>;
  const [enabled, setEnabled] = useState(Boolean(o.enabled));
  const [originUrl, setOriginUrl] = useState(String(o.originUrl ?? ""));
  const [protectAll, setProtectAll] = useState(o.protectAll !== false);
  const [prefixes, setPrefixes] = useState(
    Array.isArray(o.pathPrefixes)
      ? (o.pathPrefixes as string[]).join(",")
      : String(o.pathPrefixes ?? ""),
  );

  return (
    <Card withBorder bg="dark.7" style={{ borderColor: "rgba(232,241,245,0.14)" }}>
      <Stack>
        <Title order={4}>Origin proxy</Title>
        <Checkbox
          label="Enable origin proxy"
          checked={enabled}
          onChange={(e) => setEnabled(e.currentTarget.checked)}
        />
        <TextInput
          label="Origin URL"
          value={originUrl}
          onChange={(e) => setOriginUrl(e.currentTarget.value)}
        />
        <Checkbox
          label="Protect all non-TideGuard paths"
          checked={protectAll}
          onChange={(e) => setProtectAll(e.currentTarget.checked)}
        />
        <TextInput
          label="Path prefixes"
          value={prefixes}
          onChange={(e) => setPrefixes(e.currentTarget.value)}
          disabled={protectAll}
        />
        <Button
          onClick={() => {
            if (!window.confirm("Save origin proxy settings?")) return;
            void api("/api/admin/origin", {
              method: "PUT",
              body: JSON.stringify({
                enabled,
                originUrl,
                protectAll,
                pathPrefixes: prefixes,
                queue: state.queue,
              }),
            })
              .then(() => {
                notifyOk("Origin saved");
                return onSaved();
              })
              .catch(notifyError);
          }}
        >
          Save origin proxy
        </Button>
      </Stack>
    </Card>
  );
}

function BypassGeoPanel({ state, onSaved }: { state: AdminState; onSaved: () => Promise<void> }) {
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

function CloudflarePanel({ state, onSaved }: { state: AdminState; onSaved: () => Promise<void> }) {
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

function TeamPanel({ state, onSaved }: { state: AdminState; onSaved: () => Promise<void> }) {
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  return (
    <Card withBorder bg="dark.7" style={{ borderColor: "rgba(232,241,245,0.14)" }}>
      <Stack>
        <Title order={4}>Team</Title>
        <Text size="sm" c="dimmed">
          You: {state.me.username}
        </Text>
        {state.team.users.map((u) => (
          <Text key={u.id} size="sm">
            {u.username}
          </Text>
        ))}
        <Button
          onClick={() => {
            void api<{ acceptUrl?: string }>("/api/admin/invites", {
              method: "POST",
              body: "{}",
            })
              .then((data) => {
                setInviteUrl(data.acceptUrl ?? null);
                notifyOk("Invite created — copy the link now");
                return onSaved();
              })
              .catch(notifyError);
          }}
        >
          Create invite
        </Button>
        {inviteUrl ? <TextInput label="Invite link" value={inviteUrl} readOnly /> : null}
        {state.team.invites.map((inv) => {
          const id = String(inv.id ?? "");
          return (
            <Group key={id} justify="space-between">
              <Text size="sm">Invite {id.slice(0, 8)}…</Text>
              <Button
                size="xs"
                variant="default"
                color="red"
                onClick={() => {
                  if (!window.confirm("Revoke invite?")) return;
                  void api(`/api/admin/invites/${encodeURIComponent(id)}`, {
                    method: "DELETE",
                  })
                    .then(() => onSaved())
                    .catch(notifyError);
                }}
              >
                Revoke
              </Button>
            </Group>
          );
        })}
      </Stack>
    </Card>
  );
}

function ActivityPanel() {
  const [events, setEvents] = useState<
    Array<{ summary: string; actorUsername: string; at: number }>
  >([]);

  const load = () => {
    void api<{ events: typeof events }>("/api/admin/audit")
      .then((data) => setEvents(data.events || []))
      .catch(notifyError);
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <Card withBorder bg="dark.7" style={{ borderColor: "rgba(232,241,245,0.14)" }}>
      <Stack>
        <Group justify="space-between">
          <Title order={4}>Activity</Title>
          <Button size="xs" variant="default" onClick={load}>
            Refresh
          </Button>
        </Group>
        {events.slice(0, 30).map((e, i) => (
          <Text key={`${e.at}-${i}`} size="sm" c="dimmed">
            {new Date(e.at).toLocaleString()} · {e.actorUsername} · {e.summary}
          </Text>
        ))}
        {events.length === 0 ? (
          <Text size="sm" c="dimmed">
            No activity yet
          </Text>
        ) : null}
      </Stack>
    </Card>
  );
}

function UpdatesPanel() {
  const [summary, setSummary] = useState("—");

  const check = (force = false) => {
    void api<{ summary?: string; updateAvailable?: boolean }>(
      `/api/admin/updates${force ? "?refresh=1" : ""}`,
    )
      .then((data) =>
        setSummary(data.summary || (data.updateAvailable ? "Update available" : "Up to date")),
      )
      .catch((e) => setSummary(e instanceof ApiError ? e.message : "Check failed"));
  };

  useEffect(() => {
    check(false);
  }, []);

  return (
    <Card withBorder bg="dark.7" style={{ borderColor: "rgba(232,241,245,0.14)" }}>
      <Stack>
        <Group justify="space-between">
          <Title order={4}>Updates</Title>
          <Button size="xs" variant="default" onClick={() => check(true)}>
            Check
          </Button>
        </Group>
        <Text size="sm">{summary}</Text>
      </Stack>
    </Card>
  );
}
