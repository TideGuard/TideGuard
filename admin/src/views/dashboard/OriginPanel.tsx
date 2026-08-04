import { useState } from "react";
import { Button, Checkbox, Stack, TextInput } from "@mantine/core";
import { api } from "../../lib/api";
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
    Array.isArray(o.pathPrefixes) ? o.pathPrefixes.join(",") : "",
  );

  return (
    <Panel
      id="origin"
      title="Origin proxy"
      description={<DocHint href={LINKS.docsOrigin} label="Protecting a domain" />}
    >
      <Stack>
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
        <TextInput
          label="Path prefixes"
          value={prefixes}
          onChange={(e) => setPrefixes(e.currentTarget.value)}
          disabled={protectAll}
        />
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
