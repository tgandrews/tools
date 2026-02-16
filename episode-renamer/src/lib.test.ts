import { describe, it, expect } from "vitest";
import {
  normalizeShowName,
  extractSeasonEpisode,
  isVideoFile,
  isSubtitleFile,
  findMatchingSubtitles,
  getSubtitleLanguageCode,
  showNameMatchesFilename,
  checkForConflicts,
  extractShowNameFromFilename,
  inferShowName,
  extractYear,
  detectContentType,
  extractMovieTitleFromFilename,
  movieTitleMatchesFilename,
  inferMovieTitle,
  type RenameOperation,
} from "./lib.js";

describe("normalizeShowName", () => {
  it("should capitalize first letter of each word", () => {
    expect(normalizeShowName("the rookie")).toBe("The.Rookie");
  });

  it("should handle already capitalized names", () => {
    expect(normalizeShowName("The Rookie")).toBe("The.Rookie");
  });

  it("should handle mixed case", () => {
    expect(normalizeShowName("wOnDeR mAn")).toBe("Wonder.Man");
  });

  it("should trim whitespace", () => {
    expect(normalizeShowName("  The Rookie  ")).toBe("The.Rookie");
  });

  it("should handle multiple spaces", () => {
    expect(normalizeShowName("The   Rookie")).toBe("The.Rookie");
  });

  it("should handle single word", () => {
    expect(normalizeShowName("Friends")).toBe("Friends");
  });
});

describe("extractSeasonEpisode", () => {
  it("should extract uppercase S##E## pattern", () => {
    expect(extractSeasonEpisode("Show.S04E07.mkv")).toEqual({
      season: "04",
      episode: "07",
    });
  });

  it("should extract lowercase s##e## pattern", () => {
    expect(extractSeasonEpisode("show.s4e7.mkv")).toEqual({
      season: "04",
      episode: "07",
    });
  });

  it("should extract mixed case pattern", () => {
    expect(extractSeasonEpisode("show.S1e2.mkv")).toEqual({
      season: "01",
      episode: "02",
    });
  });

  it("should pad single digit season", () => {
    expect(extractSeasonEpisode("Show.S1E12.mkv")).toEqual({
      season: "01",
      episode: "12",
    });
  });

  it("should pad single digit episode", () => {
    expect(extractSeasonEpisode("Show.S12E1.mkv")).toEqual({
      season: "12",
      episode: "01",
    });
  });

  it("should handle pattern in middle of filename", () => {
    expect(extractSeasonEpisode("The.Rookie.S04E07.Fire.Fight.1080p.mkv")).toEqual({
      season: "04",
      episode: "07",
    });
  });

  it("should return null when no pattern found", () => {
    expect(extractSeasonEpisode("episode_without_pattern.mkv")).toBeNull();
  });

  it("should return null for invalid pattern", () => {
    expect(extractSeasonEpisode("Season.1.Episode.2.mkv")).toBeNull();
  });
});

describe("isVideoFile", () => {
  it("should return true for .mkv files", () => {
    expect(isVideoFile("episode.mkv")).toBe(true);
  });

  it("should return true for .mp4 files", () => {
    expect(isVideoFile("episode.mp4")).toBe(true);
  });

  it("should return true for .avi files", () => {
    expect(isVideoFile("episode.avi")).toBe(true);
  });

  it("should return true for .flv files", () => {
    expect(isVideoFile("episode.flv")).toBe(true);
  });

  it("should return true for .m4v files", () => {
    expect(isVideoFile("episode.m4v")).toBe(true);
  });

  it("should return true for .mov files", () => {
    expect(isVideoFile("episode.mov")).toBe(true);
  });

  it("should return true for .wmv files", () => {
    expect(isVideoFile("episode.wmv")).toBe(true);
  });

  it("should handle uppercase extensions", () => {
    expect(isVideoFile("episode.MKV")).toBe(true);
  });

  it("should return false for non-video files", () => {
    expect(isVideoFile("document.pdf")).toBe(false);
  });

  it("should return false for text files", () => {
    expect(isVideoFile("readme.txt")).toBe(false);
  });
});

