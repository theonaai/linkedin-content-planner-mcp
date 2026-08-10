/** "Not signed in at all" — distinct from core's NotFoundError (thrown by assertMembership
 * for "signed in, but not a member of this workspace"), which deliberately maps to 404 rather
 * than 403 so a non-member can't tell a workspace exists just by probing its id. */
export class UnauthorizedError extends Error {
  constructor(message = "Not signed in") {
    super(message);
    this.name = "UnauthorizedError";
  }
}
