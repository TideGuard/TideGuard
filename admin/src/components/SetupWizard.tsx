import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Anchor,
  Button,
  Card,
  Checkbox,
  ColorInput,
  Group,
  List,
  NumberInput,
  PasswordInput,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Textarea,
  Title,
} from "@mantine/core";
import { api } from "../lib/api";
import type { BootstrapResponse } from "../lib/types";
import {
  CF_PHASE_LABELS,
  FIELD_HELP,
  LINKS,
  SETUP_STEPS,
  TOKEN_PERMISSIONS,
  type CfPhase,
  isPasswordReady,
  passwordChecks,
} from "../lib/setup-guidance";

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: {
          sitekey: string;
          callback: (token: string) => void;
          "expired-callback"?: () => void;
        },
      ) => string;
      reset: (id?: string) => void;
      remove: (id?: string) => void;
    };
  }
}

type VerifyPayload = {
  ok?: boolean;
  verify?: {
    proxy?: { ok?: boolean; summary?: string; suggestions?: string[] };
    ssl?: { mode?: string | null; isStrict?: boolean };
    domains?: { hostnameAttached?: boolean };
  };
};

function ExtLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Anchor href={href} target="_blank" rel="noreferrer" size="sm">
      {children}
    </Anchor>
  );
}

export function SetupWizard({
  bootstrap,
  onComplete,
}: {
  bootstrap: BootstrapResponse;
  onComplete: () => Promise<void>;
}) {
  const [step, setStep] = useState(1);
  const [cfPhase, setCfPhase] = useState<CfPhase>("token");
  const [tokenSecret, setTokenSecret] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirm] = useState("");
  const [cfToken, setCfToken] = useState("");
  const [tokenVerified, setTokenVerified] = useState(false);
  const [zoneId, setZoneId] = useState("");
  const [hostname, setHostname] = useState(() =>
    typeof window !== "undefined" ? window.location.hostname : "",
  );
  const [workerService, setWorkerService] = useState("tideguard");
  const [proxyOk, setProxyOk] = useState(false);
  const [proxyChecked, setProxyChecked] = useState(false);
  const [proxySummary, setProxySummary] = useState<string | null>(null);
  const [proxySuggestions, setProxySuggestions] = useState<string[]>([]);
  const [sslDone, setSslDone] = useState(false);
  const [domainDone, setDomainDone] = useState(false);
  const [tsSitekey, setTsSitekey] = useState<string | null>(bootstrap.turnstileSitekey);
  const [tsToken, setTsToken] = useState<string | null>(null);
  const [tsVerified, setTsVerified] = useState(false);
  const [queue, setQueue] = useState(bootstrap.defaultQueue || "default");
  const [mode, setMode] = useState<"queue" | "lottery">("queue");
  const [title, setTitle] = useState("You're in line");
  const [message, setMessage] = useState(
    "Thanks for waiting — we'll let you in as soon as we can.",
  );
  const [primary, setPrimary] = useState("#2bb0a6");
  const [accent, setAccent] = useState("#3dd6c8");
  const [bg, setBg] = useState("#07151c");
  const [surface, setSurface] = useState("#0e2531");
  const [text, setText] = useState("#e8f1f5");
  const [muted, setMuted] = useState("#8aa4b0");
  const [showWaiting, setShowWaiting] = useState(true);
  const [requireClick, setRequireClick] = useState(false);
  const [hold, setHold] = useState(60);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const widgetRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);

  const pwd = passwordChecks(password, confirmPassword);
  const activeStep = SETUP_STEPS.find((s) => s.id === step);

  function authHeaders(): HeadersInit {
    return { Authorization: `Bearer ${tokenSecret}` };
  }

  useEffect(() => {
    if (step !== 3 || !tsSitekey || !widgetRef.current) return;
    void ensureTurnstile().then(() => {
      if (!widgetRef.current || !window.turnstile) return;
      if (widgetId.current) window.turnstile.remove(widgetId.current);
      widgetId.current = window.turnstile.render(widgetRef.current, {
        sitekey: tsSitekey,
        callback: (t) => setTsToken(t),
        "expired-callback": () => setTsToken(null),
      });
    });
  }, [step, tsSitekey]);

  async function finish() {
    setBusy(true);
    setStatus(null);
    try {
      await api("/api/admin/setup", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          username,
          password,
          confirmPassword,
          queue,
          admissionMode: mode,
          branding: {
            title,
            message,
            primaryColor: primary,
            accentColor: accent,
            backgroundColor: bg,
            surfaceColor: surface,
            textColor: text,
            mutedColor: muted,
            fontFamily: '"Source Sans 3", system-ui, sans-serif',
            showWaitingCount: showWaiting,
            redirectUrl: "",
            requireClickToEnter: requireClick,
            admitHoldSeconds: hold,
            enterButtonLabel: "Continue",
            playTurnSound: true,
          },
        }),
      });
      await onComplete();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Setup failed");
    } finally {
      setBusy(false);
    }
  }

  function verifyToken() {
    setBusy(true);
    setStatus(null);
    void api<{ ok?: boolean }>("/api/admin/setup/cloudflare/token-verify", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ apiToken: cfToken }),
    })
      .then(() => {
        setTokenVerified(true);
        setStatus("API token verified");
        setCfPhase("zone");
      })
      .catch((e) => setStatus(e instanceof Error ? e.message : "Token verify failed"))
      .finally(() => setBusy(false));
  }

  function applyVerifyResult(data: VerifyPayload) {
    const ok = Boolean(data.ok && data.verify?.proxy?.ok);
    setProxyChecked(true);
    setProxyOk(ok);
    setProxySummary(data.verify?.proxy?.summary ?? null);
    setProxySuggestions(data.verify?.proxy?.suggestions ?? []);
    return ok;
  }

  function verifyZone() {
    setBusy(true);
    setStatus(null);
    void api<VerifyPayload>("/api/admin/setup/cloudflare/verify", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        apiToken: cfToken,
        zoneId,
        hostname,
        workerService,
      }),
    })
      .then((data) => {
        const ok = applyVerifyResult(data);
        if (ok) {
          setStatus("Proxied DNS verified");
          setCfPhase("ssl");
        } else {
          setStatus(
            data.verify?.proxy?.summary ||
              "Hostname is not fully proxied yet — use Fix setup, then verify again.",
          );
        }
      })
      .catch((e) => setStatus(e instanceof Error ? e.message : "Verify failed"))
      .finally(() => setBusy(false));
  }

  function fixProxy() {
    setBusy(true);
    setStatus(null);
    void api<VerifyPayload>("/api/admin/setup/cloudflare/fix", {
      method: "POST",
      headers: authHeaders(),
      body: "{}",
    })
      .then((data) => {
        const ok = Boolean(data.ok);
        setProxyChecked(true);
        setProxyOk(ok);
        const check = (data as { check?: { summary?: string; suggestions?: string[] } }).check;
        setProxySummary(check?.summary ?? null);
        setProxySuggestions(check?.suggestions ?? []);
        if (ok) {
          setStatus("Proxy fixed — continue to SSL");
          setCfPhase("ssl");
        } else {
          setStatus(check?.summary || "Fix incomplete — check DNS and try again");
        }
      })
      .catch((e) => setStatus(e instanceof Error ? e.message : "Fix failed"))
      .finally(() => setBusy(false));
  }

  function setSsl() {
    setBusy(true);
    setStatus(null);
    void api("/api/admin/setup/cloudflare/ssl", {
      method: "POST",
      headers: authHeaders(),
      body: "{}",
    })
      .then(() => {
        setSslDone(true);
        setStatus("SSL set to Full (strict)");
        setCfPhase("domain");
      })
      .catch((e) => setStatus(e instanceof Error ? e.message : "SSL update failed"))
      .finally(() => setBusy(false));
  }

  function attachDomain() {
    setBusy(true);
    setStatus(null);
    void api("/api/admin/setup/cloudflare/attach-domain", {
      method: "POST",
      headers: authHeaders(),
      body: "{}",
    })
      .then(() => {
        setDomainDone(true);
        setStatus("Hostname attached to Worker");
        setStep(3);
      })
      .catch((e) => setStatus(e instanceof Error ? e.message : "Attach failed"))
      .finally(() => setBusy(false));
  }

  const statusLooksBad =
    status != null &&
    (/fail|error|Fill|wrong|missing|invalid|incomplete|not fully|must/i.test(status) ||
      status.includes("≥"));

  return (
    <Card
      maw={720}
      mx="auto"
      withBorder
      bg="dark.7"
      mt="xl"
      style={{ borderColor: "rgba(232,241,245,0.14)" }}
    >
      <Stack>
        <Title order={3}>First-time setup</Title>
        <Text size="sm" c="dimmed">
          Step {step} of 5{step === 2 ? ` · ${CF_PHASE_LABELS[cfPhase]}` : ""}
        </Text>

        <Group gap="xs" wrap="wrap">
          {SETUP_STEPS.map((s) => (
            <Text
              key={s.id}
              size="xs"
              fw={s.id === step ? 700 : 400}
              c={s.id === step ? "teal" : s.id < step ? "dimmed" : "dark.2"}
            >
              {s.id}. {s.label}
              {s.id < 5 ? " →" : ""}
            </Text>
          ))}
        </Group>

        {activeStep && step !== 2 ? (
          <Text size="sm" c="dimmed">
            {activeStep.short}
          </Text>
        ) : null}

        {step === 1 ? (
          <>
            <PasswordInput
              label="TOKEN_SECRET"
              description="Same value as the Worker secret from Deploy to Cloudflare or .dev.vars. Required as Bearer so a public Worker cannot be claimed by a stranger."
              value={tokenSecret}
              onChange={(e) => setTokenSecret(e.currentTarget.value)}
            />
            <TextInput
              label="Admin username"
              value={username}
              onChange={(e) => setUsername(e.currentTarget.value)}
            />
            <PasswordInput
              label="Password"
              description="8–128 chars, at least one uppercase letter, and a digit or symbol."
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
            />
            <PasswordInput
              label="Confirm password"
              value={confirmPassword}
              onChange={(e) => setConfirm(e.currentTarget.value)}
            />
            <List size="sm" spacing={2} c="dimmed">
              <List.Item c={pwd.length ? "teal" : undefined}>
                {pwd.length ? "✓" : "○"} At least 8 characters
              </List.Item>
              <List.Item c={pwd.upper ? "teal" : undefined}>
                {pwd.upper ? "✓" : "○"} One uppercase letter
              </List.Item>
              <List.Item c={pwd.digitOrSymbol ? "teal" : undefined}>
                {pwd.digitOrSymbol ? "✓" : "○"} One digit or symbol
              </List.Item>
              <List.Item c={pwd.match ? "teal" : undefined}>
                {pwd.match ? "✓" : "○"} Passwords match
              </List.Item>
            </List>
            <Button
              onClick={() => {
                if (!tokenSecret || !username || !isPasswordReady(password, confirmPassword)) {
                  setStatus("Fill claim fields (password policy + match required)");
                  return;
                }
                setStatus(null);
                setStep(2);
                setCfPhase("token");
              }}
            >
              Continue
            </Button>
          </>
        ) : null}

        {step === 2 && cfPhase === "token" ? (
          <>
            <Text size="sm" c="dimmed">
              One-time connect: create a token in Cloudflare, paste it here, then TideGuard can
              manage the rest for you.
            </Text>

            <Stack gap="xs">
              <Text size="sm" fw={600}>
                1. Create a Custom Token
              </Text>
              <Text size="sm" c="dimmed">
                In Cloudflare: API Tokens → Create Token → Create Custom Token. Limit Zone Resources
                to your domain.
              </Text>
              <div>
                <Button
                  component="a"
                  href={LINKS.apiTokens}
                  target="_blank"
                  rel="noreferrer"
                  variant="light"
                  size="compact-sm"
                >
                  Open API Tokens
                </Button>
              </div>
            </Stack>

            <Stack gap={4}>
              <Text size="sm" fw={600}>
                2. Add these permissions
              </Text>
              <List size="sm" c="dimmed" spacing={2} withPadding>
                {TOKEN_PERMISSIONS.map((p) => (
                  <List.Item key={p}>{p}</List.Item>
                ))}
              </List>
            </Stack>

            <Stack gap="xs">
              <Text size="sm" fw={600}>
                3. Paste and verify
              </Text>
              <PasswordInput
                label={FIELD_HELP.apiToken.label}
                placeholder="Paste the token you just created"
                value={cfToken}
                onChange={(e) => {
                  setCfToken(e.currentTarget.value);
                  setTokenVerified(false);
                }}
              />
            </Stack>

            <Group>
              <Button variant="default" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button
                loading={busy}
                onClick={() => verifyToken()}
                disabled={cfToken.trim().length < 20}
              >
                Verify token
              </Button>
            </Group>
            {tokenVerified ? (
              <Text size="sm" c="teal">
                Token ready
              </Text>
            ) : null}
          </>
        ) : null}

        {step === 2 && cfPhase === "zone" ? (
          <>
            <Text size="sm" c="dimmed">
              Tell TideGuard which site to protect. Hostname must be proxied (orange cloud).
            </Text>
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
                  {FIELD_HELP.zoneId.hint} <ExtLink href={LINKS.findIds}>Find Zone ID</ExtLink>
                </>
              }
              value={zoneId}
              onChange={(e) => setZoneId(e.currentTarget.value)}
              placeholder="Leave blank to auto-detect"
            />
            <TextInput
              label={FIELD_HELP.workerService.label}
              description={FIELD_HELP.workerService.hint}
              value={workerService}
              onChange={(e) => setWorkerService(e.currentTarget.value)}
            />
            {proxySummary ? (
              <Text size="sm" c={proxyOk ? "teal" : "orange"}>
                {proxySummary}
              </Text>
            ) : null}
            {proxySuggestions.length > 0 ? (
              <List size="xs" c="dimmed">
                {proxySuggestions.map((s) => (
                  <List.Item key={s}>{s}</List.Item>
                ))}
              </List>
            ) : null}
            <Group>
              <Button
                variant="default"
                onClick={() => {
                  setCfPhase("token");
                  setStatus(null);
                }}
              >
                Back
              </Button>
              <Button loading={busy} onClick={() => verifyZone()} disabled={!hostname.trim()}>
                Verify site
              </Button>
              {!proxyOk && proxyChecked ? (
                <Button variant="light" loading={busy} onClick={() => fixProxy()}>
                  Fix setup
                </Button>
              ) : null}
            </Group>
          </>
        ) : null}

        {step === 2 && cfPhase === "ssl" ? (
          <>
            <Text size="sm" c="dimmed">
              Recommended when your origin has a valid certificate. Skip if you are not ready — you
              can set this later in Admin → Cloudflare access.
            </Text>
            <Group>
              <Button
                variant="default"
                onClick={() => {
                  setCfPhase("zone");
                  setStatus(null);
                }}
              >
                Back
              </Button>
              <Button loading={busy} onClick={() => setSsl()}>
                Set Full (strict)
              </Button>
              <Button
                variant="light"
                onClick={() => {
                  setSslDone(true);
                  setStatus("SSL skipped for now");
                  setCfPhase("domain");
                }}
              >
                Skip for now
              </Button>
            </Group>
            {sslDone ? (
              <Text size="sm" c="teal">
                SSL step done
              </Text>
            ) : null}
          </>
        ) : null}

        {step === 2 && cfPhase === "domain" ? (
          <>
            <Text size="sm" c="dimmed">
              Link your hostname to this Worker so visitors hit the waiting room. Skip if it is
              already linked — you can manage domains later in Admin → Cloudflare access.
            </Text>
            <Group>
              <Button
                variant="default"
                onClick={() => {
                  setCfPhase("ssl");
                  setStatus(null);
                }}
              >
                Back
              </Button>
              <Button loading={busy} onClick={() => attachDomain()}>
                Attach domain
              </Button>
              <Button
                variant="light"
                onClick={() => {
                  setDomainDone(true);
                  setStatus("Domain attach skipped");
                  setStep(3);
                }}
              >
                Skip for now
              </Button>
            </Group>
            {domainDone ? (
              <Text size="sm" c="teal">
                Domain step done
              </Text>
            ) : null}
          </>
        ) : null}

        {step === 3 ? (
          <>
            <Text size="sm" c="dimmed">
              TideGuard creates a Turnstile widget with your verified API token. Complete the
              challenge, then verify — required for admin login after setup.
            </Text>
            <Group>
              <Button
                loading={busy}
                onClick={() => {
                  setBusy(true);
                  setStatus(null);
                  void api<{ sitekey?: string }>("/api/admin/setup/turnstile/provision", {
                    method: "POST",
                    headers: authHeaders(),
                    body: "{}",
                  })
                    .then((data) => {
                      setTsSitekey(data.sitekey ?? null);
                      setStatus("Widget ready — complete the challenge");
                    })
                    .catch((e) => setStatus(e instanceof Error ? e.message : "Provision failed"))
                    .finally(() => setBusy(false));
                }}
              >
                Create widget
              </Button>
              <Button
                loading={busy}
                disabled={!tsToken}
                onClick={() => {
                  setBusy(true);
                  setStatus(null);
                  void api("/api/admin/setup/turnstile/verify", {
                    method: "POST",
                    headers: authHeaders(),
                    body: JSON.stringify({ turnstileToken: tsToken }),
                  })
                    .then(() => {
                      setTsVerified(true);
                      setStatus("Turnstile verified");
                      setStep(4);
                    })
                    .catch((e) => setStatus(e instanceof Error ? e.message : "Verify failed"))
                    .finally(() => setBusy(false));
                }}
              >
                Verify challenge
              </Button>
            </Group>
            <div ref={widgetRef} />
            <Group>
              <Button
                variant="default"
                onClick={() => {
                  setStep(2);
                  setCfPhase("domain");
                }}
              >
                Back
              </Button>
              <Button disabled={!tsVerified} onClick={() => setStep(4)}>
                Continue
              </Button>
            </Group>
          </>
        ) : null}

        {step === 4 ? (
          <>
            <Text size="sm" c="dimmed">
              Queue name and admission mode are stored when you finish setup (not at deploy time).
            </Text>
            <TextInput
              label="Queue name"
              value={queue}
              onChange={(e) => setQueue(e.currentTarget.value)}
            />
            <SegmentedControl
              value={mode}
              onChange={(v) => setMode(v as "queue" | "lottery")}
              data={[
                { label: "Queue", value: "queue" },
                { label: "Lottery", value: "lottery" },
              ]}
            />
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
            <NumberInput
              label="Admit hold (s)"
              value={hold}
              onChange={(v) => setHold(Number(v) || 60)}
              min={15}
              max={900}
            />
            <Group>
              <Button variant="default" onClick={() => setStep(3)}>
                Back
              </Button>
              <Button onClick={() => setStep(5)}>Continue</Button>
            </Group>
          </>
        ) : null}

        {step === 5 ? (
          <>
            <Text size="sm" c="dimmed">
              Preview colors client-side; nothing is written until Finish setup.
            </Text>
            <TextInput
              label="Title"
              value={title}
              onChange={(e) => setTitle(e.currentTarget.value)}
            />
            <Textarea
              label="Message"
              value={message}
              onChange={(e) => setMessage(e.currentTarget.value)}
            />
            <SimpleGrid cols={2}>
              <ColorInput label="Primary" value={primary} onChange={setPrimary} />
              <ColorInput label="Accent" value={accent} onChange={setAccent} />
              <ColorInput label="Background" value={bg} onChange={setBg} />
              <ColorInput label="Surface" value={surface} onChange={setSurface} />
              <ColorInput label="Text" value={text} onChange={setText} />
              <ColorInput label="Muted" value={muted} onChange={setMuted} />
            </SimpleGrid>
            <Group>
              <Button variant="default" onClick={() => setStep(4)}>
                Back
              </Button>
              <Button loading={busy} onClick={() => void finish()}>
                Finish setup
              </Button>
            </Group>
          </>
        ) : null}

        {status ? (
          <Text size="sm" c={statusLooksBad ? "red" : "dimmed"}>
            {status}
          </Text>
        ) : null}
      </Stack>
    </Card>
  );
}

function ensureTurnstile(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector("script[data-tg-turnstile]");
    if (existing) {
      existing.addEventListener("load", () => resolve());
      return;
    }
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.dataset.tgTurnstile = "1";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load Turnstile"));
    document.head.appendChild(s);
  });
}
