import { defineCollection, z } from 'astro:content';

export const chordItemSchema = z.object({
  index: z.number().int().min(0),
  chord: z.string(),
});

export const lineItemSchema = z.object({
  a: z.string(),
  b: z.string().optional(),
  chords: z.array(chordItemSchema).optional(),
});

export const sectionItemSchema = z.object({
  type: z.enum(['verse', 'chorus', 'bridge', 'pre-chorus', 'tag', 'outro']),
  index: z.number().optional(),
  lines: z.array(lineItemSchema),
});

export const songAssetSchema = z.object({
  type: z.enum(['sheet', 'ppt', 'audio', 'external']),
  name: z.string(),
  url: z.string(),
  size: z.string().optional(),
});

export const songSchema = z.object({
  meta: z.object({
    languages: z.object({
      a: z.string().default('中文'),
      b: z.string().optional(),
    }),
    title: z.object({
      a: z.string(),
      b: z.string().optional(),
    }),
    originalKey: z.string().optional(),
    bpm: z.number().optional(),
    author: z.string().optional(),
    ccli: z.string().optional(),
    tags: z.array(z.string()).default([]),
    assets: z.array(songAssetSchema).optional(),
  }),
  sections: z.array(sectionItemSchema),
});

export const librarySchema = z.object({
  id: z.string(),
  meta: z.object({
    title: z.object({
      a: z.string(),
      b: z.string().optional(),
    }),
    description: z.string().optional(),
    tags: z.array(z.string()).default([]),
  }),
  songIds: z.array(z.string()),
});

export const collections = {
  songs: defineCollection({
    type: 'data',
    schema: songSchema,
  }),
  libraries: defineCollection({
    type: 'data',
    schema: librarySchema,
  }),
};

export type ChordItem = z.infer<typeof chordItemSchema>;
export type LineItem = z.infer<typeof lineItemSchema>;
export type SectionItem = z.infer<typeof sectionItemSchema>;
export type SongAsset = z.infer<typeof songAssetSchema>;
export type SongData = z.infer<typeof songSchema>;
export type SongWithId = SongData & { id: string };
export type LibraryData = z.infer<typeof librarySchema>;
