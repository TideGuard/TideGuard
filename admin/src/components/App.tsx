import { useEffect, useRef, useState } from "react";
import { Button, Card, PasswordInput, Stack, Text, TextInput, Title } from "@mantine/core";
import { api, ApiError } from "../lib/api";
import type { AdminState, BootstrapResponse } from "../lib/types";
import { isPasswordReady } from "../lib/setup-guidance";
import { ensureTurnstile } from "../views/setup/helpers";
import { PasswordChecklist } from "../views/dashboard/PasswordChecklist";
import { Dashboard } from "./Dashboard";
import { SetupWizard } from "./SetupWizard";

type View = "loading" | "login" | "invite" | "wizard" | "dashboard";

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
          `/api/admin/state?queue=${encodeURIComponent(bootData.defaultQueue)}`,
        );
        if (!bootData.setupComplete) {
          setView("wizard");
          return;
        }
        setState(dash);
        setView("dashboard");
      } catch (e) {
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

  async function afterAuth(bootData: BootstrapResponse) {
    if (!bootData.setupComplete) {
      setView("wizard");
      return;
    }
    const dash = await api<AdminState>(
      `/api/admin/state?queue=${encodeURIComponent(bootData.defaultQueue)}`,
    );
    setState(dash);
    setView("dashboard");
  }

  if (view === "loading") {
    return (
      <Text c="dimmed" ta="center" py="xl">
        Loading…
      </Text>
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
            `/api/admin/state?queue=${encodeURIComponent(refreshed.defaultQueue)}`,
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
        onSuccess={async () => {
          window.history.replaceState({}, "", "/admin/");
          const dash = await api<AdminState>(
            `/api/admin/state?queue=${encodeURIComponent(bootstrap.defaultQueue)}`,
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
        await afterAuth(bootData);
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
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(error);
  const widgetRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);

  useEffect(() => {
    if (!requireTurnstile || !sitekey || !widgetRef.current) return;
    ensureTurnstile().then(() => {
      if (!widgetRef.current || !window.turnstile) return;
      if (widgetId.current) window.turnstile.remove(widgetId.current);
      widgetId.current = window.turnstile.render(widgetRef.current, {
        sitekey,
        callback: (t) => setTurnstileToken(t),
        "expired-callback": () => setTurnstileToken(null),
      });
    });
  }, [sitekey, requireTurnstile]);

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
        <Title order={3}>TideGuard Admin</Title>
        <Text size="sm" c="dimmed">
          {incompleteSetup
            ? "Sign in to finish first-time setup."
            : "Sign in to manage the waiting room."}
        </Text>
        <TextInput
          label="Username"
          value={username}
          onChange={(e) => setUsername(e.currentTarget.value)}
          autoComplete="username"
        />
        <PasswordInput
          label="Password"
          value={password}
          onChange={(e) => setPassword(e.currentTarget.value)}
          autoComplete="current-password"
        />
        {requireTurnstile ? <div ref={widgetRef} /> : null}
        {msg ? (
          <Text size="sm" c="red">
            {msg}
          </Text>
        ) : null}
        <Button
          loading={busy}
          onClick={() => {
            setBusy(true);
            setMsg(null);
            void api("/api/admin/login", {
              method: "POST",
              body: JSON.stringify({
                username,
                password,
                ...(requireTurnstile ? { turnstileToken } : {}),
              }),
            })
              .then(() => onSuccess())
              .catch((e) => {
                setMsg(e instanceof Error ? e.message : "Login failed");
                if (widgetId.current && window.turnstile) window.turnstile.reset(widgetId.current);
                setTurnstileToken(null);
              })
              .finally(() => setBusy(false));
          }}
        >
          Sign in
        </Button>
      </Stack>
    </Card>
  );
}

function InviteView({
  sitekey,
  token,
  onSuccess,
}: {
  sitekey: string | null;
  token: string;
  onSuccess: () => Promise<void>;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirm] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const widgetRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);

  useEffect(() => {
    if (!sitekey || !widgetRef.current) return;
    ensureTurnstile().then(() => {
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
        <div ref={widgetRef} />
        {msg ? (
          <Text size="sm" c="red">
            {msg}
          </Text>
        ) : null}
        <Button
          loading={busy}
          disabled={!isPasswordReady(password, confirmPassword)}
          onClick={() => {
            setBusy(true);
            setMsg(null);
            void api("/api/admin/invites/accept", {
              method: "POST",
              body: JSON.stringify({
                token,
                username,
                password,
                confirmPassword,
                turnstileToken,
              }),
            })
              .then(() => onSuccess())
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
