import { NextResponse } from "next/server";

import {
  isSystemPromptVariant,
} from "@/lib/system-prompts";

import type {
  SystemPromptVariant,
} from "@/lib/system-prompts";

import {
  generateRagAnswer,
} from "@/lib/rag";

import {
  DEFAULT_VECTOR_SEARCH_OPTIONS,
  searchSimilarChunks,
} from "@/lib/vector-search";

/*
 * Az endpoint Node.js futtatókörnyezetet használ,
 * mert OpenAI API- és PostgreSQL-kapcsolatra van szüksége.
 */
export const runtime = "nodejs";

/*
 * A POST kérés JSON törzsének lehetséges mezői.
 *
 * unknown típust használunk, mert a kliens által
 * küldött adatokat használat előtt ellenőrizni kell.
 */
interface ChatRequestBody {
  message?: unknown;
  limit?: unknown;
  minimumSimilarity?: unknown;
  systemPromptVariant?: unknown;
}

/*
 * POST /api/chat
 *
 * Példakérés:
 *
 * {
 *   "message": "Tudsz ajánlani paradicsomos tésztát?",
 *   "limit": 5,
 *   "minimumSimilarity": 0.2
 * }
 */
export async function POST(request: Request) {
  try {
    /*
     * A JSON törzs beolvasása.
     */
    const requestBody =
      (await request.json()) as ChatRequestBody;

    /*
     * A message mezőnek szövegnek kell lennie.
     */
    if (typeof requestBody.message !== "string") {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "CHAT_MESSAGE_MISSING",
            message:
              "A message szöveges mező megadása kötelező.",
          },
        },
        {
          status: 400,
        }
      );
    }

    /*
     * A kérdés normalizálása.
     */
    const normalizedMessage =
      requestBody.message.trim();

    /*
     * Üres kérdés ellenőrzése.
     */
    if (normalizedMessage.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "CHAT_MESSAGE_EMPTY",
            message:
              "A chatüzenet nem lehet üres.",
          },
        },
        {
          status: 400,
        }
      );
    }

    /*
     * Túl hosszú kérdés ellenőrzése.
     */
    if (normalizedMessage.length > 2000) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "CHAT_MESSAGE_TOO_LONG",
            message:
              "A chatüzenet legfeljebb 2000 karakter hosszú lehet.",
          },
        },
        {
          status: 400,
        }
      );
    }

    /*
     * A keresési találatok maximális száma.
     */
    const limit =
      requestBody.limit === undefined
        ? DEFAULT_VECTOR_SEARCH_OPTIONS.limit
        : requestBody.limit;

    /*
     * A limit ellenőrzése.
     */
    if (
      typeof limit !== "number" ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 10
    ) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_CHAT_SEARCH_LIMIT",
            message:
              "A limit értékének 1 és 10 közötti egész számnak kell lennie.",
          },
        },
        {
          status: 400,
        }
      );
    }

    /*
     * Minimális similarity küszöb.
     */
    const minimumSimilarity =
      requestBody.minimumSimilarity === undefined
        ? DEFAULT_VECTOR_SEARCH_OPTIONS.minimumSimilarity
        : requestBody.minimumSimilarity;

    /*
     * A similarity küszöb ellenőrzése.
     */
    if (
      typeof minimumSimilarity !== "number" ||
      !Number.isFinite(minimumSimilarity) ||
      minimumSimilarity < -1 ||
      minimumSimilarity > 1
    ) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code:
              "INVALID_CHAT_SIMILARITY_THRESHOLD",
            message:
              "A minimumSimilarity értékének -1 és 1 között kell lennie.",
          },
        },
        {
          status: 400,
        }
      );
    }

// A frontend által kiválasztott system prompt változat.
//
// Ha a frontend nem küld értéket, undefined marad,
// és a RAG modul az alapértelmezett változatot használja.
let systemPromptVariant:
  | SystemPromptVariant
  | undefined;

// Ha a frontend küldött promptváltozatot,
// ellenőrizzük, hogy támogatott értékről van-e szó.
if (
  requestBody.systemPromptVariant !==
  undefined
) {
  if (
    !isSystemPromptVariant(
      requestBody.systemPromptVariant
    )
  ) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code:
            "INVALID_SYSTEM_PROMPT_VARIANT",
          message:
            "A systemPromptVariant értéke csak strict vagy conversational lehet.",
        },
      },
      {
        status: 400,
      }
    );
  }

  // A típusellenőrzés után a TypeScript már tudja,
  // hogy az érték SystemPromptVariant típusú.
  systemPromptVariant =
    requestBody.systemPromptVariant;
}

    /*
     * 1. Retrieval lépés:
     *
     * A kérdéshez kapcsolódó receptchunkok
     * megkeresése pgvector segítségével.
     */
    const searchResults =
      await searchSimilarChunks(
        normalizedMessage,
        {
          limit,
          minimumSimilarity,
        }
      );

    /*
     * 2. Generation lépés:
     *
     * A találatok alapján végleges
     * receptasszisztensi választ készítünk.
     */
    const ragAnswer = await generateRagAnswer({
      question: normalizedMessage,
      searchResults,
      systemPromptVariant,
    });

    /*
     * A források rövid, frontendbarát listája.
     *
     * A teljes chunk tartalmat a chat API
     * nem adja vissza még egyszer.
     */
    const sources = searchResults.map(
      (result) => ({
        documentId: result.documentId,
        chunkId: result.chunkId,
        chunkIndex: result.chunkIndex,
        originalFilename:
          result.originalFilename,
        documentTitle:
          result.documentTitle,
        similarity:
          result.similarity,
      })
    );

    /*
     * Sikeres chatválasz.
     */
    return NextResponse.json(
      {
        success: true,
        message: normalizedMessage,
        answer: ragAnswer.answer,
        model: ragAnswer.model,
        systemPromptVariant:
          ragAnswer.systemPromptVariant,
        retrieval: {
          resultCount: searchResults.length,
          contextCount:
            ragAnswer.contextCount,
          limit,
          minimumSimilarity,
        },
        sources,
      },
      {
        status: 200,
      }
    );
  } catch (error) {
    /*
     * A részletes technikai hibát csak a szerver
     * termináljában jelenítjük meg.
     */
    console.error(
      "RAG chat request failed:",
      error
    );

    /*
     * A kliensnek nem adjuk vissza az OpenAI vagy
     * az adatbázis teljes technikai hibaüzenetét.
     */
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "RAG_CHAT_FAILED",
          message:
            "A receptasszisztens válaszának elkészítése közben hiba történt.",
        },
      },
      {
        status: 500,
      }
    );
  }
}