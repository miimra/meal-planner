// Rewritten during the image build. These development defaults deliberately do
// not read environment variables so a running container cannot change its
// reported identity.
module.exports = Object.freeze({
  service: "meal-planner",
  version: "development",
  commit: "development",
  builtAt: "development",
});
