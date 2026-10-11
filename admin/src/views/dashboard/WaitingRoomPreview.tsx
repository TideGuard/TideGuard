import { Text, Title } from "@mantine/core";
import type { WaitingRoomBranding } from "../../lib/types";

/** Admin preview uses the same built-in logo path as the Worker waiting room. */
const BUILTIN_LOGO_PATH = "/brand/logo.png";

/** Lightweight waiting-room mock for branding edits (no iframe required). */
export function WaitingRoomPreview({
  branding,
  admissionMode = "queue",
  waitingCount = 128,
  position = 42,
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
  > & { logoUrl?: string };
  admissionMode?: "queue" | "lottery";
  waitingCount?: number;
  position?: number;
}) {
  const placeLine =
    admissionMode === "lottery"
      ? `Your chance · about 1 in ${Math.max(1, waitingCount)}`
      : branding.showWaitingCount
        ? `#${position} of ${waitingCount.toLocaleString()}`
        : `Position ${position}`;
  const logoSrc = branding.logoUrl?.trim() || BUILTIN_LOGO_PATH;

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
        <img
          src={logoSrc}
          alt="TideGuard"
          style={{ maxWidth: "8rem", maxHeight: "2.5rem", objectFit: "contain", marginBottom: 8 }}
        />
        <Title order={4} style={{ color: branding.textColor, fontFamily: "inherit" }}>
          {branding.title || "You’re in line"}
        </Title>
        <Text size="sm" style={{ color: branding.mutedColor, fontFamily: "inherit" }} mt="xs">
          {branding.message || "We’re letting people in at a steady pace."}
        </Text>
        <Text size="sm" mt="md" style={{ color: branding.textColor, fontFamily: "inherit" }}>
          {placeLine}
        </Text>
        {branding.showWaitingCount && admissionMode === "queue" ? (
          <Text size="sm" mt={4} style={{ color: branding.mutedColor, fontFamily: "inherit" }}>
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
        ) : (
          <Text size="xs" mt="sm" style={{ color: branding.mutedColor, fontFamily: "inherit" }}>
            Auto-continue when admitted
          </Text>
        )}
      </div>
    </div>
  );
}
