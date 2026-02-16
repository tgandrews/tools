import path from "path";

export const VIDEO_EXTENSIONS = new Set([".mkv", ".avi", ".mp4", ".flv", ".m4v", ".mov", ".wmv"]);
export const SUBTITLE_EXTENSIONS = new Set([".srt"]);
export const SEASON_EPISODE_REGEX = /[Ss](\d{1,2})[Ee](\d{1,2})/;
export const YEAR_REGEX = /(\d{4})/g;

export interface RenameOperation {
  oldPath: string;
  newPath: string;
  oldName: string;
  newName: string;
  skipped?: boolean;
  reason?: string;
}

export interface ContentInfo {
  type: 'episode' | 'movie' | 'unknown';
  seasonEpisode?: { season: string; episode: string };
  year?: string;
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

export function extractYear(filename: string): string | null {
  const matches = filename.match(YEAR_REGEX);
  if (!matches) {
    return null;
  }

  // Find first valid year (1900-2099) to filter out resolution indicators (1080p, 2160p)
  for (const match of matches) {
    const year = parseInt(match, 10);
    if (year >= 1900 && year <= 2099) {
      return match;
    }
  }

  return null;
}

export function detectContentType(filename: string): ContentInfo {
  // Priority 1: Check for S##E## pattern (TV Episode)
  const seasonEpisode = extractSeasonEpisode(filename);
  if (seasonEpisode) {
    return { type: 'episode', seasonEpisode };
  }

  // Priority 2: Check for year (Movie)
  const year = extractYear(filename);
  if (year) {
    return { type: 'movie', year };
  }

  // No pattern found
  return { type: 'unknown' };
}

export function isVideoFile(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  return VIDEO_EXTENSIONS.has(ext);
}

export function isSubtitleFile(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  return SUBTITLE_EXTENSIONS.has(ext);
}

export function isProcessableFile(filename: string): boolean {
  return isVideoFile(filename) || isSubtitleFile(filename);
}

export function findMatchingSubtitles(videoFilename: string, allFilenames: string[]): string[] {
  const videoBaseName = path.basename(videoFilename, path.extname(videoFilename));

  return allFilenames.filter(filename => {
    if (!isSubtitleFile(filename)) {
      return false;
    }

    // Get subtitle base name without extension
    const subtitleBaseName = path.basename(filename, path.extname(filename));

    // Check for exact match (e.g., Movie.2025.mp4 -> Movie.2025.srt)
    if (subtitleBaseName === videoBaseName) {
      return true;
    }

    // Check for language code match (e.g., Movie.2025.mp4 -> Movie.2025.en.srt)
    // Language codes are typically 2-3 characters
    const languageCodePattern = /^(.+)\.([\w]{2,3})$/;
    const match = subtitleBaseName.match(languageCodePattern);

    if (match) {
      const subtitleBaseWithoutLang = match[1];
      return subtitleBaseWithoutLang === videoBaseName;
    }

    return false;
  });
}

export function getSubtitleLanguageCode(subtitleFilename: string): string | null {
  const baseName = path.basename(subtitleFilename, path.extname(subtitleFilename));
  const languageCodePattern = /\.([\w]{2,3})$/;
  const match = baseName.match(languageCodePattern);
  return match ? match[1] : null;
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

export function extractMovieTitleFromFilename(filename: string): string | null {
  const year = extractYear(filename);
  if (!year) {
    return null;
  }

  // Find the position of the year in the filename, accounting for brackets/parentheses
  let yearIndex = filename.indexOf(year);
  if (yearIndex === -1) {
    return null;
  }

  // Check if the year is preceded by a bracket or parenthesis
  if (yearIndex > 0 && (filename[yearIndex - 1] === '[' || filename[yearIndex - 1] === '(')) {
    yearIndex = yearIndex - 1;
  }

  // Get text before the year
  const beforeYear = filename.slice(0, yearIndex);

  // Remove metadata patterns in brackets or parentheses
  const cleaned = beforeYear.replace(/[\[\(].*?[\]\)]/g, "");

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

export function movieTitleMatchesFilename(movieTitle: string, filename: string): boolean {
  // Reuse the same logic as showNameMatchesFilename
  return showNameMatchesFilename(movieTitle, filename);
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

export function inferMovieTitle(filenames: string[]): InferenceResult {
  if (filenames.length === 0) {
    return { showName: null, confidence: 'low' };
  }

  // Extract movie titles from all filenames
  const extractedTitles = filenames
    .map(filename => extractMovieTitleFromFilename(filename))
    .filter((title): title is string => title !== null);

  if (extractedTitles.length === 0) {
    return { showName: null, confidence: 'low' };
  }

  // Count occurrences of each movie title
  const titleCounts = new Map<string, number>();
  for (const title of extractedTitles) {
    titleCounts.set(title, (titleCounts.get(title) || 0) + 1);
  }

  // Find the most common movie title
  let mostCommonTitle: string | null = null;
  let maxCount = 0;
  for (const [title, count] of titleCounts) {
    if (count > maxCount) {
      mostCommonTitle = title;
      maxCount = count;
    }
  }

  // Determine confidence level
  const totalExtracted = extractedTitles.length;
  const matchPercentage = (maxCount / totalExtracted) * 100;

  // Get conflicting titles (titles that aren't the most common)
  const conflictingNames = Array.from(titleCounts.keys())
    .filter(title => title !== mostCommonTitle);

  if (matchPercentage === 100) {
    // All files match - high confidence
    return { showName: mostCommonTitle, confidence: 'high' };
  } else if (matchPercentage >= 80) {
    // Most files match (80%+) - medium confidence
    return {
      showName: mostCommonTitle,
      confidence: 'medium',
      conflictingNames: conflictingNames.length > 0 ? conflictingNames : undefined
    };
  } else {
    // No clear majority - low confidence
    return {
      showName: mostCommonTitle,
      confidence: 'low',
      conflictingNames: conflictingNames.length > 0 ? conflictingNames : undefined
    };
  }
}
