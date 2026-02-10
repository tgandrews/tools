import fs from "fs/promises";
import path from "path";
import inquirer from "inquirer";
import {
  normalizeShowName,
  extractSeasonEpisode,
  isVideoFile,
  showNameMatchesFilename,
  checkForConflicts,
  inferShowName,
  type RenameOperation,
  type InferenceResult,
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

async function promptForShowName(inference: InferenceResult): Promise<string> {
  let message: string;
  let prefillValue = inference.showName || "";

  if (inference.showName === null) {
    message = "Could not detect show name. Please enter manually:";
  } else if (inference.confidence === "high") {
    message = "Detected show name (all files match):";
  } else if (inference.confidence === "medium") {
    message = "Detected show name (most files match):";
    if (inference.conflictingNames && inference.conflictingNames.length > 0) {
      console.log(`\n⚠️  Warning: Some files have different show names: ${inference.conflictingNames.join(", ")}`);
    }
  } else {
    message = "Suggested show name (low confidence):";
    if (inference.conflictingNames && inference.conflictingNames.length > 0) {
      console.log(`\n⚠️  Multiple shows detected: ${inference.conflictingNames.join(", ")}`);
    }
  }

  const result = await inquirer.prompt([
    {
      type: "input",
      name: "showName",
      message,
      default: prefillValue,
      validate: (input: string) => {
        const trimmed = input.trim();
        if (trimmed.length === 0) {
          return "Show name cannot be empty";
        }
        return true;
      },
    },
  ]);

  return result.showName.trim();
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
  const [inputPath] = process.argv.slice(startIndex);

  if (process.argv[startIndex] === "--help" || !inputPath) {
    console.log("Usage: episode-renamer <path>");
    console.log("");
    console.log("Arguments:");
    console.log("  path  Path to folder or single file to rename");
    console.log("");
    console.log("Examples:");
    console.log("  episode-renamer ./episodes");
    console.log("  episode-renamer ./The.Rookie.S04E07.mkv");
    return;
  }

  const resolvedPath = path.resolve(process.cwd(), inputPath);

  // Detect if path is file or directory
  let stats;
  try {
    stats = await fs.stat(resolvedPath);
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      throw new Error(`Path does not exist: ${inputPath}`);
    }
    if (error.code === 'EACCES') {
      throw new Error(`Permission denied: ${inputPath}`);
    }
    throw error;
  }

  const isFile = stats.isFile();
  const isDirectory = stats.isDirectory();

  if (!isFile && !isDirectory) {
    throw new Error(`Path is neither a file nor a directory: ${inputPath}`);
  }

  let videoFiles: { name: string; path: string }[];

  if (isFile) {
    // Single file mode
    const filename = path.basename(resolvedPath);

    if (!isVideoFile(filename)) {
      throw new Error(`Not a video file: ${filename}`);
    }

    const seasonEpisode = extractSeasonEpisode(filename);
    if (!seasonEpisode) {
      throw new Error(`No S##E## pattern found in: ${filename}`);
    }

    console.log(`\nProcessing single file: ${filename}`);

    videoFiles = [{ name: filename, path: resolvedPath }];
  } else {
    // Directory mode (existing logic)
    const entries = await fs.readdir(resolvedPath, { withFileTypes: true });
    const files = entries
      .filter(e => e.isFile())
      .filter(e => isVideoFile(e.name));

    if (files.length === 0) {
      console.log("No video files found in the specified folder.");
      return;
    }

    console.log(`\nFound ${files.length} video file(s)`);

    videoFiles = files.map(f => ({
      name: f.name,
      path: path.join(resolvedPath, f.name)
    }));
  }

  // Infer show name from filenames
  const inference = inferShowName(videoFiles.map(f => f.name));

  const finalShowName = await promptForShowName(inference);
  const normalizedShowName = normalizeShowName(finalShowName);

  const operations: RenameOperation[] = videoFiles.map(file => {
    const seasonEpisode = extractSeasonEpisode(file.name);
    if (!seasonEpisode) {
      return {
        oldPath: file.path,
        newPath: "",
        oldName: file.name,
        newName: "",
        skipped: true,
        reason: "No S##E## pattern found",
      };
    }

    if (!showNameMatchesFilename(finalShowName, file.name)) {
      return {
        oldPath: file.path,
        newPath: "",
        oldName: file.name,
        newName: "",
        skipped: true,
        reason: "Show name not found in filename",
      };
    }

    const ext = path.extname(file.name);
    const newName = `${normalizedShowName}.S${seasonEpisode.season}E${seasonEpisode.episode}${ext}`;
    const newPath = isFile
      ? path.join(path.dirname(file.path), newName)
      : path.join(resolvedPath, newName);

    return {
      oldPath: file.path,
      newPath: newPath,
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
