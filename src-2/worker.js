import { Worker } from "bullmq";

const workerName = process.argv[2] || "Unknown Worker";

const worker = new Worker(
    "demo-queue",
    async (job) => {
        console.log(`\n${workerName} picked Job ${job.id}`);

        let x = (job) => {
                console.log(job.id);
                process.exit(1);
        }

        if(workerName == 'B') x();

        await new Promise((resolve) => {
            setTimeout(resolve, 12000);
        });

        console.log(`${workerName} finished Job ${job.id}`);
    },
    {
        connection: {
            host: "127.0.0.1",
            port: 6379,
        },
    }
);

console.log(`${workerName} is waiting for jobs...`);