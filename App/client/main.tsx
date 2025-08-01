import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ThemeProvider";
import { queryClient } from "./lib/queryClient";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <ThemeProvider defaultTheme="light" storageKey="ponyhof-ui-theme">
      <TooltipProvider>
        <App />
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);
