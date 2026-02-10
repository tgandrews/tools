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

export function extractShowNameFromFilename(filename: string): string | null {
  const match = filename.match(SEASON_EPISODE_REGEX);
  if (!match) {
    return null;
  }

  // Get text before the S##E## pattern
  const beforePattern = filename.slice(0, match.index);

  // Remove metadata patterns in brackets or parentheses
  const cleaned = beforePattern.replace(/[\[\(].*?[\]\)]/g, "");

  // Replace separators (., -, _) with spaces
  const withSpaces = cleaned.replace(/[._-]/g, " ");

  // Trim and split into words
  const words = withSpaces.trim().split(/\s+/).filter(word => word.length > 0);

  if (words.length === 0) {
    return null;
  }

  // Capitalize each word properly
  const capitalized = words.map(word =>
    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  );

  return capitalized.join(" ");
}

export interface InferenceResult {
  showName: string | null;
  confidence: 'high' | 'medium' | 'low';
  conflictingNames?: string[];
}

export function inferShowName(filenames: string[]): InferenceResult {
  if (filenames.length === 0) {
    return { showName: null, confidence: 'low' };
  }

  // Extract show names from all filenames
  const extractedNames = filenames
    .map(filename => extractShowNameFromFilename(filename))
    .filter((name): name is string => name !== null);

  if (extractedNames.length === 0) {
    return { showName: null, confidence: 'low' };
  }

  // Count occurrences of each show name
  const nameCounts = new Map<string, number>();
  for (const name of extractedNames) {
    nameCounts.set(name, (nameCounts.get(name) || 0) + 1);
  }

  // Find the most common show name
  let mostCommonName: string | null = null;
  let maxCount = 0;
  for (const [name, count] of nameCounts) {
    if (count > maxCount) {
      mostCommonName = name;
      maxCount = count;
    }
  }

  // Determine confidence level
  const totalExtracted = extractedNames.length;
  const matchPercentage = (maxCount / totalExtracted) * 100;

  // Get conflicting names (names that aren't the most common)
  const conflictingNames = Array.from(nameCounts.keys())
    .filter(name => name !== mostCommonName);

  if (matchPercentage === 100) {
    // All files match - high confidence
    return { showName: mostCommonName, confidence: 'high' };
  } else if (matchPercentage >= 80) {
    // Most files match (80%+) - medium confidence
    return {
      showName: mostCommonName,
      confidence: 'medium',
      conflictingNames: conflictingNames.length > 0 ? conflictingNames : undefined
    };
  } else {
    // No clear majority - low confidence
    return {
      showName: mostCommonName,
      confidence: 'low',
      conflictingNames: conflictingNames.length > 0 ? conflictingNames : undefined
    };
  }
}
