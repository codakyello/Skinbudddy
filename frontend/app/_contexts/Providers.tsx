"use client";

import { ThemeProvider, createTheme } from "@mui/material/styles";
const theme = createTheme({
  spacing: 4,
  // your theme configuration
});
export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider theme={theme}>
      <>{children}</>
    </ThemeProvider>
  );
}
