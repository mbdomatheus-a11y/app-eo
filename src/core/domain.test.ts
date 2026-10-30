import { describe, expect, it } from "vitest";
import {
  acknowledge,
  canReadNotice,
  canTarget,
  hasAcknowledged,
  initialState,
  people,
  tasks,
  visibleTasks,
} from "./domain";

describe("abrangência e ciência de comunicados", () => {
  const [manager, employee, director, admin] = people;
  const [notice, , otherStore] = initialState().notices;
  it("isola comunicados de outra loja e impede confirmar por acesso direto", () => {
    expect(canReadNotice(manager, otherStore)).toBe(false);
    expect(() => acknowledge([], manager, otherStore, "now")).toThrow();
    expect(canReadNotice(director, otherStore)).toBe(true);
    expect(canReadNotice(admin, otherStore)).toBe(true);
  });
  it("confirma uma vez por pessoa e versão, sem transferir ciência entre usuários", () => {
    const first = acknowledge([], manager, notice, "first");
    expect(acknowledge(first, manager, notice, "second")).toEqual(first);
    expect(hasAcknowledged(first, employee, notice)).toBe(false);
    expect(hasAcknowledged(first, manager, { ...notice, version: 2 })).toBe(
      false,
    );
    expect(
      acknowledge(first, manager, { ...notice, version: 2 }, "third"),
    ).toHaveLength(2);
  });
  it("restringe publicação ao perfil e à abrangência, inclusive com público vazio", () => {
    expect(canTarget(manager, ["001"])).toBe(false);
    expect(canTarget(employee, ["001"])).toBe(false);
    expect(canTarget(director, ["001", "002"])).toBe(true);
    expect(canTarget(director, ["003"])).toBe(false);
    expect(canTarget(admin, [])).toBe(false);
  });
  it("mostra somente tarefas pessoais para colaborador e da loja para gerente", () => {
    expect(visibleTasks(employee, tasks).map((t) => t.id)).toEqual(["t2"]);
    expect(visibleTasks(manager, tasks).map((t) => t.id)).toEqual([
      "t1",
      "t2",
      "t3",
    ]);
  });
});
