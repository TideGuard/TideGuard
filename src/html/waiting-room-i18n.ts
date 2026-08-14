/**
 * Waiting-room interface copy. Branding title and message remain operator overrides.
 * Keep keys stable for i18n hooks.
 */

export type WaitingRoomLocale = "en" | "de" | "fr" | "es" | "ja";

export interface WaitingRoomStrings {
  brand: string;
  positionLabel: string;
  placeLabel: string;
  lotteryLabel: string;
  waitLabel: string;
  depthLabel: string;
  checkInLabel: string;
  openNow: string;
  opensIn: string;
  queueOpenKeepPage: string;
  nextUpdateHint: string;
  soundLabel: string;
  notificationLabel: string;
  notificationSoon: string;
  notificationReady: string;
  statusJoining: string;
  statusWaiting: string;
  statusAdmitted: string;
  statusHold: string;
}

export const WAITING_ROOM_STRINGS: Record<WaitingRoomLocale, WaitingRoomStrings> = {
  en: {
    brand: "TideGuard",
    positionLabel: "Position",
    placeLabel: "Your place",
    lotteryLabel: "Your chance",
    waitLabel: "Est. wait",
    depthLabel: "Waiting",
    checkInLabel: "Next update",
    openNow: "Admissions are open",
    opensIn: "Opens in",
    queueOpenKeepPage: "Queue is open — keep this tab open until you enter",
    nextUpdateHint: "Keep this tab open. Returning late can cost your place.",
    soundLabel: "Play a sound when it is your turn",
    notificationLabel: "Notify me about check-ins and my turn",
    notificationSoon: "Your next queue check-in is due soon.",
    notificationReady: "It is your turn. Return to the queue to enter.",
    statusJoining: "Joining the line…",
    statusWaiting: "Waiting for your turn…",
    statusAdmitted: "You are through — continuing…",
    statusHold: "Your spot is ready — continue when you are",
  },
  de: {
    brand: "TideGuard",
    positionLabel: "Position",
    placeLabel: "Dein Platz",
    lotteryLabel: "Deine Chance",
    waitLabel: "Wartezeit",
    depthLabel: "Wartende",
    checkInLabel: "Nächstes Update",
    openNow: "Einlass ist geöffnet",
    opensIn: "Öffnet in",
    queueOpenKeepPage: "Die Warteschlange ist offen — Tab bis zum Eintritt geöffnet lassen",
    nextUpdateHint: "Lass diesen Tab offen. Bei später Rückkehr kannst du deinen Platz verlieren.",
    soundLabel: "Ton abspielen, wenn du an der Reihe bist",
    notificationLabel: "Über Check-ins und meinen Aufruf benachrichtigen",
    notificationSoon: "Dein nächster Check-in ist bald fällig.",
    notificationReady: "Du bist an der Reihe. Kehre zum Eintritt zurück.",
    statusJoining: "Warteschlange wird betreten…",
    statusWaiting: "Du wartest auf deinen Aufruf…",
    statusAdmitted: "Du bist drin — weiter geht’s…",
    statusHold: "Dein Platz ist bereit — fahre fort",
  },
  fr: {
    brand: "TideGuard",
    positionLabel: "Position",
    placeLabel: "Votre place",
    lotteryLabel: "Votre chance",
    waitLabel: "Attente estimée",
    depthLabel: "En attente",
    checkInLabel: "Prochaine mise à jour",
    openNow: "Les admissions sont ouvertes",
    opensIn: "Ouverture dans",
    queueOpenKeepPage: "La file est ouverte — gardez cet onglet ouvert jusqu’à l’entrée",
    nextUpdateHint:
      "Gardez cet onglet ouvert. Un retour tardif peut vous faire perdre votre place.",
    soundLabel: "Jouer un son quand vient votre tour",
    notificationLabel: "M’avertir des pointages et de mon tour",
    notificationSoon: "Votre prochain pointage approche.",
    notificationReady: "C’est votre tour. Revenez à la file pour entrer.",
    statusJoining: "Entrée dans la file…",
    statusWaiting: "En attente de votre tour…",
    statusAdmitted: "Vous pouvez entrer — redirection…",
    statusHold: "Votre place est prête — continuez",
  },
  es: {
    brand: "TideGuard",
    positionLabel: "Posición",
    placeLabel: "Tu lugar",
    lotteryLabel: "Tu oportunidad",
    waitLabel: "Espera estimada",
    depthLabel: "En espera",
    checkInLabel: "Próxima actualización",
    openNow: "La admisión está abierta",
    opensIn: "Abre en",
    queueOpenKeepPage: "La cola está abierta — mantén esta pestaña abierta hasta entrar",
    nextUpdateHint: "Mantén esta pestaña abierta. Volver tarde puede hacerte perder el lugar.",
    soundLabel: "Reproducir un sonido cuando sea tu turno",
    notificationLabel: "Avisarme de controles y de mi turno",
    notificationSoon: "Tu próximo control de cola será pronto.",
    notificationReady: "Es tu turno. Vuelve a la cola para entrar.",
    statusJoining: "Entrando en la cola…",
    statusWaiting: "Esperando tu turno…",
    statusAdmitted: "Ya puedes entrar — continuando…",
    statusHold: "Tu lugar está listo — continúa",
  },
  ja: {
    brand: "TideGuard",
    positionLabel: "順番",
    placeLabel: "あなたの順番",
    lotteryLabel: "当選機会",
    waitLabel: "予想待ち時間",
    depthLabel: "待機中",
    checkInLabel: "次の更新",
    openNow: "入場受付中",
    opensIn: "開始まで",
    queueOpenKeepPage: "待機列は受付中です — 入場までこのタブを開いたままにしてください",
    nextUpdateHint: "このタブを開いたままにしてください。戻りが遅いと順番を失うことがあります。",
    soundLabel: "順番が来たら音を鳴らす",
    notificationLabel: "確認時刻と順番を通知する",
    notificationSoon: "次の待機列確認時刻が近づいています。",
    notificationReady: "あなたの順番です。待機列に戻って入場してください。",
    statusJoining: "待機列に参加しています…",
    statusWaiting: "順番を待っています…",
    statusAdmitted: "入場できます — 移動中…",
    statusHold: "入場枠を確保しました — 続行してください",
  },
};

export function resolveWaitingRoomLocale(raw: string | null | undefined): WaitingRoomLocale {
  if (!raw) return "en";
  const candidates = raw
    .split(",")
    .map((part, index) => {
      const [tag = "", ...params] = part.trim().toLowerCase().split(";");
      const qParam = params.find((param) => param.trim().startsWith("q="));
      const q = qParam ? Number(qParam.trim().slice(2)) : 1;
      return { tag: tag.split("-")[0], q: Number.isFinite(q) ? q : 0, index };
    })
    .sort((a, b) => b.q - a.q || a.index - b.index);
  for (const candidate of candidates) {
    if (
      candidate.q > 0 &&
      (candidate.tag === "en" ||
        candidate.tag === "de" ||
        candidate.tag === "fr" ||
        candidate.tag === "es" ||
        candidate.tag === "ja")
    ) {
      return candidate.tag;
    }
  }
  return "en";
}

export function waitingRoomStrings(locale: WaitingRoomLocale = "en"): WaitingRoomStrings {
  return WAITING_ROOM_STRINGS[locale] ?? WAITING_ROOM_STRINGS.en;
}
