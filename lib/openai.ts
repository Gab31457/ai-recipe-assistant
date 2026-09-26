import OpenAI from "openai";

/*
 * Az embeddingmodell alapértelmezett neve.
 *
 * Ha az OPENAI_EMBEDDING_MODEL környezeti változó
 * nincs beállítva, akkor ezt a modellt használjuk.
 */
const DEFAULT_EMBEDDING_MODEL =
  "text-embedding-3-small";

/*
 * A text-embedding-3-small modell alapértelmezett
 * embeddingmérete 1536.
 *
 * Ennek meg kell egyeznie a PostgreSQL-adatbázisban
 * létrehozott VECTOR(1536) mező méretével.
 */
export const EMBEDDING_DIMENSIONS = 1536;

/*
 * Az OpenAI kliens csak az első API-híváskor jön létre.
 *
 * Ez azért előnyös, mert az alkalmazás azon részei,
 * amelyek nem használnak OpenAI API-t, API-kulcs nélkül
 * is betölthetők.
 */
let openAIClient: OpenAI | null = null;

/*
 * Visszaadja a konfigurált embeddingmodell nevét.
 */
export function getEmbeddingModel(): string {
  return (
    process.env.OPENAI_EMBEDDING_MODEL?.trim() ||
    DEFAULT_EMBEDDING_MODEL
  );
}

/*
 * Létrehozza vagy visszaadja a már létrehozott
 * OpenAI API-klienst.
 */
function getOpenAIClient(): OpenAI {
  /*
   * Ha a kliens már létezik, nem hozunk létre újat.
   */
  if (openAIClient) {
    return openAIClient;
  }

  /*
   * Az API-kulcsot kizárólag a szerveroldali
   * környezeti változóból olvassuk be.
   */
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  /*
   * Érthető hibaüzenetet adunk, ha hiányzik a kulcs.
   */
  if (!apiKey) {
    throw new Error(
      "Az OPENAI_API_KEY környezeti változó nincs beállítva."
    );
  }

  /*
   * Az OpenAI kliens létrehozása.
   */
  openAIClient = new OpenAI({
    apiKey,
  });

  return openAIClient;
}

/*
 * Egyetlen szöveg embeddingjének létrehozása.
 *
 * A függvény a szöveget elküldi az OpenAI embedding API-nak,
 * majd visszaadja az elkészült számtömböt.
 */
export async function createEmbedding(
  inputText: string
): Promise<number[]> {
  /*
   * A fölösleges szóközöket eltávolítjuk
   * a szöveg elejéről és végéről.
   */
  const normalizedInput = inputText.trim();

  /*
   * Üres szöveghez nem készítünk embeddinget.
   */
  if (normalizedInput.length === 0) {
    throw new Error(
      "Üres szöveghez nem generálható embedding."
    );
  }

  const client = getOpenAIClient();
  const model = getEmbeddingModel();

  /*
   * Embeddingkérés elküldése az OpenAI API-nak.
   *
   * A float formátum lebegőpontos számtömböt ad vissza,
   * amelyet a pgvector adatbázismezőben tárolhatunk.
   */
  const response = await client.embeddings.create({
    model,
    input: normalizedInput,
    encoding_format: "float",
  });

  /*
   * Egyetlen szöveget küldtünk, ezért az első eredmény
   * tartalmazza a szükséges embeddingvektort.
   */
  const embedding = response.data[0]?.embedding;

  if (!embedding) {
    throw new Error(
      "Az OpenAI API nem adott vissza embeddingvektort."
    );
  }

  /*
   * Ellenőrizzük, hogy a kapott vektor mérete megfelel-e
   * az adatbázis VECTOR(1536) mezőjének.
   */
  if (embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Nem megfelelő embeddingméret. Várt: ${EMBEDDING_DIMENSIONS}, kapott: ${embedding.length}.`
    );
  }

  return embedding;
}