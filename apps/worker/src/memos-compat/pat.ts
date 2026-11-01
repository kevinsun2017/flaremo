/**
 * Personal-access-token DTO shared by the current REST and Connect Memos
 * surfaces; both previously carried identical copies.
 */

export type PersonalAccessTokenLike = {
  id: string;
  name: string | null;
  createdAt: Date;
  expiresAt: Date | null;
  lastRequest: Date | null;
};

export function personalAccessTokenToDto(
  token: PersonalAccessTokenLike,
  userId: string,
) {
  return {
    name: `${userId}/personalAccessTokens/${token.id}`,
    ...(token.name ? { description: token.name } : {}),
    createdAt: token.createdAt.toISOString(),
    ...(token.expiresAt ? { expiresAt: token.expiresAt.toISOString() } : {}),
    ...(token.lastRequest
      ? { lastUsedAt: token.lastRequest.toISOString() }
      : {}),
  };
}
