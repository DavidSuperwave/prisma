import type { ChatMessage } from "./types";

type ChatBubbleProps = {
  message: ChatMessage;
};

export function ChatBubble({ message }: ChatBubbleProps) {
  return (
    <article className={`chat-bubble ${message.role}`} aria-label={`Mensaje de ${message.role === "agent" ? "Prisma" : "usuario"}`}>
      <p>{message.content}</p>
      <div className="chat-meta-row">
        <time>{message.timestamp}</time>
        {message.role === "user" ? <span className="chat-checks">✓✓</span> : null}
      </div>
    </article>
  );
}

export function TypingBubble() {
  return (
    <article className="chat-bubble agent" aria-label="Prisma esta escribiendo">
      <div className="typing-indicator" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </article>
  );
}
