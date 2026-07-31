import type { ReactNode } from "react";
import { Anchor } from "@mantine/core";

export function ExtLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Anchor href={href} target="_blank" rel="noreferrer" size="sm">
      {children}
    </Anchor>
  );
}
