"use strict";

// Method handler table. Each entry maps a JSON-RPC method name to
// function (params, context) returning the result object. Throw an RpcError
// (see dispatcher.js) to return a JSON-RPC error. The dispatcher and auth code
// do not need to change to add methods: register `initialize`, `tools/list`
// and `tools/call` here. Until then they answer method-not-found.
module.exports = {};
