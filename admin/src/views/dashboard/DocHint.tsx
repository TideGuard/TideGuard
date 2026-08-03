import { Anchor, Text } from "@mantine/core";

/** External docs deep link shown under panel titles. */
export function DocHint({ href, label = "Guide" }: { href: string; label?: string }) {
  return (
    <Text size="sm" c="dimmed">
      <Anchor href={href} target="_blank" rel="noreferrer" size="sm">
        {label}
      </Anchor>
    </Text>
  );
}
