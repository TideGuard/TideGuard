import { List, Text } from "@mantine/core";
import { passwordChecks } from "../../lib/setup-guidance";

export function PasswordChecklist({ password, confirm }: { password: string; confirm: string }) {
  const pwd = passwordChecks(password, confirm);
  const items = [
    { ok: pwd.length, label: "At least 8 characters" },
    { ok: pwd.upper, label: "One uppercase letter" },
    { ok: pwd.digitOrSymbol, label: "One digit or symbol" },
    { ok: pwd.match, label: "Passwords match" },
  ] as const;

  return (
    <List size="sm" spacing={4} c="dimmed" aria-label="Password requirements">
      {items.map((item) => (
        <List.Item key={item.label} c={item.ok ? "teal" : undefined}>
          <Text span size="sm" aria-label={`${item.label}: ${item.ok ? "met" : "not met"}`}>
            <span aria-hidden="true">{item.ok ? "✓" : "○"} </span>
            {item.label}
          </Text>
        </List.Item>
      ))}
    </List>
  );
}
