import fs from "fs/promises";
import path from "path";

(async () => {
  const [episodeFolderPath, seasonDefinition, writeArg] = process.argv.slice(3)
  if (episodeFolderPath === "--help") {
    console.log("Expect [path] [seasonDefinition] [write]");
    console.log("e.g. `folder 2,5,6` denoting 2 episodes in season 1, 5 in season 2 and 6 episodes in season 3");
    console.log("final argument persists the changes to disk");
    return;
  }
  const shouldPersist = Boolean(writeArg);
  console.log({ shouldPersist, lenght: process.argv.length });
  if (process.argv.length !== 5 && process.argv.length !== 6) {
    throw new Error("Incorrect number of arguments");
  }

  const resolvedFolderPath = path.resolve(process.cwd(), episodeFolderPath);
  const entries = await fs.readdir(resolvedFolderPath, { withFileTypes: true });
  const files = entries.filter(e => e.isFile());
  const mediaFiles = files.filter(f => f.name.endsWith(".mp4") || f.name.endsWith(".flv"));
  const episodes = mediaFiles.map(f => {
    const name = f.name;
    const match = name.match(/(\d+)/);
    if (!match) {
      throw new Error(`Found no match: ${name}`);
    }
    const episodeNumber = parseInt(match[0], 10);
    const fileParts = name.split('.');
    const fileEnding = fileParts[fileParts.length - 1];

    return { name, episodeNumber, fileEnding };
  }).reduce((arr, ep) => {
    if (arr[ep.episodeNumber]) {
      throw new Error(`Duplicate episode: ${ep.episodeNumber}`);
    }
    arr[ep.episodeNumber] = ep;
    return arr;
  }, [] as {name: string, episodeNumber: number, fileEnding: string}[]);

  
  const seasons = seasonDefinition.split(",").map(s => parseInt(s.trim(), 10))
  const expectedEpisodeCount = seasons.reduce((sum, episodesInSeason) => sum + episodesInSeason, 0);

  let totalEpisodeIndex = 1;
  console.log(episodes);
  for (let seasonIndex = 0; seasonIndex < seasons.length; ++seasonIndex) {
    const episodeCount = seasons[seasonIndex];
    for (let episodeIndex = 0; episodeIndex < episodeCount; ++episodeIndex) {
      const episode = episodes[totalEpisodeIndex];
      const oldFilePath = path.resolve(resolvedFolderPath, episode.name);
      const newFilePath = path.resolve(resolvedFolderPath, `Dragon.Ball.Z.S${(seasonIndex + 1).toString().padStart(2, "0")}E${(episodeIndex + 1).toString().padStart(2, "0")}.${episode.fileEnding}`)
      console.log({
        oldFilePath,
        newFilePath
      });
      if (shouldPersist) {
        await fs.rename(oldFilePath, newFilePath);
      }
      ++totalEpisodeIndex;
      
    }
  }
  
  console.log({ mediaFiles: episodes.length, expectedEpisodeCount });
})().catch((e) => {
  console.error(e);
  process.exit(1);
})