// Primitives — spec in replica/design/components.md. Tokens only, no raw hex.

type Variant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  variant = "primary",
  className = "",
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const styles: Record<Variant, string> = {
    primary: "bg-accent-strong text-on-accent hover:brightness-110",
    secondary: "bg-surface-raised text-text border border-border hover:border-border-input",
    ghost: "bg-transparent text-text-muted hover:text-text",
    danger: "bg-danger text-on-accent hover:brightness-110",
  };
  return (
    <button
      className={`min-h-12 rounded-md px-5 text-sm font-semibold transition-all duration-fast ease-ease
        active:scale-[.98] focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2
        disabled:cursor-not-allowed disabled:opacity-45 ${styles[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
