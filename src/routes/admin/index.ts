export {
  handleAdminPage,
  handleAdminBootstrap,
  handleAdminClaim,
  handleAdminSetup,
  handleAdminLogin,
  handleAdminLogout,
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
  handleAdminRemoveUser,
} from "./team";

export {
  handleAdminSaveBranding,
  handleAdminSaveOrigin,
  handleAdminSaveBypass,
  handleAdminSaveGeoBlock,
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
  handleAdminSetMode,
  handleAdminPause,
  handleAdminRate,
  handleAdminClearRate,
  handleAdminTraffic,
  handleAdminSchedule,
  handleAdminHealth,
  handleAdminReset,
} from "./traffic";
