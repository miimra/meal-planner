"use strict";

function bearerToken(header) {
  if (typeof header !== "string" || header.slice(0, 7) !== "Bearer ") return "";
  return header.slice(7).trim();
}

function middleware(e) {
  const expected = $os.getenv("MEAL_ASSISTANT_TOKEN");
  if (!expected || expected.length < 32) {
    // Configuration failures are intentionally not described to remote callers.
    throw new InternalServerError("Meal assistant API is unavailable.");
  }

  const provided = bearerToken(e.request.header.get("Authorization"));
  const valid = provided && $security.equal(
    $security.sha256(provided),
    $security.sha256(expected),
  );
  if (!valid) {
    throw new UnauthorizedError("Missing or invalid meal assistant credential.");
  }

  return e.next();
}

function userOrAssistantMiddleware(e) {
  if (e.auth && e.auth.collection().name === "users") {
    return e.next();
  }

  return middleware(e);
}

module.exports = { bearerToken, middleware, userOrAssistantMiddleware };
