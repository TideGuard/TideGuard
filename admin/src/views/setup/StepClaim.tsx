import { Button, Group, List, PasswordInput, Text, TextInput } from "@mantine/core";
import { passwordChecks } from "../../lib/setup-guidance";

export function StepClaim({
  claimed,
  signedInAs,
  claimedUsername,
  tokenSecret,
  username,
  password,
  confirmPassword,
  busy,
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
  onTokenSecretChange: (v: string) => void;
  onUsernameChange: (v: string) => void;
  onPasswordChange: (v: string) => void;
  onConfirmChange: (v: string) => void;
  onClaim: () => void;
  onContinue: () => void;
  onNeedLogin: () => void;
}) {
  const pwd = passwordChecks(password, confirmPassword);

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
      <PasswordInput
        label="TOKEN_SECRET"
        description="Same value as the Worker secret (generate at tideguard.dev/token). Claim locks your admin account immediately."
        value={tokenSecret}
        onChange={(e) => onTokenSecretChange(e.currentTarget.value)}
      />
      <TextInput
        label="Admin username"
        value={username}
        onChange={(e) => onUsernameChange(e.currentTarget.value)}
      />
      <PasswordInput
        label="Password"
        description="8–128 chars, at least one uppercase letter, and a digit or symbol."
        value={password}
        onChange={(e) => onPasswordChange(e.currentTarget.value)}
      />
      <PasswordInput
        label="Confirm password"
        value={confirmPassword}
        onChange={(e) => onConfirmChange(e.currentTarget.value)}
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
      <Button loading={busy} onClick={onClaim}>
        Claim & continue
      </Button>
    </>
  );
}
