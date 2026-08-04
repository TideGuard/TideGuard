import { Button, Group, List, PasswordInput, Stack, Text, TextInput } from "@mantine/core";
import { FIELD_HELP, LINKS, TOKEN_PERMISSIONS, type CfPhase } from "../../lib/setup-guidance";
import { ExtLink } from "./ExtLink";

export function StepCloudflare({
  cfPhase,
  cfToken,
  tokenVerified,
  hostname,
  zoneId,
  workerService,
  proxyOk,
  proxyChecked,
  proxySummary,
  proxySuggestions,
  sslDone,
  domainDone,
  busy,
  onCfTokenChange,
  onHostnameChange,
  onZoneIdChange,
  onWorkerServiceChange,
  onBackToStep1,
  onBackToPhase,
  onVerifyToken,
  onVerifyZone,
  onFixProxy,
  onSetSsl,
  onSkipSsl,
  onAttachDomain,
  onSkipDomain,
}: {
  cfPhase: CfPhase;
  cfToken: string;
  tokenVerified: boolean;
  hostname: string;
  zoneId: string;
  workerService: string;
  proxyOk: boolean;
  proxyChecked: boolean;
  proxySummary: string | null;
  proxySuggestions: string[];
  sslDone: boolean;
  domainDone: boolean;
  busy: boolean;
  onCfTokenChange: (v: string) => void;
  onHostnameChange: (v: string) => void;
  onZoneIdChange: (v: string) => void;
  onWorkerServiceChange: (v: string) => void;
  onBackToStep1: () => void;
  onBackToPhase: (phase: CfPhase) => void;
  onVerifyToken: () => void;
  onVerifyZone: () => void;
  onFixProxy: () => void;
  onSetSsl: () => void;
  onSkipSsl: () => void;
  onAttachDomain: () => void;
  onSkipDomain: () => void;
}) {
  if (cfPhase === "token") {
    return (
      <>
        <Text size="sm" c="dimmed">
          One-time connect: create a token in Cloudflare, paste it here, then TideGuard can manage
          the rest for you.
        </Text>

        <Stack gap="xs">
          <Text size="sm" fw={600}>
            1. Create a Custom Token
          </Text>
          <Text size="sm" c="dimmed">
            In Cloudflare: API Tokens → Create Token → Create Custom Token. Limit Zone Resources to
            your domain.
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
          {tokenVerified ? (
            <Text size="sm">
              Token verified and stored encrypted on the Worker. You will not need to paste it again
              for the rest of setup.
            </Text>
          ) : (
            <PasswordInput
              label={FIELD_HELP.apiToken.label}
              placeholder="Paste the token you just created"
              value={cfToken}
              onChange={(e) => onCfTokenChange(e.currentTarget.value)}
              autoComplete="off"
            />
          )}
        </Stack>

        <Group>
          <Button variant="default" onClick={onBackToStep1}>
            Back
          </Button>
          {tokenVerified ? (
            <>
              <Button onClick={() => onBackToPhase("zone")}>Continue</Button>
              <Button variant="subtle" onClick={() => onCfTokenChange("")}>
                Use a different token
              </Button>
            </>
          ) : (
            <Button loading={busy} onClick={onVerifyToken} disabled={cfToken.trim().length < 20}>
              Verify token
            </Button>
          )}
        </Group>
      </>
    );
  }

  if (cfPhase === "zone") {
    return (
      <>
        <Text size="sm" c="dimmed">
          Tell TideGuard which site to protect. Hostname must be proxied (orange cloud).
        </Text>
        <TextInput
          label={FIELD_HELP.hostname.label}
          description={FIELD_HELP.hostname.hint}
          value={hostname}
          onChange={(e) => onHostnameChange(e.currentTarget.value)}
        />
        <TextInput
          label={FIELD_HELP.zoneId.label}
          description={
            <>
              {FIELD_HELP.zoneId.hint} <ExtLink href={LINKS.findIds}>Find Zone ID</ExtLink>
            </>
          }
          value={zoneId}
          onChange={(e) => onZoneIdChange(e.currentTarget.value)}
          placeholder="Leave blank to auto-detect"
        />
        <TextInput
          label={FIELD_HELP.workerService.label}
          description={FIELD_HELP.workerService.hint}
          value={workerService}
          onChange={(e) => onWorkerServiceChange(e.currentTarget.value)}
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
          <Button variant="default" onClick={() => onBackToPhase("token")}>
            Back
          </Button>
          <Button loading={busy} onClick={onVerifyZone} disabled={!hostname.trim()}>
            Verify site
          </Button>
          {!proxyOk && proxyChecked ? (
            <Button variant="light" loading={busy} onClick={onFixProxy}>
              Fix setup
            </Button>
          ) : null}
        </Group>
      </>
    );
  }

  if (cfPhase === "ssl") {
    return (
      <>
        <Text size="sm" c="dimmed">
          Recommended when your origin has a valid certificate. Skip if you are not ready — you can
          set this later in Admin → Cloudflare access.
        </Text>
        <Group>
          <Button variant="default" onClick={() => onBackToPhase("zone")}>
            Back
          </Button>
          <Button loading={busy} onClick={onSetSsl}>
            Set Full (strict)
          </Button>
          <Button variant="light" onClick={onSkipSsl}>
            Skip for now
          </Button>
        </Group>
        {sslDone ? (
          <Text size="sm" c="teal">
            SSL step done
          </Text>
        ) : null}
      </>
    );
  }

  return (
    <>
      <Text size="sm" c="dimmed">
        Link your hostname to this Worker so visitors hit the waiting room. Skip if it is already
        linked — you can manage domains later in Admin → Cloudflare access.
      </Text>
      <Group>
        <Button variant="default" onClick={() => onBackToPhase("ssl")}>
          Back
        </Button>
        <Button loading={busy} onClick={onAttachDomain}>
          Attach domain
        </Button>
        <Button variant="light" onClick={onSkipDomain}>
          Skip for now
        </Button>
      </Group>
      {domainDone ? (
        <Text size="sm" c="teal">
          Domain step done
        </Text>
      ) : null}
    </>
  );
}
