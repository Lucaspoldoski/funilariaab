import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Wrench, AlertTriangle, Mail, ExternalLink, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/auth")({ component: AuthPage });

// ─── Detecção de ambiente ─────────────────────────────────────────────────────
const isDev = import.meta.env.DEV;
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? "";
const isLocal = SUPABASE_URL.includes("127.0.0.1") || SUPABASE_URL.includes("localhost");

// URLs do ambiente local
const INBUCKET_URL = "http://127.0.0.1:54324";
const STUDIO_URL   = "http://127.0.0.1:54323";
const SUPABASE_CLOUD_AUTH_URL =
  "https://supabase.com/dashboard/project/swxmhqhphpemdwnqrriv/auth/providers";

// ─── Tradução de erros ────────────────────────────────────────────────────────
function traduzirErro(msg: string): string {
  if (!msg) return "Erro desconhecido. Tente novamente.";
  const m = msg.toLowerCase();
  if (m.includes("invalid login credentials"))
    return "E-mail ou senha incorretos. Verifique os dados e tente novamente.";
  if (m.includes("email not confirmed"))
    return isLocal
      ? "E-mail não confirmado. No ambiente local isso não deveria acontecer — verifique se o Supabase está rodando com `supabase start`."
      : "E-mail não confirmado. Verifique sua caixa de entrada e clique no link de confirmação.";
  if (m.includes("user already registered"))
    return "Este e-mail já está cadastrado. Acesse a aba 'Entrar' para fazer login.";
  if (m.includes("password should be at least"))
    return "A senha deve ter no mínimo 8 caracteres.";
  if (m.includes("password should contain at least one character of each"))
    return "A senha deve conter letras maiúsculas, minúsculas e números.";
  if (m.includes("password is too common") || m.includes("found in data breach"))
    return "Senha muito comum ou comprometida em vazamentos. Escolha uma senha mais forte.";
  if (m.includes("signup requires a valid password"))
    return "Senha inválida. Use ao menos 8 caracteres com letras e números.";
  if (m.includes("email rate limit exceeded") || m.includes("rate limit"))
    return "Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.";
  if (m.includes("signup is disabled"))
    return "Cadastro de novos usuários está desabilitado. Contate o administrador.";
  if (m.includes("network") || m.includes("fetch"))
    return isLocal
      ? "Erro de conexão. O Supabase local está rodando? Execute `npx supabase start`."
      : "Erro de conexão. Verifique sua internet e tente novamente.";
  return msg;
}

type AuthView = "form" | "confirm-email";

function AuthPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [busy, setBusy] = React.useState(false);
  const [view, setView] = React.useState<AuthView>("form");
  const [pendingEmail, setPendingEmail] = React.useState("");
  const [lastLoginEmail, setLastLoginEmail] = React.useState("");
  const [showResend, setShowResend] = React.useState(false);

  React.useEffect(() => {
    if (!loading && user) navigate({ to: "/" });
  }, [user, loading, navigate]);

  // ─── LOGIN ──────────────────────────────────────────────────────────────────
  async function handleSignIn(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setShowResend(false);
    const fd = new FormData(e.currentTarget);
    const email    = String(fd.get("email")).trim();
    const password = String(fd.get("password"));

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);

    if (error) {
      const isCredentialsError =
        error.message === "Invalid login credentials" ||
        error.message === "Email not confirmed";
      if (isCredentialsError) {
        setLastLoginEmail(email);
        setShowResend(true);
      }
      return toast.error(traduzirErro(error.message), { duration: 8000 });
    }

    if (data.session) {
      toast.success("Bem-vindo!");
      navigate({ to: "/" });
    }
  }

  // ─── CADASTRO ───────────────────────────────────────────────────────────────
  async function handleSignUp(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    e.stopPropagation();
    setBusy(true);

    const fd       = new FormData(e.currentTarget);
    const email    = String(fd.get("email")).trim();
    const password = String(fd.get("password"));
    const name     = String(fd.get("name") ?? "").trim();

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { full_name: name },
      },
    });

    const errMeta = error as ({ code?: string; status?: number } & typeof error) | null;
    setBusy(false);

    if (error) {
      return toast.error(traduzirErro(error.message), { duration: 8000 });
    }

    // Usuário já existia mas não confirmou o e-mail: Supabase retorna identities=[]
    const jaExistia = data.user && (!data.user.identities || data.user.identities.length === 0);
    if (jaExistia) {
      setPendingEmail(email);
      setView("confirm-email");
      toast.info("Conta já cadastrada. Confirme seu e-mail para entrar.", { duration: 6000 });
      return;
    }

    // Confirmação desabilitada (ambiente local ou cloud sem confirmação) → sessão imediata
    if (data.session) {
      toast.success("Conta criada! Bem-vindo!");
      navigate({ to: "/" });
      return;
    }

    // Confirmação habilitada → mostrar tela de aguardar e-mail
    setPendingEmail(email);
    setView("confirm-email");
  }

  // ─── REENVIAR CONFIRMAÇÃO ───────────────────────────────────────────────────
  async function handleResend(email: string) {
    setBusy(true);
    const { error } = await supabase.auth.resend({ type: "signup", email });
    setBusy(false);
    if (error) return toast.error(traduzirErro(error.message));
    toast.success("E-mail de confirmação reenviado!");
  }

  // ─── GOOGLE OAUTH ───────────────────────────────────────────────────────────
  async function handleGoogle() {
    setBusy(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      setBusy(false);
      return toast.error("Erro ao entrar com Google. Tente novamente.");
    }
    if (result.redirected) return;
    navigate({ to: "/" });
  }

  // ─── TELA: AGUARDANDO CONFIRMAÇÃO ──────────────────────────────────────────
  if (view === "confirm-email") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-muted px-4">
        <div className="w-full max-w-md space-y-4">
          <Card className="border-border/60 shadow-xl">
            <CardHeader className="text-center">
              <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <Mail className="h-6 w-6 text-primary" />
              </div>
              <CardTitle>Confirme seu e-mail</CardTitle>
              <CardDescription>
                Enviamos um link de confirmação para{" "}
                <strong className="text-foreground">{pendingEmail}</strong>.
                <br />
                Clique no link do e-mail e depois volte aqui para entrar.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* ── Ambiente local: link para Inbucket ── */}
              {isDev && isLocal && (
                <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">
                    <CheckCircle2 className="h-4 w-4" />
                    Ambiente local detectado
                  </div>
                  <p className="text-xs text-emerald-700 dark:text-emerald-400">
                    Com <code className="rounded bg-emerald-500/20 px-1">enable_confirmations = false</code> no{" "}
                    <code className="rounded bg-emerald-500/20 px-1">config.toml</code>, o cadastro deveria criar
                    sessão automaticamente. Se chegou aqui, o Supabase local pode não estar rodando.
                  </p>
                  <a
                    href={INBUCKET_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/25 transition"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Abrir Inbucket (e-mails locais)
                  </a>
                  <a
                    href={STUDIO_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-2 inline-flex items-center gap-1.5 rounded-md border border-blue-500/40 bg-blue-500/15 px-3 py-1.5 text-xs font-medium text-blue-700 dark:text-blue-400 hover:bg-blue-500/25 transition"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Studio local
                  </a>
                </div>
              )}

              {/* ── Cloud Supabase em modo dev: link para dashboard ── */}
              {isDev && !isLocal && (
                <div className="rounded-md border border-amber-400 bg-amber-50 dark:bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-400">
                  <strong>Modo dev · Cloud Supabase</strong>
                  <br />
                  Para não precisar confirmar e-mail, desabilite em:{" "}
                  <a
                    href={SUPABASE_CLOUD_AUTH_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                  >
                    Dashboard → Email → desmarque "Confirm email"
                  </a>
                  .
                  <br className="mb-1" />
                  Ou use o Supabase local:{" "}
                  <code className="rounded bg-amber-200 dark:bg-amber-500/20 px-1">npx supabase start</code> e crie{" "}
                  <code className="rounded bg-amber-200 dark:bg-amber-500/20 px-1">.env.local</code>.
                </div>
              )}

              <Button
                className="w-full"
                variant="outline"
                onClick={() => handleResend(pendingEmail)}
                disabled={busy}
              >
                Reenviar e-mail de confirmação
              </Button>
              <Button
                className="w-full"
                variant="ghost"
                onClick={() => { setView("form"); setShowResend(false); }}
              >
                Voltar para o login
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // ─── TELA PRINCIPAL: LOGIN / CADASTRO ──────────────────────────────────────
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-muted px-4">
      <div className="w-full max-w-md space-y-4">

        {/* Banner de ambiente */}
        {isDev && isLocal && (
          <div className="flex items-start gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-800 dark:text-emerald-400">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <strong>Supabase Local</strong> — cadastro sem confirmação de e-mail.
              Inbucket: <a href={INBUCKET_URL} target="_blank" rel="noreferrer" className="underline">{INBUCKET_URL}</a>
              {" · "}
              Studio: <a href={STUDIO_URL} target="_blank" rel="noreferrer" className="underline">{STUDIO_URL}</a>
            </span>
          </div>
        )}

        {isDev && !isLocal && (
          <div className="flex items-start gap-2 rounded-md border border-amber-400 bg-amber-50 dark:bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <strong>Cloud Supabase</strong> — cadastro exige confirmação de e-mail.{" "}
              Para desenvolvimento sem confirmação, use o Supabase local:{" "}
              <code className="rounded bg-amber-200 dark:bg-amber-500/20 px-1">npx supabase start</code>{" "}
              (requer Docker). Ou desabilite em{" "}
              <a
                href={SUPABASE_CLOUD_AUTH_URL}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                Dashboard → Email Providers
              </a>.
            </span>
          </div>
        )}

        {/* Logo */}
        <div className="flex items-center justify-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/25">
            <Wrench className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Funilaria Pro</h1>
            <p className="text-xs text-muted-foreground">Gestão automotiva premium</p>
          </div>
        </div>

        <Card className="border-border/60 shadow-xl">
          <CardHeader>
            <CardTitle>Acesse sua conta</CardTitle>
            <CardDescription>Entre ou crie uma conta para começar.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="signin">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">Entrar</TabsTrigger>
                <TabsTrigger value="signup">Criar conta</TabsTrigger>
              </TabsList>

              {/* ── Login ── */}
              <TabsContent value="signin" className="pt-4">
                <form onSubmit={handleSignIn} className="space-y-3">
                  <div>
                    <Label htmlFor="signin-email">E-mail</Label>
                    <Input
                      id="signin-email"
                      name="email"
                      type="email"
                      required
                      autoComplete="email"
                      placeholder="seu@email.com"
                    />
                  </div>
                  <div>
                    <Label htmlFor="signin-password">Senha</Label>
                    <Input
                      id="signin-password"
                      name="password"
                      type="password"
                      required
                      autoComplete="current-password"
                      placeholder="••••••••"
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={busy}>
                    {busy ? "Entrando…" : "Entrar"}
                  </Button>
                  {showResend && lastLoginEmail && (
                    <button
                      type="button"
                      className="w-full text-center text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
                      onClick={() => { setPendingEmail(lastLoginEmail); setView("confirm-email"); }}
                      disabled={busy}
                    >
                      {isLocal
                        ? "Ver instruções de confirmação"
                        : `Reenviar confirmação para ${lastLoginEmail}`}
                    </button>
                  )}
                </form>
              </TabsContent>

              {/* ── Cadastro ── */}
              <TabsContent value="signup" className="pt-4">
                <form onSubmit={handleSignUp} className="space-y-3">
                  <div>
                    <Label htmlFor="signup-name">Nome completo</Label>
                    <Input
                      id="signup-name"
                      name="name"
                      required
                      placeholder="João da Silva"
                      autoComplete="name"
                    />
                  </div>
                  <div>
                    <Label htmlFor="signup-email">E-mail</Label>
                    <Input
                      id="signup-email"
                      name="email"
                      type="email"
                      required
                      placeholder="seu@email.com"
                      autoComplete="email"
                    />
                  </div>
                  <div>
                    <Label htmlFor="signup-password">Senha</Label>
                    <Input
                      id="signup-password"
                      name="password"
                      type="password"
                      required
                      minLength={8}
                      placeholder="Mínimo 8 caracteres"
                      autoComplete="new-password"
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      Use ao menos 8 caracteres com letras e números.
                    </p>
                  </div>
                  <Button type="submit" className="w-full" disabled={busy}>
                    {busy ? "Criando conta…" : "Criar conta"}
                  </Button>
                  {isLocal && (
                    <p className="text-center text-xs text-emerald-600 dark:text-emerald-400">
                      Login automático após cadastro (sem confirmação de e-mail)
                    </p>
                  )}
                </form>
              </TabsContent>
            </Tabs>

            {/* Divisor */}
            <div className="relative my-5">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">ou</span>
              </div>
            </div>

            {/* Google */}
            <Button
              variant="outline"
              className="w-full"
              onClick={handleGoogle}
              disabled={busy}
            >
              <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.83z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.83C6.71 7.31 9.14 5.38 12 5.38z" />
              </svg>
              Continuar com Google
            </Button>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          {isLocal ? (
            <>Conectado ao Supabase local · <code className="text-[10px]">{SUPABASE_URL}</code></>
          ) : (
            "Ao criar uma conta, você concorda com nossos Termos de Uso."
          )}
        </p>
      </div>
    </div>
  );
}