describe("showNameMatchesFilename", () => {
  it("should match when show name is in filename with dots", () => {
    expect(showNameMatchesFilename("The Rookie", "The.Rookie.S04E07.mkv")).toBe(true);
  });

  it("should match when show name is in filename with dashes", () => {
    expect(showNameMatchesFilename("Wonder Man", "Wonder-Man-S01E01.mkv")).toBe(true);
  });

  it("should match when show name is in filename with spaces", () => {
    expect(showNameMatchesFilename("The Rookie", "The Rookie S04E07.mkv")).toBe(true);
  });

  it("should match when show name is in filename with underscores", () => {
    expect(showNameMatchesFilename("Dragon Ball", "dragon_ball_s1e1.mp4")).toBe(true);
  });

  it("should be case insensitive", () => {
    expect(showNameMatchesFilename("the rookie", "THE.ROOKIE.S04E07.mkv")).toBe(true);
  });

  it("should not match when show name is different", () => {
    expect(showNameMatchesFilename("The Rookie", "Wonder.Man.S01E01.mkv")).toBe(false);
  });

  it("should not match when only partial word matches", () => {
    expect(showNameMatchesFilename("The Rookie", "Therookie.S04E07.mkv")).toBe(false);
  });

  it("should match all words regardless of order in filename", () => {
    expect(showNameMatchesFilename("Man Wonder", "Wonder.Man.S01E01.mkv")).toBe(true);
  });

  it("should not match when one word is missing", () => {
    expect(showNameMatchesFilename("The Rookie Season", "The.Rookie.S04E07.mkv")).toBe(false);
  });

  it("should handle complex show names", () => {
    expect(showNameMatchesFilename("The Office US", "The.Office.US.S02E01.mkv")).toBe(true);
  });
});

describe("checkForConflicts", () => {
  it("should return empty array when no conflicts", () => {
    const operations: RenameOperation[] = [
      {
        oldPath: "/path/file1.mkv",
        newPath: "/path/Show.S01E01.mkv",
        oldName: "file1.mkv",
        newName: "Show.S01E01.mkv",
        skipped: false,
      },
      {
        oldPath: "/path/file2.mkv",
        newPath: "/path/Show.S01E02.mkv",
        oldName: "file2.mkv",
        newName: "Show.S01E02.mkv",
        skipped: false,
      },
    ];

    expect(checkForConflicts(operations)).toEqual([]);
  });

  it("should detect duplicate target filenames", () => {
    const operations: RenameOperation[] = [
      {
        oldPath: "/path/file1.mkv",
        newPath: "/path/Show.S01E01.mkv",
        oldName: "file1.mkv",
        newName: "Show.S01E01.mkv",
        skipped: false,
      },
      {
        oldPath: "/path/file2.mkv",
        newPath: "/path/Show.S01E01.mkv",
        oldName: "file2.mkv",
        newName: "Show.S01E01.mkv",
        skipped: false,
      },
    ];

    expect(checkForConflicts(operations)).toEqual(["Show.S01E01.mkv"]);
  });

  it("should detect multiple conflicts", () => {
    const operations: RenameOperation[] = [
      {
        oldPath: "/path/file1.mkv",
        newPath: "/path/Show.S01E01.mkv",
        oldName: "file1.mkv",
        newName: "Show.S01E01.mkv",
        skipped: false,
      },
      {
        oldPath: "/path/file2.mkv",
        newPath: "/path/Show.S01E01.mkv",
        oldName: "file2.mkv",
        newName: "Show.S01E01.mkv",
        skipped: false,
      },
      {
        oldPath: "/path/file3.mkv",
        newPath: "/path/Show.S01E02.mkv",
        oldName: "file3.mkv",
        newName: "Show.S01E02.mkv",
        skipped: false,
      },
      {
        oldPath: "/path/file4.mkv",
        newPath: "/path/Show.S01E02.mkv",
        oldName: "file4.mkv",
        newName: "Show.S01E02.mkv",
        skipped: false,
      },
    ];

    const conflicts = checkForConflicts(operations);
    expect(conflicts).toHaveLength(2);
    expect(conflicts).toContain("Show.S01E01.mkv");
    expect(conflicts).toContain("Show.S01E02.mkv");
  });

  it("should handle empty operations array", () => {
    expect(checkForConflicts([])).toEqual([]);
  });

  it("should handle single operation", () => {
    const operations: RenameOperation[] = [
      {
        oldPath: "/path/file1.mkv",
        newPath: "/path/Show.S01E01.mkv",
        oldName: "file1.mkv",
        newName: "Show.S01E01.mkv",
        skipped: false,
      },
    ];

    expect(checkForConflicts(operations)).toEqual([]);
  });
});

