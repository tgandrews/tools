import path from "path";

export const VIDEO_EXTENSIONS = new Set([".mkv", ".avi", ".mp4", ".flv", ".m4v", ".mov", ".wmv"]);
export const SEASON_EPISODE_REGEX = /[Ss](\d{1,2})[Ee](\d{1,2})/;

export interface RenameOperation {
  oldPath: string;
  newPath: string;
  oldName: string;
  newName: string;
  skipped?: boolean;
  reason?: string;
}

export function normalizeShowName(showName: string): string {
  return showName
    .trim()
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(".");
}

export function extractSeasonEpisode(filename: string): { season: string; episode: string } | null {
  const match = filename.match(SEASON_EPISODE_REGEX);
  if (!match) {
    return null;
  }

  const season = match[1].padStart(2, "0");
  const episode = match[2].padStart(2, "0");

  return { season, episode };
}

export function isVideoFile(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  return VIDEO_EXTENSIONS.has(ext);
}

export function showNameMatchesFilename(showName: string, filename: string): boolean {
  // Split show name into words and normalize
  const showWords = showName
    .toLowerCase()
    .split(/\s+/)
    .filter(word => word.length > 0);

  // Normalize filename by replacing separators with spaces and lowercase, then split into words
  const filenameWords = filename
    .toLowerCase()
    .replace(/[._-]/g, " ")
    .split(/\s+/)
    .filter(word => word.length > 0);

  // Check if all show name words appear as complete words in the filename
  return showWords.every(showWord =>
    filenameWords.some(fileWord => fileWord === showWord)
  );
}

export function checkForConflicts(operations: RenameOperation[]): string[] {
  const targetNames = new Map<string, number>();

  for (const op of operations) {
    const count = targetNames.get(op.newName) || 0;
    targetNames.set(op.newName, count + 1);
  }

  const conflicts: string[] = [];
  for (const [name, count] of targetNames) {
    if (count > 1) {
      conflicts.push(name);
    }
  }

  return conflicts;
}
