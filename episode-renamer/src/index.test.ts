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

  describe("Movie Renaming", () => {
    describe("Single Movie File", () => {
      it("should detect movie with year from single file", async () => {
        const mockStats = {
          isFile: () => true,
          isDirectory: () => false,
        };

        vi.mocked(fs.stat).mockResolvedValue(mockStats as any);

        const {
          detectContentType,
          extractMovieTitleFromFilename,
          inferMovieTitle,
          normalizeShowName,
          movieTitleMatchesFilename,
          extractYear
        } = await import("./lib.js");

        const filename = "Marty.Supreme.2025.1080p.WEBRip.x264.AAC5.1-[YTS.BZ].mp4";

        // Detect content type
        const contentInfo = detectContentType(filename);
        expect(contentInfo.type).toBe("movie");
        expect(contentInfo.year).toBe("2025");

        // Extract movie title
        expect(extractMovieTitleFromFilename(filename)).toBe("Marty Supreme");

        // Infer movie title
        const result = inferMovieTitle([filename]);
        expect(result.showName).toBe("Marty Supreme");
        expect(result.confidence).toBe("high");

        // Normalize and verify match
        const normalized = normalizeShowName(result.showName!);
        expect(normalized).toBe("Marty.Supreme");
        expect(movieTitleMatchesFilename("Marty Supreme", filename)).toBe(true);

        // Verify expected output filename
        const expectedOutput = `${normalized}.${contentInfo.year}.mp4`;
        expect(expectedOutput).toBe("Marty.Supreme.2025.mp4");
      });

      it("should handle movie with year in brackets", async () => {
        const { detectContentType, extractMovieTitleFromFilename, extractYear } = await import("./lib.js");

        const filename = "Some.Movie.[2024].1080p.mp4";

        const contentInfo = detectContentType(filename);
        expect(contentInfo.type).toBe("movie");
        expect(contentInfo.year).toBe("2024");

        expect(extractMovieTitleFromFilename(filename)).toBe("Some Movie");
      });

      it("should handle movie with year in parentheses", async () => {
        const { detectContentType, extractMovieTitleFromFilename } = await import("./lib.js");

        const filename = "Another.Movie.(2023).720p.mp4";

        const contentInfo = detectContentType(filename);
        expect(contentInfo.type).toBe("movie");
        expect(contentInfo.year).toBe("2023");

        expect(extractMovieTitleFromFilename(filename)).toBe("Another Movie");
      });
    });

    describe("Batch Movie Renaming", () => {
      it("should detect movie title with high confidence when all files match", async () => {
        const mockFiles: Dirent[] = [
          new MockDirent("Marty.Supreme.2025.1080p.mp4"),
          new MockDirent("Marty.Supreme.2025.720p.mp4"),
          new MockDirent("Marty.Supreme.2025.480p.mp4"),
        ] as Dirent[];

        const { inferMovieTitle } = await import("./lib.js");
        const filenames = mockFiles.map(f => f.name);
        const result = inferMovieTitle(filenames);

        expect(result.showName).toBe("Marty Supreme");
        expect(result.confidence).toBe("high");
        expect(result.conflictingNames).toBeUndefined();
      });

      it("should detect movie title with different separators", async () => {
        const mockFiles: Dirent[] = [
          new MockDirent("The.Matrix.1999.mp4"),
          new MockDirent("The-Matrix-1999.mkv"),
          new MockDirent("The_Matrix_1999.avi"),
        ] as Dirent[];

        const { inferMovieTitle } = await import("./lib.js");
        const filenames = mockFiles.map(f => f.name);
        const result = inferMovieTitle(filenames);

        expect(result.showName).toBe("The Matrix");
        expect(result.confidence).toBe("high");
      });

      it("should generate correct rename operations for movie files", async () => {
        const mockFiles: Dirent[] = [
          new MockDirent("Marty.Supreme.2025.1080p.WEBRip.x264.mp4"),
          new MockDirent("Marty.Supreme.2025.720p.WEBRip.x264.mp4"),
        ] as Dirent[];

        const {
          normalizeShowName,
          detectContentType,
          movieTitleMatchesFilename
        } = await import("./lib.js");

        const movieTitle = "Marty Supreme";
        const normalizedTitle = normalizeShowName(movieTitle);

        const operations = mockFiles.map(file => {
          const contentInfo = detectContentType(file.name);
          const matches = movieTitleMatchesFilename(movieTitle, file.name);

          if (contentInfo.type === 'movie' && matches) {
            const ext = file.name.substring(file.name.lastIndexOf('.'));
            return {
              oldName: file.name,
              newName: `${normalizedTitle}.${contentInfo.year}${ext}`,
              skipped: false
            };
          }

          return {
            oldName: file.name,
            newName: "",
            skipped: true,
            reason: "Movie title not found in filename"
          };
        });

        expect(operations).toHaveLength(2);
        expect(operations[0]).toMatchObject({
          oldName: "Marty.Supreme.2025.1080p.WEBRip.x264.mp4",
          newName: "Marty.Supreme.2025.mp4",
          skipped: false
        });
        expect(operations[1]).toMatchObject({
          oldName: "Marty.Supreme.2025.720p.WEBRip.x264.mp4",
          newName: "Marty.Supreme.2025.mp4",
          skipped: false
        });
      });
    });

    describe("Content Type Priority", () => {
      it("should prioritize S##E## pattern over year (treat as episode)", async () => {
        const { detectContentType } = await import("./lib.js");

        const filename = "Show.2024.S01E01.mkv";

        const contentInfo = detectContentType(filename);
        expect(contentInfo.type).toBe("episode");
        expect(contentInfo.seasonEpisode).toEqual({ season: "01", episode: "01" });
      });

      it("should treat file with only year as movie", async () => {
        const { detectContentType } = await import("./lib.js");

        const filename = "Marty.Supreme.2025.mp4";

        const contentInfo = detectContentType(filename);
        expect(contentInfo.type).toBe("movie");
        expect(contentInfo.year).toBe("2025");
      });

      it("should return unknown for files with neither pattern", async () => {
        const { detectContentType } = await import("./lib.js");

        const filename = "random_file.mkv";

        const contentInfo = detectContentType(filename);
        expect(contentInfo.type).toBe("unknown");
      });
    });

    describe("Movie Edge Cases", () => {
      it("should filter out resolution indicators like 1080p and 2160p", async () => {
        const { extractYear } = await import("./lib.js");

        expect(extractYear("Movie.1080p.2025.mp4")).toBe("2025");
        expect(extractYear("Movie.2160p.2025.4K.mp4")).toBe("2025");
        expect(extractYear("Movie.720p.1080p.2024.mp4")).toBe("2024");
      });

      it("should use first valid year when multiple years present", async () => {
        const { extractYear, extractMovieTitleFromFilename } = await import("./lib.js");

        const filename = "Movie.2024.Remastered.2025.mp4";

        expect(extractYear(filename)).toBe("2024");
        expect(extractMovieTitleFromFilename(filename)).toBe("Movie");
      });

      it("should handle metadata in brackets before movie title", async () => {
        const { extractMovieTitleFromFilename } = await import("./lib.js");

        expect(extractMovieTitleFromFilename("[RARBG]Marty.Supreme.2025.mp4")).toBe("Marty Supreme");
        expect(extractMovieTitleFromFilename("[YTS]The.Matrix.1999.mp4")).toBe("The Matrix");
      });

      it("should handle uppercase and lowercase movie filenames", async () => {
        const { extractMovieTitleFromFilename } = await import("./lib.js");

        expect(extractMovieTitleFromFilename("THE.MATRIX.1999.mkv")).toBe("The Matrix");
        expect(extractMovieTitleFromFilename("the.matrix.1999.mkv")).toBe("The Matrix");
      });

      it("should reject files with year outside valid range", async () => {
        const { extractYear } = await import("./lib.js");

        expect(extractYear("Movie.1899.mp4")).toBeNull();
        expect(extractYear("Movie.2100.mp4")).toBeNull();
        expect(extractYear("Movie.1900.mp4")).toBe("1900");
        expect(extractYear("Movie.2099.mp4")).toBe("2099");
      });
    });

    describe("Mixed Content Handling", () => {
      it("should handle directory with both episodes and movies", async () => {
        const mockFiles: Dirent[] = [
          new MockDirent("The.Rookie.S04E01.mkv"),
          new MockDirent("The.Rookie.S04E02.mkv"),
          new MockDirent("Marty.Supreme.2025.mp4"),
          new MockDirent("The.Matrix.1999.mp4"),
        ] as Dirent[];

        const { detectContentType } = await import("./lib.js");

        const episodes = mockFiles.filter(f => detectContentType(f.name).type === 'episode');
        const movies = mockFiles.filter(f => detectContentType(f.name).type === 'movie');

        expect(episodes).toHaveLength(2);
        expect(movies).toHaveLength(2);
        expect(episodes.map(f => f.name)).toEqual([
          "The.Rookie.S04E01.mkv",
          "The.Rookie.S04E02.mkv"
        ]);
        expect(movies.map(f => f.name)).toEqual([
          "Marty.Supreme.2025.mp4",
          "The.Matrix.1999.mp4"
        ]);
      });

      it("should skip files without patterns in mixed directory", async () => {
        const mockFiles: Dirent[] = [
          new MockDirent("The.Rookie.S04E01.mkv"),
          new MockDirent("Marty.Supreme.2025.mp4"),
          new MockDirent("random_file.mkv"),
          new MockDirent("readme.txt"),
        ] as Dirent[];

        const { detectContentType, isVideoFile } = await import("./lib.js");

        const validFiles = mockFiles.filter(f => {
          if (!isVideoFile(f.name)) return false;
          const info = detectContentType(f.name);
          return info.type !== 'unknown';
        });

        expect(validFiles).toHaveLength(2);
        expect(validFiles.map(f => f.name)).toEqual([
          "The.Rookie.S04E01.mkv",
          "Marty.Supreme.2025.mp4"
        ]);
      });
    });

    describe("End-to-End Movie Workflow", () => {
      it("should complete full movie renaming workflow", async () => {
        // Test case: User has multiple quality versions of Marty Supreme (2025)
        const mockFiles: Dirent[] = [
          new MockDirent("Marty.Supreme.2025.1080p.WEBRip.x264.AAC5.1-[YTS.BZ].mp4"),
          new MockDirent("Marty.Supreme.2025.720p.WEBRip.x264.mp4"),
          new MockDirent("Marty.Supreme.2025.480p.mp4"),
        ] as Dirent[];

        const {
          detectContentType,
          inferMovieTitle,
          normalizeShowName,
          movieTitleMatchesFilename,
          checkForConflicts
        } = await import("./lib.js");

        // Step 1: Detect content type from first file
        const firstFileContentInfo = detectContentType(mockFiles[0].name);
        expect(firstFileContentInfo.type).toBe("movie");
        expect(firstFileContentInfo.year).toBe("2025");

        // Step 2: Infer movie title
        const inference = inferMovieTitle(mockFiles.map(f => f.name));
        expect(inference.showName).toBe("Marty Supreme");
        expect(inference.confidence).toBe("high");

        // Step 3: User confirms or enters movie title (simulated as "Marty Supreme")
        const finalTitle = inference.showName!;
        const normalizedTitle = normalizeShowName(finalTitle);
        expect(normalizedTitle).toBe("Marty.Supreme");

        // Step 4: Generate rename operations
        const operations = mockFiles.map(file => {
          const contentInfo = detectContentType(file.name);

          if (contentInfo.type === 'movie') {
            if (!movieTitleMatchesFilename(finalTitle, file.name)) {
              return {
                oldPath: `/path/${file.name}`,
                newPath: "",
                oldName: file.name,
                newName: "",
                skipped: true,
                reason: "Movie title not found in filename",
              };
            }

            const ext = file.name.substring(file.name.lastIndexOf('.'));
            const newName = `${normalizedTitle}.${contentInfo.year}${ext}`;

            return {
              oldPath: `/path/${file.name}`,
              newPath: `/path/${newName}`,
              oldName: file.name,
              newName,
              skipped: false,
            };
          }

          return {
            oldPath: `/path/${file.name}`,
            newPath: "",
            oldName: file.name,
            newName: "",
            skipped: true,
            reason: "No S##E## pattern or year found",
          };
        });

        // Step 5: Verify all operations are valid
        const validOps = operations.filter(op => !op.skipped);
        expect(validOps).toHaveLength(3);

        // Step 6: Check for conflicts (all should be same name - this is expected for different quality versions)
        const conflicts = checkForConflicts(validOps);
        expect(conflicts).toEqual(["Marty.Supreme.2025.mp4"]);

        // Step 7: Verify expected transformations
        expect(operations[0]).toMatchObject({
          oldName: "Marty.Supreme.2025.1080p.WEBRip.x264.AAC5.1-[YTS.BZ].mp4",
          newName: "Marty.Supreme.2025.mp4",
          skipped: false
        });
        expect(operations[1]).toMatchObject({
          oldName: "Marty.Supreme.2025.720p.WEBRip.x264.mp4",
          newName: "Marty.Supreme.2025.mp4",
          skipped: false
        });
        expect(operations[2]).toMatchObject({
          oldName: "Marty.Supreme.2025.480p.mp4",
          newName: "Marty.Supreme.2025.mp4",
          skipped: false
        });
      });

      it("should handle movie with brackets and parentheses in full workflow", async () => {
        const mockFiles: Dirent[] = [
          new MockDirent("Some.Movie.[2024].1080p.mp4"),
          new MockDirent("Another.Movie.(2023).720p.mp4"),
        ] as Dirent[];

        const {
          detectContentType,
          inferMovieTitle,
          normalizeShowName,
          movieTitleMatchesFilename
        } = await import("./lib.js");

        // Process first movie
        const contentInfo1 = detectContentType(mockFiles[0].name);
        expect(contentInfo1.type).toBe("movie");
        expect(contentInfo1.year).toBe("2024");

        const inference1 = inferMovieTitle([mockFiles[0].name]);
        expect(inference1.showName).toBe("Some Movie");

        const normalized1 = normalizeShowName(inference1.showName!);
        const ext1 = mockFiles[0].name.substring(mockFiles[0].name.lastIndexOf('.'));
        const newName1 = `${normalized1}.${contentInfo1.year}${ext1}`;
        expect(newName1).toBe("Some.Movie.2024.mp4");

        // Process second movie
        const contentInfo2 = detectContentType(mockFiles[1].name);
        expect(contentInfo2.type).toBe("movie");
        expect(contentInfo2.year).toBe("2023");

        const inference2 = inferMovieTitle([mockFiles[1].name]);
        expect(inference2.showName).toBe("Another Movie");

        const normalized2 = normalizeShowName(inference2.showName!);
        const ext2 = mockFiles[1].name.substring(mockFiles[1].name.lastIndexOf('.'));
        const newName2 = `${normalized2}.${contentInfo2.year}${ext2}`;
        expect(newName2).toBe("Another.Movie.2023.mp4");
      });

      it("should maintain backward compatibility with episode renaming", async () => {
        // Test case: User still has TV episodes and workflow should work exactly as before
        const mockFiles: Dirent[] = [
          new MockDirent("The.Rookie.S04E01.720p.mkv"),
          new MockDirent("The.Rookie.S04E02.1080p.mkv"),
        ] as Dirent[];

        const {
          detectContentType,
          inferShowName,
          normalizeShowName,
          showNameMatchesFilename
        } = await import("./lib.js");

        // Step 1: Detect content type - should still be episode
        const firstFileContentInfo = detectContentType(mockFiles[0].name);
        expect(firstFileContentInfo.type).toBe("episode");
        expect(firstFileContentInfo.seasonEpisode).toEqual({ season: "04", episode: "01" });

        // Step 2: Infer show name (not movie title)
        const inference = inferShowName(mockFiles.map(f => f.name));
        expect(inference.showName).toBe("The Rookie");
        expect(inference.confidence).toBe("high");

        // Step 3: Generate rename operations
        const finalName = inference.showName!;
        const normalizedName = normalizeShowName(finalName);

        const operations = mockFiles.map(file => {
          const contentInfo = detectContentType(file.name);

          if (contentInfo.type === 'episode') {
            if (!showNameMatchesFilename(finalName, file.name)) {
              return {
                oldName: file.name,
                newName: "",
                skipped: true,
              };
            }

            const ext = file.name.substring(file.name.lastIndexOf('.'));
            const newName = `${normalizedName}.S${contentInfo.seasonEpisode!.season}E${contentInfo.seasonEpisode!.episode}${ext}`;

            return {
              oldName: file.name,
              newName,
              skipped: false,
            };
          }

          return {
            oldName: file.name,
            newName: "",
            skipped: true,
          };
        });

        // Verify episode renaming still works
        expect(operations[0]).toMatchObject({
          oldName: "The.Rookie.S04E01.720p.mkv",
          newName: "The.Rookie.S04E01.mkv",
          skipped: false
        });
        expect(operations[1]).toMatchObject({
          oldName: "The.Rookie.S04E02.1080p.mkv",
          newName: "The.Rookie.S04E02.mkv",
          skipped: false
        });
      });
    });

    describe("Subtitle File Handling", () => {
      it("should rename subtitle files alongside movie files", async () => {
        const {
          detectContentType,
          normalizeShowName,
          findMatchingSubtitles,
          getSubtitleLanguageCode,
        } = await import("./lib.js");

        const allFiles = [
          "Marty.Supreme.2025.1080p.mp4",
          "Marty.Supreme.2025.1080p.srt",
        ];

        const videoFile = allFiles[0];
        const contentInfo = detectContentType(videoFile);
        const movieTitle = "Marty Supreme";
        const normalizedTitle = normalizeShowName(movieTitle);

        // Find matching subtitles
        const matchingSubtitles = findMatchingSubtitles(videoFile, allFiles);
        expect(matchingSubtitles).toEqual(["Marty.Supreme.2025.1080p.srt"]);

        // Generate operations
        const operations = [];

        // Video file operation
        operations.push({
          oldName: videoFile,
          newName: `${normalizedTitle}.${contentInfo.year}.mp4`,
          skipped: false,
        });

        // Subtitle file operations
        for (const subtitleFile of matchingSubtitles) {
          const languageCode = getSubtitleLanguageCode(subtitleFile);
          const subtitleNewName = languageCode
            ? `${normalizedTitle}.${contentInfo.year}.${languageCode}.srt`
            : `${normalizedTitle}.${contentInfo.year}.srt`;

          operations.push({
            oldName: subtitleFile,
            newName: subtitleNewName,
            skipped: false,
          });
        }

        expect(operations).toHaveLength(2);
        expect(operations[0]).toMatchObject({
          oldName: "Marty.Supreme.2025.1080p.mp4",
          newName: "Marty.Supreme.2025.mp4",
          skipped: false,
        });
        expect(operations[1]).toMatchObject({
          oldName: "Marty.Supreme.2025.1080p.srt",
          newName: "Marty.Supreme.2025.srt",
          skipped: false,
        });
      });

      it("should handle subtitle files with language codes", async () => {
        const {
          detectContentType,
          normalizeShowName,
          findMatchingSubtitles,
          getSubtitleLanguageCode,
        } = await import("./lib.js");

        const allFiles = [
          "Marty.Supreme.2025.mp4",
          "Marty.Supreme.2025.en.srt",
          "Marty.Supreme.2025.es.srt",
        ];

        const videoFile = allFiles[0];
        const contentInfo = detectContentType(videoFile);
        const movieTitle = "Marty Supreme";
        const normalizedTitle = normalizeShowName(movieTitle);

        // Find matching subtitles
        const matchingSubtitles = findMatchingSubtitles(videoFile, allFiles);
        expect(matchingSubtitles).toHaveLength(2);

        // Generate operations
        const operations = [];

        // Video file operation
        operations.push({
          oldName: videoFile,
          newName: `${normalizedTitle}.${contentInfo.year}.mp4`,
          skipped: false,
        });

        // Subtitle file operations
        for (const subtitleFile of matchingSubtitles) {
          const languageCode = getSubtitleLanguageCode(subtitleFile);
          const subtitleNewName = languageCode
            ? `${normalizedTitle}.${contentInfo.year}.${languageCode}.srt`
            : `${normalizedTitle}.${contentInfo.year}.srt`;

          operations.push({
            oldName: subtitleFile,
            newName: subtitleNewName,
            skipped: false,
          });
        }

        expect(operations).toHaveLength(3);
        expect(operations[0].newName).toBe("Marty.Supreme.2025.mp4");
        expect(operations[1].newName).toBe("Marty.Supreme.2025.en.srt");
        expect(operations[2].newName).toBe("Marty.Supreme.2025.es.srt");
      });

      it("should rename subtitle files alongside episode files", async () => {
        const {
          detectContentType,
          normalizeShowName,
          findMatchingSubtitles,
          getSubtitleLanguageCode,
        } = await import("./lib.js");

        const allFiles = [
          "The.Rookie.S04E07.720p.mkv",
          "The.Rookie.S04E07.720p.srt",
          "The.Rookie.S04E07.720p.en.srt",
        ];

        const videoFile = allFiles[0];
        const contentInfo = detectContentType(videoFile);
        const showName = "The Rookie";
        const normalizedName = normalizeShowName(showName);

        // Find matching subtitles
        const matchingSubtitles = findMatchingSubtitles(videoFile, allFiles);
        expect(matchingSubtitles).toHaveLength(2);

        // Generate operations
        const operations = [];

        // Video file operation
        operations.push({
          oldName: videoFile,
          newName: `${normalizedName}.S${contentInfo.seasonEpisode!.season}E${contentInfo.seasonEpisode!.episode}.mkv`,
          skipped: false,
        });

        // Subtitle file operations
        for (const subtitleFile of matchingSubtitles) {
          const languageCode = getSubtitleLanguageCode(subtitleFile);
          const subtitleNewName = languageCode
            ? `${normalizedName}.S${contentInfo.seasonEpisode!.season}E${contentInfo.seasonEpisode!.episode}.${languageCode}.srt`
            : `${normalizedName}.S${contentInfo.seasonEpisode!.season}E${contentInfo.seasonEpisode!.episode}.srt`;

          operations.push({
            oldName: subtitleFile,
            newName: subtitleNewName,
            skipped: false,
          });
        }

        expect(operations).toHaveLength(3);
        expect(operations[0].newName).toBe("The.Rookie.S04E07.mkv");
        expect(operations[1].newName).toBe("The.Rookie.S04E07.srt");
        expect(operations[2].newName).toBe("The.Rookie.S04E07.en.srt");
      });

      it("should not include subtitles when none match", async () => {
        const {
          findMatchingSubtitles,
        } = await import("./lib.js");

        const allFiles = [
          "Movie.2025.mp4",
          "Other.Movie.2025.srt",
        ];

        const matchingSubtitles = findMatchingSubtitles("Movie.2025.mp4", allFiles);
        expect(matchingSubtitles).toEqual([]);
      });

      it("should process standalone subtitle files for movies", async () => {
        const {
          detectContentType,
          extractMovieTitleFromFilename,
          normalizeShowName,
          getSubtitleLanguageCode,
        } = await import("./lib.js");

        const subtitleFile = "Marty.Supreme.2025.1080p.WEBRip.x264.AAC5.1-[YTS.BZ].srt";

        // Detect content type
        const contentInfo = detectContentType(subtitleFile);
        expect(contentInfo.type).toBe("movie");
        expect(contentInfo.year).toBe("2025");

        // Extract movie title
        const movieTitle = extractMovieTitleFromFilename(subtitleFile);
        expect(movieTitle).toBe("Marty Supreme");

        // Generate new name
        const normalizedTitle = normalizeShowName(movieTitle!);
        const languageCode = getSubtitleLanguageCode(subtitleFile);
        const newName = languageCode
          ? `${normalizedTitle}.${contentInfo.year}.${languageCode}.srt`
          : `${normalizedTitle}.${contentInfo.year}.srt`;

        expect(newName).toBe("Marty.Supreme.2025.srt");
      });

      it("should process standalone subtitle files with language codes", async () => {
        const {
          detectContentType,
          extractMovieTitleFromFilename,
          normalizeShowName,
          getSubtitleLanguageCode,
        } = await import("./lib.js");

        const subtitleFile = "Marty.Supreme.2025.1080p.en.srt";

        const contentInfo = detectContentType(subtitleFile);
        const movieTitle = extractMovieTitleFromFilename(subtitleFile);
        const normalizedTitle = normalizeShowName(movieTitle!);
        const languageCode = getSubtitleLanguageCode(subtitleFile);

        expect(languageCode).toBe("en");

        const newName = languageCode
          ? `${normalizedTitle}.${contentInfo.year}.${languageCode}.srt`
          : `${normalizedTitle}.${contentInfo.year}.srt`;

        expect(newName).toBe("Marty.Supreme.2025.en.srt");
      });

      it("should process standalone subtitle files for episodes", async () => {
        const {
          detectContentType,
          extractShowNameFromFilename,
          normalizeShowName,
          getSubtitleLanguageCode,
        } = await import("./lib.js");

        const subtitleFile = "The.Rookie.S04E07.720p.srt";

        const contentInfo = detectContentType(subtitleFile);
        expect(contentInfo.type).toBe("episode");
        expect(contentInfo.seasonEpisode).toEqual({ season: "04", episode: "07" });

        const showName = extractShowNameFromFilename(subtitleFile);
        expect(showName).toBe("The Rookie");

        const normalizedName = normalizeShowName(showName!);
        const languageCode = getSubtitleLanguageCode(subtitleFile);
        const newName = languageCode
          ? `${normalizedName}.S${contentInfo.seasonEpisode!.season}E${contentInfo.seasonEpisode!.episode}.${languageCode}.srt`
          : `${normalizedName}.S${contentInfo.seasonEpisode!.season}E${contentInfo.seasonEpisode!.episode}.srt`;

        expect(newName).toBe("The.Rookie.S04E07.srt");
      });

      it("should process standalone subtitle files with language codes for episodes", async () => {
        const {
          detectContentType,
          extractShowNameFromFilename,
          normalizeShowName,
          getSubtitleLanguageCode,
        } = await import("./lib.js");

        const subtitleFile = "The.Rookie.S04E07.720p.en.srt";

        const contentInfo = detectContentType(subtitleFile);
        const showName = extractShowNameFromFilename(subtitleFile);
        const normalizedName = normalizeShowName(showName!);
        const languageCode = getSubtitleLanguageCode(subtitleFile);

        expect(languageCode).toBe("en");

        const newName = languageCode
          ? `${normalizedName}.S${contentInfo.seasonEpisode!.season}E${contentInfo.seasonEpisode!.episode}.${languageCode}.srt`
          : `${normalizedName}.S${contentInfo.seasonEpisode!.season}E${contentInfo.seasonEpisode!.episode}.srt`;

        expect(newName).toBe("The.Rookie.S04E07.en.srt");
      });
    });
  });

  describe("Multi-Movie Directory", () => {
    it("should rename multiple different movies independently without prompting", async () => {
      const {
        detectContentType,
        extractMovieTitleFromFilename,
        normalizeShowName,
        isSubtitleFile,
        findMatchingSubtitles,
        getSubtitleLanguageCode,
      } = await import("./lib.js");

      const allFiles = [
        "Alien.1979.1080p.mkv",
        "Aliens.1986.BluRay.mkv",
      ];

      const operations: { oldName: string; newName: string; skipped: boolean }[] = [];

      // Simulate multi-movie directory pass 1 (video files only)
      for (const filename of allFiles) {
        if (isSubtitleFile(filename)) continue;

        const contentInfo = detectContentType(filename);
        expect(contentInfo.type).toBe("movie");

        const movieTitle = extractMovieTitleFromFilename(filename);
        expect(movieTitle).not.toBeNull();

        const normalized = normalizeShowName(movieTitle!);
        const ext = filename.substring(filename.lastIndexOf("."));
        const newName = `${normalized}.${contentInfo.year}${ext}`;
        operations.push({ oldName: filename, newName, skipped: false });
      }

      expect(operations).toHaveLength(2);
      expect(operations[0]).toMatchObject({
        oldName: "Alien.1979.1080p.mkv",
        newName: "Alien.1979.mkv",
        skipped: false,
      });
      expect(operations[1]).toMatchObject({
        oldName: "Aliens.1986.BluRay.mkv",
        newName: "Aliens.1986.mkv",
        skipped: false,
      });
    });

    it("should rename multiple movies with matching subtitles independently", async () => {
      const {
        detectContentType,
        extractMovieTitleFromFilename,
        normalizeShowName,
        isSubtitleFile,
        findMatchingSubtitles,
        getSubtitleLanguageCode,
      } = await import("./lib.js");

      const allFiles = [
        "Movie.A.2020.mp4",
        "Movie.A.2020.en.srt",
        "Movie.B.2019.mp4",
      ];

      const handledSubtitles = new Set<string>();
      const operations: { oldName: string; newName: string; skipped: boolean }[] = [];

      // Pass 1: video files
      for (const filename of allFiles) {
        if (isSubtitleFile(filename)) continue;

        const contentInfo = detectContentType(filename);
        const movieTitle = extractMovieTitleFromFilename(filename);
        const normalized = normalizeShowName(movieTitle!);
        const ext = filename.substring(filename.lastIndexOf("."));
        operations.push({ oldName: filename, newName: `${normalized}.${contentInfo.year}${ext}`, skipped: false });

        const matchingSubtitles = findMatchingSubtitles(filename, allFiles);
        for (const subtitleFile of matchingSubtitles) {
          const languageCode = getSubtitleLanguageCode(subtitleFile);
          const subtitleNewName = languageCode
            ? `${normalized}.${contentInfo.year}.${languageCode}.srt`
            : `${normalized}.${contentInfo.year}.srt`;
          operations.push({ oldName: subtitleFile, newName: subtitleNewName, skipped: false });
          handledSubtitles.add(subtitleFile);
        }
      }

      expect(operations).toHaveLength(3);
      expect(operations[0]).toMatchObject({ oldName: "Movie.A.2020.mp4", newName: "Movie.A.2020.mp4", skipped: false });
      expect(operations[1]).toMatchObject({ oldName: "Movie.A.2020.en.srt", newName: "Movie.A.2020.en.srt", skipped: false });
      expect(operations[2]).toMatchObject({ oldName: "Movie.B.2019.mp4", newName: "Movie.B.2019.mp4", skipped: false });
    });

    it("should rename a single movie in directory correctly", async () => {
      const {
        detectContentType,
        extractMovieTitleFromFilename,
        normalizeShowName,
        isSubtitleFile,
      } = await import("./lib.js");

      const allFiles = ["Interstellar.2014.1080p.BluRay.mkv"];

      const operations: { oldName: string; newName: string; skipped: boolean }[] = [];

      for (const filename of allFiles) {
        if (isSubtitleFile(filename)) continue;

        const contentInfo = detectContentType(filename);
        expect(contentInfo.type).toBe("movie");
        expect(contentInfo.year).toBe("2014");

        const movieTitle = extractMovieTitleFromFilename(filename);
        expect(movieTitle).toBe("Interstellar");

        const normalized = normalizeShowName(movieTitle!);
        const ext = filename.substring(filename.lastIndexOf("."));
        operations.push({ oldName: filename, newName: `${normalized}.${contentInfo.year}${ext}`, skipped: false });
      }

      expect(operations).toHaveLength(1);
      expect(operations[0]).toMatchObject({
        oldName: "Interstellar.2014.1080p.BluRay.mkv",
        newName: "Interstellar.2014.mkv",
        skipped: false,
      });
    });

    it("should skip movie files with no extractable year", async () => {
      const {
        detectContentType,
        isSubtitleFile,
      } = await import("./lib.js");

      const filename = "SomeMovieWithNoYear.mkv";
      const contentInfo = detectContentType(filename);

      expect(contentInfo.type).toBe("unknown");

      // In the multi-movie directory branch, this would be skipped
      const skipped = contentInfo.type !== "movie";
      expect(skipped).toBe(true);
    });

    it("should still prompt for show name in episode directory (regression)", async () => {
      const {
        detectContentType,
        inferShowName,
      } = await import("./lib.js");

      const filenames = [
        "The.Rookie.S04E01.720p.mkv",
        "The.Rookie.S04E02.1080p.mkv",
      ];

      // Content type should be episode, not movie → isMultiMovieDirectory = false
      const firstFileContentInfo = detectContentType(filenames[0]);
      expect(firstFileContentInfo.type).toBe("episode");

      const isMovie = firstFileContentInfo.type === "movie";
      expect(isMovie).toBe(false);

      // isMultiMovieDirectory = !isFile && isMovie = false
      // So inference + prompt path is used
      const inference = inferShowName(filenames);
      expect(inference.showName).toBe("The Rookie");
      expect(inference.confidence).toBe("high");
    });
  });
});
