import { describe, expect, test } from "bun:test";
import {
  parseDeliveryReports,
  toDeliveryState,
  verifyWebhookSignature,
} from "./unisenderWebhook";

const API_KEY = "test-api-key-0123456789";

/** Signs a body the way Unisender Go does: MD5 of the body with the key in. */
function sign(bodyWithPlaceholder: string, key = API_KEY): string {
  const hasher = new Bun.CryptoHasher("md5");
  hasher.update(bodyWithPlaceholder.replace("__AUTH__", key));
  const digest = hasher.digest("hex");
  return bodyWithPlaceholder.replace("__AUTH__", digest);
}

function callback(events: unknown[]): string {
  return sign(
    JSON.stringify({
      auth: "__AUTH__",
      events_by_user: [{ user_id: 1, events }],
    })
  );
}

function statusEvent(over: Record<string, unknown> = {}): unknown {
  return {
    event_name: "transactional_email_status",
    event_data: {
      email: "a@example.com",
      status: "delivered",
      metadata: { purpose: "signup" },
      ...over,
    },
  };
}

describe("Unisender Go webhook signature", () => {
  test("a correctly signed body verifies", () => {
    expect(verifyWebhookSignature(callback([statusEvent()]), API_KEY)).toBe(true);
  });

  test("a body signed with another key is refused", () => {
    const body = sign(
      JSON.stringify({ auth: "__AUTH__", events_by_user: [] }),
      "someone-elses-key"
    );
    expect(verifyWebhookSignature(body, API_KEY)).toBe(false);
  });

  test("tampering with the payload after signing is refused", () => {
    const body = callback([statusEvent()]);
    const tampered = body.replace("a@example.com", "attacker@example.com");
    expect(verifyWebhookSignature(tampered, API_KEY)).toBe(false);
  });

  test("a body with no signature at all is refused", () => {
    expect(verifyWebhookSignature(JSON.stringify({ events_by_user: [] }), API_KEY)).toBe(
      false
    );
  });
});

describe("Unisender Go status mapping", () => {
  test("arrival maps to taken, bounces to bounced, complaints to refused", () => {
    expect(toDeliveryState("delivered")).toBe("taken");
    expect(toDeliveryState("sent")).toBe("taken");
    expect(toDeliveryState("soft_bounced")).toBe("bounced");
    expect(toDeliveryState("hard_bounced")).toBe("bounced");
    expect(toDeliveryState("spam")).toBe("refused");
    expect(toDeliveryState("unsubscribed")).toBe("refused");
  });

  test("engagement events say nothing about delivery and are dropped", () => {
    expect(toDeliveryState("opened")).toBeNull();
    expect(toDeliveryState("clicked")).toBeNull();
    expect(toDeliveryState("something_new")).toBeNull();
  });
});

describe("Unisender Go callback parsing", () => {
  test("a bounce becomes a report against the address and purpose", () => {
    const body = JSON.parse(
      callback([
        statusEvent({
          status: "hard_bounced",
          metadata: { purpose: "password_reset" },
          delivery_info: { delivery_status: "err_mailbox_not_found" },
        }),
      ])
    );

    expect(parseDeliveryReports(body)).toEqual([
      {
        address: "a@example.com",
        purpose: "password_reset",
        state: "bounced",
        detail: "err_mailbox_not_found",
      },
    ]);
  });

  test("an event with no purpose in its metadata is dropped", () => {
    // Nothing ties it to a challenge, and guessing would touch the wrong one.
    const body = JSON.parse(callback([statusEvent({ metadata: {} })]));
    expect(parseDeliveryReports(body)).toEqual([]);
  });

  test("several events in one callback all come through", () => {
    const body = JSON.parse(
      callback([
        statusEvent(),
        statusEvent({ email: "b@example.com", status: "soft_bounced" }),
        statusEvent({ status: "opened" }),
      ])
    );
    expect(parseDeliveryReports(body)).toHaveLength(2);
  });

  test("a shapeless body yields nothing rather than throwing", () => {
    expect(parseDeliveryReports(null)).toEqual([]);
    expect(parseDeliveryReports({ events_by_user: "nope" })).toEqual([]);
  });
});
