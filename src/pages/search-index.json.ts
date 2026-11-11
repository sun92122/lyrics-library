import { getCollection } from "astro:content";
import type { APIRoute } from "astro";
import { buildSearchDocs, type SearchDoc } from "@/utils/searchIndex";

export type { SearchDoc };

export const GET: APIRoute = async () => {
  const songs = await getCollection("songs");
  const searchDocs = buildSearchDocs(songs);

  return new Response(JSON.stringify(searchDocs), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
  });
};
