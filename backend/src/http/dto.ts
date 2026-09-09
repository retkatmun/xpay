/**
 * dto.ts — legacy wire-shape helpers kept for backward compat.
 * New code uses inline serialisers in http/api/index.ts directly.
 * This file is retained only so any old imports don't break during migration.
 */

import type { UserRow } from "../db/schema.js"

export type PublicUserDto = {
  username: string
  displayName: string
}

export const toPublicUserDto = (u: UserRow): PublicUserDto => ({
  username: u.username,
  displayName: u.displayName,
})
