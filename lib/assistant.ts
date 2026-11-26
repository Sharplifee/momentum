export const ASSISTANT_NAME = "Norma";
// Sender enum used in the DB; do NOT rename the enum/table columns.
export const SENDER_ASSISTANT = "nora";

/**
 * Helper to render "Norma (AI assistant)" consistently.
 */
export function assistantDisplayLabel(): string {
  return `${ASSISTANT_NAME} (AI assistant)`;
}
