import * as React from "react";
import { Link } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { useHasRole, type AppRole } from "@/hooks/use-role";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function AdminGuard({
  children,
  roles = ["admin", "manager"],
}: {
  children: React.ReactNode;
  roles?: AppRole[];
}) {
  const { allowed, loading } = useHasRole(...roles);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-6">
        <Card className="max-w-md">
          <CardContent className="space-y-4 p-6 text-center">
            <ShieldAlert className="mx-auto h-10 w-10 text-destructive" />
            <h2 className="text-lg font-semibold">Acesso restrito</h2>
            <p className="text-sm text-muted-foreground">
              Esta área é exclusiva para administradores e gerentes. Solicite acesso ao
              responsável pelo sistema caso precise visualizá-la.
            </p>
            <Button asChild>
              <Link to="/">Voltar ao início</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
