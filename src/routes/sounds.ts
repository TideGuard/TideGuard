import notificationMp3 from "../assets/sounds/notification.mp3";

/**
 * Built-in waiting-room jingle (Continue / your-turn alert).
 */
export function handleNotificationSound(): Response {
  return new Response(notificationMp3, {
    status: 200,
    headers: {
      "content-type": "audio/mpeg",
      "cache-control": "public, max-age=86400",
      "accept-ranges": "bytes",
    },
  });
}
