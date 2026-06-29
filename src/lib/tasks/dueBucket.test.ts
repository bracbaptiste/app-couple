import { describe, expect, it } from "vitest"

import { dueBucket, parisTodayIso } from "./dueBucket"

describe("parisTodayIso", () => {
  it("renvoie le jour à Paris, pas en UTC (décalage de nuit)", () => {
    // 28 juin 23h30 UTC = 29 juin 01h30 à Paris (heure d'été) → on est déjà le 29.
    const lateNightUtc = new Date("2026-06-28T23:30:00Z")
    expect(parisTodayIso(lateNightUtc)).toBe("2026-06-29")
  })

  it("renvoie « yyyy-mm-dd »", () => {
    expect(parisTodayIso(new Date("2026-01-15T12:00:00Z"))).toBe("2026-01-15")
  })
})

describe("dueBucket", () => {
  const today = "2026-06-29"

  it("classe selon le jour courant à Paris", () => {
    expect(dueBucket(null, today)).toBe("none")
    expect(dueBucket("2026-06-28", today)).toBe("overdue")
    expect(dueBucket("2026-06-29", today)).toBe("today")
    expect(dueBucket("2026-06-30", today)).toBe("upcoming")
  })

  it("tronque un timestamp éventuel au jour", () => {
    expect(dueBucket("2026-06-29T00:00:00Z", today)).toBe("today")
  })
})
