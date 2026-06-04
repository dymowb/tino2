import { User } from '@/models/User';

/**
 * Public-safe shape of a user — only fields safe to expose to other users.
 * NEVER include password, reset/verification tokens, Stripe IDs, settings, etc.
 */
export interface PublicUser {
  id: string;
  firstName: string;
  lastName: string;
  profileImage: string | null;
  userType: string;
}

/**
 * Strip a User entity down to public-safe fields.
 * Used anywhere a user is embedded in a response visible to OTHER users
 * (messaging participants, message sender/receiver, etc.).
 */
export function toPublicUser(user: User | null | undefined): PublicUser | null {
  if (!user) return null;
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    profileImage: user.profileImage ?? null,
    userType: user.userType,
  };
}
