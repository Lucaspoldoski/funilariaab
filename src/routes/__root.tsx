import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
      Outlet,
      Link,
      createRootRouteWithContext,
      useRouter,
      HeadContent,
      Scripts,
} from "@tanstack/react-router";
import { AuthProvider } from "@/hooks/use-auth";
import { Toaster } from "@/components/ui/sonner";

import appCss from "../styles.css?url";

// ─── Error Boundary ──────────────────────────────────────────────────────────
// Captura erros de inicializacao (ex: "Missing Supabase env variables")
// e exibe a mensagem real em vez do erro generico "Invariant failed".
type ErrorBoundaryState = { error: Error | null };

class AppErrorBoundary extends React.Component<
{ children: React.ReactNode },
      ErrorBoundaryState
    > {
      state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
          return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
          console.error("[AppErrorBoundary] Erro capturado:", error.message);
          console.error("[AppErrorBoundary] Stack:", error.stack);
          console.error("[AppErrorBoundary] Component stack:", info.componentStack);
  }

  render() {
          if (this.state.error) {
                    return (
                                <div
                                              style={{
                                                              padding: "2rem",
                                                              fontFamily: "monospace",
                                                              background: "#1a1a1a",
                                                              color: "#ff6b6b",
                                                              minHeight: "100vh",
                                              }}
                                            >
                                          <h2 style={{ color: "#ff6b6b", fontSize: "1.2rem" }}>
                                                      Erro de inicializacao do aplicativo
                                          </h2>h2>
                                          <pre
                                                          style={{
                                                                            background: "#2a2a2a",
                                                                            padding: "1rem",
                                                                            borderRadius: "4px",
                                                                            whiteSpace: "pre-wrap",
                                                                            wordBreak: "break-word",
                                                                            marginTop: "1rem",
                                                                            color: "#ffa0a0",
                                                          }}
                                                        >
                                              {this.state.error.message}
                                          </pre>pre>
                                          <p style={{ color: "#aaa", marginTop: "1rem", fontSize: "0.85rem" }}>
                                                      Verifique o console do navegador para mais detalhes.
                                          </p>p>
                                          <button
                                                          onClick={() => window.location.reload()}
                                                          style={{
                                                                            marginTop: "1rem",
                                                                            padding: "0.5rem 1rem",
                                                                            background: "#333",
                                                                            color: "#fff",
                                                                            border: "1px solid #555",
                                                                            borderRadius: "4px",
                                                                            cursor: "pointer",
                                                          }}
                                                        >
                                                      Recarregar pagina
                                          </button>button>
                                </div>div>
                              );
          }
          return this.props.children;
  }
}

// ─── Not Found ───────────────────────────────────────────────────────────────
function NotFoundComponent() {
      return (
              <div className="flex min-h-screen items-center justify-center bg-background px-4">
                    <div className="max-w-md text-center">
                            <h1 className="text-7xl font-bold text-foreground">404</h1>h1>
                            <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>h2>
                            <p className="mt-2 text-sm text-muted-foreground">
                                      The page you're looking for doesn't exist or has been moved.
                            </p>p>
                            <div className="mt-6">
                                      <Link
                                                      to="/"
                                                      className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                                                    >
                                                  Go home
                                      </Link>Link>
                            </div>div>
                    </div>div>
              </div>div>
            );
}

// ─── Error Component (TanStack Router) ───────────────────────────────────────
function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
      console.error(error);
      const router = useRouter();
    
      return (
              <div className="flex min-h-screen items-center justify-center bg-background px-4">
                    <div className="max-w-md text-center">
                            <h1 className="text-xl font-semibold tracking-tight text-foreground">
                                      This page didn't load
                            </h1>h1>
                            <p className="mt-2 text-sm text-muted-foreground">
                                      Something went wrong on our end. You can try refreshing or head back home.
                            </p>p>
                            <div className="mt-6 flex flex-wrap justify-center gap-2">
                                      <button
                                                      onClick={() => {
                                                                        router.invalidate();
                                                                        reset();
                                                      }}
                                                      className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                                                    >
                                                  Try again
                                      </button>button>
                                      <Link
                                                      to="/"
                                                      className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                                                    >
                                                  Go home
                                      </Link>Link>
                            </div>div>
                    </div>div>
              </div>div>
            );
}

// ─── Route Definition ────────────────────────────────────────────────────────
export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
      component: RootShell,
      notFoundComponent: NotFoundComponent,
      errorComponent: ErrorComponent,
});

// ─── Shell (HTML wrapper) ────────────────────────────────────────────────────
function RootShell() {
      return (
              <html lang="pt-BR">
                    <head>
                            <meta charSet="UTF-8" />
                            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                            <title>Funilaria AB</title>title>
                        {appCss ? <link rel="stylesheet" href={appCss} /> : null}
                            <HeadContent />
                    </head>head>
                    <body>
                            <RootComponent />
                            <Scripts />
                    </body>body>
              </html>html>
            );
}

// ─── Root Component ──────────────────────────────────────────────────────────
function RootComponent() {
      const { queryClient } = Route.useRouteContext();
    
      return (
              <QueryClientProvider client={queryClient}>
                    <AppErrorBoundary>
                            <AuthProvider>
                                      <Outlet />
                                      <Toaster richColors position="top-right" />
                            </AuthProvider>AuthProvider>
                    </AppErrorBoundary>AppErrorBoundary>
              </QueryClientProvider>QueryClientProvider>
            );
}
