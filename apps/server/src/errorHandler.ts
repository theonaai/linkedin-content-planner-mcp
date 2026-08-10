import type { FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { NotFoundError, ValidationError, InvalidStateTransitionError } from "@linkedin-planner/core";
import { UnauthorizedError } from "./auth/errors.js";

export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ZodError) {
      return reply.code(400).send({ error: "Invalid input", issues: err.issues });
    }
    if (err instanceof UnauthorizedError) {
      return reply.code(401).send({ error: err.message });
    }
    if (err instanceof NotFoundError) {
      return reply.code(404).send({ error: err.message });
    }
    if (err instanceof ValidationError) {
      return reply.code(400).send({ error: err.message });
    }
    if (err instanceof InvalidStateTransitionError) {
      return reply.code(409).send({ error: err.message });
    }
    // Fastify's own request-parsing errors (e.g. FST_ERR_CTP_EMPTY_JSON_BODY for a
    // Content-Type: application/json request with no body, as a bodyless DELETE sends)
    // already carry a 4xx statusCode — surface that directly instead of masking a client
    // mistake as a 500.
    if (typeof err.statusCode === "number" && err.statusCode >= 400 && err.statusCode < 500) {
      return reply.code(err.statusCode).send({ error: err.message });
    }
    app.log.error(err);
    reply.code(500).send({ error: "Internal server error" });
  });
}
