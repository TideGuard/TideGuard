import { useEffect, useRef, useState } from "react";
import { Card, Group, Stack, Text, Title } from "@mantine/core";
import { api, ApiError } from "../lib/api";
import type { BootstrapResponse, SetupPendingPublic } from "../lib/types";
import { CF_PHASE_LABELS, SETUP_STEPS, type CfPhase, isPasswordReady } from "../lib/setup-guidance";
import { StepClaim } from "../views/setup/StepClaim";
import { StepCloudflare } from "../views/setup/StepCloudflare";
import { StepFinish } from "../views/setup/StepFinish";
import { StepQueue } from "../views/setup/StepQueue";
import { StepTurnstile } from "../views/setup/StepTurnstile";
import { RecoveryPhraseModal } from "../views/setup/RecoveryPhraseModal";
import { ensureTurnstile, type VerifyPayload } from "../views/setup/helpers";

/** Resume wizard from flat bootstrap.setupPending (matches toSetupPendingPublic). */
function initialStep(bootstrap: BootstrapResponse): number {
  if (!bootstrap.claimed) return 1;
  const pending = bootstrap.setupPending;
  if (!pending) return 2;
  if (pending.turnstileReady) return 4;
  if (pending.proxyOk || pending.cloudflareReady) return 3;
  return 2;
}

function initialCfPhase(pending: SetupPendingPublic | null | undefined): CfPhase {
  if (!pending) return "token";
  if (pending.hostnameAttached) return "domain";
  if (pending.sslIsStrict) return "domain";
  if (pending.proxyOk) return "ssl";
  if (pending.apiTokenReady || pending.cloudflareReady || pending.zoneId) return "zone";
  return "token";
}

