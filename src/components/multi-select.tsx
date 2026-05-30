import * as React from "react";
import { Check, ChevronsUpDown, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";

export type MultiSelectOption = { value: string; label: string; color?: string | null };

export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = "Selecione...",
  emptyText = "Nada encontrado.",
  onCreate,
  createLabel = "Criar",
  className,
}: {
  options: MultiSelectOption[];
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  emptyText?: string;
  onCreate?: (name: string) => Promise<string | null>;
  createLabel?: string;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [creating, setCreating] = React.useState(false);

  const selected = options.filter((o) => value.includes(o.value));
  const filtered = options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()));
  const canCreate =
    onCreate &&
    search.trim().length > 1 &&
    !options.some((o) => o.label.toLowerCase() === search.trim().toLowerCase());

  function toggle(v: string) {
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  }

  async function handleCreate() {
    if (!onCreate || !search.trim()) return;
    setCreating(true);
    const id = await onCreate(search.trim());
    setCreating(false);
    if (id) {
      onChange([...value, id]);
      setSearch("");
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" className={cn("h-auto min-h-9 w-full justify-between px-3 py-1.5", className)}>
          <div className="flex flex-1 flex-wrap items-center gap-1">
            {selected.length === 0 && <span className="text-muted-foreground text-sm">{placeholder}</span>}
            {selected.map((s) => (
              <Badge key={s.value} variant="secondary" className="gap-1" style={s.color ? { backgroundColor: `${s.color}22`, color: s.color } : undefined}>
                {s.label}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); toggle(s.value); }}
                  className="rounded-full hover:bg-black/10"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Buscar..." value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {filtered.map((o) => (
                <CommandItem key={o.value} onSelect={() => toggle(o.value)}>
                  <Check className={cn("mr-2 h-4 w-4", value.includes(o.value) ? "opacity-100" : "opacity-0")} />
                  {o.color && <span className="mr-2 h-2 w-2 rounded-full" style={{ backgroundColor: o.color }} />}
                  {o.label}
                </CommandItem>
              ))}
              {canCreate && (
                <CommandItem onSelect={handleCreate} disabled={creating} className="border-t text-primary">
                  <Plus className="mr-2 h-4 w-4" />
                  {createLabel} "{search.trim()}"
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
