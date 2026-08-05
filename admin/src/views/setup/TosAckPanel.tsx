import { Anchor, Checkbox, Stack, Text, Title } from "@mantine/core";
import { LINKS } from "../../lib/setup-guidance";

const DEFAULT_SUMMARY = [
  "TideGuard is MIT-licensed open-source software provided as is, without warranty. You deploy and operate it on your own Cloudflare account.",
  "You are responsible for your secrets, configuration, invited admins, visitor-facing experience, and legal compliance for your events.",
  "The authors do not run your waiting room as a hosted service under these terms. Full text is linked below.",
].join("\n\n");

export function TosAckPanel({
  tosVersion,
  tosSummary,
  tosUrl,
  checked,
  onCheckedChange,
  updated = false,
}: {
  tosVersion: number;
  tosSummary?: string | null;
  tosUrl?: string | null;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  /** True when re-accepting after a ToS version bump. */
  updated?: boolean;
}) {
  const summary = (tosSummary && tosSummary.trim()) || DEFAULT_SUMMARY;
  const url = tosUrl || LINKS.terms;

  return (
    <Stack gap="sm">
      <div>
        <Title order={5}>Terms of Service (version {tosVersion})</Title>
        {updated ? (
          <Text size="sm" c="dimmed" mt={4}>
            Please review the updated terms (version {tosVersion}) before continuing.
          </Text>
        ) : null}
      </div>
      <Text size="sm" style={{ whiteSpace: "pre-wrap" }} c="dimmed">
        {summary}
      </Text>
      <Text size="sm">
        Full text:{" "}
        <Anchor href={url} target="_blank" rel="noreferrer">
          TERMS.md
        </Anchor>
        {" · "}
        <Anchor href={LINKS.license} target="_blank" rel="noreferrer">
          MIT License
        </Anchor>
      </Text>
      <Checkbox
        checked={checked}
        onChange={(e) => onCheckedChange(e.currentTarget.checked)}
        label={`I have read and accept the Terms of Service (version ${tosVersion})`}
      />
    </Stack>
  );
}
