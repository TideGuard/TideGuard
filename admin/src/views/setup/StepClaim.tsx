import { Button, Group, PasswordInput, Text, TextInput, Anchor } from "@mantine/core";
import { useState } from "react";
import { LINKS } from "../../lib/setup-guidance";
import { PasswordChecklist } from "../dashboard/PasswordChecklist";
import { TokenSecretAckModal } from "./TokenSecretAckModal";
import { TosAckPanel } from "./TosAckPanel";

export function StepClaim({
  claimed,
  signedInAs,
  claimedUsername,
  tokenSecret,
  username,
  password,
  confirmPassword,
  busy,
  tosVersion,
  tosSummary,
  tosUrl,
  onTokenSecretChange,
  onUsernameChange,
  onPasswordChange,
  onConfirmChange,
  onClaim,
  onContinue,
  onNeedLogin,
}: {
  claimed: boolean;
  signedInAs: string | null | undefined;
  claimedUsername: string | null | undefined;
  tokenSecret: string;
  username: string;
  password: string;
  confirmPassword: string;
  busy: boolean;
  tosVersion: number;
  tosSummary: string;
  tosUrl: string;
  onTokenSecretChange: (v: string) => void;
  onUsernameChange: (v: string) => void;
  onPasswordChange: (v: string) => void;
  onConfirmChange: (v: string) => void;
  onClaim: () => void;
  onContinue: () => void;
  onNeedLogin: () => void;
}) {
  const [secretAcked, setSecretAcked] = useState(false);
  const [tosAcked, setTosAcked] = useState(false);

  if (claimed || signedInAs) {
    return (
      <>
        <Text size="sm">
          Account locked in as <strong>{signedInAs ?? claimedUsername}</strong>. Continue Cloudflare
          setup, or sign in again if your session expired.
        </Text>
        <Group>
          <Button onClick={onContinue}>Continue setup</Button>
          <Button variant="default" onClick={onNeedLogin}>
            Sign in
          </Button>
        </Group>
      </>
    );
  }

  return (
    <>
      <TokenSecretAckModal opened={!secretAcked} onConfirm={() => setSecretAcked(true)} />

      <PasswordInput
        label="TOKEN_SECRET"
        description={
          <>
            Same value as the Worker secret (generate at tideguard.dev/token). Claim locks your
            admin account immediately.{" "}
            <Anchor href={LINKS.docsGettingStarted} target="_blank" rel="noreferrer" size="sm">
              Getting started
            </Anchor>
          </>
        }
        value={tokenSecret}
        onChange={(e) => onTokenSecretChange(e.currentTarget.value)}
        autoComplete="off"
        disabled={!secretAcked}
      />
      <TextInput
        label="Admin username"
        value={username}
        onChange={(e) => onUsernameChange(e.currentTarget.value)}
        autoComplete="username"
      />
      <PasswordInput
        label="Password"
        description="8–128 chars, at least one uppercase letter, and a digit or symbol."
        value={password}
        onChange={(e) => onPasswordChange(e.currentTarget.value)}
        autoComplete="new-password"
      />
      <PasswordInput
        label="Confirm password"
        value={confirmPassword}
        onChange={(e) => onConfirmChange(e.currentTarget.value)}
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
      <Button loading={busy} onClick={() => onClaim()} disabled={!secretAcked || !tosAcked}>
        Claim & continue
      </Button>
    </>
  );
}
