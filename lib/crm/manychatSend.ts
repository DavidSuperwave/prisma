/**
 * Outbound send via the ManyChat Messenger/Cloud API.
 *
 * If `MANYCHAT_API_KEY` is not configured, returns a non-fatal error so local
 * dev and degraded production modes still let the UI record the reply.
 */

export type ManychatSendArgs = {
  subscriberId: string;
  text: string;
};

export type ManychatSendResult =
  | { ok: true; providerMessageId?: string }
  | { ok: false; error: string; retryable: boolean };

const MANYCHAT_BASE = "https://api.manychat.com";

export async function sendViaManychat(args: ManychatSendArgs): Promise<ManychatSendResult> {
  const key = process.env.MANYCHAT_API_KEY?.trim();
  if (!key) {
    return { ok: false, error: "MANYCHAT_API_KEY not configured", retryable: false };
  }
  try {
    const response = await fetch(`${MANYCHAT_BASE}/fb/sending/sendContent`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        subscriber_id: args.subscriberId,
        data: {
          version: "v2",
          content: {
            messages: [{ type: "text", text: args.text }],
          },
        },
        message_tag: "ACCOUNT_UPDATE",
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return {
        ok: false,
        error: `ManyChat ${response.status}: ${body.slice(0, 300) || response.statusText}`,
        retryable: response.status >= 500 || response.status === 429,
      };
    }

    const json = (await response.json().catch(() => ({}))) as {
      data?: { message_id?: string };
    };
    return { ok: true, providerMessageId: json?.data?.message_id };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      retryable: true,
    };
  }
}
