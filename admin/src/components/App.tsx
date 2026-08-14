import { useEffect, useRef, useState } from "react";
import {
  Anchor,
  Button,
  Card,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Textarea,
  Title,
} from "@mantine/core";
import { api, ApiError } from "../lib/api";
import type { AdminState, BootstrapResponse } from "../lib/types";
import { isPasswordReady } from "../lib/setup-guidance";
import { ensureTurnstile } from "../views/setup/helpers";
import { PasswordChecklist } from "../views/dashboard/PasswordChecklist";
import { RecoveryPhraseModal } from "../views/setup/RecoveryPhraseModal";
import { TosAckPanel } from "../views/setup/TosAckPanel";
import { TosGate } from "../views/setup/TosGate";
import { Dashboard } from "./Dashboard";
import { SetupWizard } from "./SetupWizard";

type View = "loading" | "login" | "invite" | "wizard" | "dashboard" | "tos";

function dashboardQueue(defaultQueue: string): string {
  return new URLSearchParams(window.location.search).get("queue") || defaultQueue;
}

function isTosRequiredError(e: unknown): boolean {
  if (!(e instanceof ApiError) || e.status !== 403) return false;
  const code =
    e.body && typeof e.body === "object" && e.body !== null && "error" in e.body
      ? (e.body as { error?: { code?: string } }).error?.code
      : undefined;
  return code === "tos_required";
}

