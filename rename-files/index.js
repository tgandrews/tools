const fs = require("fs");
const path = require("path");

if (process.argv[2] === "--help" || process.argv.length < 5)  {
  console.log("[replacee] [replacer] [testIt?]")
  process.exit(0);
}

const directoryPath = path.resolve(process.cwd(), process.argv[2]);

const replacee = process.argv[3];
const replacer = process.argv[4];

const testIt = process.argv[5];

console.log({ replacee, replacer });

for (var thingName of fs.readdirSync(directoryPath)) {
  const filePath = path.resolve(directoryPath, thingName);
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) {
    continue;
  }
  const re = new RegExp(replacee);
  const newPath = path.resolve(
    directoryPath,
    thingName.replace(re, replacer)
  );
  if (!testIt) {
    fs.renameSync(filePath, newPath);
  } else {
    console.log({ filePath, newPath });
  }
}