describe("extractShowNameFromFilename", () => {
  it("should extract from dot-separated filename", () => {
    expect(extractShowNameFromFilename("The.Rookie.S04E07.mkv")).toBe("The Rookie");
  });

  it("should extract from dash-separated filename", () => {
    expect(extractShowNameFromFilename("The-Rookie-S04E07.mkv")).toBe("The Rookie");
  });

  it("should extract from space-separated filename", () => {
    expect(extractShowNameFromFilename("The Rookie S04E07.mkv")).toBe("The Rookie");
  });

  it("should extract from underscore-separated filename", () => {
    expect(extractShowNameFromFilename("the_rookie_s04e07.mkv")).toBe("The Rookie");
  });

  it("should handle mixed separators", () => {
    expect(extractShowNameFromFilename("The.Rookie-Feds_S01E01.mkv")).toBe("The Rookie Feds");
  });

  it("should normalize case", () => {
    expect(extractShowNameFromFilename("THE.ROOKIE.S04E07.mkv")).toBe("The Rookie");
  });

  it("should return null when no S##E## pattern found", () => {
    expect(extractShowNameFromFilename("random_file.mkv")).toBeNull();
  });

  it("should remove metadata in brackets", () => {
    expect(extractShowNameFromFilename("[RARBG]The.Rookie.S04E07.mkv")).toBe("The Rookie");
  });

  it("should remove metadata in parentheses", () => {
    expect(extractShowNameFromFilename("(2023)The.Rookie.S04E07.mkv")).toBe("The Rookie");
  });

  it("should handle multiple metadata patterns", () => {
    expect(extractShowNameFromFilename("[RARBG]The.Rookie[1080p].S04E07.mkv")).toBe("The Rookie");
  });

  it("should handle lowercase pattern", () => {
    expect(extractShowNameFromFilename("wonder.man.s01e01.mkv")).toBe("Wonder Man");
  });

  it("should handle mixed case pattern", () => {
    expect(extractShowNameFromFilename("Wonder.Man.S01e01.mkv")).toBe("Wonder Man");
  });

  it("should handle extra content after pattern", () => {
    expect(extractShowNameFromFilename("The.Rookie.S04E07.720p.HDTV.mkv")).toBe("The Rookie");
  });
});

