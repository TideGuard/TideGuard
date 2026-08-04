import { useCallback, useEffect, useState } from "react";
import { Anchor, Button, Code, Group, Stack, Tabs, Text, Title, Alert } from "@mantine/core";
import { api } from "../lib/api";
import type { AdminState, DashboardSection, GeoBlockSettings, QueueMetrics } from "../lib/types";
import { LINKS } from "../lib/setup-guidance";
import { EventToolbar } from "./EventToolbar";
import { TrafficPanel } from "./TrafficPanel";
import { ActivityPanel } from "../views/dashboard/ActivityPanel";
import { BrandingPanel } from "../views/dashboard/BrandingPanel";
import { BypassGeoPanel } from "../views/dashboard/BypassGeoPanel";
import { CloudflarePanel } from "../views/dashboard/CloudflarePanel";
import { DangerZonePanel } from "../views/dashboard/DangerZonePanel";
import { DemoModeBanner } from "../views/dashboard/DemoModeBanner";
import { LiveMetrics } from "../views/dashboard/LiveMetrics";
import { OriginPanel } from "../views/dashboard/OriginPanel";
import { AccessGuidancePanel } from "../views/dashboard/AccessGuidancePanel";
import { ScheduleHealthPanel } from "../views/dashboard/ScheduleHealthPanel";
import { SecretRotationPanel } from "../views/dashboard/SecretRotationPanel";
import { TeamPanel } from "../views/dashboard/TeamPanel";
import { TurnstilePanel } from "../views/dashboard/TurnstilePanel";
import { UpdatesPanel } from "../views/dashboard/UpdatesPanel";
import { WebhooksPanel } from "../views/dashboard/WebhooksPanel";
import { notifyError } from "../views/dashboard/notify";

const SECTIONS: Array<{ value: DashboardSection; label: string }> = [
  { value: "live", label: "Live" },
  { value: "admission", label: "Admission" },
  { value: "branding", label: "Branding" },
  { value: "access", label: "Access" },
  { value: "cloudflare", label: "Cloudflare" },
  { value: "team", label: "Team" },
  { value: "system", label: "System" },
];

export function Dashboard({ initial, onLogout }: { initial: AdminState; onLogout: () => void }) {
  const [state, setState] = useState(initial);
  const [metrics, setMetrics] = useState<QueueMetrics>(initial.metrics);
  const [geoBlock, setGeoBlock] = useState<GeoBlockSettings>(initial.geoBlock);
  const [section, setSection] = useState<DashboardSection>("live");
  const [pollError, setPollError] = useState<string | null>(null);
  const [auditTick, setAuditTick] = useState(0);
  const [showFirstRun, setShowFirstRun] = useState(() => {
    try {
      return sessionStorage.getItem("tg-first-run") !== "1" && initial.metrics.waiting === 0;
    } catch {
      return false;
    }
  });
  const queue = state.queue;

  const refreshMetrics = useCallback(async () => {
    const data = await api<{ metrics: QueueMetrics; geoBlock?: GeoBlockSettings }>(
      `/api/admin/metrics?queue=${encodeURIComponent(queue)}`,
    );
    setMetrics(data.metrics);
    if (data.geoBlock) setGeoBlock(data.geoBlock);
    setPollError(null);
  }, [queue]);

  const refreshState = useCallback(async () => {
    const data = await api<AdminState>(`/api/admin/state?queue=${encodeURIComponent(queue)}`);
    setState(data);
    setMetrics(data.metrics);
    setGeoBlock(data.geoBlock);
    setAuditTick((n) => n + 1);
    setPollError(null);
  }, [queue]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void refreshMetrics().catch((e) => {
        setPollError(e instanceof Error ? e.message : "Metrics refresh failed");
      });
    }, 5000);
    return () => window.clearInterval(id);
  }, [refreshMetrics]);

  function dismissFirstRun() {
    setShowFirstRun(false);
    try {
      sessionStorage.setItem("tg-first-run", "1");
    } catch {
      /* ignore */
    }
  }

  return (
    <Stack gap="md" className="tg-dashboard">
      <Group justify="space-between" align="flex-start" wrap="wrap">
        <div>
          <Title order={2} className="tg-page-title">
            Control room
          </Title>
          <Text c="dimmed" size="sm">
            Signed in as {state.me.username} · v{state.version} · queue <Code>{queue}</Code>
            {" · "}
            <Anchor href={LINKS.docs} target="_blank" rel="noreferrer" size="sm">
              Docs
            </Anchor>
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

      {showFirstRun ? (
        <Alert
          color="teal"
          title="Ready for traffic — time to green"
          withCloseButton
          onClose={dismissFirstRun}
        >
          <ol style={{ margin: "0.5rem 0 0", paddingLeft: "1.25rem" }}>
            <li>
              Smoke-test Demo mode: open <code>/wait?return=/demo</code> in an incognito window.
            </li>
            <li>
              Set admit rate in the toolbar; optionally schedule an opening time under Admission.
            </li>
            <li>When ready, Go live (origin URL + protect-all) and walk the launch checklist.</li>
          </ol>
        </Alert>
      ) : null}

      {pollError ? (
        <Alert color="orange" title="Live metrics paused">
          {pollError}. Retrying every 5s.
        </Alert>
      ) : null}

      <DemoModeBanner
        state={state}
        onGoLive={refreshState}
        onOpenAccess={() => setSection("access")}
      />

      <EventToolbar queue={queue} metrics={metrics} onRefresh={refreshMetrics} />

      <Tabs
        value={section}
        onChange={(v) => setSection((v as DashboardSection) || "live")}
        className="tg-section-tabs"
        keepMounted={false}
      >
        <Tabs.List>
          {SECTIONS.map((s) => (
            <Tabs.Tab key={s.value} value={s.value}>
              {s.label}
            </Tabs.Tab>
          ))}
        </Tabs.List>

        <Tabs.Panel value="live" pt="md">
          <Stack gap="lg" className="tg-live-composition">
            <LiveMetrics metrics={metrics} geoBlock={geoBlock} />
            <TrafficPanel queue={queue} metrics={metrics} onMetricsRefresh={refreshMetrics} />
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="admission" pt="md">
          <ScheduleHealthPanel state={state} metrics={metrics} onSaved={refreshState} />
        </Tabs.Panel>

        <Tabs.Panel value="branding" pt="md">
          <BrandingPanel state={state} onSaved={refreshState} />
        </Tabs.Panel>

        <Tabs.Panel value="access" pt="md">
          <Stack gap="lg">
            <OriginPanel state={state} onSaved={refreshState} />
            <AccessGuidancePanel />
            <BypassGeoPanel
              state={{ ...state, geoBlock }}
              onSaved={refreshState}
              showPassQueue={false}
            />
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="cloudflare" pt="md">
          <Stack gap="lg">
            <CloudflarePanel state={state} onSaved={refreshState} />
            <TurnstilePanel state={state} />
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="team" pt="md">
          <TeamPanel state={state} onSaved={refreshState} />
        </Tabs.Panel>

        <Tabs.Panel value="system" pt="md">
          <Stack gap="lg">
            <ActivityPanel refreshKey={auditTick} />
            <UpdatesPanel />
            <WebhooksPanel state={state} onSaved={refreshState} />
            <SecretRotationPanel />
            <DangerZonePanel onReset={onLogout} />
          </Stack>
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}