export function SetupWizard({
  bootstrap,
  onComplete,
  onNeedLogin,
}: {
  bootstrap: BootstrapResponse;
  onComplete: () => Promise<void>;
  onNeedLogin: () => void;
}) {
  const claimed = bootstrap.claimed;
  const pending = bootstrap.setupPending;
  const [step, setStep] = useState(() => initialStep(bootstrap));
  const [cfPhase, setCfPhase] = useState<CfPhase>(() => initialCfPhase(pending));
  const [tokenSecret, setTokenSecret] = useState("");
  const [username, setUsername] = useState(bootstrap.claimedUsername ?? "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirm] = useState("");
  const [signedInAs, setSignedInAs] = useState(bootstrap.claimedUsername);
  const [recoveryMnemonic, setRecoveryMnemonic] = useState<string | null>(null);
  const [cfToken, setCfToken] = useState("");
  const [tokenVerified, setTokenVerified] = useState(() => Boolean(pending?.apiTokenReady));
  const [zoneId, setZoneId] = useState(() => pending?.zoneId ?? "");
  const [hostname, setHostname] = useState(
    () => pending?.hostname ?? (typeof window !== "undefined" ? window.location.hostname : ""),
  );
  const [workerService, setWorkerService] = useState("tideguard");
  const [proxyOk, setProxyOk] = useState(() => Boolean(pending?.proxyOk));
  const [proxyChecked, setProxyChecked] = useState(() => Boolean(pending?.proxyOk));
  const [proxySummary, setProxySummary] = useState<string | null>(null);
  const [proxySuggestions, setProxySuggestions] = useState<string[]>([]);
  const [sslDone, setSslDone] = useState(() => Boolean(pending?.sslIsStrict));
  const [domainDone, setDomainDone] = useState(() => Boolean(pending?.hostnameAttached));
  const [tsSitekey, setTsSitekey] = useState<string | null>(
    () => pending?.turnstileSitekey ?? bootstrap.turnstileSitekey,
  );
  const [tsToken, setTsToken] = useState<string | null>(null);
  const [tsVerified, setTsVerified] = useState(() => Boolean(pending?.turnstileReady));
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

  const activeStep = SETUP_STEPS.find((s) => s.id === step);

  function handleApiError(e: unknown, fallback: string) {
    if (e instanceof ApiError && e.status === 401) {
      onNeedLogin();
      return;
    }
    setStatus(e instanceof Error ? e.message : fallback);
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

  async function claim() {
    if (!tokenSecret || !username || !isPasswordReady(password, confirmPassword)) {
      setStatus("Fill claim fields (password policy + match required)");
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const result = await api<{ username: string; recoveryMnemonic?: string }>(
        "/api/admin/claim",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${tokenSecret}` },
          body: JSON.stringify({
            username,
            password,
            confirmPassword,
            queue: bootstrap.defaultQueue || "default",
            acceptedTosVersion: bootstrap.tosVersion,
          }),
        },
      );
      setSignedInAs(result.username);
      setTokenSecret("");
      setPassword("");
      setConfirm("");
      if (result.recoveryMnemonic) {
        setRecoveryMnemonic(result.recoveryMnemonic);
      } else {
        setStep(2);
        setCfPhase("token");
      }
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Claim failed");
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    setBusy(true);
    setStatus(null);
    try {
      await api("/api/admin/setup", {
        method: "POST",
        body: JSON.stringify({
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
            fontFamily: '"Fraunces", "IBM Plex Serif", Georgia, serif',
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
      handleApiError(e, "Setup failed");
    } finally {
      setBusy(false);
    }
  }

  function verifyToken() {
    setBusy(true);
    setStatus(null);
    void api<{ ok?: boolean }>("/api/admin/setup/cloudflare/token-verify", {
      method: "POST",
      body: JSON.stringify({ apiToken: cfToken }),
    })
      .then(() => {
        setTokenVerified(true);
        setCfToken("");
        setStatus("API token verified and stored encrypted — continue with your site");
        setCfPhase("zone");
      })
      .catch((e) => handleApiError(e, "Token verify failed"))
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
      body: JSON.stringify({
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
      .catch((e) => handleApiError(e, "Verify failed"))
      .finally(() => setBusy(false));
  }

  function fixProxy() {
    setBusy(true);
    setStatus(null);
    void api<VerifyPayload>("/api/admin/setup/cloudflare/fix", {
      method: "POST",
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
      .catch((e) => handleApiError(e, "Fix failed"))
      .finally(() => setBusy(false));
  }

  function setSsl() {
    setBusy(true);
    setStatus(null);
    void api("/api/admin/setup/cloudflare/ssl", {
      method: "POST",
      body: "{}",
    })
      .then(() => {
        setSslDone(true);
        setStatus("SSL set to Full (strict)");
        setCfPhase("domain");
      })
      .catch((e) => handleApiError(e, "SSL update failed"))
      .finally(() => setBusy(false));
  }

  function attachDomain() {
    setBusy(true);
    setStatus(null);
    void api("/api/admin/setup/cloudflare/attach-domain", {
      method: "POST",
      body: "{}",
    })
      .then(() => {
        setDomainDone(true);
        setStatus("Hostname attached to Worker");
        setStep(3);
      })
      .catch((e) => handleApiError(e, "Attach failed"))
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
        <RecoveryPhraseModal
          opened={Boolean(recoveryMnemonic)}
          mnemonic={recoveryMnemonic ?? ""}
          onConfirm={() => {
            setRecoveryMnemonic(null);
            setStep(2);
            setCfPhase("token");
          }}
        />
        <Title order={3}>First-time setup</Title>
        <Text size="sm" c="dimmed">
          Step {step} of 5{step === 2 ? ` · ${CF_PHASE_LABELS[cfPhase]}` : ""}
          {signedInAs ? ` · Signed in as ${signedInAs}` : ""}
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
          <StepClaim
            claimed={claimed}
            signedInAs={signedInAs}
            claimedUsername={bootstrap.claimedUsername}
            tokenSecret={tokenSecret}
            username={username}
            password={password}
            confirmPassword={confirmPassword}
            busy={busy}
            tosVersion={bootstrap.tosVersion}
            tosSummary={bootstrap.tosSummary}
            tosUrl={bootstrap.tosUrl}
            onTokenSecretChange={setTokenSecret}
            onUsernameChange={setUsername}
            onPasswordChange={setPassword}
            onConfirmChange={setConfirm}
            onClaim={() => void claim()}
            onContinue={() => {
              setStep(2);
              setCfPhase("token");
            }}
            onNeedLogin={onNeedLogin}
          />
        ) : null}

        {step === 2 ? (
          <StepCloudflare
            cfPhase={cfPhase}
            cfToken={cfToken}
            tokenVerified={tokenVerified}
            hostname={hostname}
            zoneId={zoneId}
            workerService={workerService}
            proxyOk={proxyOk}
            proxyChecked={proxyChecked}
            proxySummary={proxySummary}
            proxySuggestions={proxySuggestions}
            sslDone={sslDone}
            domainDone={domainDone}
            busy={busy}
            onCfTokenChange={(v) => {
              setCfToken(v);
              setTokenVerified(false);
            }}
            onHostnameChange={setHostname}
            onZoneIdChange={setZoneId}
            onWorkerServiceChange={setWorkerService}
            onBackToStep1={() => setStep(1)}
            onBackToPhase={(phase) => {
              setCfPhase(phase);
              setStatus(null);
            }}
            onVerifyToken={() => verifyToken()}
            onVerifyZone={() => verifyZone()}
            onFixProxy={() => fixProxy()}
            onSetSsl={() => setSsl()}
            onSkipSsl={() => {
              setSslDone(true);
              setStatus("SSL skipped for now");
              setCfPhase("domain");
            }}
            onAttachDomain={() => attachDomain()}
            onSkipDomain={() => {
              setDomainDone(true);
              setStatus("Domain attach skipped");
              setStep(3);
            }}
          />
        ) : null}

        {step === 3 ? (
          <StepTurnstile
            busy={busy}
            tsToken={tsToken}
            tsVerified={tsVerified}
            widgetRef={widgetRef}
            onProvision={() => {
              setBusy(true);
              setStatus(null);
              void api<{ sitekey?: string }>("/api/admin/setup/turnstile/provision", {
                method: "POST",
                body: "{}",
              })
                .then((data) => {
                  setTsSitekey(data.sitekey ?? null);
                  setStatus("Widget ready — complete the challenge");
                })
                .catch((e) => handleApiError(e, "Provision failed"))
                .finally(() => setBusy(false));
            }}
            onVerify={() => {
              setBusy(true);
              setStatus(null);
              void api("/api/admin/setup/turnstile/verify", {
                method: "POST",
                body: JSON.stringify({ turnstileToken: tsToken }),
              })
                .then(() => {
                  setTsVerified(true);
                  setStatus("Turnstile verified");
                  setStep(4);
                })
                .catch((e) => handleApiError(e, "Verify failed"))
                .finally(() => setBusy(false));
            }}
            onBack={() => {
              setStep(2);
              setCfPhase("domain");
            }}
            onContinue={() => setStep(4)}
          />
        ) : null}

        {step === 4 ? (
          <StepQueue
            queue={queue}
            mode={mode}
            showWaiting={showWaiting}
            requireClick={requireClick}
            hold={hold}
            onQueueChange={setQueue}
            onModeChange={setMode}
            onShowWaitingChange={setShowWaiting}
            onRequireClickChange={setRequireClick}
            onHoldChange={setHold}
            onBack={() => setStep(3)}
            onContinue={() => setStep(5)}
          />
        ) : null}

        {step === 5 ? (
          <StepFinish
            title={title}
            message={message}
            primary={primary}
            accent={accent}
            bg={bg}
            surface={surface}
            text={text}
            muted={muted}
            busy={busy}
            onTitleChange={setTitle}
            onMessageChange={setMessage}
            onPrimaryChange={setPrimary}
            onAccentChange={setAccent}
            onBgChange={setBg}
            onSurfaceChange={setSurface}
            onTextChange={setText}
            onMutedChange={setMuted}
            onBack={() => setStep(4)}
            onFinish={() => void finish()}
          />
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
