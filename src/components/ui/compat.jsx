import React from "react";
import { cva } from "class-variance-authority";
import { cn } from "../../lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-xl border text-sm font-semibold transition-colors duration-150 disabled:pointer-events-none disabled:opacity-60",
  {
    variants: {
      variant: {
        default: "border-[var(--primary-strong)] bg-[var(--primary)] text-[var(--on-primary)] hover:bg-[var(--primary-strong)]",
        secondary: "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)] hover:bg-[var(--surface)]",
        danger: "border-[var(--danger-strong)] bg-[var(--danger-soft)] text-[var(--danger)] hover:bg-[var(--danger-strong)]",
      },
      size: {
        md: "h-10 px-4 py-2",
        sm: "h-8 px-3 py-1",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  }
);

export const Button = ({
  children,
  className,
  variant = "default",
  size = "md",
  ...props
}) => {
  return (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    >
      {children}
    </button>
  );
};

export const Spinner = ({ className, style }) => (
  <span
    className={cn(
      "inline-block h-7 w-7 animate-spin rounded-full border-[3px] border-[var(--border)] border-t-[var(--primary)]",
      className
    )}
    style={style}
  />
);

export const Alert = ({ className, variant = "default", style, children }) => (
  <div
    className={cn(
      "rounded-xl border px-4 py-3",
      variant === "danger" && "border-[var(--danger-strong)] bg-[var(--danger-soft)] text-[var(--danger)]",
      variant === "success" && "border-[var(--ok-strong)] bg-[var(--ok-soft)] text-[var(--ok)]",
      variant === "default" && "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)]",
      className
    )}
    style={style}
  >
    {children}
  </div>
);

export const InputGroup = ({ className, children }) => (
  <div className={cn("flex items-center gap-2", className)}>{children}</div>
);

export const FormControl = ({ className, ...props }) => (
  <input
    className={cn(
      "w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[var(--text)] outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--focus-ring)]",
      className
    )}
    {...props}
  />
);

export const FormLabel = ({ className, children, ...props }) => (
  <label className={cn("mb-1 block text-sm font-semibold text-[var(--muted)]", className)} {...props}>
    {children}
  </label>
);

export const ProgressBar = ({ now = 0, className, style }) => (
  <div className={cn("h-3 w-full overflow-hidden rounded-full bg-[var(--surface-2)]", className)} style={style}>
    <div
      className="h-full rounded-full bg-[var(--primary)] transition-all duration-200"
      style={{ width: `${Math.max(0, Math.min(100, now))}%` }}
    />
  </div>
);

export const Fade = ({ children }) => <>{children}</>;

export const Container = ({ className, children }) => (
  <div className={cn("mx-auto w-full max-w-[1120px] px-4", className)}>{children}</div>
);

export const Card = ({ className, children, style }) => (
  <div className={cn("overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]", className)} style={style}>
    {children}
  </div>
);

Card.Img = ({ className, style, src, alt = "" }) => (
  <img className={cn(className)} style={style} src={src} alt={alt} />
);

Card.Body = ({ className, style, children }) => (
  <div className={cn("p-4", className)} style={style}>
    {children}
  </div>
);

Card.Title = ({ className, style, children }) => (
  <h3 className={cn("m-0 text-base font-semibold", className)} style={style}>
    {children}
  </h3>
);

Card.Text = ({ className, style, children }) => (
  <p className={cn("mt-2", className)} style={style}>
    {children}
  </p>
);

Card.Footer = ({ className, style, children }) => (
  <div className={cn("border-t border-[var(--border)] bg-[var(--surface-2)] p-3", className)} style={style}>
    {children}
  </div>
);

export const Form = ({ className, children, ...props }) => (
  <form className={className} {...props}>
    {children}
  </form>
);

Form.Group = ({ className, children, ...props }) => (
  <div className={cn("mb-4", className)} {...props}>
    {children}
  </div>
);

Form.Label = ({ className, children, ...props }) => (
  <label className={cn("mb-1 block text-sm font-semibold text-[var(--muted)]", className)} {...props}>
    {children}
  </label>
);

Form.Control = ({ className, as, children, ...props }) => {
  if (as === "select") {
    return (
      <select
        className={cn(
          "w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[var(--text)] outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--focus-ring)]",
          className
        )}
        {...props}
      >
        {children}
      </select>
    );
  }

  return (
    <input
      className={cn(
        "w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[var(--text)] outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--focus-ring)]",
        className
      )}
      {...props}
    />
  );
};

Form.Text = ({ className, children, ...props }) => (
  <small className={cn("text-sm text-[var(--muted)]", className)} {...props}>
    {children}
  </small>
);

Form.Select = ({ className, children, ...props }) => (
  <select
    className={cn(
      "w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[var(--text)] outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--focus-ring)]",
      className
    )}
    {...props}
  >
    {children}
  </select>
);

export const Modal = ({ show, onHide, children }) => {
  if (!show) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[rgba(3,6,10,0.72)] p-4"
      onClick={onHide}
    >
      <div
        className="w-[min(460px,96vw)] rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[0_18px_30px_rgba(0,0,0,0.45)]"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
};

Modal.Header = ({ className, style, children }) => (
  <div className={cn("border-b border-[var(--border)] p-4", className)} style={style}>
    {children}
  </div>
);

Modal.Title = ({ className, style, children }) => (
  <h4 className={cn("m-0", className)} style={style}>
    {children}
  </h4>
);

Modal.Body = ({ className, style, children }) => (
  <div className={cn("p-4", className)} style={style}>
    {children}
  </div>
);

Modal.Footer = ({ className, style, children }) => (
  <div className={cn("flex justify-end gap-2 border-t border-[var(--border)] p-4", className)} style={style}>
    {children}
  </div>
);
