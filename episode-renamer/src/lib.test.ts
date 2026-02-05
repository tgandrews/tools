import { describe, it, expect } from "vitest";
import {
  normalizeShowName,
  extractSeasonEpisode,
  isVideoFile,
  showNameMatchesFilename,
  checkForConflicts,
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
