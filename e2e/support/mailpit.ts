/**
 * Mailpit email testing utilities for E2E tests
 *
 * Supabase now ships Mailpit under the legacy "inbucket" section name.
 * We prefer MAILPIT_* env vars but keep INBUCKET_* as a compatibility alias.
 */

interface MailpitRecipient {
  Name?: string;
  Address: string;
}

interface MailpitMessage {
  ID: string;
  Subject: string;
  To: MailpitRecipient[];
  From?: MailpitRecipient;
  Date?: string;
  // Convenience normalized fields for tests
  id?: string;
  subject?: string;
  to?: string[];
}

type MailpitMessageDetail = MailpitMessage & {
  HTML?: string;
  Text?: string;
};

export class MailpitClient {
  public readonly apiUrl: string;

  constructor() {
    const port =
      process.env["MAILPIT_PORT"] ?? process.env["INBUCKET_PORT"] ?? "54324";
    const host = process.env["MAILPIT_HOST"] ?? "localhost";
    this.apiUrl = `http://${host}:${port}/api/v1`;
  }

  /**
   * Get all messages for a mailbox
   */
  async getMessages(email: string): Promise<MailpitMessage[]> {
    const response = await fetch(
      `${this.apiUrl}/messages?query=addressed:"${email}"`
    );
    if (!response.ok) {
      if (response.status === 404) {
        return []; // Tolerate 404 as empty mailbox
      }
      throw new Error(
        `Failed to fetch messages: ${response.status} ${response.statusText}`
      );
    }

    const data = (await response.json()) as
      | { messages: MailpitMessage[] }
      | MailpitMessage[]
      | { items: MailpitMessage[] };

    const list: MailpitMessage[] = Array.isArray(data)
      ? data
      : "messages" in data
        ? data.messages
        : "items" in data
          ? data.items
          : [];

    return list.map((msg) => ({
      ...msg,
      id: msg.ID,
      subject: msg.Subject,
      to: msg.To.map((r) => r.Address),
    }));
  }

  /**
   * Get a specific message by ID
   */
  async getMessage(
    _email: string,
    messageId: string
  ): Promise<MailpitMessageDetail> {
    const response = await fetch(`${this.apiUrl}/message/${messageId}`);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch message ${messageId}: ${response.statusText}`
      );
    }

    const detail = (await response.json()) as MailpitMessageDetail;
    return {
      ...detail,
      id: detail.ID,
      subject: detail.Subject,
      to: detail.To.map((r) => r.Address),
    };
  }

  /**
   * Wait for an email matching criteria to arrive
   */
  async waitForEmail(
    email: string,
    criteria: {
      subject?: string;
      subjectContains?: string;
      timeout?: number;
      pollIntervalMs?: number;
    } = {}
  ): Promise<MailpitMessage | null> {
    const timeout = criteria.timeout ?? 30000;
    const interval = criteria.pollIntervalMs ?? 750;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const allMessages = await this.getMessages(email);

      // Filter messages to ensure they are addressed to the specific email
      // and match the other criteria. This is extra defensive against Mailpit
      // query broadness.
      const match = allMessages.find((msg) => {
        const isToRecipient =
          msg.to?.some((addr) => addr.toLowerCase() === email.toLowerCase()) ??
          false;
        if (!isToRecipient) return false;

        if (criteria.subject && msg.Subject !== criteria.subject) {
          return false;
        }
        if (
          criteria.subjectContains &&
          !msg.Subject.toLowerCase().includes(
            criteria.subjectContains.toLowerCase()
          )
        ) {
          return false;
        }
        return true;
      });

      if (match) {
        return match;
      }

      await new Promise((resolve) => setTimeout(resolve, interval));
    }

    return null;
  }

  /**
   * Extract signup link from the latest email for a mailbox
   */
  async getSignupLink(email: string): Promise<string> {
    console.log(`[Mailpit] Looking for invite email to ${email}...`);
    const latest = await this.waitForEmail(email, {
      subjectContains: "Invite",
      timeout: 30000,
      pollIntervalMs: 750,
    });

    if (!latest) {
      console.log(`[Mailpit] No invite email found after waiting`);
      // Try to get ALL messages to debug
      const allMessages = await this.getMessages(email);
      console.log(
        `[Mailpit] Total messages for ${email}: ${allMessages.length}`
      );
      allMessages.forEach((msg) => {
        console.log(`[Mailpit]   - ${msg.Subject} (${msg.ID})`);
      });
      throw new Error(`No invite messages found for ${email}`);
    }

    console.log(
      `[Mailpit] Found invite email: ${latest.Subject} (${latest.ID})`
    );
    const detail = await this.getMessage(email, latest.ID);
    const html = (detail.HTML ?? detail.Text ?? "").toString();
    const match = /href="([^"]*\/signup\?email=[^"]*)"/i.exec(html);
    if (!match?.[1]) {
      throw new Error("Signup link not found in email body");
    }
    return decodeHtmlEntities(match[1]);
  }
}

const decodeHtmlEntities = (text: string): string =>
  text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

const mailpitClient = new MailpitClient();

export const getSignupLink = async (email: string): Promise<string> =>
  mailpitClient.getSignupLink(email);