describe("inferShowName", () => {
  it("should infer with high confidence when all files match", () => {
    const filenames = [
      "The.Rookie.S04E01.mkv",
      "The.Rookie.S04E02.mkv",
      "The.Rookie.S04E03.mkv",
    ];

    const result = inferShowName(filenames);
    expect(result.showName).toBe("The Rookie");
    expect(result.confidence).toBe("high");
    expect(result.conflictingNames).toBeUndefined();
  });

  it("should infer with high confidence when files have different separators", () => {
    const filenames = [
      "The.Rookie.S04E01.mkv",
      "The-Rookie-S04E02.mkv",
      "The_Rookie_S04E03.mkv",
    ];

    const result = inferShowName(filenames);
    expect(result.showName).toBe("The Rookie");
    expect(result.confidence).toBe("high");
    expect(result.conflictingNames).toBeUndefined();
  });

  it("should infer with medium confidence when 80%+ majority", () => {
    const filenames = [
      "The.Rookie.S04E01.mkv",
      "The.Rookie.S04E02.mkv",
      "The.Rookie.S04E03.mkv",
      "The.Rookie.S04E04.mkv",
      "Wonder.Man.S01E01.mkv",
    ];

    const result = inferShowName(filenames);
    expect(result.showName).toBe("The Rookie");
    expect(result.confidence).toBe("medium");
    expect(result.conflictingNames).toEqual(["Wonder Man"]);
  });

  it("should infer with low confidence when no clear majority", () => {
    const filenames = [
      "The.Rookie.S04E01.mkv",
      "Wonder.Man.S01E01.mkv",
      "Breaking.Bad.S01E01.mkv",
    ];

    const result = inferShowName(filenames);
    expect(result.showName).toBe("The Rookie"); // First one alphabetically or by occurrence
    expect(result.confidence).toBe("low");
    expect(result.conflictingNames).toContain("Wonder Man");
    expect(result.conflictingNames).toContain("Breaking Bad");
  });

  it("should return null with low confidence when no S##E## patterns", () => {
    const filenames = [
      "random_file.mkv",
      "movie.mp4",
    ];

    const result = inferShowName(filenames);
    expect(result.showName).toBeNull();
    expect(result.confidence).toBe("low");
  });

  it("should return null with low confidence for empty array", () => {
    const result = inferShowName([]);
    expect(result.showName).toBeNull();
    expect(result.confidence).toBe("low");
  });

  it("should handle mix of valid and invalid filenames", () => {
    const filenames = [
      "The.Rookie.S04E01.mkv",
      "The.Rookie.S04E02.mkv",
      "random_file.mkv",
      "movie.mp4",
    ];

    const result = inferShowName(filenames);
    expect(result.showName).toBe("The Rookie");
    expect(result.confidence).toBe("high");
    expect(result.conflictingNames).toBeUndefined();
  });

  it("should handle case-insensitive matching", () => {
    const filenames = [
      "THE.ROOKIE.S04E01.mkv",
      "the.rookie.s04e02.mkv",
      "The.Rookie.S04E03.mkv",
    ];

    const result = inferShowName(filenames);
    expect(result.showName).toBe("The Rookie");
    expect(result.confidence).toBe("high");
    expect(result.conflictingNames).toBeUndefined();
  });

  it("should infer with high confidence for single file", () => {
    const filenames = ["The.Rookie.S04E01.mkv"];
    const result = inferShowName(filenames);

    expect(result.showName).toBe("The Rookie");
    expect(result.confidence).toBe("high");
    expect(result.conflictingNames).toBeUndefined();
  });
});

describe("extractYear", () => {
  it("should extract plain year from filename", () => {
    expect(extractYear("Marty.Supreme.2025.mp4")).toBe("2025");
  });

  it("should extract year in brackets", () => {
    expect(extractYear("Some.Movie.[2024].mp4")).toBe("2024");
  });

  it("should extract year in parentheses", () => {
    expect(extractYear("Another.Movie.(2023).720p.mp4")).toBe("2023");
  });

  it("should filter out resolution indicators like 1080p", () => {
    expect(extractYear("Movie.1080p.2025.mp4")).toBe("2025");
  });

  it("should filter out resolution indicators like 2160p", () => {
    expect(extractYear("Movie.2160p.2025.mp4")).toBe("2025");
  });

  it("should return first valid year when multiple years present", () => {
    expect(extractYear("Movie.2024.Remastered.2025.mp4")).toBe("2024");
  });

  it("should return null when no year found", () => {
    expect(extractYear("random_file.mkv")).toBeNull();
  });

  it("should validate year range 1900-2099", () => {
    expect(extractYear("Movie.1899.mp4")).toBeNull();
    expect(extractYear("Movie.1900.mp4")).toBe("1900");
    expect(extractYear("Movie.2099.mp4")).toBe("2099");
    expect(extractYear("Movie.2100.mp4")).toBeNull();
  });
});

