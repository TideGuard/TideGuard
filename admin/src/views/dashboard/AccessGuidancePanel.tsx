import { Alert, Anchor, List, Stack, Text } from "@mantine/core";
import { Panel } from "./Panel";
import { DocHint } from "./DocHint";
import { LINKS } from "../../lib/setup-guidance";

/** Docs-only: put Cloudflare Access / Zero Trust in front of /admin. */
export function AccessGuidancePanel() {
  return (
    <Panel
      id="cf-access"
      title="Protect /admin with Cloudflare Access"
      description={<DocHint href={LINKS.docsSecurity} label="Security policy" />}
    >
      <Stack>
        <Alert color="blue" title="Recommended for production">
          <Text size="sm">
            TideGuard already requires username + password + Turnstile. For high-stakes launches,
            put <strong>Cloudflare Access (Zero Trust)</strong> in front of <code>/admin</code> so
            only your IdP users can reach the control room.
          </Text>
        </Alert>
        <Text size="sm" fw={600}>
          Suggested setup
        </Text>
        <List size="sm" spacing="xs">
          <List.Item>
            In Zero Trust → Access → Applications, create a self-hosted app for your TideGuard
            hostname path <code>/admin*</code> (and optionally <code>/api/admin*</code>).
          </List.Item>
          <List.Item>
            Allow only your operator emails / IdP groups. Keep TideGuard login + Turnstile as a
            second factor inside the Worker.
          </List.Item>
          <List.Item>
            Do <strong>not</strong> put Access on <code>/wait</code>, <code>/join</code>,{" "}
            <code>/status</code>, or visitor paths — those must stay public for the waiting room.
          </List.Item>
          <List.Item>Confirm Deploy / Pass queue still works from an allowed identity.</List.Item>
        </List>
        <Anchor
          href="https://developers.cloudflare.com/cloudflare-one/applications/configure-apps/self-hosted-public-app/"
          target="_blank"
          rel="noreferrer"
          size="sm"
        >
          Cloudflare Access docs →
        </Anchor>
      </Stack>
    </Panel>
  );
}
