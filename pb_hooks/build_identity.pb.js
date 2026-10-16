routerAdd("GET", "/version", (e) => {
  const buildIdentity = require(`${__hooks}/build_identity.js`);
  return e.json(200, buildIdentity);
});
routerAdd("GET", "/api/version", (e) => {
  const buildIdentity = require(`${__hooks}/build_identity.js`);
  return e.json(200, buildIdentity);
});

// Intercept the built-in health route instead of registering a duplicate. This
// preserves the health endpoint's established status and response shape.
routerUse((e) => {
  if (e.request.url.path === "/api/health") {
    const buildIdentity = require(`${__hooks}/build_identity.js`);
    return e.json(200, {
      message: "API is healthy.",
      code: 200,
      data: {},
      ...buildIdentity,
    });
  }

  return e.next();
});
