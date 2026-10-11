import { forwardRef, useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface AuthFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  id: string;
  label: string;
  icon: LucideIcon;
}

/**
 * One sign-in field: a label, then a tall filled input with its icon, as in native apps.
 * Password fields get a show / hide eye.
 */
const AuthField = forwardRef<HTMLInputElement, AuthFieldProps>(({ id, label, icon: Icon, type = "text", className, ...props }, ref) => {
  const [shown, setShown] = useState(false);
  const isPassword = type === "password";
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="pl-1 text-[13px] font-medium text-muted-foreground">
        {label}
      </label>
      <div className="group relative flex items-center">
        <Icon className="pointer-events-none absolute left-4 h-[18px] w-[18px] text-muted-foreground transition-colors group-focus-within:text-primary" aria-hidden="true" />
        <input
          ref={ref}
          id={id}
          type={isPassword && shown ? "text" : type}
          className={cn(
            "h-[52px] w-full rounded-2xl border border-transparent bg-secondary pl-11 text-[16px] text-foreground outline-none transition-all placeholder:text-muted-foreground/70",
            "focus:border-primary/50 focus:bg-background focus:ring-4 focus:ring-primary/10 disabled:opacity-60",
            isPassword ? "pr-12" : "pr-4",
            className
          )}
          {...props}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShown((s) => !s)}
            className="absolute right-2 flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label={shown ? "Hide password" : "Show password"}
          >
            {shown ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
          </button>
        )}
      </div>
    </div>
  );
});
AuthField.displayName = "AuthField";

export default AuthField;
