import { Globe } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function MawidWordmark() {
  return (
    <>
      <span className="text-lg font-semibold tracking-[0.18em] uppercase">Mawid</span>
      <span className="text-muted-foreground text-base">|</span>
      <span className="text-base">موعد</span>
    </>
  );
}

export function LangToggle({ compact }: { compact?: boolean }) {
  const { lang, setLang } = useI18n();
  return (
    <div className="border-border bg-card inline-flex items-center rounded-full border p-0.5">
      {!compact && <Globe className="text-muted-foreground mx-2 h-4 w-4" aria-hidden />}
      {(["en", "ar"] as const).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLang(l)}
          aria-pressed={lang === l}
          className={cn(
            "min-h-9 min-w-11 rounded-full px-3 text-sm font-medium transition-colors",
            lang === l
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {l === "en" ? "EN" : "AR"}
        </button>
      ))}
    </div>
  );
}
