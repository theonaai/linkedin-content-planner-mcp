import type { FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { NotFoundError, ValidationError, InvalidStateTransitionError } from "@linkedin-planner/core";

export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ZodError) {
      return reply.code(400).send({ error: "Invalid input", issues: err.issues });
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
    app.log.error(err);
    reply.code(500).send({ error: "Internal server error" });
  });
}
