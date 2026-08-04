import type { ReactNode } from "react";
import { Stack, Text, Title } from "@mantine/core";

/** Section surface for interactive admin panels (border, not nested cards). */
export function Panel({
  id,
  title,
  description,
  children,
  actions,
}: {
  id?: string;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section id={id} className="tg-panel" aria-labelledby={id ? `${id}-title` : undefined}>
      <Stack gap="md">
        <div className="tg-panel-head">
          <div>
            <Title order={3} id={id ? `${id}-title` : undefined} className="tg-panel-title">
              {title}
            </Title>
            {description ? (
              <Text size="sm" c="dimmed" mt={4}>
                {description}
              </Text>
            ) : null}
          </div>
          {actions ? <div className="tg-panel-actions">{actions}</div> : null}
        </div>
        {children}
      </Stack>
    </section>
  );
}
