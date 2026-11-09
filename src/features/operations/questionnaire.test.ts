import { describe, expect, it } from "vitest";
import {
  listFromLines,
  validateAnswers,
  type DiaryConfig,
} from "./questionnaire";
const config: DiaryConfig = {
  prompt: "Como foi?",
  note_label: "Relato",
  note_required: true,
  note_max_chars: 10,
  sold: ["Fluxo"],
  no_sale: ["Preço"],
  questions: [
    {
      id: "n",
      label: "Quantidade",
      type: "number",
      required: true,
      max_chars: 8,
      options: [],
    },
    {
      id: "s",
      label: "Turno",
      type: "select",
      required: true,
      max_chars: 10,
      options: ["Manhã", "Tarde"],
    },
    {
      id: "t",
      label: "Observação",
      type: "text",
      required: false,
      max_chars: 3,
      options: [],
    },
  ],
};
describe("questionário diário", () => {
  it("valida obrigatoriedade, números brasileiros e opções legítimas", () => {
    expect(validateAnswers(config, { n: "2,5", s: "Manhã" }, "Relato")).toBe(
      "",
    );
    expect(validateAnswers(config, { n: "2", s: "Tarde" }, " ")).toContain(
      "Relato",
    );
    expect(validateAnswers(config, { n: "", s: "Tarde" }, "Relato")).toContain(
      "Quantidade",
    );
    expect(
      validateAnswers(config, { n: "dois", s: "Tarde" }, "Relato"),
    ).toContain("número");
    expect(validateAnswers(config, { n: "2", s: "Noite" }, "Relato")).toContain(
      "Turno",
    );
  });
  it("respeita limites e mantém respostas anteriores intocadas", () => {
    const answers = { n: "2", s: "Manhã", t: "1234" };
    expect(validateAnswers(config, answers, "Relato")).toContain(
      "3 caracteres",
    );
    expect(validateAnswers(config, {}, "12345678901")).toContain(
      "10 caracteres",
    );
    expect(answers).toEqual({ n: "2", s: "Manhã", t: "1234" });
  });
  it("transforma categorias sem duplicar nem manter linhas vazias", () => {
    expect(listFromLines(" Fluxo\n\nPreço\nFluxo ")).toEqual([
      "Fluxo",
      "Preço",
    ]);
  });
});
