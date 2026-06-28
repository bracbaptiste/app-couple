import { describe, expect, it } from "vitest"

import {
  jourCourantDansFuseau,
  parseTaskCommand,
  TaskParseError,
  type ProfileContext,
  type TodoListContext,
} from "./voice-parsing"

const LISTS: TodoListContext[] = [
  { id: "list-maison", name: "Maison" },
  { id: "list-pro", name: "Pro" },
]
const PROFILES: ProfileContext[] = [
  { id: "prof-moi", display_name: "Bapt", color: "sauge" },
  { id: "prof-soso", display_name: "Soso", color: "brique" },
]
const CTX = { lists: LISTS, profiles: PROFILES }

describe("parseTaskCommand", () => {
  it("parse un JSON pur complet", () => {
    const t = parseTaskCommand(
      JSON.stringify({
        title: "Sortir les poubelles",
        due_date: "2026-07-01",
        recurrence: {
          type: "weekly",
          interval: 1,
          weekday: 1,
          day_of_month: null,
        },
        assigned_to: "prof-soso",
        list_id: "list-maison",
      }),
      CTX,
    )
    expect(t).toEqual({
      title: "Sortir les poubelles",
      due_date: "2026-07-01",
      recurrence: { type: "weekly", interval: 1, weekday: 1, day_of_month: null },
      assigned_to: "prof-soso",
      list_id: "list-maison",
    })
  })

  it("tolère les fences Markdown et le préambule", () => {
    const raw =
      'Voici la tâche :\n```json\n{"title":"Acheter du pain","due_date":null,"recurrence":null,"assigned_to":null,"list_id":null}\n```'
    expect(parseTaskCommand(raw, CTX).title).toBe("Acheter du pain")
  })

  it("ramène à null un id de profil ou de liste inconnu (garde-fou §5)", () => {
    const t = parseTaskCommand(
      JSON.stringify({
        title: "X",
        due_date: null,
        recurrence: null,
        assigned_to: "prof-inventé",
        list_id: "list-inventée",
      }),
      CTX,
    )
    expect(t.assigned_to).toBeNull()
    expect(t.list_id).toBeNull()
  })

  it("rejette une due_date mal formée ou impossible", () => {
    expect(parseTaskCommand(JSON.stringify({ title: "X", due_date: "demain" }), CTX).due_date).toBeNull()
    expect(parseTaskCommand(JSON.stringify({ title: "X", due_date: "2026-02-31" }), CTX).due_date).toBeNull()
  })

  it("neutralise une récurrence 'none' ou de type inconnu en null", () => {
    expect(
      parseTaskCommand(
        JSON.stringify({ title: "X", recurrence: { type: "none", interval: 1 } }),
        CTX,
      ).recurrence,
    ).toBeNull()
  })

  it("borne l'interval et n'expose weekday/day_of_month que pour le bon type", () => {
    const daily = parseTaskCommand(
      JSON.stringify({
        title: "X",
        recurrence: { type: "daily", interval: 0, weekday: 3, day_of_month: 12 },
      }),
      CTX,
    ).recurrence
    expect(daily).toEqual({ type: "daily", interval: 1, weekday: null, day_of_month: null })

    const monthly = parseTaskCommand(
      JSON.stringify({
        title: "X",
        recurrence: { type: "monthly", interval: 2, weekday: 4, day_of_month: 15 },
      }),
      CTX,
    ).recurrence
    expect(monthly).toEqual({ type: "monthly", interval: 2, weekday: null, day_of_month: 15 })
  })

  it("lève TaskParseError sur JSON invalide ou titre manquant", () => {
    expect(() => parseTaskCommand("pas du json", CTX)).toThrow(TaskParseError)
    expect(() => parseTaskCommand(JSON.stringify({ title: "   " }), CTX)).toThrow(
      TaskParseError,
    )
  })
})

describe("jourCourantDansFuseau", () => {
  it("formate la date du jour au format YYYY-MM-DD dans le fuseau Paris", () => {
    // 2026-06-28T23:30:00Z = encore le 28 à Paris (UTC+2 en été → 29 juin 01:30).
    const j = jourCourantDansFuseau(new Date("2026-06-28T23:30:00Z"))
    expect(j.iso).toBe("2026-06-29")
    expect(j.label).toContain("2026")
  })
})
