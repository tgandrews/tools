const fs = require('fs/promises');
const path = require('path');

const dirPath = process.argv[3];

(async () => {
  const directoryPath = path.resolve(dirPath)
  const files = await fs.readdir(directoryPath);
  for (const file of files) {
    if (!file.startsWith('VD') && !file.startsWith('IM')) {
      continue;
    }

    const [, fileEnding] = file.split('.')
    const oldFilePath = path.resolve(`${directoryPath}/${file}`);
    const { mtime } = await fs.stat(oldFilePath);

    const newName = `${mtime.toJSON().replace(/[T:\.]/g, '-').replace('-000Z', '')}.${fileEnding}`

    const newFilePath = path.resolve(`${directoryPath}/${newName}`);
    console.log({
      oldFilePath,
      newFilePath
    })

    await fs.rename(oldFilePath, newFilePath)
  }

})().catch((e) => {
  console.error(e);
  process.exit(1);
})