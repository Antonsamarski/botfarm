import { describe, expect, it } from "vitest";
import { checkPhone, maskPhone } from "../server/phone";

describe("телефон", () => {
  it("принимает российские номера в любом виде и приводит к одному формату", () => {
    for (const v of ["89991234567", "+7 999 123-45-67", "8 (999) 123 45 67", "9991234567", "+7(999)1234567"]) {
      expect(checkPhone(v)).toEqual({ ok: true, phone: "+7 (999) 123-45-67" });
    }
    expect(checkPhone("8 846 200-11-22")).toEqual({ ok: true, phone: "+7 (846) 200-11-22" });
    expect(checkPhone("+7 701 234 56 78").ok).toBe(true); // Казахстан
  });

  it("отсекает мусор", () => {
    for (const v of ["+7999", "123", "+7 (999) 999-99-99", "+7 900 000-00-00", "+7 123 456-78-90", "+7 012 345-67-89",
      "+7 (999) 123-45-6", "+7 999 123-45-678", "1234567890", "+7 999 123-45-67 доб 5", "abc", "+7 (555) 123-45-67"]) {
      expect(checkPhone(v).ok, v).toBe(false);
    }
  });

  it("иностранные — только с плюсом", () => {
    expect(checkPhone("+380 67 123 4567")).toEqual({ ok: true, phone: "+380671234567" });
    expect(checkPhone("380671234567").ok).toBe(false);
  });

  it("маска при вводе", () => {
    expect(maskPhone("8")).toBe("+7");
    expect(maskPhone("89")).toBe("+7 (9");
    expect(maskPhone("8999")).toBe("+7 (999");
    expect(maskPhone("89991")).toBe("+7 (999) 1");
    expect(maskPhone("899912345")).toBe("+7 (999) 123-45");
    expect(maskPhone("8999123456789")).toBe("+7 (999) 123-45-67");
    expect(maskPhone("+380")).toBe("+380");
  });
});

