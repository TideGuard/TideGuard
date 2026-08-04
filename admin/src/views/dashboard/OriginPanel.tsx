import { useEffect, useState } from "react";
import { Alert, Button, Checkbox, Stack, Text, TextInput, Textarea } from "@mantine/core";
import { api } from "../../lib/api";
import { isDemoMode } from "../../lib/demo-mode";
import type { AdminState } from "../../lib/types";
import { LINKS } from "../../lib/setup-guidance";
import { DocHint } from "./DocHint";
import { Panel } from "./Panel";
import { notifyError, notifyOk } from "./notify";

export function OriginPanel({
  state,
  onSaved,
}: {
  state: AdminState;
  onSaved: () => Promise<void>;
}) {
  const o = state.origin;
  const [enabled, setEnabled] = useState(Boolean(o.enabled));
  const [originUrl, setOriginUrl] = useState(o.originUrl ?? "");
  const [protectAll, setProtectAll] = useState(o.protectAll !== false);
  const [prefixes, setPrefixes] = useState(
    Array.isArray(o.pathPrefixes) ? o.pathPrefixes.join("\n") : "",
  );

  useEffect(() => {
    setEnabled(Boolean(o.enabled));
    setOriginUrl(o.originUrl ?? "");
    setProtectAll(o.protectAll !== false);
    setPrefixes(Array.isArray(o.pathPrefixes) ? o.pathPrefixes.join("\n") : "");
  }, [o.enabled, o.originUrl, o.protectAll, o.pathPrefixes]);

  const demo = isDemoMode({
    enabled,
    protectAll,
    pathPrefixes: prefixes
      .split(/[,\n]+/)
      .map((p) => p.trim())
      .filter(Boolean),
  });

  return (
    <Panel
      id="origin"
      title="Origin proxy"
      description={<DocHint href={LINKS.docsOrigin} label="Protecting a domain" />}
    >
      <Stack>
        {demo ? (
          <Alert color="blue" title="Demo mode">
            <Text size="sm">
              Origin is not gating traffic. Smoke-test at <code>/demo</code>, then enable proxy +
              protect-all (or path prefixes) before a real surge.
            </Text>
          </Alert>
        ) : null}
        <Checkbox
          label="Enable origin proxy"
          checked={enabled}
          onChange={(e) => setEnabled(e.currentTarget.checked)}
        />
        <TextInput
          label="Origin URL"
          value={originUrl}
          onChange={(e) => setOriginUrl(e.currentTarget.value)}
        />
        <Checkbox
          label="Protect all non-TideGuard paths"
          checked={protectAll}
          onChange={(e) => setProtectAll(e.currentTarget.checked)}
        />
        <Textarea
          label="Path prefixes (one per line)"
          description={
            protectAll
              ? "Disabled while protect-all is on. Turn protect-all off to gate only specific paths."
              : "Only these path prefixes require admission (e.g. /checkout and /account). Commas also work. Queue name for gated paths comes from the control-room queue (toolbar / Branding)."
          }
          value={prefixes}
          onChange={(e) => setPrefixes(e.currentTarget.value)}
          disabled={protectAll}
          autosize
          minRows={3}
          placeholder={"/checkout\n/account"}
        />
        <Alert color="gray" title="Queues & paths">
          <Text size="sm">
            One Worker uses one default queue from setup (shown in the header). Path prefixes decide{" "}
            <em>which URLs</em> are gated; they do not create separate queues. For multiple named
            queues, call <code>/join</code> with different <code>queue</code> values from your own
            UI, or run separate Workers.
          </Text>
        </Alert>
        <Button
          onClick={() => {
            if (!window.confirm("Save origin proxy settings?")) return;
            void api("/api/admin/origin", {
              method: "PUT",
              body: JSON.stringify({
                enabled,
                originUrl,
                protectAll,
                pathPrefixes: prefixes,
                queue: state.queue,
              }),
            })
              .then(() => {
                notifyOk("Origin saved");
                return onSaved();
              })
              .catch(notifyError);
          }}
        >
          Save origin proxy
        </Button>
      </Stack>
    </Panel>
  );
}
