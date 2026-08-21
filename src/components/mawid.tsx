import { Link } from "@tanstack/react-router";
import { Globe, RotateCcw } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useI18n } from "@/lib/i18n";
import { useDemo } from "@/lib/store";
import type { BookingStatus } from "@/lib/demo-data";
import { cn } from "@/lib/utils";

export function Wordmark({ className }: { className?: string }) {
  return (
    <Link to="/" className={cn("inline-flex items-baseline gap-2", className)}>
      <span className="text-lg font-semibold tracking-[0.18em] uppercase">Mawid</span>
      <span className="text-muted-foreground text-base">|</span>
      <span className="text-base">موعد</span>
    </Link>
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

export function ResetDemoButton({ variant = "outline" }: { variant?: "outline" | "ghost" }) {
  const { t } = useI18n();
  const { reset } = useDemo();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} size="sm" onClick={() => setOpen(true)} className="gap-2">
        <RotateCcw className="h-4 w-4" aria-hidden />
        {t("reset_demo")}
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("reset_confirm_title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("reset_confirm_desc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                reset();
                toast.success(t("reset_done"));
              }}
            >
              {t("confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

const statusStyles: Record<BookingStatus, string> = {
  pending: "bg-warning/20 text-warning-foreground border-warning/40",
  approved: "bg-success/15 text-success border-success/40",
  rejected: "bg-destructive/10 text-destructive border-destructive/30",
  cancelled: "bg-muted text-muted-foreground border-border",
  completed: "bg-primary/10 text-primary border-primary/30",
  proposed: "bg-info/10 text-info border-info/30",
};

const statusKey: Record<BookingStatus, string> = {
  pending: "status_pending_short",
  approved: "status_approved",
  rejected: "status_rejected",
  cancelled: "status_cancelled",
  completed: "status_completed",
  proposed: "status_proposed",
};

export function StatusBadge({ status, long }: { status: BookingStatus; long?: boolean }) {
  const { t } = useI18n();
  return (
    <Badge variant="outline" className={cn("font-medium", statusStyles[status])}>
      {long && status === "pending" ? t("status_pending") : t(statusKey[status])}
    </Badge>
  );
}

export function statusColor(status: BookingStatus) {
  return statusStyles[status];
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="border-border bg-card/60 flex flex-col items-center rounded-xl border border-dashed px-6 py-12 text-center">
      {icon && <div className="text-muted-foreground mb-3">{icon}</div>}
      <p className="font-medium">{title}</p>
      {description && <p className="text-muted-foreground mt-1 max-w-sm text-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function PrototypeNotice() {
  const { t } = useI18n();
  return (
    <p className="text-muted-foreground border-gold/50 bg-gold/10 rounded-lg border px-3 py-2 text-xs leading-relaxed">
      {t("demo_notice")}
    </p>
  );
}
