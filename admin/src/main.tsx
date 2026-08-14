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
          <span aria-hidden="true"> · </span>
          <a href="https://tideguard.dev/docs/" target="_blank" rel="noreferrer">
            Docs
          </a>
          <span aria-hidden="true"> · </span>
          <a
            href="https://github.com/TideGuard/TideGuard/blob/main/ROADMAP.md"
            target="_blank"
            rel="noreferrer"
          >
            Roadmap
          </a>
          <span aria-hidden="true"> · </span>
          <a href="https://github.com/TideGuard/TideGuard" target="_blank" rel="noreferrer">
            GitHub
          </a>
          <span aria-hidden="true"> · </span>
          <a
            href="https://github.com/TideGuard/TideGuard/blob/main/TERMS.md"
            target="_blank"
            rel="noreferrer"
          >
            Terms
          </a>
          <span aria-hidden="true"> · </span>
          <a
            href="https://github.com/TideGuard/TideGuard/blob/main/LICENSE"
            target="_blank"
            rel="noreferrer"
          >
            License
          </a>
          <span aria-hidden="true"> · </span>
          <a href="https://github.com/TideGuard/TideGuard/issues" target="_blank" rel="noreferrer">
            Issues or ideas?
          </a>
        </footer>
      </div>
    </MantineProvider>
  </StrictMode>,
);
