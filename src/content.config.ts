import { defineCollection } from "astro:content";
import { z } from "astro/zod";
import { glob } from "astro/loaders";

export const lineItemSchema = z.object({
  a: z.string(),
  b: z.string().optional(),
});

export const sectionItemSchema = z.object({
  name: z.string(),
  lines: z.array(lineItemSchema),
});

export const songScoreSchema = z.object({
  format: z.enum(["123", "abc", "musicxml"]),
  content: z.string(),
  sourceKind: z.enum(["jianpu", "staff", "mixed"]).optional(),
  defaultView: z.enum(["original", "expanded", "staff", "mixed"]).optional(),
});

export const songAssetSchema = z.object({
  type: z.enum(["pdf", "video", "audio", "slide", "youtube", "other"]),
  name: z.string(),
  url: z.string(),
  size: z.string().optional(),
});

export const songSchema = z.object({
  meta: z.object({
    languages: z.object({
      a: z.string().default("zh"),
      b: z.string().optional(),
    }),
    title: z.object({
      a: z.string(),
      b: z.string().optional(),
    }),
    note: z.string().optional(),
    originalKey: z.string().optional(),
    bpm: z.number().optional(),
    author: z.string().optional(),
    ccli: z.string().optional(),
    tags: z.array(z.string()).default([]),
    assets: z.array(songAssetSchema).optional(),
    arrangement: z.array(z.number()).optional(),
  }),
  sections: z.array(sectionItemSchema),
  score: songScoreSchema.optional(),
});

export const librarySchema = z.object({
  meta: z.object({
    title: z.object({
      a: z.string(),
      b: z.string().optional(),
    }),
    description: z.string().optional(),
    tags: z.array(z.string()).default([]),
    date: z.coerce.date().optional(),
  }),
  songs: z.array(
    z.object({
      type: z.enum(["song", "separator", "note", "header"]).optional(),
      id: z.string().optional(),
      content: z.string().optional(),
    }),
  ),
});

const post = defineCollection({
  loader: glob({ base: "src/content/docs", pattern: "**/*.md" }),
  schema: z.object({
    title: z.string().default("說明文件"),
    description: z.string().optional(),
    pubDate: z.coerce.date().optional(),
    updatedDate: z.coerce.date().optional(),
  }),
});

export const collections = {
  songs: defineCollection({
    loader: glob({ base: "src/content/songs", pattern: "**/*.json" }),
    schema: songSchema,
  }),
  libraries: defineCollection({
    loader: glob({ base: "src/content/libraries", pattern: "**/*.json" }),
    schema: librarySchema,
  }),
  post,
};

export type LineItem = z.infer<typeof lineItemSchema>;
export type SectionItem = z.infer<typeof sectionItemSchema>;
export type SongScore = z.infer<typeof songScoreSchema>;
export type SongAsset = z.infer<typeof songAssetSchema>;
export type SongData = z.infer<typeof songSchema>;
export type SongWithId = SongData & { id: string };
export type LibraryData = z.infer<typeof librarySchema>;
export type LibraryWithId = LibraryData & { id: string };
