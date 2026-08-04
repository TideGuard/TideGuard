import { Text, Title } from "@mantine/core";
import type { WaitingRoomBranding } from "../../lib/types";

/** Lightweight waiting-room mock for branding edits (no iframe required). */
export function WaitingRoomPreview({
  branding,
  waitingCount = 128,
}: {
  branding: Pick<
    WaitingRoomBranding,
    | "title"
    | "message"
    | "primaryColor"
    | "accentColor"
    | "backgroundColor"
    | "surfaceColor"
    | "textColor"
    | "mutedColor"
    | "fontFamily"
    | "showWaitingCount"
    | "enterButtonLabel"
    | "requireClickToEnter"
  >;
  waitingCount?: number;
}) {
  return (
    <div
      className="tg-wait-preview"
      style={{
        background: branding.backgroundColor,
        color: branding.textColor,
        fontFamily: branding.fontFamily || undefined,
      }}
      aria-label="Waiting room preview"
    >
      <div
        className="tg-wait-preview-card"
        style={{
          background: branding.surfaceColor,
          borderColor: `${branding.accentColor}44`,
        }}
      >
        <Title order={4} style={{ color: branding.textColor, fontFamily: "inherit" }}>
          {branding.title || "You’re in line"}
        </Title>
        <Text size="sm" style={{ color: branding.mutedColor, fontFamily: "inherit" }} mt="xs">
          {branding.message || "We’re letting people in at a steady pace."}
        </Text>
        {branding.showWaitingCount ? (
          <Text size="sm" mt="md" style={{ color: branding.mutedColor, fontFamily: "inherit" }}>
            About {waitingCount.toLocaleString()} people waiting
          </Text>
        ) : null}
        <div
          className="tg-wait-preview-bar"
          style={{ background: `${branding.primaryColor}33` }}
          aria-hidden="true"
        >
          <div
            className="tg-wait-preview-bar-fill"
            style={{ background: branding.primaryColor, width: "42%" }}
          />
        </div>
        {branding.requireClickToEnter ? (
          <button
            type="button"
            className="tg-wait-preview-btn"
            style={{
              background: branding.accentColor,
              color: branding.backgroundColor,
              fontFamily: "inherit",
            }}
            tabIndex={-1}
            aria-hidden="true"
          >
            {branding.enterButtonLabel || "Continue"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
