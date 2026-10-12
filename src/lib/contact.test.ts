import { describe, expect, it } from "vitest";
import {
  addressInline,
  addressLines,
  contactFromEnv,
  isPlaceholder,
  looksLikeUid,
  missingForLaunch,
} from "./contact";

describe("contactFromEnv", () => {
  it("bez promennych vraci prazdne retezce a vychozi e-mail, ne zastupne texty", () => {
    const c = contactFromEnv({});
    expect(c.phone).toBe("");
    expect(c.street).toBe("");
    expect(c.email).toBe("info@tichy24.ch");
    expect(c.pickupHours).toBe("nach Vereinbarung");
    expect(JSON.stringify(c)).not.toContain("[");
  });

  it("cte hodnoty a orizne mezery", () => {
    const c = contactFromEnv({
      SHOP_PHONE: " +41 79 123 45 67 ",
      SHOP_STREET: "Bahnhofstrasse 1",
      SHOP_POSTAL_CODE: "8001",
      SHOP_CITY: "Zürich",
      SHOP_UID: "CHE-123.456.789",
      SHOP_EMAIL: "  shop@example.ch ",
      SHOP_PICKUP_HOURS: "Mo–Fr 17–19 Uhr",
    });
    expect(c).toMatchObject({
      phone: "+41 79 123 45 67",
      email: "shop@example.ch",
      pickupHours: "Mo–Fr 17–19 Uhr",
    });
  });

  it("prazdny retezec v env se chova jako nenastaveno (e-mail spadne na vychozi)", () => {
    expect(contactFromEnv({ SHOP_EMAIL: "   " }).email).toBe("info@tichy24.ch");
  });
});

describe("missingForLaunch", () => {
  it("vypise vsechny chybejici promenne", () => {
    expect(missingForLaunch(contactFromEnv({}))).toEqual([
      "SHOP_PHONE",
      "SHOP_STREET",
      "SHOP_POSTAL_CODE",
      "SHOP_CITY",
      "SHOP_UID",
    ]);
  });

  it("kdyz je vse vyplneno, nechybi nic", () => {
    const c = contactFromEnv({
      SHOP_PHONE: "1",
      SHOP_STREET: "a",
      SHOP_POSTAL_CODE: "8001",
      SHOP_CITY: "b",
      SHOP_UID: "CHE-123.456.789",
    });
    expect(missingForLaunch(c)).toEqual([]);
  });
});

describe("zastupne hodnoty", () => {
  it.each(["[PLZ]", "[Strasse und Nr.]", " [Ort] "])("%j je zastupna", (v) =>
    expect(isPlaceholder(v)).toBe(true),
  );
  it.each(["", "8001", "Zürich", "CHE-123.456.789"])("%j neni zastupna", (v) =>
    expect(isPlaceholder(v)).toBe(false),
  );

  it("pro spusteni se zastupna hodnota pocita jako chybejici", () => {
    const c = contactFromEnv({
      SHOP_PHONE: "[Telefonnummer]",
      SHOP_STREET: "Bahnhofstrasse 1",
      SHOP_POSTAL_CODE: "[PLZ]",
      SHOP_CITY: "Zürich",
      SHOP_UID: "[CHE-xxx.xxx.xxx]",
    });
    expect(missingForLaunch(c)).toEqual(["SHOP_PHONE", "SHOP_POSTAL_CODE", "SHOP_UID"]);
  });
});

describe("address helpers", () => {
  it("preskoci nevyplnene casti", () => {
    expect(addressLines(contactFromEnv({}))).toEqual([]);
    expect(addressInline(contactFromEnv({}))).toBe("");
    expect(addressLines(contactFromEnv({ SHOP_CITY: "Zürich" }))).toEqual(["Zürich"]);
  });

  it("sklada ulici a PSC s obci", () => {
    const c = contactFromEnv({ SHOP_STREET: "Bahnhofstrasse 1", SHOP_POSTAL_CODE: "8001", SHOP_CITY: "Zürich" });
    expect(addressLines(c)).toEqual(["Bahnhofstrasse 1", "8001 Zürich"]);
    expect(addressInline(c)).toBe("Bahnhofstrasse 1, 8001 Zürich");
  });
});

describe("looksLikeUid", () => {
  it.each(["CHE-123.456.789", "CHE-123.456.789 MWST", "che-123.456.789 tva"])("prijme %s", (v) =>
    expect(looksLikeUid(v)).toBe(true),
  );
  it.each(["", "123.456.789", "CHE-12.456.789", "[CHE-xxx.xxx.xxx]"])("odmitne %j", (v) =>
    expect(looksLikeUid(v)).toBe(false),
  );
});
