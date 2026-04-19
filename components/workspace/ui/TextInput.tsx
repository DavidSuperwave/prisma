import { forwardRef, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { Search } from "lucide-react";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  leadingIcon?: ReactNode;
};

export const TextInput = forwardRef<HTMLInputElement, InputProps>(function TextInput(
  { leadingIcon, className, ...rest },
  ref,
) {
  const classes = ["ws-input", leadingIcon ? "ws-input--with-icon" : "", className].filter(Boolean).join(" ");
  if (!leadingIcon) {
    return <input ref={ref} className={classes} {...rest} />;
  }
  return (
    <span className="ws-search" style={{ minWidth: 0, flex: "1 1 220px" }}>
      <span className="ws-search__icon">{leadingIcon}</span>
      <input ref={ref} className={classes} {...rest} />
    </span>
  );
});

type SearchProps = InputHTMLAttributes<HTMLInputElement>;

export const SearchInput = forwardRef<HTMLInputElement, SearchProps>(function SearchInput(props, ref) {
  return <TextInput ref={ref} type="search" leadingIcon={<Search size={14} aria-hidden />} {...props} />;
});

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea({ className, ...rest }, ref) {
  const classes = ["ws-input", className].filter(Boolean).join(" ");
  return <textarea ref={ref} className={classes} {...rest} />;
});

type SelectProps = InputHTMLAttributes<HTMLSelectElement> & {
  children: ReactNode;
};

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select({ className, children, ...rest }, ref) {
  const classes = ["ws-input", className].filter(Boolean).join(" ");
  return (
    <select ref={ref} className={classes} {...(rest as unknown as InputHTMLAttributes<HTMLSelectElement>)}>
      {children}
    </select>
  );
});
