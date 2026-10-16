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
    const data = {};
    if (e.hasSuperuserAuth()) {
      const trustedProxyHeaders = $app.settings().trustedProxy.headers || [];
      data.canBackup = !$app.store().has("@activeBackup");
      data.realIP = e.realIP();
      data.possibleProxyHeader = "";
      const headersToCheck = [
        ...trustedProxyHeaders,
        "CF-Connecting-IP",
        "Fly-Client-IP",
        "X-Forwarded-For",
      ];
      for (const header of headersToCheck) {
        if (e.request.header.get(header)) {
          data.possibleProxyHeader = header;
          break;
        }
      }
    }
    return e.json(200, {
      message: "API is healthy.",
      code: 200,
      data,
      ...buildIdentity,
    });
  }

  return e.next();
});
