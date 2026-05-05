import { describe, it, expect } from "vitest";
import { getHelpTranslations } from "../../../src/vite/client/plugins/help-i18n";

const SUPPORTED_LANGUAGES = [
  "en-US",
  "de",
  "es-ES",
  "fr",
  "ko",
  "pt-BR",
  "ru",
  "ja",
  "zh-CN",
  "zh-TW",
];

describe("help-i18n", () => {
  describe("getHelpTranslations", () => {
    it.each(SUPPORTED_LANGUAGES)(
      "returns translations for %s",
      (lang) => {
        const t = getHelpTranslations(lang);

        expect(t.sections).toBeDefined();
        expect(t.sections.properties).toBeTruthy();
        expect(t.sections.credentials).toBeTruthy();
        expect(t.sections.input).toBeTruthy();
        expect(t.sections.output).toBeTruthy();
        expect(t.sections.outputs).toBeTruthy();
        expect(t.sections.port).toBeTruthy();

        expect(t.columns).toBeDefined();
        expect(t.columns.property).toBeTruthy();
        expect(t.columns.label).toBeTruthy();
        expect(t.columns.type).toBeTruthy();
        expect(t.columns.required).toBeTruthy();
        expect(t.columns.default).toBeTruthy();
        expect(t.columns.description).toBeTruthy();

        expect(t.values).toBeDefined();
        expect(t.values.yes).toBeTruthy();
        expect(t.values.no).toBeTruthy();
      },
    );

    it("falls back to en-US for unknown languages", () => {
      const t = getHelpTranslations("xx-XX");
      const enUS = getHelpTranslations("en-US");
      expect(t).toEqual(enUS);
    });

    it("returns different translations for different languages", () => {
      const en = getHelpTranslations("en-US");
      const ptBR = getHelpTranslations("pt-BR");
      const de = getHelpTranslations("de");

      expect(en.sections.properties).toBe("Properties");
      expect(ptBR.sections.properties).toBe("Propriedades");
      expect(de.sections.properties).toBe("Eigenschaften");

      expect(en.values.yes).toBe("Yes");
      expect(ptBR.values.yes).toBe("Sim");
      expect(de.values.yes).toBe("Ja");
    });
  });
});
