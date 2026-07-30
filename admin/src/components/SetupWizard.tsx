import { useEffect, useRef, useState } from "react";
import {
  Button,
  Card,
  Checkbox,
  ColorInput,
  Group,
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

export function SetupWizard({
  bootstrap,
  onComplete,
}: {
  bootstrap: BootstrapResponse;
  onComplete: () => Promise<void>;
}) {
  const [step, setStep] = useState(1);
  const [tokenSecret, setTokenSecret] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirm] = useState("");
  const [cfToken, setCfToken] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [hostname, setHostname] = useState("");
  const [workerService, setWorkerService] = useState("tideguard");
  const [cfReady, setCfReady] = useState(false);
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

  return (
    <Card
      maw={560}
      mx="auto"
      withBorder
      bg="dark.7"
      mt="xl"
      style={{ borderColor: "rgba(232,241,245,0.14)" }}
    >
      <Stack>
        <Title order={3}>First-time setup</Title>
        <Text size="sm" c="dimmed">
          Step {step} of 5
        </Text>

        {step === 1 ? (
          <>
            <PasswordInput
              label="TOKEN_SECRET"
              description="Same value as the Worker secret"
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
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
            />
            <PasswordInput
              label="Confirm password"
              value={confirmPassword}
              onChange={(e) => setConfirm(e.currentTarget.value)}
            />
            <Button
              onClick={() => {
                if (
                  !tokenSecret ||
                  !username ||
                  password.length < 8 ||
                  password !== confirmPassword
                ) {
                  setStatus("Fill claim fields (password ≥ 8, must match)");
                  return;
                }
                setStatus(null);
                setStep(2);
              }}
            >
              Continue
            </Button>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <Text size="sm" c="dimmed">
              Verify Cloudflare access so TideGuard can check proxied DNS and provision Turnstile.
            </Text>
            <PasswordInput
              label="API token"
              value={cfToken}
              onChange={(e) => setCfToken(e.currentTarget.value)}
            />
            <TextInput
              label="Zone ID"
              value={zoneId}
              onChange={(e) => setZoneId(e.currentTarget.value)}
            />
            <TextInput
              label="Hostname"
              value={hostname}
              onChange={(e) => setHostname(e.currentTarget.value)}
            />
            <TextInput
              label="Worker service"
              value={workerService}
              onChange={(e) => setWorkerService(e.currentTarget.value)}
            />
            <Group>
              <Button variant="default" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button
                loading={busy}
                onClick={() => {
                  setBusy(true);
                  setStatus(null);
                  void api("/api/admin/setup/cloudflare/verify", {
                    method: "POST",
                    headers: authHeaders(),
                    body: JSON.stringify({
                      apiToken: cfToken,
                      zoneId,
                      hostname,
                      workerService,
                    }),
                  })
                    .then(() => {
                      setCfReady(true);
                      setStatus("Cloudflare verified");
                      setStep(3);
                    })
                    .catch((e) => setStatus(e instanceof Error ? e.message : "Verify failed"))
                    .finally(() => setBusy(false));
                }}
              >
                Verify & continue
              </Button>
            </Group>
            {cfReady ? (
              <Text size="sm" c="teal">
                Cloudflare ready
              </Text>
            ) : null}
          </>
        ) : null}

        {step === 3 ? (
          <>
            <Text size="sm" c="dimmed">
              Provision a Turnstile widget, complete the challenge, then verify.
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
              <Button variant="default" onClick={() => setStep(2)}>
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
          <Text size="sm" c={status.includes("fail") || status.includes("Fill") ? "red" : "dimmed"}>
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
