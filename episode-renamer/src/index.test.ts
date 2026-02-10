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
});
