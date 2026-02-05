import fs from "fs/promises";
import path from "path";
import inquirer from "inquirer";
import {
  normalizeShowName,
  extractSeasonEpisode,
  isVideoFile,
  showNameMatchesFilename,
  checkForConflicts,
  type RenameOperation,
} from "./lib.js";

function displayPreview(operations: RenameOperation[]): void {
  const validOps = operations.filter(op => !op.skipped);
  const skippedOps = operations.filter(op => op.skipped);

  if (validOps.length > 0) {
    console.log("\nFiles to rename:");
    console.log("────────────────────────────────────────────────────────────────");
    validOps.forEach(op => {
      console.log(`${op.oldName} → ${op.newName}`);
    });
  }

  if (skippedOps.length > 0) {
    console.log("\nSkipped files:");
    console.log("────────────────────────────────────────────────────────────────");
    skippedOps.forEach(op => {
      console.log(`${op.oldName} - ${op.reason}`);
    });
  }

  console.log("\nSummary:");
  console.log(`  Valid: ${validOps.length}`);
  console.log(`  Skipped: ${skippedOps.length}`);
  console.log(`  Total: ${operations.length}`);
}

async function confirmRename(): Promise<boolean> {
  const result = await inquirer.prompt([
    {
      type: "confirm",
      name: "proceed",
      message: "Proceed with renaming?",
      default: false,
    },
  ]);

  return result.proceed;
}

async function performRename(op: RenameOperation): Promise<void> {
  await fs.rename(op.oldPath, op.newPath);
  console.log(`✓ ${op.oldName} → ${op.newName}`);
}

(async () => {
  // Detect if called via tools wrapper (has extra argument) or directly
  const startIndex = process.argv[2] === "episode-renamer" ? 3 : 2;
  const [folderPath, showName] = process.argv.slice(startIndex);

  if (process.argv[startIndex] === "--help" || !folderPath || !showName) {
    console.log("Usage: episode-renamer <folderPath> <showName>");
    console.log("");
    console.log("Arguments:");
    console.log("  folderPath  Path to folder containing episode files");
    console.log("  showName    Show name in natural format (e.g., \"The Rookie\")");
    console.log("");
    console.log("Examples:");
    console.log("  episode-renamer ./episodes \"The Rookie\"");
    console.log("  episode-renamer ./episodes \"Wonder Man\"");
    return;
  }

  const normalizedShowName = normalizeShowName(showName);
  const resolvedFolderPath = path.resolve(process.cwd(), folderPath);

  const entries = await fs.readdir(resolvedFolderPath, { withFileTypes: true });
  const videoFiles = entries
    .filter(e => e.isFile())
    .filter(e => isVideoFile(e.name));

  if (videoFiles.length === 0) {
    console.log("No video files found in the specified folder.");
    return;
  }

  const operations: RenameOperation[] = videoFiles.map(file => {
    const seasonEpisode = extractSeasonEpisode(file.name);
    if (!seasonEpisode) {
      return {
        oldPath: path.join(resolvedFolderPath, file.name),
        newPath: "",
        oldName: file.name,
        newName: "",
        skipped: true,
        reason: "No S##E## pattern found",
      };
    }

    if (!showNameMatchesFilename(showName, file.name)) {
      return {
        oldPath: path.join(resolvedFolderPath, file.name),
        newPath: "",
        oldName: file.name,
        newName: "",
        skipped: true,
        reason: "Show name not found in filename",
      };
    }

    const ext = path.extname(file.name);
    const newName = `${normalizedShowName}.S${seasonEpisode.season}E${seasonEpisode.episode}${ext}`;

    return {
      oldPath: path.join(resolvedFolderPath, file.name),
      newPath: path.join(resolvedFolderPath, newName),
      oldName: file.name,
      newName,
      skipped: false,
    };
  });

  const validOps = operations.filter(op => !op.skipped);

  if (validOps.length === 0) {
    console.log("No files with S##E## pattern found.");
    displayPreview(operations);
    return;
  }

  const conflicts = checkForConflicts(validOps);
  if (conflicts.length > 0) {
    throw new Error(`Duplicate target filenames: ${conflicts.join(", ")}`);
  }

  displayPreview(operations);

  const confirmed = await confirmRename();
  if (!confirmed) {
    console.log("Rename cancelled");
    return;
  }

  console.log("\nRenaming files...");
  for (const op of validOps) {
    await performRename(op);
  }

  console.log(`\n✓ Successfully renamed ${validOps.length} file(s)`);
})().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
