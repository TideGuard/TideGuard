import { useState } from "react";
import { Alert, Button, Group, Text } from "@mantine/core";
import { api } from "../../lib/api";
import type { AdminState } from "../../lib/types";
import { isDemoMode } from "../../lib/demo-mode";
import { notifyError, notifyOk } from "./notify";

export function DemoModeBanner({
  state,
  onGoLive,
  onOpenAccess,
}: {
  state: AdminState;
  onGoLive: () => Promise<void>;
  onOpenAccess: () => void;
}) {
  const [busy, setBusy] = useState(false);

  if (!isDemoMode(state.origin)) return null;

  const hasOriginUrl = Boolean(state.origin.originUrl?.trim());

  async function goLive() {
    if (!hasOriginUrl) {
      onOpenAccess();
      notifyError(new Error("Set an Origin URL under Access, then click Go live."));
      return;
    }
    if (
      !window.confirm(
        "Go live? This enables the origin proxy and protects all non-TideGuard paths. Confirm your launch checklist first.",
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await api("/api/admin/origin", {
        method: "PUT",
        body: JSON.stringify({
          enabled: true,
          originUrl: state.origin.originUrl,
          protectAll: true,
          pathPrefixes: [],
          queue: state.queue,
        }),
      });
      notifyOk("Origin is live — all non-TideGuard paths are gated");
      await onGoLive();
    } catch (e) {
      notifyError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Alert color="blue" title="Demo mode — origin not gated">
      <Text size="sm" mb="sm">
        Smoke-test the waiting room at <code>/demo</code> (open <code>/wait?return=/demo</code> in
        an incognito window). Real site paths are not gated until you go live.
      </Text>
      <Group gap="sm">
        <Button size="xs" loading={busy} onClick={() => void goLive()}>
          Go live
        </Button>
        <Button size="xs" variant="default" onClick={onOpenAccess}>
          Configure origin
        </Button>
      </Group>
    </Alert>
  );
}