describe("detectContentType", () => {
  it("should detect episode when S##E## pattern exists", () => {
    const result = detectContentType("The.Rookie.S04E07.mkv");
    expect(result.type).toBe("episode");
    expect(result.seasonEpisode).toEqual({ season: "04", episode: "07" });
  });

  it("should detect movie when year exists but no S##E##", () => {
    const result = detectContentType("Marty.Supreme.2025.mp4");
    expect(result.type).toBe("movie");
    expect(result.year).toBe("2025");
  });

  it("should prioritize episode over movie when both patterns exist", () => {
    const result = detectContentType("Show.2024.S01E01.mkv");
    expect(result.type).toBe("episode");
    expect(result.seasonEpisode).toEqual({ season: "01", episode: "01" });
  });

  it("should return unknown when neither pattern exists", () => {
    const result = detectContentType("random_file.mkv");
    expect(result.type).toBe("unknown");
  });
});

describe("extractMovieTitleFromFilename", () => {
  it("should extract from dot-separated filename", () => {
    expect(extractMovieTitleFromFilename("Marty.Supreme.2025.mp4")).toBe("Marty Supreme");
  });

  it("should extract from dash-separated filename", () => {
    expect(extractMovieTitleFromFilename("The-Matrix-1999.mkv")).toBe("The Matrix");
  });

  it("should extract from underscore-separated filename", () => {
    expect(extractMovieTitleFromFilename("some_movie_2024.mp4")).toBe("Some Movie");
  });

  it("should extract from mixed separators", () => {
    expect(extractMovieTitleFromFilename("The.Greatest-Showman_2017.mkv")).toBe("The Greatest Showman");
  });

  it("should remove metadata in brackets", () => {
    expect(extractMovieTitleFromFilename("[RARBG]Marty.Supreme.2025.mp4")).toBe("Marty Supreme");
  });

  it("should remove metadata in parentheses before year", () => {
    expect(extractMovieTitleFromFilename("Movie.(HDR).2024.mp4")).toBe("Movie");
  });

  it("should normalize case", () => {
    expect(extractMovieTitleFromFilename("THE.MATRIX.1999.mkv")).toBe("The Matrix");
  });

  it("should handle quality indicators after year", () => {
    expect(extractMovieTitleFromFilename("Marty.Supreme.2025.1080p.WEBRip.x264.mp4")).toBe("Marty Supreme");
  });

  it("should return null when no year found", () => {
    expect(extractMovieTitleFromFilename("random_file.mkv")).toBeNull();
  });

  it("should handle year in brackets", () => {
    expect(extractMovieTitleFromFilename("Some.Movie.[2024].1080p.mp4")).toBe("Some Movie");
  });

  it("should return null when title extraction yields empty result", () => {
    expect(extractMovieTitleFromFilename("2025.mp4")).toBeNull();
  });
});

describe("movieTitleMatchesFilename", () => {
  it("should match when movie title is in filename with dots", () => {
    expect(movieTitleMatchesFilename("Marty Supreme", "Marty.Supreme.2025.mp4")).toBe(true);
  });

  it("should match when movie title is in filename with dashes", () => {
    expect(movieTitleMatchesFilename("The Matrix", "The-Matrix-1999.mkv")).toBe(true);
  });

  it("should be case insensitive", () => {
    expect(movieTitleMatchesFilename("marty supreme", "MARTY.SUPREME.2025.mp4")).toBe(true);
  });

  it("should not match when movie title is different", () => {
    expect(movieTitleMatchesFilename("The Matrix", "Marty.Supreme.2025.mp4")).toBe(false);
  });

  it("should not match when only partial word matches", () => {
    expect(movieTitleMatchesFilename("Marty Supreme", "MartySupreme.2025.mp4")).toBe(false);
  });
});

