import { createTheme } from "@mantine/core";

export const tideguardTheme = createTheme({
  fontFamily: '"Source Sans 3", "Segoe UI", system-ui, sans-serif',
  primaryColor: "teal",
  colors: {
    dark: [
      "#e8f1f5",
      "#c5d5de",
      "#8aa4b0",
      "#5a7a8a",
      "#3d5f70",
      "#2a4554",
      "#1a3340",
      "#0e2531",
      "#0b1f2a",
      "#07151c",
    ],
    teal: [
      "#e6faf8",
      "#c2f0eb",
      "#7ee0d6",
      "#3dd6c8",
      "#2bb0a6",
      "#23968e",
      "#1c7a74",
      "#155e59",
      "#0f4542",
      "#0a2e2c",
    ],
  },
  defaultRadius: "md",
  other: {
    inflow: "#2bb0a6",
    outflow: "#e07070",
    waiting: "#9b8fd9",
    waitTime: "#e0a070",
  },
});
