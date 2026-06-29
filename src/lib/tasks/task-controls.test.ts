import { describe, expect, it } from "vitest"

import {
  filterByDue,
  filterByPerson,
  sortTasksBy,
  type ControllableTask,
} from "./task-controls"

/** Fabrique une tâche minimale pour les tests (valeurs par défaut neutres). */
function task(over: Partial<ControllableTask>): ControllableTask {
  return {
    dueDate: null,
    createdAt: "2026-06-01T00:00:00.000Z",
    position: 0,
    assignedTo: null,
    isDone: false,
    ...over,
  }
}

// Résolveur de couleur : "s-*" = sauge, "b-*" = brique, sinon null.
const colorOf = (id: string | null) =>
  id?.startsWith("s") ? ("sauge" as const) : id?.startsWith("b") ? ("brique" as const) : null

describe("filterByPerson", () => {
  const tasks = [
    task({ assignedTo: "s-1" }),
    task({ assignedTo: "b-1" }),
    task({ assignedTo: null }),
  ]

  it("ne garde que la couleur demandée", () => {
    expect(filterByPerson(tasks, "sauge", colorOf)).toHaveLength(1)
    expect(filterByPerson(tasks, "brique", colorOf)).toHaveLength(1)
  })

  it("`all` laisse tout passer (y compris non assignées)", () => {
    expect(filterByPerson(tasks, "all", colorOf)).toHaveLength(3)
  })
})

describe("filterByDue", () => {
  const today = "2026-06-29"
  const tasks = [
    task({ dueDate: "2026-06-28" }), // overdue
    task({ dueDate: "2026-06-29" }), // today
    task({ dueDate: "2026-07-05" }), // upcoming
    task({ dueDate: null }), // none
  ]

  it("isole chaque tranche", () => {
    expect(filterByDue(tasks, "overdue", today)).toHaveLength(1)
    expect(filterByDue(tasks, "today", today)[0]?.dueDate).toBe("2026-06-29")
    expect(filterByDue(tasks, "upcoming", today)).toHaveLength(1)
    expect(filterByDue(tasks, "none", today)[0]?.dueDate).toBeNull()
  })

  it("`all` laisse tout passer", () => {
    expect(filterByDue(tasks, "all", today)).toHaveLength(4)
  })
})

describe("sortTasksBy", () => {
  it("due : retard → proche → loin, sans date en bas", () => {
    const sorted = sortTasksBy(
      [
        task({ dueDate: null, createdAt: "2026-06-10T00:00:00Z" }),
        task({ dueDate: "2026-07-01" }),
        task({ dueDate: "2026-06-01" }),
      ],
      "due",
      colorOf,
    )
    expect(sorted.map((t) => t.dueDate)).toEqual(["2026-06-01", "2026-07-01", null])
  })

  it("manual : par position croissante", () => {
    const sorted = sortTasksBy(
      [task({ position: 2 }), task({ position: 0 }), task({ position: 1 })],
      "manual",
      colorOf,
    )
    expect(sorted.map((t) => t.position)).toEqual([0, 1, 2])
  })

  it("created : la plus récente d'abord", () => {
    const sorted = sortTasksBy(
      [
        task({ createdAt: "2026-06-01T00:00:00Z" }),
        task({ createdAt: "2026-06-10T00:00:00Z" }),
      ],
      "created",
      colorOf,
    )
    expect(sorted.map((t) => t.createdAt)).toEqual([
      "2026-06-10T00:00:00Z",
      "2026-06-01T00:00:00Z",
    ])
  })

  it("assignee : sauge, puis brique, puis non assignée", () => {
    const sorted = sortTasksBy(
      [
        task({ assignedTo: null }),
        task({ assignedTo: "b-1" }),
        task({ assignedTo: "s-1" }),
      ],
      "assignee",
      colorOf,
    )
    expect(sorted.map((t) => colorOf(t.assignedTo))).toEqual([
      "sauge",
      "brique",
      null,
    ])
  })

  it("ne mute pas l'entrée", () => {
    const input = [task({ position: 1 }), task({ position: 0 })]
    const snapshot = [...input]
    sortTasksBy(input, "manual", colorOf)
    expect(input).toEqual(snapshot)
  })
})
