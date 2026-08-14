import { useEffect, useState } from "react";
import { Button, Checkbox, SimpleGrid, Stack, TextInput } from "@mantine/core";
import { api } from "../../lib/api";
import type { AdminState, RoomRules } from "../../lib/types";
import { Panel } from "./Panel";
import { notifyError, notifyOk } from "./notify";

export function RoomRulesPanel({
  state,
  onSaved,
}: {
  state: AdminState;
  onSaved: () => Promise<void>;
}) {
  const [rules, setRules] = useState<RoomRules>(state.roomRules);

  useEffect(() => setRules(state.roomRules), [state.roomRules]);

  const set = <K extends keyof RoomRules>(key: K, value: RoomRules[K]) =>
    setRules((current) => ({ ...current, [key]: value }));

  return (
    <Panel
      id="room-rules"
      title="Room rules"
      description="Cheap request bypasses and custom waiting-room behavior."
    >
      <Stack>
        <Checkbox
          label="Bypass known SEO crawlers"
          checked={rules.seoCrawlerBypass}
          onChange={(event) => set("seoCrawlerBypass", event.currentTarget.checked)}
        />
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <TextInput
            label="Bypass cookie name"
            placeholder="trusted_visitor"
            value={rules.cookieBypassName}
            onChange={(event) => set("cookieBypassName", event.currentTarget.value)}
          />
          <TextInput
            label="Bypass header name"
            placeholder="x-tideguard-bypass"
            value={rules.headerBypassName}
            onChange={(event) => set("headerBypassName", event.currentTarget.value)}
          />
        </SimpleGrid>
        <TextInput
          label="Bypass header value"
          value={rules.headerBypassValue}
          onChange={(event) => set("headerBypassValue", event.currentTarget.value)}
        />
        <Checkbox
          label="JSON redirect mode for application/json requests"
          checked={rules.jsonMode}
          onChange={(event) => set("jsonMode", event.currentTarget.checked)}
        />
        <Checkbox
          label="Reject with a branded 503 when the queue is full"
          checked={rules.rejectWhenFull}
          onChange={(event) => set("rejectWhenFull", event.currentTarget.checked)}
        />
        <Button
          onClick={() => {
            void api("/api/admin/room-rules", {
              method: "PUT",
              body: JSON.stringify(rules),
            })
              .then(() => {
                notifyOk("Room rules saved");
                return onSaved();
              })
              .catch(notifyError);
          }}
        >
          Save room rules
        </Button>
      </Stack>
    </Panel>
  );
}
