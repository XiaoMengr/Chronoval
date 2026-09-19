import type { SessionUser } from '../../server/utils/auth'

declare module '#auth-utils' {
  interface User extends SessionUser {}
}

export {}