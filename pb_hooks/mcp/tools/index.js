"use strict";

// Tool registry. Sibling modules each export an array of tools:
// { name, title, description, inputSchema, annotations, handler(app, args) }.
module.exports = [].concat(
  require(`${__hooks}/mcp/tools/context.js`),
  require(`${__hooks}/mcp/tools/plan.js`),
  require(`${__hooks}/mcp/tools/catalog.js`)
);
