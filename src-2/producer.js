import { myQueue } from "./queue.js";

async function main() {

    for (let i = 1; i <= 3; i++) {

        await myQueue.add("long-task", {
            number: i,
        });

        console.log(`Added Job ${i}`);
    }

    process.exit(0);
}

main();
