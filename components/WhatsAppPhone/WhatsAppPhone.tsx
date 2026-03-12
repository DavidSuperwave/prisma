"use client";

import {
  Camera,
  ChevronLeft,
  MessageSquareText,
  Mic,
  Phone,
  Plus,
  Sparkles,
  Video,
  Wifi,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { ChatBubble } from "./ChatBubble";
import { ChatInput } from "./ChatInput";
import { useLiveChat } from "./useLiveChat";

function formatChatDate(date: Date) {
  return new Intl.DateTimeFormat("es-MX", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(date);
}

export function WhatsAppPhone() {
  const live = useLiveChat(true);
  const [chatDate] = useState(() => formatChatDate(new Date()));

  return (
    <div className="demo-section-grid fade-in">
      <div>
        <div className="section-label">Agente interactivo</div>
        <h2 className="section-title">Muestra el producto como realmente se usa.</h2>
        <p className="section-desc">
          La experiencia principal vive dentro de un clon visual de WhatsApp para que tus futuras paginas demuestren el flujo real del agente y conviertan desde el primer mensaje.
        </p>

        <div className="phone-caption-list">
          <div className="phone-caption-item">
            <Sparkles size={18} strokeWidth={2} />
            <div>
              <strong>Opt-in directo</strong>
              <p>La conversacion empieza lista para que la persona te diga que necesita y entre al funnel sin pasos extra.</p>
            </div>
          </div>
          <div className="phone-caption-item">
            <MessageSquareText size={18} strokeWidth={2} />
            <div>
              <strong>Chat en vivo</strong>
              <p>Desde que abre la pagina, el agente ya esta disponible para responder y mover la conversacion al siguiente paso.</p>
            </div>
          </div>
          <div className="phone-caption-item">
            <Zap size={18} strokeWidth={2} />
            <div>
              <strong>Funnel reusable</strong>
              <p>La misma estructura se adapta por vertical cambiando prompt, copy y siguientes preguntas del workflow.</p>
            </div>
          </div>
        </div>

        {live.error ? (
          <p className="section-desc" style={{ marginTop: "1.5rem", marginBottom: 0, color: "#F87171" }}>
            {live.error}
          </p>
        ) : null}
      </div>

      <div className="phone-shell" aria-label="Demo del agente en un clon de WhatsApp">
        <div className="phone-frame">
          <div className="phone-statusbar">
            <span className="phone-status-time">9:41</span>
            <div className="phone-status-icons" aria-hidden="true">
              <div className="phone-signal">
                <span />
                <span />
                <span />
                <span />
              </div>
              <Wifi size={13} strokeWidth={2.1} />
              <span className="phone-battery" />
            </div>
          </div>

          <div className="whatsapp-header">
            <button type="button" className="whatsapp-icon-button" aria-label="Volver">
              <ChevronLeft size={20} strokeWidth={2.25} />
            </button>
            <div className="whatsapp-avatar">E</div>
            <div className="whatsapp-meta">
              <strong>Elisa Das</strong>
              <span>tap here for contact info</span>
            </div>
            <div className="whatsapp-header-actions">
              <button type="button" className="whatsapp-icon-button" aria-label="Videollamada">
                <Video size={18} strokeWidth={2} />
              </button>
              <button type="button" className="whatsapp-icon-button" aria-label="Llamada">
                <Phone size={18} strokeWidth={2} />
              </button>
            </div>
          </div>

          <div className="chat-thread">
            <div className="chat-day-label">{chatDate}</div>
            {live.messages.map((message) => (
              <ChatBubble key={message.id} message={message} />
            ))}
          </div>

          <div className="chat-input-wrap">
            <div className="chat-composer-bar">
              <button type="button" className="composer-side-action" aria-label="Agregar">
                <Plus size={20} strokeWidth={2.2} />
              </button>
              <div className="chat-form-wrap">
                <ChatInput
                  value={live.input}
                  onChange={live.setInput}
                  onSubmit={live.sendMessage}
                  disabled={live.isLoading}
                  placeholder="Escribe un mensaje"
                />
              </div>
              <button type="button" className="composer-side-action" aria-label="Camara">
                <Camera size={19} strokeWidth={2} />
              </button>
              <button type="button" className="composer-side-action" aria-label="Microfono">
                <Mic size={19} strokeWidth={2} />
              </button>
            </div>
            <div className="phone-home-indicator" />
          </div>
        </div>
      </div>
    </div>
  );
}
