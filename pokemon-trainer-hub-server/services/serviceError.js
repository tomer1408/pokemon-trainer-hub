// A business-logic error raised by a service function (e.g. "duplicate",
// "not found"). Routers catch this and map `code` to the right HTTP status —
// services themselves never know about HTTP.
class ServiceError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

module.exports = ServiceError;