export function App() {
  const [view, setView] = useState<View>("loading");
  const [bootstrap, setBootstrap] = useState<BootstrapResponse | null>(null);
  const [state, setState] = useState<AdminState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inviteToken = new URLSearchParams(window.location.search).get("invite");

  useEffect(() => {
    void boot();
  }, []);

  async function boot() {
    setError(null);
    try {
      const bootData = await api<BootstrapResponse>("/api/admin/bootstrap");
      setBootstrap(bootData);

      if (!bootData.claimed) {
        setView("wizard");
        return;
      }

      if (inviteToken && bootData.setupComplete) {
        setView("invite");
        return;
      }

      try {
        const dash = await api<AdminState>(
          `/api/admin/state?queue=${encodeURIComponent(dashboardQueue(bootData.defaultQueue))}`,
        );
        if (!bootData.setupComplete) {
          setView("wizard");
          return;
        }
        setState(dash);
        setView("dashboard");
      } catch (e) {
        if (isTosRequiredError(e)) {
          setView("tos");
          return;
        }
        if (e instanceof ApiError && e.status === 401) {
          setView("login");
          return;
        }
        throw e;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load admin");
      setView("login");
    }
  }

  async function afterAuth() {
    const refreshed = await api<BootstrapResponse>("/api/admin/bootstrap");
    setBootstrap(refreshed);

    if (refreshed.acceptedTosVersion !== refreshed.tosVersion) {
      setView("tos");
      return;
    }

    if (!refreshed.setupComplete) {
      setView("wizard");
      return;
    }

    try {
      const dash = await api<AdminState>(
        `/api/admin/state?queue=${encodeURIComponent(dashboardQueue(refreshed.defaultQueue))}`,
      );
      setState(dash);
      setView("dashboard");
    } catch (e) {
      if (isTosRequiredError(e)) {
        setView("tos");
        return;
      }
      throw e;
    }
  }

  if (view === "loading") {
    return (
      <Text c="dimmed" ta="center" py="xl">
        Loading…
      </Text>
    );
  }

  if (view === "tos" && bootstrap) {
    return (
      <TosGate
        tosVersion={bootstrap.tosVersion}
        tosSummary={bootstrap.tosSummary}
        tosUrl={bootstrap.tosUrl}
        onAccepted={async () => {
          const refreshed = await api<BootstrapResponse>("/api/admin/bootstrap");
          setBootstrap(refreshed);
          if (!refreshed.setupComplete) {
            setView("wizard");
            return;
          }
          const dash = await api<AdminState>(
            `/api/admin/state?queue=${encodeURIComponent(dashboardQueue(refreshed.defaultQueue))}`,
          );
          setState(dash);
          setView("dashboard");
        }}
      />
    );
  }

  if (view === "wizard" && bootstrap) {
    return (
      <SetupWizard
        bootstrap={bootstrap}
        onComplete={async () => {
          try {
            sessionStorage.removeItem("tg-first-run");
          } catch {
            /* ignore */
          }
          const refreshed = await api<BootstrapResponse>("/api/admin/bootstrap");
          setBootstrap(refreshed);
          const dash = await api<AdminState>(
            `/api/admin/state?queue=${encodeURIComponent(dashboardQueue(refreshed.defaultQueue))}`,
          );
          setState(dash);
          setView("dashboard");
        }}
        onNeedLogin={() => setView("login")}
      />
    );
  }

  if (view === "invite" && bootstrap && inviteToken) {
    return (
      <InviteView
        sitekey={bootstrap.turnstileSitekey}
        token={inviteToken}
        tosVersion={bootstrap.tosVersion}
        tosSummary={bootstrap.tosSummary}
        tosUrl={bootstrap.tosUrl}
        onSuccess={async () => {
          window.history.replaceState({}, "", "/admin/");
          const refreshed = await api<BootstrapResponse>("/api/admin/bootstrap");
          setBootstrap(refreshed);
          const dash = await api<AdminState>(
            `/api/admin/state?queue=${encodeURIComponent(dashboardQueue(refreshed.defaultQueue))}`,
          );
          setState(dash);
          setView("dashboard");
        }}
      />
    );
  }

  if (view === "dashboard" && state) {
    return (
      <Dashboard
        initial={state}
        onLogout={() => {
          setState(null);
          setView("login");
        }}
      />
    );
  }

  return (
    <LoginView
      sitekey={bootstrap?.turnstileSitekey ?? null}
      requireTurnstile={Boolean(bootstrap?.setupComplete && bootstrap.turnstileSitekey)}
      error={error}
      incompleteSetup={Boolean(bootstrap?.claimed && !bootstrap.setupComplete)}
      onSuccess={async () => {
        const bootData = bootstrap ?? (await api<BootstrapResponse>("/api/admin/bootstrap"));
        setBootstrap(bootData);
        await afterAuth();
      }}
    />
  );
}

function LoginView({
  sitekey,
  requireTurnstile,
  error,
  incompleteSetup,
  onSuccess,
}: {
  sitekey: string | null;
  requireTurnstile: boolean;
  error: string | null;
  incompleteSetup: boolean;
  onSuccess: () => Promise<void>;
}) {
  const [mode, setMode] = useState<"login" | "recover">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirm] = useState("");
  const [mnemonic, setMnemonic] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(error);
  const widgetRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);

  useEffect(() => {
    if (!requireTurnstile || !sitekey || !widgetRef.current) return;
    void ensureTurnstile().then(() => {
      if (!widgetRef.current || !window.turnstile) return;
      if (widgetId.current) window.turnstile.remove(widgetId.current);
      widgetId.current = window.turnstile.render(widgetRef.current, {
        sitekey,
        callback: (t) => setTurnstileToken(t),
        "expired-callback": () => setTurnstileToken(null),
      });
    });
  }, [sitekey, requireTurnstile, mode]);

  return (
    <Card
      maw={420}
      mx="auto"
      withBorder
      bg="dark.7"
      mt="xl"
      style={{ borderColor: "rgba(232,241,245,0.14)" }}
    >
      <Stack>
        <Title order={3}>{mode === "login" ? "TideGuard Admin" : "Reset password"}</Title>
        <Text size="sm" c="dimmed">
          {mode === "recover"
            ? "Enter your username, 12-word recovery phrase, and a new password."
            : incompleteSetup
              ? "Sign in to finish first-time setup."
              : "Sign in to manage the waiting room."}
        </Text>
        <TextInput
          label="Username"
          value={username}
          onChange={(e) => setUsername(e.currentTarget.value)}
          autoComplete="username"
        />
        {mode === "login" ? (
          <PasswordInput
            label="Password"
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
            autoComplete="current-password"
          />
        ) : (
          <>
            <Textarea
              label="Recovery phrase"
              description="12 words in order, as shown when you claimed or accepted an invite"
              value={mnemonic}
              onChange={(e) => setMnemonic(e.currentTarget.value)}
              autosize
              minRows={3}
              styles={{ input: { fontFamily: "var(--mantine-font-family-monospace)" } }}
            />
            <PasswordInput
              label="New password"
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
              autoComplete="new-password"
            />
            <PasswordInput
              label="Confirm new password"
              value={confirmPassword}
              onChange={(e) => setConfirm(e.currentTarget.value)}
              autoComplete="new-password"
            />
            <PasswordChecklist password={password} confirm={confirmPassword} />
          </>
        )}
        {requireTurnstile ? <div ref={widgetRef} /> : null}
        {msg ? (
          <Text size="sm" c="red">
            {msg}
          </Text>
        ) : null}
        <Button
          loading={busy}
          disabled={mode === "recover" && !isPasswordReady(password, confirmPassword)}
          onClick={() => {
            setBusy(true);
            setMsg(null);
            const path = mode === "login" ? "/api/admin/login" : "/api/admin/password/recover";
            const body =
              mode === "login"
                ? {
                    username,
                    password,
                    ...(requireTurnstile ? { turnstileToken } : {}),
                  }
                : {
                    username,
                    mnemonic,
                    password,
                    confirmPassword,
                    ...(requireTurnstile ? { turnstileToken } : {}),
                  };
            void api(path, {
              method: "POST",
              body: JSON.stringify(body),
            })
              .then(() => onSuccess())
              .catch((e) => {
                setMsg(e instanceof Error ? e.message : "Request failed");
                if (widgetId.current && window.turnstile) window.turnstile.reset(widgetId.current);
                setTurnstileToken(null);
              })
              .finally(() => setBusy(false));
          }}
        >
          {mode === "login" ? "Sign in" : "Reset password"}
        </Button>
        {!incompleteSetup ? (
          <Anchor
            component="button"
            type="button"
            size="sm"
            onClick={() => {
              setMode(mode === "login" ? "recover" : "login");
              setMsg(null);
              setPassword("");
              setConfirm("");
              setMnemonic("");
            }}
          >
            {mode === "login" ? "Forgot password?" : "Back to sign in"}
          </Anchor>
        ) : null}
      </Stack>
    </Card>
  );
}

