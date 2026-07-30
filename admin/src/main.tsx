import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import { App } from "./components/App";
import { tideguardTheme } from "./theme";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MantineProvider theme={tideguardTheme} forceColorScheme="dark" defaultColorScheme="dark">
      <Notifications position="top-right" />
      <div className="tg-shell">
        <header className="tg-top">
          <strong>TideGuard</strong>
          <span>Admin</span>
        </header>
        <App />
        <footer className="tg-footer">
          <a href="https://tideguard.dev" target="_blank" rel="noreferrer">
            tideguard.dev
          </a>
        </footer>
      </div>
    </MantineProvider>
  </StrictMode>,
);
