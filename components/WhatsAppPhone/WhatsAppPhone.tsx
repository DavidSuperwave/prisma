"use client";

import {
  MessageSquareText,
  Sparkles,
  Zap,
} from "lucide-react";
import { PhoneFrame } from "./PhoneFrame";
import { useLiveChat } from "./useLiveChat";

// WhatsAppPhone keeps the old demo-section layout for any page that still uses it
export function WhatsAppPhone() {
  const live = useLiveChat(false);

  return (
    <div className="demo-section-grid fade-in">
      <div>
        <div className="section-label">Agente interactivo</div>
        <h2 className="section-title">Muestra el producto como realmente se usa.</h2>
        <p className="section-desc">
          La experiencia principal vive dentro de un clon visual de WhatsApp para que tus futuras
          paginas demuestren el flujo real del agente y conviertan desde el primer mensaje.
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

      <PhoneFrame />
    </div>
  );
}
