import { AlertCircle, CheckCircle2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/cn";

export function FormAlert({ message, tone = "danger" }: { message: string | null; tone?: "danger" | "success" }) {
  const Icon = tone === "danger" ? AlertCircle : CheckCircle2;
  return (
    <AnimatePresence initial={false}>
      {message && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2 }}
          role={tone === "danger" ? "alert" : "status"}
          className={cn(
            "flex items-start gap-2.5 rounded-xl px-3.5 py-3 text-[14px]",
            tone === "danger" ? "bg-danger-soft text-danger" : "bg-success-soft text-success",
          )}
        >
          <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{message}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
