import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  Group,
  Modal,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from "@mantine/core";
import { IconCopy, IconDownload } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";

type Step = "save" | "verify";

function parseWords(mnemonic: string): string[] {
  return mnemonic.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

/** Pick `count` distinct 1-based positions from 1..n, shuffled. */
function pickQuizPositions(wordCount: number, count: number): number[] {
  const indices = Array.from({ length: wordCount }, (_, i) => i + 1);
  for (let i = indices.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = indices[i]!;
    indices[i] = indices[j]!;
    indices[j] = tmp;
  }
  return indices.slice(0, Math.min(count, wordCount)).sort((a, b) => a - b);
}

function downloadPhrase(words: string[]) {
  const lines = [
    "TideGuard admin recovery phrase",
    "Keep this offline. Anyone with these words can reset your admin password.",
    "Without these words you cannot use Forgot password — only factory reset with TOKEN_SECRET.",
    "",
    ...words.map((w, i) => `${i + 1}. ${w}`),
    "",
    words.join(" "),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "tideguard-recovery-phrase.txt";
  a.click();
  URL.revokeObjectURL(url);
}

/** One-time reveal of a BIP39 English recovery phrase with numbered list + quiz. */
export function RecoveryPhraseModal({
  opened,
  mnemonic,
  onConfirm,
  title = "Save your recovery phrase",
}: {
  opened: boolean;
  mnemonic: string;
  onConfirm: () => void;
  title?: string;
}) {
  const words = useMemo(() => parseWords(mnemonic), [mnemonic]);
  const [step, setStep] = useState<Step>("save");
  const [acked, setAcked] = useState(false);
  const [quizPositions, setQuizPositions] = useState<number[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [verifyError, setVerifyError] = useState<string | null>(null);

  useEffect(() => {
    if (!opened) return;
    setStep("save");
    setAcked(false);
    setQuizPositions([]);
    setAnswers({});
    setVerifyError(null);
  }, [opened, mnemonic]);

  function goToVerify() {
    if (!acked) return;
    setQuizPositions(pickQuizPositions(words.length, 3));
    setAnswers({});
    setVerifyError(null);
    setStep("verify");
  }

  function submitVerify() {
    const ok = quizPositions.every((pos) => {
      const expected = words[pos - 1] ?? "";
      const given = (answers[pos] ?? "").trim().toLowerCase();
      return given === expected;
    });
    if (!ok) {
      setVerifyError("Those words do not match. Check your saved list and try again.");
      return;
    }
    onConfirm();
  }

  async function copyList() {
    const text = words.map((w, i) => `${i + 1}. ${w}`).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      notifications.show({ color: "teal", message: "Numbered list copied" });
    } catch {
      notifications.show({ color: "red", message: "Could not copy — select and copy manually" });
    }
  }

  async function copyPhrase() {
    try {
      await navigator.clipboard.writeText(words.join(" "));
      notifications.show({ color: "teal", message: "Phrase copied" });
    } catch {
      notifications.show({ color: "red", message: "Could not copy — select and copy manually" });
    }
  }

  return (
    <Modal
      opened={opened}
      onClose={() => {
        /* must confirm — do not dismiss without ack */
      }}
      closeOnClickOutside={false}
      closeOnEscape={false}
      withCloseButton={false}
      title={step === "save" ? title : "Confirm your recovery phrase"}
      centered
      size="md"
    >
      {step === "save" ? (
        <Stack>
          <Alert color="orange" title="This is your only password-reset key">
            <Text size="sm">
              There is no reset email. Without these 12 words you{" "}
              <strong>cannot use Forgot password</strong> — only a factory reset with{" "}
              <code>TOKEN_SECRET</code>, which wipes admin setup. Store them offline (paper or a
              password manager), not in chat or screenshots.
            </Text>
          </Alert>

          <Text size="sm">
            Write these <strong>12 words in order</strong>. Anyone with this phrase can reset your
            admin password. TideGuard never shows it again.
          </Text>

          <SimpleGrid cols={2} spacing="xs">
            {words.map((w, i) => (
              <Group
                key={`${i}-${w}`}
                gap="xs"
                wrap="nowrap"
                p="xs"
                style={{
                  borderRadius: "var(--mantine-radius-sm)",
                  background: "var(--mantine-color-dark-6)",
                  border: "1px solid var(--mantine-color-dark-4)",
                }}
              >
                <Text
                  size="xs"
                  c="dimmed"
                  w={22}
                  ta="right"
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {i + 1}
                </Text>
                <Text size="sm" ff="monospace" fw={600}>
                  {w}
                </Text>
              </Group>
            ))}
          </SimpleGrid>

          <Group gap="xs">
            <Button
              size="xs"
              variant="default"
              leftSection={<IconCopy size={14} />}
              onClick={() => void copyList()}
            >
              Copy list
            </Button>
            <Button
              size="xs"
              variant="default"
              leftSection={<IconCopy size={14} />}
              onClick={() => void copyPhrase()}
            >
              Copy phrase
            </Button>
            <Button
              size="xs"
              variant="default"
              leftSection={<IconDownload size={14} />}
              onClick={() => downloadPhrase(words)}
            >
              Download .txt
            </Button>
          </Group>

          <Checkbox
            checked={acked}
            onChange={(e) => setAcked(e.currentTarget.checked)}
            label="I understand I cannot reset my password without these words, and I have stored them securely offline"
          />

          <Button onClick={goToVerify} disabled={!acked || words.length !== 12}>
            I saved these words — verify
          </Button>
        </Stack>
      ) : (
        <Stack>
          <Text size="sm">
            Enter the words at the positions below (from your saved list). This confirms you can
            recover your account later.
          </Text>

          {quizPositions.map((pos) => (
            <TextInput
              key={pos}
              label={`Word #${pos}`}
              placeholder={`Word at position ${pos}`}
              value={answers[pos] ?? ""}
              onChange={(e) => {
                setVerifyError(null);
                setAnswers((prev) => ({ ...prev, [pos]: e.currentTarget.value }));
              }}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              styles={{ input: { fontFamily: "var(--mantine-font-family-monospace)" } }}
            />
          ))}

          {verifyError ? (
            <Text size="sm" c="red">
              {verifyError}
            </Text>
          ) : null}

          <Group justify="space-between">
            <UnstyledButton onClick={() => setStep("save")}>
              <Text size="sm" c="dimmed">
                ← Back to list
              </Text>
            </UnstyledButton>
            <Button
              onClick={submitVerify}
              disabled={quizPositions.some((pos) => !(answers[pos] ?? "").trim())}
            >
              Confirm & continue
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
