import { describe, it, expect } from "vitest";
import {
  normalizeShowName,
  extractSeasonEpisode,
  isVideoFile,
  showNameMatchesFilename,
  checkForConflicts,
  extractShowNameFromFilename,
  inferShowName,
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
