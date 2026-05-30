import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type CategoryType = "servico" | "peca" | "despesa" | "receita" | "forma_pagamento" | "prioridade" | "status_personalizado";

export function useCategories(type: CategoryType, opts: { activeOnly?: boolean } = {}) {
  const { activeOnly = true } = opts;
  return useQuery({
    queryKey: ["categories", type, activeOnly],
    queryFn: async () => {
      let q = supabase.from("categories").select("*").eq("type", type).order("name");
      if (activeOnly) q = q.eq("active", true);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateCategory() {
  const qc = useQueryClient();
  return async (type: CategoryType, name: string): Promise<string | null> => {
    const clean = name.trim();
    if (!clean) return null;
    const { data, error } = await supabase
      .from("categories")
      .insert({ type, name: clean, slug: clean.toLowerCase() })
      .select("id")
      .single();
    if (error) {
      // unique violation = already exists; try to fetch
      if (error.code === "23505") {
        const { data: existing } = await supabase
          .from("categories")
          .select("id")
          .eq("type", type)
          .ilike("name", clean)
          .maybeSingle();
        if (existing) {
          qc.invalidateQueries({ queryKey: ["categories", type] });
          return existing.id;
        }
      }
      toast.error(error.message);
      return null;
    }
    qc.invalidateQueries({ queryKey: ["categories", type] });
    toast.success("Categoria criada");
    return data.id;
  };
}
