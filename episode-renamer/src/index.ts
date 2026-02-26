import fs from "fs/promises";
import path from "path";
import inquirer from "inquirer";
import {
  normalizeShowName,
  extractSeasonEpisode,
  isVideoFile,
  isSubtitleFile,
  isProcessableFile,
  findMatchingSubtitles,
  getSubtitleLanguageCode,
  showNameMatchesFilename,
  checkForConflicts,
  inferShowName,
  detectContentType,
  inferMovieTitle,
  movieTitleMatchesFilename,
  extractMovieTitleFromFilename,
  extractYear,
  type RenameOperation,
  type InferenceResult,
  type ContentInfo,
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

async function promptForShowName(inference: InferenceResult, isMovie: boolean = false): Promise<string> {
  let message: string;
  let prefillValue = inference.showName || "";
  const contentLabel = isMovie ? "movie title" : "show name";
  const contentLabelCap = isMovie ? "Movie title" : "Show name";

  if (inference.showName === null) {
    message = `Could not detect ${contentLabel}. Please enter manually:`;
  } else if (inference.confidence === "high") {
    message = `Detected ${contentLabel} (all files match):`;
  } else if (inference.confidence === "medium") {
    message = `Detected ${contentLabel} (most files match):`;
    if (inference.conflictingNames && inference.conflictingNames.length > 0) {
      console.log(`\n⚠️  Warning: Some files have different ${contentLabel}s: ${inference.conflictingNames.join(", ")}`);
    }
  } else {
    message = `Suggested ${contentLabel} (low confidence):`;
    if (inference.conflictingNames && inference.conflictingNames.length > 0) {
      console.log(`\n⚠️  Multiple ${contentLabel}s detected: ${inference.conflictingNames.join(", ")}`);
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
          return `${contentLabelCap} cannot be empty`;
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
    console.log("Description:");
    console.log("  Rename TV show episodes (S##E##) or movie files (with year)");
    console.log("  Works with video files (.mp4, .mkv, etc.) and subtitle files (.srt)");
    console.log("  Automatically renames matching subtitle files when processing videos");
    console.log("");
    console.log("Arguments:");
    console.log("  path  Path to folder or single file to rename");
    console.log("");
    console.log("Examples:");
    console.log("  episode-renamer ./episodes                    # TV show folder");
    console.log("  episode-renamer ./The.Rookie.S04E07.mkv       # Single episode");
    console.log("  episode-renamer ./movies                      # Movie folder");
    console.log("  episode-renamer ./Marty.Supreme.2025.mp4      # Single movie");
    console.log("  episode-renamer ./Marty.Supreme.2025.srt      # Single subtitle");
    console.log("  episode-renamer ./Marty.Supreme.2025.en.srt   # Subtitle with language code");
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

    if (!isProcessableFile(filename)) {
      throw new Error(`Not a video or subtitle file: ${filename}`);
    }

    const contentInfo = detectContentType(filename);
    if (contentInfo.type === 'unknown') {
      throw new Error(`No S##E## pattern or year found in: ${filename}`);
    }

    console.log(`\nProcessing single file: ${filename}`);

    videoFiles = [{ name: filename, path: resolvedPath }];
  } else {
    // Directory mode - process both video and subtitle files
    const entries = await fs.readdir(resolvedPath, { withFileTypes: true });
    const allFiles = entries.filter(e => e.isFile());
    const files = allFiles.filter(e => isProcessableFile(e.name));

    if (files.length === 0) {
      console.log("No video or subtitle files found in the specified folder.");
      return;
    }

    const videoFileCount = files.filter(f => isVideoFile(f.name)).length;
    const subtitleFileCount = files.filter(f => isSubtitleFile(f.name)).length;

    console.log(`\nFound ${videoFileCount} video file(s) and ${subtitleFileCount} subtitle file(s)`);

    videoFiles = files.map(f => ({
      name: f.name,
      path: path.join(resolvedPath, f.name)
    }));
  }

  // Detect content type from first file
  const firstFileContentInfo = detectContentType(videoFiles[0].name);
  const isMovie = firstFileContentInfo.type === 'movie';
  const isMultiMovieDirectory = !isFile && isMovie;

  let finalName: string = "";
  let normalizedName: string = "";

  if (!isMultiMovieDirectory) {
    const inference = isMovie
      ? inferMovieTitle(videoFiles.map(f => f.name))
      : inferShowName(videoFiles.map(f => f.name));
    finalName = await promptForShowName(inference, isMovie);
    normalizedName = normalizeShowName(finalName);
  }

  // Get all filenames for subtitle matching
  let allFilenames: string[];
  if (isFile) {
    // Single file mode - check same directory for subtitles
    const dirPath = path.dirname(resolvedPath);
    const dirEntries = await fs.readdir(dirPath, { withFileTypes: true });
    allFilenames = dirEntries.filter(e => e.isFile()).map(e => e.name);
  } else {
    // Directory mode - use already scanned files
    const entries = await fs.readdir(resolvedPath, { withFileTypes: true });
    allFilenames = entries.filter(e => e.isFile()).map(e => e.name);
  }

  const operations: RenameOperation[] = [];
  const handledSubtitles = new Set<string>();

  if (isMultiMovieDirectory) {
    // Pass 1: process video files, each with their own extracted title+year
    for (const file of videoFiles) {
      if (isSubtitleFile(file.name)) continue; // handle in pass 2

      const contentInfo = detectContentType(file.name);

      if (contentInfo.type !== 'movie') {
        operations.push({
          oldPath: file.path, newPath: "", oldName: file.name, newName: "",
          skipped: true, reason: contentInfo.type === 'episode'
            ? "Episode file in movie folder"
            : "No year found in filename",
        });
        continue;
      }

      const movieTitle = extractMovieTitleFromFilename(file.name);
      if (!movieTitle) {
        operations.push({
          oldPath: file.path, newPath: "", oldName: file.name, newName: "",
          skipped: true, reason: "Could not extract movie title",
        });
        continue;
      }

      const normalized = normalizeShowName(movieTitle);
      const ext = path.extname(file.name);
      const newName = `${normalized}.${contentInfo.year}${ext}`;
      operations.push({
        oldPath: file.path,
        newPath: path.join(resolvedPath, newName),
        oldName: file.name,
        newName,
        skipped: false,
      });

      // Rename matching subtitles
      const matchingSubtitles = findMatchingSubtitles(file.name, allFilenames);
      for (const subtitleFile of matchingSubtitles) {
        const languageCode = getSubtitleLanguageCode(subtitleFile);
        const subtitleNewName = languageCode
          ? `${normalized}.${contentInfo.year}.${languageCode}.srt`
          : `${normalized}.${contentInfo.year}.srt`;
        operations.push({
          oldPath: path.join(resolvedPath, subtitleFile),
          newPath: path.join(resolvedPath, subtitleNewName),
          oldName: subtitleFile,
          newName: subtitleNewName,
          skipped: false,
        });
        handledSubtitles.add(subtitleFile);
      }
    }

    // Pass 2: standalone subtitles not matched to a video
    for (const file of videoFiles) {
      if (!isSubtitleFile(file.name) || handledSubtitles.has(file.name)) continue;

      const contentInfo = detectContentType(file.name);

      if (contentInfo.type !== 'movie') {
        operations.push({
          oldPath: file.path, newPath: "", oldName: file.name, newName: "",
          skipped: true, reason: "No year found in subtitle",
        });
        continue;
      }

      const movieTitle = extractMovieTitleFromFilename(file.name);
      if (!movieTitle) {
        operations.push({
          oldPath: file.path, newPath: "", oldName: file.name, newName: "",
          skipped: true, reason: "Could not extract movie title",
        });
        continue;
      }

      const normalized = normalizeShowName(movieTitle);
      const languageCode = getSubtitleLanguageCode(file.name);
      const newName = languageCode
        ? `${normalized}.${contentInfo.year}.${languageCode}.srt`
        : `${normalized}.${contentInfo.year}.srt`;
      operations.push({
        oldPath: file.path,
        newPath: path.join(resolvedPath, newName),
        oldName: file.name,
        newName,
        skipped: false,
      });
    }
  } else {
  // Process video and subtitle files
  for (const file of videoFiles) {
    const contentInfo = detectContentType(file.name);
    const isSubtitle = isSubtitleFile(file.name);

    // Handle episode files
    if (contentInfo.type === 'episode') {
      if (!showNameMatchesFilename(finalName, file.name)) {
        operations.push({
          oldPath: file.path,
          newPath: "",
          oldName: file.name,
          newName: "",
          skipped: true,
          reason: "Show name not found in filename",
        });
        continue;
      }

      const ext = path.extname(file.name);

      // For subtitle files, preserve language code if present
      let newName: string;
      if (isSubtitle) {
        const languageCode = getSubtitleLanguageCode(file.name);
        newName = languageCode
          ? `${normalizedName}.S${contentInfo.seasonEpisode!.season}E${contentInfo.seasonEpisode!.episode}.${languageCode}${ext}`
          : `${normalizedName}.S${contentInfo.seasonEpisode!.season}E${contentInfo.seasonEpisode!.episode}${ext}`;
      } else {
        newName = `${normalizedName}.S${contentInfo.seasonEpisode!.season}E${contentInfo.seasonEpisode!.episode}${ext}`;
      }

      const newPath = isFile
        ? path.join(path.dirname(file.path), newName)
        : path.join(resolvedPath, newName);

      operations.push({
        oldPath: file.path,
        newPath: newPath,
        oldName: file.name,
        newName,
        skipped: false,
      });

      // Find and process matching subtitle files (only for video files, not for subtitles)
      if (!isSubtitle) {
        const matchingSubtitles = findMatchingSubtitles(file.name, allFilenames);
        for (const subtitleFile of matchingSubtitles) {
          const languageCode = getSubtitleLanguageCode(subtitleFile);
          const subtitleNewName = languageCode
            ? `${normalizedName}.S${contentInfo.seasonEpisode!.season}E${contentInfo.seasonEpisode!.episode}.${languageCode}.srt`
            : `${normalizedName}.S${contentInfo.seasonEpisode!.season}E${contentInfo.seasonEpisode!.episode}.srt`;

          const subtitlePath = isFile
            ? path.join(path.dirname(file.path), subtitleFile)
            : path.join(resolvedPath, subtitleFile);

          const subtitleNewPath = isFile
            ? path.join(path.dirname(file.path), subtitleNewName)
            : path.join(resolvedPath, subtitleNewName);

          operations.push({
            oldPath: subtitlePath,
            newPath: subtitleNewPath,
            oldName: subtitleFile,
            newName: subtitleNewName,
            skipped: false,
          });
        }
      }

      continue;
    }

    // Handle movie files
    if (contentInfo.type === 'movie') {
      if (!movieTitleMatchesFilename(finalName, file.name)) {
        operations.push({
          oldPath: file.path,
          newPath: "",
          oldName: file.name,
          newName: "",
          skipped: true,
          reason: "Movie title not found in filename",
        });
        continue;
      }

      const ext = path.extname(file.name);

      // For subtitle files, preserve language code if present
      let newName: string;
      if (isSubtitle) {
        const languageCode = getSubtitleLanguageCode(file.name);
        newName = languageCode
          ? `${normalizedName}.${contentInfo.year}.${languageCode}${ext}`
          : `${normalizedName}.${contentInfo.year}${ext}`;
      } else {
        newName = `${normalizedName}.${contentInfo.year}${ext}`;
      }

      const newPath = isFile
        ? path.join(path.dirname(file.path), newName)
        : path.join(resolvedPath, newName);

      operations.push({
        oldPath: file.path,
        newPath: newPath,
        oldName: file.name,
        newName,
        skipped: false,
      });

      // Find and process matching subtitle files (only for video files, not for subtitles)
      if (!isSubtitle) {
        const matchingSubtitles = findMatchingSubtitles(file.name, allFilenames);
        for (const subtitleFile of matchingSubtitles) {
          const languageCode = getSubtitleLanguageCode(subtitleFile);
          const subtitleNewName = languageCode
            ? `${normalizedName}.${contentInfo.year}.${languageCode}.srt`
            : `${normalizedName}.${contentInfo.year}.srt`;

          const subtitlePath = isFile
            ? path.join(path.dirname(file.path), subtitleFile)
            : path.join(resolvedPath, subtitleFile);

          const subtitleNewPath = isFile
            ? path.join(path.dirname(file.path), subtitleNewName)
            : path.join(resolvedPath, subtitleNewName);

          operations.push({
            oldPath: subtitlePath,
            newPath: subtitleNewPath,
            oldName: subtitleFile,
            newName: subtitleNewName,
            skipped: false,
          });
        }
      }

      continue;
    }

    // Handle unknown content type
    operations.push({
      oldPath: file.path,
      newPath: "",
      oldName: file.name,
      newName: "",
      skipped: true,
      reason: "No S##E## pattern or year found",
    });
  }
  } // end else (non-multi-movie directory)

  const validOps = operations.filter(op => !op.skipped);

  if (validOps.length === 0) {
    const message = isMovie
      ? "No files with valid year found."
      : "No files with S##E## pattern found.";
    console.log(message);
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
