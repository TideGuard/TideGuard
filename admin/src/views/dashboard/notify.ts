import { notifications } from "@mantine/notifications";

export function notifyError(err: unknown) {
  notifications.show({
    color: "red",
    title: "Error",
    message: err instanceof Error ? err.message : "Request failed",
  });
}

export function notifyOk(message: string) {
  notifications.show({ color: "teal", message });
}
