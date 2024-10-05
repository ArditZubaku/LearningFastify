import Fastify, {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  HookHandlerDoneFunction,
} from "fastify";
import fastifyMongo from "@fastify/mongodb";
import { JSONSchemaType } from "ajv";

const fastify = Fastify({
  logger: {
    level: "debug",
    transport: {
      target: "pino-pretty",
    },
  },
});

fastify.get("/", async (_request, _reply) => {
  return { message: "Hello World" };
});

// fastify.addHook("preHandler", async (request: FastifyRequest, reply: FastifyReply) => {
//   request.user = "John Doe";
// })

declare module "fastify" {
  export interface FastifyInstance {
    signJWT(): string;
    verifyJWT(): { name: string };
  }
  export interface FastifyRequest {
    user: {
      name: string;
      age: number;
    };
  }
}

fastify.decorateRequest("user", {
  getter() {
    return {
      name: "",
      age: 0,
    };
  },
});
fastify.decorate("signJWT", () => "signed-jwt");
fastify.decorate("verifyJWT", () => ({ name: "Tom" }));

fastify.addHook(
  "preHandler",
  (
    request: FastifyRequest,
    reply: FastifyReply,
    done: HookHandlerDoneFunction
  ) => {
    request.user = {
      name: "John Doe",
      age: 30,
    };

    done();
  }
);

type BodyType = {
  name: string;
  age: number;
  test?: boolean;
};

async function userRoutes(fastify: FastifyInstance) {
  fastify.addHook("onRequest", async () => {
    fastify.log.info("onRequest: Scoped for user routes");
  });

  fastify.addHook("onResponse", async () => {
    fastify.log.info("onResponse: Scoped for user routes");
  });

  const schema: JSONSchemaType<BodyType> = {
    $id: "userSchema",
    type: "object",
    required: ["name"],
    properties: {
      name: { type: "string" },
      age: { type: "number" },
      test: { type: "boolean", nullable: true },
    },
  };

  fastify.post("/", {
    schema: {
      body: schema,
      response: {
        201: {
          type: "object",
          properties: {
            message: { type: "string" },
            jwt: { type: "string" },
            verified: {
              type: "object",
              properties: {
                name: { type: "string" },
              },
            },
          },
        },
      }
    },
    preHandler: async (_request, _reply) => {
      fastify.log.info("Pre-handler-test");
    },
    handler: (
      request: FastifyRequest<{ Body: BodyType }>,
      reply: FastifyReply
    ) => {
      fastify.log.debug("Request body: %o", request.body);
      const jwt = fastify.signJWT();
      const verified = fastify.verifyJWT();
      return reply.code(201).send({ message: "User created", jwt, verified });
    },
  });

  fastify.log.info("User routes registered");
}

fastify.register(userRoutes, { prefix: "/api/users" });

async function dbConnector(fastify: FastifyInstance) {
  // fastify.register(fastifyMongo, { url: "mongodb://localhost:27017/test" });
  fastify.log.info("Connected to MongoDB");
}

fastify.register(dbConnector);

// Add hooks before starting the server
fastify.addHook("onRequest", async () => {
  fastify.log.info("Request received");
});

fastify.addHook("onResponse", async (_, reply: FastifyReply) => {
  fastify.log.info("Response sent");
  fastify.log.info(reply.elapsedTime)
});

// Start the server
fastify.listen(
  {
    port: 3000,
    host: "0.0.0.0",
  },
  (err: Error | null, address: string) => {
    if (err) {
      fastify.log.error(err.message);
      process.exit(1); // Exit with error
    } else {
      fastify.log.info(`Listening on port 3000 at address ${address}`);

      // Signal handling after server starts
      ["SIGINT", "SIGTERM"].forEach((signal: string) => {
        process.on(signal, async () => {
          fastify.log.info(`Received signal ${signal}, shutting down...`);
          try {
            await fastify.close();
            process.exit(0); // Graceful exit
          } catch (err) {
            fastify.log.error(`Error during shutdown: ${err}`);
            process.exit(1); // Exit with error
          }
        });
      });
    }
  }
);

// Export Fastify instance for testing
export default fastify;
