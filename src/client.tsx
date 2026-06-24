import { RouterProvider } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { getRouter } from "./router";

const queryClient = new QueryClient();
const router = getRouter();

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <QueryClientProvider client={queryClient}>
              <RouterProvider router={router} />
        </QueryClientProvider>QueryClientProvider>
    </StrictMode>StrictMode>
  );</StrictMode>
