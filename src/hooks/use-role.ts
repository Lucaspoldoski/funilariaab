import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export type AppRole = "admin" | "manager" | "employee";

export function useRoles() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["user-roles", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<AppRole[]> => {
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user!.id);
      return ((data ?? []) as { role: AppRole }[]).map((r) => r.role);
    },
  });
}

export function useHasRole(...roles: AppRole[]) {
  const { data = [], isLoading } = useRoles();
  return { allowed: roles.some((r) => data.includes(r)), loading: isLoading };
}
