import { SendHorizontal, Smile } from "lucide-react";
import { forwardRef } from "react";

type ChatInputProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  placeholder?: string;
};

export const ChatInput = forwardRef<HTMLInputElement, ChatInputProps>(
  function ChatInput(
    { value, onChange, onSubmit, disabled = false, placeholder = "Escribe tu mensaje" },
    ref
  ) {
    return (
      <form
        className="chat-form"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <button type="button" className="chat-form-icon" aria-label="Stickers">
          <Smile size={18} strokeWidth={2} />
        </button>
        <input
          ref={ref}
          type="text"
          inputMode="text"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="sentences"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          aria-label="Mensaje para el agente"
        />
        <button
          type="submit"
          aria-label="Enviar mensaje"
          disabled={disabled || !value.trim()}
        >
          <SendHorizontal size={18} strokeWidth={2.25} />
        </button>
      </form>
    );
  }
);
