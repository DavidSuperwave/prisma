export const PRISMA_SDR_CALENDLY_URL = "https://calendly.com/jaime-ailegalgrowth/30min";
export const PRISMA_SDR_STRIPE_URL = "https://buy.stripe.com/9B68wOgOw4g8fPk1617EQ0m";

export const PRISMA_SDR_PLAYBOOK = {
  initial:
    "Hola [Nombre], soy de Prisma AI. Queremos regalarte un sitio web profesional para tu negocio. ¿A qué se dedica tu empresa?",
  employeeQuestion: "¿Cuántas personas trabajan en tu empresa?",
  clarityQuestion: "¿Cuánto tiempo llevan en el mercado y tienen oficinas físicas?",
  qualified:
    `Perfecto. Me gustaría entender mejor tus necesidades. ¿Agendamos una llamada rápida?\n\n${PRISMA_SDR_CALENDLY_URL}`,
  unqualified:
    `Excelente. Te regalamos el sitio web. Lo único que cobramos es un mantenimiento mensual para mantenerlo actualizado y seguro.\n\nCompleta tu acceso aquí:\n${PRISMA_SDR_STRIPE_URL}`,
  postPayment:
    "¡Listo! Ahora necesitamos tu información para construir el sitio. Comparte:\n\n- Descripción de tus servicios\n- Logo/imágenes\n- Datos de contacto\n- Cualquier otro detalle importante",
  siteReady:
    "¡Tu sitio web está listo! Aquí está: [ENLACE]\n\nSi necesitas cambios, avísame.",
} as const;

export function buildPrismaSdrLeadMetadata(input: {
  from: string | null;
  message: string | null;
  payload: Record<string, unknown>;
}) {
  return {
    channel: "whatsapp",
    from: input.from,
    message: input.message,
    payload: input.payload,
    sdr_playbook: "prisma-ai-free-website-v1",
    qualification_status: "collecting",
    next_question: "business_type",
    next_action: "Ask what the business does, then qualify with employee count.",
    qualification_rules: {
      qualified_if: [
        "more_than_5_employees",
        "has_offices_or_branches",
        "several_years_operating",
      ],
      qualified_link: PRISMA_SDR_CALENDLY_URL,
      unqualified_link: PRISMA_SDR_STRIPE_URL,
    },
  };
}