describe("inferMovieTitle", () => {
  it("should infer with high confidence when all files match", () => {
    const filenames = [
      "Marty.Supreme.2025.1080p.mp4",
      "Marty.Supreme.2025.720p.mp4",
      "Marty.Supreme.2025.480p.mp4",
    ];

    const result = inferMovieTitle(filenames);
    expect(result.showName).toBe("Marty Supreme");
    expect(result.confidence).toBe("high");
    expect(result.conflictingNames).toBeUndefined();
  });

  it("should infer with high confidence when files have different separators", () => {
    const filenames = [
      "The.Matrix.1999.mp4",
      "The-Matrix-1999.mkv",
      "The_Matrix_1999.avi",
    ];

    const result = inferMovieTitle(filenames);
    expect(result.showName).toBe("The Matrix");
    expect(result.confidence).toBe("high");
    expect(result.conflictingNames).toBeUndefined();
  });

  it("should infer with medium confidence when 80%+ majority", () => {
    const filenames = [
      "Marty.Supreme.2025.1080p.mp4",
      "Marty.Supreme.2025.720p.mp4",
      "Marty.Supreme.2025.480p.mp4",
      "Marty.Supreme.2025.360p.mp4",
      "The.Matrix.1999.mp4",
    ];

    const result = inferMovieTitle(filenames);
    expect(result.showName).toBe("Marty Supreme");
    expect(result.confidence).toBe("medium");
    expect(result.conflictingNames).toEqual(["The Matrix"]);
  });

  it("should infer with low confidence when no clear majority", () => {
    const filenames = [
      "Marty.Supreme.2025.mp4",
      "The.Matrix.1999.mp4",
      "Inception.2010.mp4",
    ];

    const result = inferMovieTitle(filenames);
    expect(result.showName).toBe("Marty Supreme");
    expect(result.confidence).toBe("low");
    expect(result.conflictingNames).toContain("The Matrix");
    expect(result.conflictingNames).toContain("Inception");
  });

  it("should return null with low confidence when no years found", () => {
    const filenames = [
      "random_file.mkv",
      "another_file.mp4",
    ];

    const result = inferMovieTitle(filenames);
    expect(result.showName).toBeNull();
    expect(result.confidence).toBe("low");
  });

  it("should return null with low confidence for empty array", () => {
    const result = inferMovieTitle([]);
    expect(result.showName).toBeNull();
    expect(result.confidence).toBe("low");
  });

  it("should handle mix of valid and invalid filenames", () => {
    const filenames = [
      "Marty.Supreme.2025.1080p.mp4",
      "Marty.Supreme.2025.720p.mp4",
      "random_file.mkv",
      "another.mp4",
    ];

    const result = inferMovieTitle(filenames);
    expect(result.showName).toBe("Marty Supreme");
    expect(result.confidence).toBe("high");
    expect(result.conflictingNames).toBeUndefined();
  });

  it("should infer with high confidence for single file", () => {
    const filenames = ["Marty.Supreme.2025.mp4"];
    const result = inferMovieTitle(filenames);

    expect(result.showName).toBe("Marty Supreme");
    expect(result.confidence).toBe("high");
    expect(result.conflictingNames).toBeUndefined();
  });
});

describe("isSubtitleFile", () => {
  it("should return true for .srt files", () => {
    expect(isSubtitleFile("movie.srt")).toBe(true);
  });

  it("should handle uppercase extensions", () => {
    expect(isSubtitleFile("movie.SRT")).toBe(true);
  });

  it("should return false for non-subtitle files", () => {
    expect(isSubtitleFile("movie.mp4")).toBe(false);
    expect(isSubtitleFile("movie.txt")).toBe(false);
  });
});

