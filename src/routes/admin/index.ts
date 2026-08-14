export {
  handleAdminPage,
  handleAdminBootstrap,
  handleAdminClaim,
  handleAdminSetup,
  handleAdminLogin,
  handleAdminLogout,
  handleAdminTosAccept,
} from "./auth";

export {
  handleAdminState,
  handleAdminMetrics,
  handleAdminUpdates,
  handleAdminAudit,
} from "./state";

export {
  handleAdminListInvites,
  handleAdminCreateInvite,
  handleAdminRevokeInvite,
  handleAdminAcceptInvite,
  handleAdminChangePassword,
  handleAdminPasswordRecover,
  handleAdminRecoveryRegenerate,
  handleAdminRemoveUser,
} from "./team";

export {
  handleAdminSaveBranding,
  handleAdminCloneBranding,
  handleAdminSaveOrigin,
  handleAdminSaveBypass,
  handleAdminSaveRoomRules,
  handleAdminSaveGeoBlock,
  handleAdminSaveWebhooks,
} from "./settings";

export {
  handleAdminSaveCloudflare,
  handleAdminCloudflareCheck,
  handleAdminCloudflareFixProxy,
  handleAdminCloudflareIpGeolocation,
  handleAdminCloudflareSsl,
  handleAdminCloudflareDomains,
} from "./cloudflare";

export {
  handleAdminSetupCloudflareTokenVerify,
  handleAdminSetupCloudflareVerify,
  handleAdminSetupCloudflareFix,
  handleAdminSetupCloudflareAttachDomain,
  handleAdminSetupCloudflareSsl,
  handleAdminSetupTurnstileProvision,
  handleAdminSetupTurnstileVerify,
} from "./setup-cloudflare";

export {
  handleAdminPass,
  handleAdminRevokeAdmissions,
  handleAdminSetMode,
  handleAdminPause,
  handleAdminRate,
  handleAdminClearRate,
  handleAdminTraffic,
  handleAdminSchedule,
  handleAdminHealth,
  handleAdminQueueLimitsGet,
  handleAdminQueueLimitsPut,
  handleAdminReset,
} from "./traffic";
