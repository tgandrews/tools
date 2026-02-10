import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import inquirer from "inquirer";
import type { Dirent } from "fs";

// Mock modules before importing the functions
vi.mock("fs/promises");
vi.mock("inquirer");

// Mock Dirent class for file entries
class MockDirent implements Partial<Dirent> {
  constructor(
    public name: string,
    private _isFile: boolean = true
  ) {}

  isFile(): boolean {
    return this._isFile;
  }

  isDirectory(): boolean {
    return !this._isFile;
  }

  isBlockDevice(): boolean {
    return false;
  }

  isCharacterDevice(): boolean {
    return false;
  }

  isSymbolicLink(): boolean {
    return false;
  }

  isFIFO(): boolean {
    return false;
  }

  isSocket(): boolean {
    return false;
  }

  path!: string;
  parentPath!: string;
  [Symbol.toStringTag]!: string;
}

describe("Episode Renamer Integration Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("High Confidence Scenario", () => {
    it("should detect show name with high confidence when all files match", async () => {
      const mockFiles: Dirent[] = [
        new MockDirent("The.Rookie.S04E01.mkv"),
        new MockDirent("The.Rookie.S04E02.mkv"),
        new MockDirent("The.Rookie.S04E03.mkv"),
      ] as Dirent[];

      vi.mocked(fs.readdir).mockResolvedValue(mockFiles);

      // We'll test the inference logic directly since we can't easily test the full CLI
      const { inferShowName } = await import("./lib.js");
      const filenames = mockFiles.map(f => f.name);
      const result = inferShowName(filenames);

      expect(result.showName).toBe("The Rookie");
      expect(result.confidence).toBe("high");
      expect(result.conflictingNames).toBeUndefined();
    });
  });

  describe("Mixed Separators Scenario", () => {
    it("should detect show name with high confidence despite different separators", async () => {
      const mockFiles: Dirent[] = [
        new MockDirent("The.Rookie.S04E01.mkv"),
        new MockDirent("The-Rookie-S04E02.mkv"),
        new MockDirent("The_Rookie_S04E03.mkv"),
      ] as Dirent[];

      const { inferShowName } = await import("./lib.js");
      const filenames = mockFiles.map(f => f.name);
      const result = inferShowName(filenames);

      expect(result.showName).toBe("The Rookie");
      expect(result.confidence).toBe("high");
      expect(result.conflictingNames).toBeUndefined();
    });
  });

  describe("Conflicting Shows Scenario", () => {
    it("should detect majority show name with low confidence and list conflicts", async () => {
      const mockFiles: Dirent[] = [
        new MockDirent("The.Rookie.S04E01.mkv"),
        new MockDirent("The.Rookie.S04E02.mkv"),
        new MockDirent("Wonder.Man.S01E01.mkv"),
      ] as Dirent[];

      const { inferShowName } = await import("./lib.js");
      const filenames = mockFiles.map(f => f.name);
      const result = inferShowName(filenames);

      expect(result.showName).toBe("The Rookie");
      expect(result.confidence).toBe("low"); // 66.67% < 80%
      expect(result.conflictingNames).toEqual(["Wonder Man"]);
    });

    it("should use medium confidence when 80%+ files match", async () => {
      const mockFiles: Dirent[] = [
        new MockDirent("The.Rookie.S04E01.mkv"),
        new MockDirent("The.Rookie.S04E02.mkv"),
        new MockDirent("The.Rookie.S04E03.mkv"),
        new MockDirent("The.Rookie.S04E04.mkv"),
        new MockDirent("Wonder.Man.S01E01.mkv"),
      ] as Dirent[];

      const { inferShowName } = await import("./lib.js");
      const filenames = mockFiles.map(f => f.name);
      const result = inferShowName(filenames);

      expect(result.showName).toBe("The Rookie");
      expect(result.confidence).toBe("medium"); // 80%
      expect(result.conflictingNames).toEqual(["Wonder Man"]);
    });
  });

  describe("No Pattern Scenario", () => {
    it("should return null when no S##E## pattern found", async () => {
      const mockFiles: Dirent[] = [
        new MockDirent("movie1.mkv"),
        new MockDirent("movie2.mkv"),
      ] as Dirent[];

      const { inferShowName } = await import("./lib.js");
      const filenames = mockFiles.map(f => f.name);
      const result = inferShowName(filenames);

      expect(result.showName).toBeNull();
      expect(result.confidence).toBe("low");
    });
  });

  describe("File Filtering", () => {
    it("should only process video files", async () => {
      const mockFiles: Dirent[] = [
        new MockDirent("The.Rookie.S04E01.mkv"),
        new MockDirent("The.Rookie.S04E02.avi"),
        new MockDirent("readme.txt"),
        new MockDirent("info.nfo"),
        new MockDirent("The.Rookie.S04E03.mp4"),
      ] as Dirent[];

      const { isVideoFile, inferShowName } = await import("./lib.js");
      const videoFiles = mockFiles.filter(f => isVideoFile(f.name));
      const result = inferShowName(videoFiles.map(f => f.name));

      expect(videoFiles).toHaveLength(3);
      expect(result.showName).toBe("The Rookie");
      expect(result.confidence).toBe("high");
    });

    it("should skip non-file entries", async () => {
      const mockEntries: Dirent[] = [
        new MockDirent("The.Rookie.S04E01.mkv", true),
        new MockDirent("subfolder", false), // directory
        new MockDirent("The.Rookie.S04E02.mkv", true),
      ] as Dirent[];

      const files = mockEntries.filter(e => e.isFile());
      expect(files).toHaveLength(2);
      expect(files.map(f => f.name)).toEqual([
        "The.Rookie.S04E01.mkv",
        "The.Rookie.S04E02.mkv"
      ]);
    });
  });

  describe("Rename Operations", () => {
    it("should generate correct rename operations for matching files", async () => {
      const mockFiles: Dirent[] = [
        new MockDirent("The.Rookie.S04E01.720p.mkv"),
        new MockDirent("The.Rookie.S04E02.720p.mkv"),
      ] as Dirent[];

      const {
        normalizeShowName,
        extractSeasonEpisode,
        showNameMatchesFilename
      } = await import("./lib.js");

      const showName = "The Rookie";
      const normalizedShowName = normalizeShowName(showName);

      const operations = mockFiles.map(file => {
        const seasonEpisode = extractSeasonEpisode(file.name);
        const matches = showNameMatchesFilename(showName, file.name);

        if (seasonEpisode && matches) {
          const ext = file.name.substring(file.name.lastIndexOf('.'));
          return {
            oldName: file.name,
            newName: `${normalizedShowName}.S${seasonEpisode.season}E${seasonEpisode.episode}${ext}`,
            skipped: false
          };
        }

        return {
          oldName: file.name,
          newName: "",
          skipped: true,
          reason: !seasonEpisode ? "No S##E## pattern found" : "Show name not found in filename"
        };
      });

      expect(operations).toHaveLength(2);
      expect(operations[0]).toMatchObject({
        oldName: "The.Rookie.S04E01.720p.mkv",
        newName: "The.Rookie.S04E01.mkv",
        skipped: false
      });
      expect(operations[1]).toMatchObject({
        oldName: "The.Rookie.S04E02.720p.mkv",
        newName: "The.Rookie.S04E02.mkv",
        skipped: false
      });
    });

    it("should skip files that don't match the selected show name", async () => {
      const mockFiles: Dirent[] = [
        new MockDirent("The.Rookie.S04E01.mkv"),
        new MockDirent("Wonder.Man.S01E01.mkv"),
      ] as Dirent[];

      const {
        normalizeShowName,
        extractSeasonEpisode,
        showNameMatchesFilename
      } = await import("./lib.js");

      // User selects "The Rookie"
      const showName = "The Rookie";
      const normalizedShowName = normalizeShowName(showName);

      const operations = mockFiles.map(file => {
        const seasonEpisode = extractSeasonEpisode(file.name);
        const matches = showNameMatchesFilename(showName, file.name);

        if (seasonEpisode && matches) {
          const ext = file.name.substring(file.name.lastIndexOf('.'));
          return {
            oldName: file.name,
            newName: `${normalizedShowName}.S${seasonEpisode.season}E${seasonEpisode.episode}${ext}`,
            skipped: false
          };
        }

        return {
          oldName: file.name,
          newName: "",
          skipped: true,
          reason: !seasonEpisode ? "No S##E## pattern found" : "Show name not found in filename"
        };
      });

      expect(operations).toHaveLength(2);
      expect(operations[0].skipped).toBe(false);
      expect(operations[0].newName).toBe("The.Rookie.S04E01.mkv");
      expect(operations[1].skipped).toBe(true);
      expect(operations[1].reason).toBe("Show name not found in filename");
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty directory", async () => {
      const mockFiles: Dirent[] = [];

      const { inferShowName } = await import("./lib.js");
      const result = inferShowName(mockFiles.map(f => f.name));

      expect(result.showName).toBeNull();
      expect(result.confidence).toBe("low");
    });

    it("should handle directory with only non-video files", async () => {
      const mockFiles: Dirent[] = [
        new MockDirent("readme.txt"),
        new MockDirent("info.nfo"),
      ] as Dirent[];

      const { isVideoFile } = await import("./lib.js");
      const videoFiles = mockFiles.filter(f => isVideoFile(f.name));

      expect(videoFiles).toHaveLength(0);
    });

    it("should handle metadata in filenames", async () => {
      const mockFiles: Dirent[] = [
        new MockDirent("[RARBG]The.Rookie.S04E01.mkv"),
        new MockDirent("(2023)The.Rookie.S04E02.mkv"),
        new MockDirent("The.Rookie[1080p].S04E03.mkv"),
      ] as Dirent[];

      const { inferShowName } = await import("./lib.js");
      const filenames = mockFiles.map(f => f.name);
      const result = inferShowName(filenames);

      expect(result.showName).toBe("The Rookie");
      expect(result.confidence).toBe("high");
    });

    it("should handle uppercase and lowercase patterns", async () => {
      const mockFiles: Dirent[] = [
        new MockDirent("THE.ROOKIE.S04E01.mkv"),
        new MockDirent("the.rookie.s04e02.mkv"),
        new MockDirent("The.Rookie.S04E03.mkv"),
      ] as Dirent[];

      const { inferShowName } = await import("./lib.js");
      const filenames = mockFiles.map(f => f.name);
      const result = inferShowName(filenames);

      expect(result.showName).toBe("The Rookie");
      expect(result.confidence).toBe("high");
    });
  });

  describe("Single File Mode", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("should process a single valid video file", async () => {
      const mockStats = {
        isFile: () => true,
        isDirectory: () => false,
      };

      vi.mocked(fs.stat).mockResolvedValue(mockStats as any);

      const {
        isVideoFile,
        extractSeasonEpisode,
        inferShowName,
        normalizeShowName,
        showNameMatchesFilename
      } = await import("./lib.js");

      const filename = "The.Rookie.S04E07.720p.mkv";

      // Validate file is video
      expect(isVideoFile(filename)).toBe(true);

      // Extract season/episode
      const seasonEpisode = extractSeasonEpisode(filename);
      expect(seasonEpisode).toEqual({
        season: "04",
        episode: "07"
      });

      // Infer show name
      const result = inferShowName([filename]);
      expect(result.showName).toBe("The Rookie");
      expect(result.confidence).toBe("high");

      // Normalize and verify match
      const normalized = normalizeShowName(result.showName!);
      expect(normalized).toBe("The.Rookie");
      expect(showNameMatchesFilename("The Rookie", filename)).toBe(true);

      // Verify expected output filename
      const expectedOutput = `${normalized}.S${seasonEpisode.season}E${seasonEpisode.episode}.mkv`;
      expect(expectedOutput).toBe("The.Rookie.S04E07.mkv");
    });

    it("should infer show name from file with metadata", async () => {
      const mockStats = {
        isFile: () => true,
        isDirectory: () => false,
      };

      vi.mocked(fs.stat).mockResolvedValue(mockStats as any);

      const { extractShowNameFromFilename, inferShowName } = await import("./lib.js");

      const filename = "[RARBG]The.Rookie.S04E07.1080p.mkv";

      expect(extractShowNameFromFilename(filename)).toBe("The Rookie");

      const result = inferShowName([filename]);
      expect(result.showName).toBe("The Rookie");
      expect(result.confidence).toBe("high");
    });

    it("should handle file with various separators", async () => {
      const mockStats = {
        isFile: () => true,
        isDirectory: () => false,
      };

      vi.mocked(fs.stat).mockResolvedValue(mockStats as any);

      const { extractShowNameFromFilename } = await import("./lib.js");

      expect(extractShowNameFromFilename("The.Rookie.S04E07.mkv")).toBe("The Rookie");
      expect(extractShowNameFromFilename("The-Rookie-S04E07.mkv")).toBe("The Rookie");
      expect(extractShowNameFromFilename("The_Rookie_S04E07.mkv")).toBe("The Rookie");
      expect(extractShowNameFromFilename("Wonder.Man.S01E01.mp4")).toBe("Wonder Man");
    });

    it("should handle lowercase and mixed case patterns", async () => {
      const mockStats = {
        isFile: () => true,
        isDirectory: () => false,
      };

      vi.mocked(fs.stat).mockResolvedValue(mockStats as any);

      const { extractShowNameFromFilename, extractSeasonEpisode } = await import("./lib.js");

      // Lowercase
      expect(extractShowNameFromFilename("wonder.man.s01e01.mkv")).toBe("Wonder Man");
      expect(extractSeasonEpisode("wonder.man.s01e01.mkv")).toEqual({
        season: "01",
        episode: "01"
      });

      // Mixed case
      expect(extractShowNameFromFilename("THE.ROOKIE.S04E07.mkv")).toBe("The Rookie");
      expect(extractSeasonEpisode("THE.ROOKIE.S04E07.mkv")).toEqual({
        season: "04",
        episode: "07"
      });
    });

    it("should process files with various video extensions", async () => {
      const mockStats = {
        isFile: () => true,
        isDirectory: () => false,
      };

      vi.mocked(fs.stat).mockResolvedValue(mockStats as any);

      const { isVideoFile } = await import("./lib.js");

      // All supported extensions
      expect(isVideoFile("show.mkv")).toBe(true);
      expect(isVideoFile("show.mp4")).toBe(true);
      expect(isVideoFile("show.avi")).toBe(true);
      expect(isVideoFile("show.flv")).toBe(true);
      expect(isVideoFile("show.m4v")).toBe(true);
      expect(isVideoFile("show.mov")).toBe(true);
      expect(isVideoFile("show.wmv")).toBe(true);

      // Case insensitive
      expect(isVideoFile("show.MKV")).toBe(true);
    });

    it("should reject non-video files", async () => {
      const mockStats = {
        isFile: () => true,
        isDirectory: () => false,
      };

      vi.mocked(fs.stat).mockResolvedValue(mockStats as any);

      const { isVideoFile } = await import("./lib.js");

      expect(isVideoFile("readme.txt")).toBe(false);
      expect(isVideoFile("document.pdf")).toBe(false);
      expect(isVideoFile("info.nfo")).toBe(false);
      expect(isVideoFile("image.jpg")).toBe(false);
      expect(isVideoFile("subtitle.srt")).toBe(false);
    });

    it("should detect missing S##E## pattern in various files", async () => {
      const { extractSeasonEpisode } = await import("./lib.js");

      expect(extractSeasonEpisode("movie.mkv")).toBeNull();
      expect(extractSeasonEpisode("random_file.mp4")).toBeNull();
      expect(extractSeasonEpisode("Season 1 Episode 2.mkv")).toBeNull();
      expect(extractSeasonEpisode("The Rookie.mkv")).toBeNull();
    });

    it("should verify file matches inferred show name", async () => {
      const mockStats = {
        isFile: () => true,
        isDirectory: () => false,
      };

      vi.mocked(fs.stat).mockResolvedValue(mockStats as any);

      const { showNameMatchesFilename } = await import("./lib.js");

      // Should match
      expect(showNameMatchesFilename("The Rookie", "The.Rookie.S04E07.mkv")).toBe(true);
      expect(showNameMatchesFilename("The Rookie", "The-Rookie-S04E07.mkv")).toBe(true);
      expect(showNameMatchesFilename("Wonder Man", "Wonder.Man.S01E01.mkv")).toBe(true);

      // Should not match
      expect(showNameMatchesFilename("The Rookie", "Wonder.Man.S01E01.mkv")).toBe(false);
      expect(showNameMatchesFilename("Wonder Man", "The.Rookie.S04E07.mkv")).toBe(false);
    });

    it("should handle ENOENT error for non-existent path", async () => {
      const error = new Error("ENOENT") as NodeJS.ErrnoException;
      error.code = "ENOENT";

      vi.mocked(fs.stat).mockRejectedValue(error);

      // Validate error code detection
      try {
        await fs.stat("nonexistent.mkv");
        expect.fail("Should have thrown error");
      } catch (e: any) {
        expect(e.code).toBe("ENOENT");
      }
    });

    it("should handle EACCES error for permission denied", async () => {
      const error = new Error("EACCES") as NodeJS.ErrnoException;
      error.code = "EACCES";

      vi.mocked(fs.stat).mockRejectedValue(error);

      // Validate error code detection
      try {
        await fs.stat("restricted.mkv");
        expect.fail("Should have thrown error");
      } catch (e: any) {
        expect(e.code).toBe("EACCES");
      }
    });

    it("should maintain backward compatibility with directory mode", async () => {
      const mockStats = {
        isFile: () => false,
        isDirectory: () => true,
      };

      vi.mocked(fs.stat).mockResolvedValue(mockStats as any);

      const mockFiles: Dirent[] = [
        new MockDirent("The.Rookie.S04E01.mkv"),
        new MockDirent("The.Rookie.S04E02.mkv"),
      ] as Dirent[];

      vi.mocked(fs.readdir).mockResolvedValue(mockFiles);

      const { inferShowName } = await import("./lib.js");

      // Directory mode should still work with multiple files
      const filenames = mockFiles.map(f => f.name);
      const result = inferShowName(filenames);

      expect(result.showName).toBe("The Rookie");
      expect(result.confidence).toBe("high");
      expect(result.conflictingNames).toBeUndefined();
    });
  });
});
