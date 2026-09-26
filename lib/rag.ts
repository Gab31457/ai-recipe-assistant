import OpenAI from "openai";

import type {
  VectorSearchResult,
} from "@/lib/vector-search";

/*
 * A válaszgeneráláshoz használt alapértelmezett modell.
 *
 * Ha az OPENAI_CHAT_MODEL környezeti változó nincs
 * beállítva, ezt a modellt használjuk.
 */
const DEFAULT_CHAT_MODEL = "gpt-4o-mini";

/*
 * A RAG-válasz elkészítéséhez szükséges bemeneti adatok.
 */
export interface RagAnswerInput {
  /*
   * A felhasználó eredeti kérdése.
   */
  question: string;

  /*
   * A pgvector keresés által visszaadott
   * releváns dokumentumchunkok.
   */
  searchResults: VectorSearchResult[];
}

/*
 * A válaszgenerálás eredménye.
 */
export interface RagAnswerResult {
  /*
   * A nyelvi modell által létrehozott válasz.
   */
  answer: string;

  /*
   * A ténylegesen használt chatmodell neve.
   */
  model: string;

  /*
   * A kontextusként felhasznált chunkok száma.
   */
  contextCount: number;
}

/*
 * Visszaadja a konfigurált chatmodell nevét.
 */
export function getChatModel(): string {
  return (
    process.env.OPENAI_CHAT_MODEL?.trim() ||
    DEFAULT_CHAT_MODEL
  );
}

/*
 * Létrehozza az OpenAI klienst.
 *
 * Az API-kulcsot kizárólag a szerveroldali
 * OPENAI_API_KEY környezeti változóból olvassuk.
 */
function createOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    throw new Error(
      "Az OPENAI_API_KEY környezeti változó nincs beállítva."
    );
  }

  return new OpenAI({
    apiKey,
  });
}

/*
 * A keresési eredményekből létrehozza azt a
 * szöveges kontextust, amelyet átadunk a modellnek.
 */
function buildContext(
  searchResults: VectorSearchResult[]
): string {
  /*
   * Minden chunkot külön, számozott forrásként
   * jelenítünk meg.
   */
  return searchResults
    .map((result, resultIndex) => {
      const sourceNumber = resultIndex + 1;

      const sourceTitle =
        result.documentTitle ||
        result.originalFilename;

      const similarity =
        result.similarity.toFixed(4);

      return [
        `[FORRÁS ${sourceNumber}]`,
        `Dokumentum címe: ${sourceTitle}`,
        `Fájlnév: ${result.originalFilename}`,
        `Chunk index: ${result.chunkIndex}`,
        `Hasonlóság: ${similarity}`,
        "Tartalom:",
        result.content,
      ].join("\n");
    })
    .join("\n\n");
}

/*
 * A receptasszisztens rendszerutasítása.
 *
 * Ez meghatározza:
 *
 * - az asszisztens szerepét;
 * - a válasz nyelvét;
 * - a források használatát;
 * - a hallucinációk csökkentésének szabályait;
 * - a válasz alapvető formátumát.
 */
function buildSystemInstruction(): string {
  return [
    "Te egy magyar nyelvű AI receptasszisztens vagy.",
    "",
    "A válasz elkészítéséhez kizárólag a megadott receptforrásokat használd.",
    "Ne találj ki olyan receptet, hozzávalót, mennyiséget vagy elkészítési lépést, amely nem szerepel a forrásokban.",
    "",
    "Ha a források nem tartalmaznak elegendő információt a kérdés megválaszolásához, ezt egyértelműen jelezd.",
    "",
    "Mindig magyarul válaszolj.",
    "A válasz legyen világos, tömör és gyakorlatias.",
    "",
    "Ha receptet ajánlasz, lehetőség szerint add meg:",
    "- a recept nevét;",
    "- a releváns hozzávalókat;",
    "- az elkészítés rövid lépéseit;",
    "- a felhasznált forrás fájlnevét.",
    "",
    "Ne hivatkozz belső embeddingekre, vektorokra, chunkokra vagy adatbázis-technológiára.",
    "",
    "A forrásokat a válasz végén külön 'Források' részben sorold fel.",
  ].join("\n");
}

/*
 * A felhasználói prompt létrehozása.
 */
function buildUserPrompt(
  question: string,
  context: string
): string {
  return [
    "Az alábbi receptforrások alapján válaszolj a kérdésre.",
    "",
    "RECEPTFORRÁSOK:",
    "",
    context,
    "",
    "FELHASZNÁLÓI KÉRDÉS:",
    question,
    "",
    "A választ kizárólag a fenti forrásokra alapozd.",
  ].join("\n");
}

/*
 * A végleges RAG-válasz elkészítése.
 */
export async function generateRagAnswer(
  input: RagAnswerInput
): Promise<RagAnswerResult> {
  /*
   * A kérdés alapvető ellenőrzése.
   */
  const normalizedQuestion =
    input.question.trim();

  if (normalizedQuestion.length === 0) {
    throw new Error(
      "Üres kérdéshez nem generálható válasz."
    );
  }

  /*
   * Ha nincs releváns keresési találat,
   * nem indítunk fölösleges OpenAI chatkérést.
   */
  if (input.searchResults.length === 0) {
    return {
      answer:
        "A receptadatbázisban nem találtam a kérdéshez kellően releváns receptet vagy receptrészletet.",
      model: getChatModel(),
      contextCount: 0,
    };
  }

  /*
   * Az OpenAI kliens és a modell előkészítése.
   */
  const client = createOpenAIClient();
  const model = getChatModel();

  /*
   * A releváns keresési találatokból
   * szöveges kontextust készítünk.
   */
  const context =
    buildContext(input.searchResults);

  /*
   * A Responses API meghívása.
   *
   * Az instructions tartalmazza a tartós
   * rendszerutasításokat.
   *
   * Az input tartalmazza:
   *
   * - a receptforrásokat;
   * - a felhasználó kérdését.
   */
  const response = await client.responses.create({
    model,
    instructions: buildSystemInstruction(),
    input: buildUserPrompt(
      normalizedQuestion,
      context
    ),
  });

  /*
   * Az output_text az SDK által összeállított
   * szöveges válasz.
   */
  const answer = response.output_text.trim();

  /*
   * Üres API-válasz esetén érthető hibát adunk.
   */
  if (answer.length === 0) {
    throw new Error(
      "Az OpenAI API üres válaszszöveget adott vissza."
    );
  }

  return {
    answer,
    model,
    contextCount: input.searchResults.length,
  };
}