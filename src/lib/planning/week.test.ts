import { describe, expect, it } from "vitest"

import {
  addDays,
  addWeeks,
  formatWeekLabel,
  isSameDay,
  parseDateKey,
  resolveWeekStart,
  startOfWeek,
  toDateKey,
  weekDays,
} from "./week"

describe("toDateKey", () => {
  it("formate en YYYY-MM-DD local (zéros de tête)", () => {
    expect(toDateKey(new Date(2026, 0, 5))).toBe("2026-01-05")
    expect(toDateKey(new Date(2026, 11, 31))).toBe("2026-12-31")
  })
})

describe("parseDateKey", () => {
  it("parse une clé valide en date locale à minuit", () => {
    const d = parseDateKey("2026-07-06")
    expect(d).not.toBeNull()
    expect(toDateKey(d!)).toBe("2026-07-06")
    expect(d!.getHours()).toBe(0)
  })

  it("rejette le format non conforme", () => {
    expect(parseDateKey("2026-7-6")).toBeNull()
    expect(parseDateKey("hier")).toBeNull()
    expect(parseDateKey("")).toBeNull()
  })

  it("rejette une date calendaire impossible (repliée)", () => {
    expect(parseDateKey("2026-02-31")).toBeNull()
    expect(parseDateKey("2026-13-01")).toBeNull()
  })

  it("est l'inverse de toDateKey", () => {
    const key = "2026-03-09"
    expect(toDateKey(parseDateKey(key)!)).toBe(key)
  })
})

describe("startOfWeek", () => {
  it("renvoie le lundi de la semaine (milieu de semaine)", () => {
    // mercredi 8 juillet 2026 → lundi 6 juillet 2026
    expect(toDateKey(startOfWeek(new Date(2026, 6, 8)))).toBe("2026-07-06")
  })

  it("renvoie le lundi même quand on est déjà lundi", () => {
    expect(toDateKey(startOfWeek(new Date(2026, 6, 6)))).toBe("2026-07-06")
  })

  it("rattache le dimanche à la semaine qui s'achève (pas la suivante)", () => {
    // dimanche 12 juillet 2026 → lundi 6 juillet 2026
    expect(toDateKey(startOfWeek(new Date(2026, 6, 12)))).toBe("2026-07-06")
  })
})

describe("weekDays", () => {
  it("produit 7 jours consécutifs lundi → dimanche", () => {
    const monday = startOfWeek(new Date(2026, 6, 8))
    const keys = weekDays(monday).map(toDateKey)
    expect(keys).toEqual([
      "2026-07-06",
      "2026-07-07",
      "2026-07-08",
      "2026-07-09",
      "2026-07-10",
      "2026-07-11",
      "2026-07-12",
    ])
  })
})

describe("addDays / addWeeks", () => {
  it("décale sans muter l'entrée", () => {
    const base = new Date(2026, 6, 6)
    expect(toDateKey(addDays(base, 3))).toBe("2026-07-09")
    expect(toDateKey(addWeeks(base, 1))).toBe("2026-07-13")
    expect(toDateKey(addWeeks(base, -1))).toBe("2026-06-29")
    // base inchangée
    expect(toDateKey(base)).toBe("2026-07-06")
  })

  it("franchit correctement les frontières de mois", () => {
    expect(toDateKey(addDays(new Date(2026, 6, 31), 1))).toBe("2026-08-01")
  })
})

describe("isSameDay", () => {
  it("ignore l'heure", () => {
    expect(
      isSameDay(new Date(2026, 6, 6, 8), new Date(2026, 6, 6, 23)),
    ).toBe(true)
    expect(isSameDay(new Date(2026, 6, 6), new Date(2026, 6, 7))).toBe(false)
  })
})

describe("resolveWeekStart", () => {
  const today = new Date(2026, 6, 8) // mercredi

  it("normalise le paramètre au lundi de sa semaine", () => {
    expect(toDateKey(resolveWeekStart("2026-07-09", today))).toBe("2026-07-06")
  })

  it("retombe sur la semaine du jour si le paramètre est absent", () => {
    expect(toDateKey(resolveWeekStart(undefined, today))).toBe("2026-07-06")
  })

  it("retombe sur la semaine du jour si le paramètre est invalide", () => {
    expect(toDateKey(resolveWeekStart("n'importe quoi", today))).toBe(
      "2026-07-06",
    )
  })
})

describe("formatWeekLabel", () => {
  it("affiche la plage lundi – dimanche", () => {
    expect(formatWeekLabel(new Date(2026, 6, 6))).toBe("6 juil. – 12 juil.")
  })

  it("gère une semaine à cheval sur deux mois", () => {
    expect(formatWeekLabel(new Date(2026, 5, 29))).toBe("29 juin – 5 juil.")
  })
})
