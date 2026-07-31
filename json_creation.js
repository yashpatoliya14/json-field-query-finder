import fs from "fs";

const TARGET_SIZE = 50 * 1024 * 1024; // 50 MB
const OUTPUT = "test_50mb.json";

const stream = fs.createWriteStream(OUTPUT);

let size = 0;
let id = 1;

stream.write('{"records":[');
size += Buffer.byteLength('{"records":[');

while (true) {
  const record = JSON.stringify({
    id,
    name: `User ${id}`,
    email: `user${id}@example.com`,
    active: id % 2 === 0,
    score: id % 100,
    tags: ["test", "sample", "json", "large"],
    description: "x".repeat(500),
  });

  const chunk = (id === 1 ? "" : ",") + record;
  const chunkSize = Buffer.byteLength(chunk);

  if (size + chunkSize + 2 > TARGET_SIZE) {
    break;
  }

  stream.write(chunk);
  size += chunkSize;
  id++;
}

stream.write("]}");
stream.end(() => {
  const stats = fs.statSync(OUTPUT);
  console.log(
    `Created ${OUTPUT} (${(stats.size / 1024 / 1024).toFixed(2)} MB) with ${id - 1} records`,
  );
});