function InviteView({
  sitekey,
  token,
  tosVersion,
  tosSummary,
  tosUrl,
  onSuccess,
}: {
  sitekey: string | null;
  token: string;
  tosVersion: number;
  tosSummary: string;
  tosUrl: string;
  onSuccess: () => Promise<void>;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirm] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [tosAcked, setTosAcked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [recoveryMnemonic, setRecoveryMnemonic] = useState<string | null>(null);
  const widgetRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);

  useEffect(() => {
    if (!sitekey || !widgetRef.current) return;
    void ensureTurnstile().then(() => {
      if (!widgetRef.current || !window.turnstile) return;
      widgetId.current = window.turnstile.render(widgetRef.current, {
        sitekey,
        callback: (t) => setTurnstileToken(t),
        "expired-callback": () => setTurnstileToken(null),
      });
    });
  }, [sitekey]);

  return (
    <Card
      maw={420}
      mx="auto"
      withBorder
      bg="dark.7"
      mt="xl"
      style={{ borderColor: "rgba(232,241,245,0.14)" }}
    >
      <RecoveryPhraseModal
        opened={Boolean(recoveryMnemonic)}
        mnemonic={recoveryMnemonic ?? ""}
        onConfirm={() => {
          setRecoveryMnemonic(null);
          void onSuccess();
        }}
      />
      <Stack>
        <Title order={3}>Join team</Title>
        <TextInput
          label="Username"
          value={username}
          onChange={(e) => setUsername(e.currentTarget.value)}
          autoComplete="username"
        />
        <PasswordInput
          label="Password"
          description="8–128 chars, at least one uppercase letter, and a digit or symbol."
          value={password}
          onChange={(e) => setPassword(e.currentTarget.value)}
          autoComplete="new-password"
        />
        <PasswordInput
          label="Confirm password"
          value={confirmPassword}
          onChange={(e) => setConfirm(e.currentTarget.value)}
          autoComplete="new-password"
        />
        <PasswordChecklist password={password} confirm={confirmPassword} />
        <TosAckPanel
          tosVersion={tosVersion}
          tosSummary={tosSummary}
          tosUrl={tosUrl}
          checked={tosAcked}
          onCheckedChange={setTosAcked}
        />
        <div ref={widgetRef} />
        {msg ? (
          <Text size="sm" c="red">
            {msg}
          </Text>
        ) : null}
        <Button
          loading={busy}
          disabled={!isPasswordReady(password, confirmPassword) || !tosAcked}
          onClick={() => {
            setBusy(true);
            setMsg(null);
            void api<{ recoveryMnemonic?: string }>("/api/admin/invites/accept", {
              method: "POST",
              body: JSON.stringify({
                token,
                username,
                password,
                confirmPassword,
                turnstileToken,
                acceptedTosVersion: tosVersion,
              }),
            })
              .then((result) => {
                if (result.recoveryMnemonic) {
                  setRecoveryMnemonic(result.recoveryMnemonic);
                } else {
                  return onSuccess();
                }
              })
              .catch((e) => {
                setMsg(e instanceof Error ? e.message : "Invite failed");
                if (widgetId.current && window.turnstile) window.turnstile.reset(widgetId.current);
              })
              .finally(() => setBusy(false));
          }}
        >
          Join team
        </Button>
      </Stack>
    </Card>
  );
}