describe("isProcessableFile", () => {
  it("should return true for video files", async () => {
    const { isProcessableFile } = await import("./lib.js");
    expect(isProcessableFile("movie.mp4")).toBe(true);
    expect(isProcessableFile("episode.mkv")).toBe(true);
  });

  it("should return true for subtitle files", async () => {
    const { isProcessableFile } = await import("./lib.js");
    expect(isProcessableFile("movie.srt")).toBe(true);
    expect(isProcessableFile("episode.SRT")).toBe(true);
  });

  it("should return false for other files", async () => {
    const { isProcessableFile } = await import("./lib.js");
    expect(isProcessableFile("readme.txt")).toBe(false);
    expect(isProcessableFile("document.pdf")).toBe(false);
  });
});

describe("findMatchingSubtitles", () => {
  it("should find exact match subtitle", () => {
    const allFiles = [
      "Movie.2025.1080p.mp4",
      "Movie.2025.1080p.srt",
      "Other.Movie.2024.mp4",
    ];

    const matches = findMatchingSubtitles("Movie.2025.1080p.mp4", allFiles);
    expect(matches).toEqual(["Movie.2025.1080p.srt"]);
  });

  it("should find subtitle with language code", () => {
    const allFiles = [
      "Movie.2025.mp4",
      "Movie.2025.en.srt",
      "Movie.2025.es.srt",
    ];

    const matches = findMatchingSubtitles("Movie.2025.mp4", allFiles);
    expect(matches).toContain("Movie.2025.en.srt");
    expect(matches).toContain("Movie.2025.es.srt");
    expect(matches).toHaveLength(2);
  });

  it("should find both exact and language code matches", () => {
    const allFiles = [
      "Movie.2025.mp4",
      "Movie.2025.srt",
      "Movie.2025.en.srt",
    ];

    const matches = findMatchingSubtitles("Movie.2025.mp4", allFiles);
    expect(matches).toContain("Movie.2025.srt");
    expect(matches).toContain("Movie.2025.en.srt");
    expect(matches).toHaveLength(2);
  });

  it("should not match unrelated subtitles", () => {
    const allFiles = [
      "Movie.2025.mp4",
      "Other.Movie.2025.srt",
      "Movie.2024.srt",
    ];

    const matches = findMatchingSubtitles("Movie.2025.mp4", allFiles);
    expect(matches).toEqual([]);
  });

  it("should work with episode files", () => {
    const allFiles = [
      "The.Rookie.S04E07.mkv",
      "The.Rookie.S04E07.srt",
      "The.Rookie.S04E07.en.srt",
      "The.Rookie.S04E08.srt",
    ];

    const matches = findMatchingSubtitles("The.Rookie.S04E07.mkv", allFiles);
    expect(matches).toContain("The.Rookie.S04E07.srt");
    expect(matches).toContain("The.Rookie.S04E07.en.srt");
    expect(matches).toHaveLength(2);
  });

  it("should handle 3-letter language codes", () => {
    const allFiles = [
      "Movie.2025.mp4",
      "Movie.2025.eng.srt",
      "Movie.2025.spa.srt",
    ];

    const matches = findMatchingSubtitles("Movie.2025.mp4", allFiles);
    expect(matches).toContain("Movie.2025.eng.srt");
    expect(matches).toContain("Movie.2025.spa.srt");
    expect(matches).toHaveLength(2);
  });
});

describe("getSubtitleLanguageCode", () => {
  it("should extract 2-letter language code", () => {
    expect(getSubtitleLanguageCode("Movie.2025.en.srt")).toBe("en");
    expect(getSubtitleLanguageCode("Movie.2025.es.srt")).toBe("es");
  });

  it("should extract 3-letter language code", () => {
    expect(getSubtitleLanguageCode("Movie.2025.eng.srt")).toBe("eng");
    expect(getSubtitleLanguageCode("Movie.2025.spa.srt")).toBe("spa");
  });

  it("should return null when no language code", () => {
    expect(getSubtitleLanguageCode("Movie.2025.srt")).toBeNull();
    expect(getSubtitleLanguageCode("Movie.2025.1080p.srt")).toBeNull();
  });

  it("should not match 4+ character codes", () => {
    expect(getSubtitleLanguageCode("Movie.2025.1080p.srt")).toBeNull();
  });
});
