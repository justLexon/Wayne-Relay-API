import "dotenv/config";
import Fastify from "fastify";
import { randomUUID } from "node:crypto";

type JobStatus = "queued" | "processing" | "done" | "error";

type Job = {
  id: string;
  userId: string;
  message: string;
  status: JobStatus;
  reply?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
};

const API_KEY = process.env.API_KEY || "dev-secret";
const PORT = Number(process.env.PORT || 3000);

const app = Fastify({ logger: true });

// --- Simple API key auth (header: Authorization: Bearer <key>)
app.addHook("preHandler", async (req, reply) => {
  // Allow health check without auth
  if (req.url === "/health") return;

  const auth = req.headers.authorization || "";
  const ok = auth === `Bearer ${API_KEY}`;
  if (!ok) {
    return reply.code(401).send({ error: "Unauthorized" });
  }
});

// --- In-memory job store (good for sanity check)
const jobs = new Map<string, Job>();

app.get("/health", async () => ({ ok: true }));

// Create a job
app.post("/jobs", async (req) => {
  const body = req.body as any;
  const userId = String(body?.userId ?? "default");
  const message = String(body?.message ?? "").trim();
  if (!message) return { error: "message is required" };

  const now = new Date().toISOString();
  const job: Job = {
    id: randomUUID(),
    userId,
    message,
    status: "queued",
    createdAt: now,
    updatedAt: now,
  };

  jobs.set(job.id, job);
  return { jobId: job.id };
});

// Get job status
app.get("/jobs/:id", async (req, reply) => {
  const { id } = req.params as any;
  const job = jobs.get(String(id));
  if (!job) return reply.code(404).send({ error: "Not found" });
  return job;
});

// Worker pulls next queued job
app.get("/jobs/next", async (req) => {
  const q = req.query as any;
  const userId = String(q?.userId ?? "default");

  for (const job of jobs.values()) {
    if (job.userId === userId && job.status === "queued") {
      job.status = "processing";
      job.updatedAt = new Date().toISOString();
      jobs.set(job.id, job);
      return job;
    }
  }
  return { job: null };
});

// Worker posts completion
app.post("/jobs/:id/complete", async (req, reply) => {
  const { id } = req.params as any;
  const job = jobs.get(String(id));
  if (!job) return reply.code(404).send({ error: "Not found" });

  const body = req.body as any;
  const replyText = String(body?.reply ?? "").trim();
  if (!replyText) return reply.code(400).send({ error: "reply is required" });

  job.status = "done";
  job.reply = replyText;
  job.updatedAt = new Date().toISOString();
  jobs.set(job.id, job);

  return { ok: true };
});

app.post("/jobs/:id/error", async (req, reply) => {
  const { id } = req.params as any;
  const job = jobs.get(String(id));
  if (!job) return reply.code(404).send({ error: "Not found" });

  const body = req.body as any;
  job.status = "error";
  job.error = String(body?.error ?? "unknown error");
  job.updatedAt = new Date().toISOString();
  jobs.set(job.id, job);

  return { ok: true };
});

app.listen({ port: PORT, host: "127.0.0.1" }).then(() => {
  console.log(`Relay API listening on http://127.0.0.1:${PORT}`);
});
