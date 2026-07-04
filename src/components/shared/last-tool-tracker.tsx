"use client"

import { usePathname } from "next/navigation"
import { useEffect } from "react"

import { rememberTool } from "@/lib/navigation/last-tool"

/**
 * Persiste le dernier outil consulté à chaque navigation (PRD V4 §4.3).
 * Monté une fois dans le shell app, ne rend rien : c'est un pur effet de bord.
 */
export function LastToolTracker() {
  const pathname = usePathname()

  useEffect(() => {
    rememberTool(pathname)
  }, [pathname])

  return null
}
