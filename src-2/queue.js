import { Queue } from "bullmq";

export const myQueue = new Queue("demo-queue", {
    connection: {
        host: "127.0.0.1",
        port: 6379,
    },
});