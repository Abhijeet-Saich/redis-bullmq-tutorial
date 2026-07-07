import { Worker } from "bullmq";

const workerName = process.argv[2] || "Unknown Worker";

const worker = new Worker(
    "demo-queue",
    async (job) => {
        console.log(job.id);
        process.exit(1);
    },
    {
        connection: {
            host: "127.0.0.1",
            port: 6379,
        },
    }
);

console.log(`${workerName} is waiting for jobs...`);