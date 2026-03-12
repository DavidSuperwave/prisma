"use client";

import {
  Camera,
  ChevronLeft,
  Mic,
  Phone,
  Plus,
  Video,
  Wifi,
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

export function PhoneFrame() {
  const live = useLiveChat(true);
  const [chatDate] = useState(() => formatChatDate(new Date()));

  return (
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
          <div className="whatsapp-avatar">P</div>
          <div className="whatsapp-meta">
            <strong>Agente Prisma</strong>
            <span>en línea</span>
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
  );
}
