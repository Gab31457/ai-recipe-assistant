"use client";

import {
  FormEvent,
  KeyboardEvent,
  useState,
} from "react";

import styles from "./ChatInterface.module.css";

/*
 * Egy forrás adatszerkezete.
 *
 * Ezeket az adatokat a POST /api/chat végpont
 * sources tömbjéből kapjuk vissza.
 */
interface ChatSource {
  documentId: string;
  chunkId: string;
  chunkIndex: number;
  originalFilename: string;
  documentTitle: string | null;
  similarity: number;
}

/*
 * Egy chatüzenet lehetséges szerepei.
 *
 * user:
 *   A felhasználó által beküldött kérdés.
 *
 * assistant:
 *   Az AI receptasszisztens válasza.
 */
type ChatMessageRole = "user" | "assistant";

/*
 * Egy frontendoldali chatüzenet adatszerkezete.
 */
interface ChatMessage {
  /*
   * A frontend által létrehozott egyedi azonosító.
   */
  id: string;

  /*
   * Az üzenet küldőjének szerepe.
   */
  role: ChatMessageRole;

  /*
   * Az üzenet tényleges szövege.
   */
  content: string;

  /*
   * Az asszisztens válaszához tartozó források.
   *
   * Felhasználói üzenet esetén ez nincs kitöltve.
   */
  sources?: ChatSource[];
}

/*
 * A chat API sikeres válaszának szerkezete.
 */
interface SuccessfulChatResponse {
  success: true;
  message: string;
  answer: string;
  model: string;
  systemPromptVariant:
    | "strict"
    | "conversational";
  retrieval: {
    resultCount: number;
    contextCount: number;
    limit: number;
    minimumSimilarity: number;
  };
  sources: ChatSource[];
}

/*
 * A chat API sikertelen válaszának szerkezete.
 */
interface FailedChatResponse {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

/*
 * A két lehetséges API-válasz egyesített típusa.
 */
type ChatResponse =
  | SuccessfulChatResponse
  | FailedChatResponse;

/*
 * Egyszerű egyedi frontendazonosító létrehozása.
 *
 * A crypto.randomUUID modern böngészőkben
 * egyedi UUID azonosítót készít.
 */
function createMessageId(): string {
  return crypto.randomUUID();
}

/*
 * A hasonlósági érték százalékos megjelenítése.
 *
 * Például:
 *
 * 0.8234 -> 82.3%
 */
function formatSimilarity(
  similarity: number
): string {
  return `${(similarity * 100).toFixed(1)}%`;
}

/*
 * A fő chatkomponens.
 */
export default function ChatInterface() {
  /*
   * A felhasználó által éppen szerkesztett kérdés.
   */
  const [inputValue, setInputValue] =
    useState("");

  /*
   * A beszélgetés üzenetei.
   */
  const [messages, setMessages] =
    useState<ChatMessage[]>([]);

  /*
   * Jelzi, hogy folyamatban van-e API-kérés.
   *
   * Amíg true, letiltjuk a küldés gombot,
   * hogy ugyanaz a kérdés ne induljon el többször.
   */
  const [isLoading, setIsLoading] =
    useState(false);

  /*
   * A felhasználónak megjelenített hibaüzenet.
   */
  const [errorMessage, setErrorMessage] =
    useState<string | null>(null);

  /*
   * A chatkérdés elküldése.
   */
  async function sendMessage(): Promise<void> {
    /*
     * A kérdés elejéről és végéről eltávolítjuk
     * a felesleges szóközöket.
     */
    const normalizedMessage =
      inputValue.trim();

    /*
     * Üres kérdést nem küldünk el.
     */
    if (
      normalizedMessage.length === 0 ||
      isLoading
    ) {
      return;
    }

    /*
     * Létrehozzuk a felhasználói üzenetet.
     */
    const userMessage: ChatMessage = {
      id: createMessageId(),
      role: "user",
      content: normalizedMessage,
    };

    /*
     * A felhasználói üzenetet azonnal megjelenítjük.
     */
    setMessages((currentMessages) => [
      ...currentMessages,
      userMessage,
    ]);

    /*
     * Kiürítjük a beviteli mezőt.
     */
    setInputValue("");

    /*
     * Töröljük az esetleges korábbi hibaüzenetet.
     */
    setErrorMessage(null);

    /*
     * Bekapcsoljuk a betöltési állapotot.
     */
    setIsLoading(true);

    try {
      /*
       * A már elkészült RAG chat endpoint meghívása.
       */
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: normalizedMessage,
          limit: 5,
          minimumSimilarity: 0.2,
        }),
      });

      /*
       * A JSON-válasz feldolgozása.
       */
      const responseBody =
        (await response.json()) as ChatResponse;

      /*
       * HTTP-hiba vagy üzleti hiba kezelése.
       */
      if (
        !response.ok ||
        responseBody.success === false
      ) {
        const apiErrorMessage =
          responseBody.success === false
            ? responseBody.error.message
            : "A szerver nem tudta feldolgozni a kérést.";

        throw new Error(apiErrorMessage);
      }

      /*
       * Az asszisztens válaszának létrehozása.
       */
      const assistantMessage: ChatMessage = {
        id: createMessageId(),
        role: "assistant",
        content: responseBody.answer,
        sources: responseBody.sources,
      };

      /*
       * Az asszisztens válaszát hozzáadjuk
       * a beszélgetéshez.
       */
      setMessages((currentMessages) => [
        ...currentMessages,
        assistantMessage,
      ]);
    } catch (error) {
      /*
       * Hálózati vagy API-hiba kezelése.
       */
      const readableErrorMessage =
        error instanceof Error
          ? error.message
          : "Ismeretlen hiba történt.";

      setErrorMessage(readableErrorMessage);
    } finally {
      /*
       * Az API-kérés befejeződött.
       */
      setIsLoading(false);
    }
  }

  /*
   * Az űrlap elküldésének kezelése.
   */
  function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ): void {
    /*
     * Megakadályozzuk a böngésző alapértelmezett
     * oldalújratöltését.
     */
    event.preventDefault();

    void sendMessage();
  }

  /*
   * Billentyűzetkezelés:
   *
   * Enter:
   *   elküldi az üzenetet.
   *
   * Shift + Enter:
   *   új sort hoz létre a textarea mezőben.
   */
  function handleKeyDown(
    event: KeyboardEvent<HTMLTextAreaElement>
  ): void {
    if (
      event.key === "Enter" &&
      !event.shiftKey
    ) {
      event.preventDefault();
      void sendMessage();
    }
  }

  return (
    <section className={styles.chatContainer}>
      <div className={styles.chatHeader}>
        <div>
          <h2 className={styles.chatTitle}>
            Receptasszisztens
          </h2>

          <p className={styles.chatDescription}>
            Kérdezz a feldolgozott
            receptadatbázis tartalmáról.
          </p>
        </div>

        <div className={styles.statusBadge}>
          RAG + pgvector
        </div>
      </div>

      <div className={styles.messageList}>
        {messages.length === 0 ? (
          <div className={styles.emptyState}>
            <div
              className={styles.emptyStateIcon}
              aria-hidden="true"
            >
              🍲
            </div>

            <h3>
              Miben segíthetek?
            </h3>

            <p>
              Például kérdezheted:
            </p>

            <ul>
              <li>
                Tudsz ajánlani paradicsomos
                tésztát?
              </li>
              <li>
                Milyen recept tartalmaz
                fokhagymát és bazsalikomot?
              </li>
              <li>
                Hogyan készül a feltöltött
                tésztarecept?
              </li>
            </ul>
          </div>
        ) : (
          messages.map((message) => (
            <article
              key={message.id}
              className={
                message.role === "user"
                  ? styles.userMessage
                  : styles.assistantMessage
              }
            >
              <div className={styles.messageLabel}>
                {message.role === "user"
                  ? "Te"
                  : "AI receptasszisztens"}
              </div>

              <div className={styles.messageContent}>
                {message.content}
              </div>

              {message.sources &&
                message.sources.length > 0 && (
                  <div
                    className={
                      styles.sourceSection
                    }
                  >
                    <div
                      className={
                        styles.sourceTitle
                      }
                    >
                      Felhasznált források
                    </div>

                    <ul
                      className={
                        styles.sourceList
                      }
                    >
                      {message.sources.map(
                        (source) => (
                          <li
                            key={source.chunkId}
                          >
                            <span>
                              {source.documentTitle ||
                                source.originalFilename}
                            </span>

                            <span
                              className={
                                styles.similarity
                              }
                            >
                              {formatSimilarity(
                                source.similarity
                              )}
                            </span>
                          </li>
                        )
                      )}
                    </ul>
                  </div>
                )}
            </article>
          ))
        )}

        {isLoading && (
          <div
            className={styles.loadingMessage}
            role="status"
          >
            <span
              className={styles.loadingDot}
            />
            <span
              className={styles.loadingDot}
            />
            <span
              className={styles.loadingDot}
            />

            <span>
              A receptasszisztens válaszol...
            </span>
          </div>
        )}
      </div>

      {errorMessage && (
        <div
          className={styles.errorMessage}
          role="alert"
        >
          <strong>Hiba:</strong>{" "}
          {errorMessage}
        </div>
      )}

      <form
        className={styles.inputSection}
        onSubmit={handleSubmit}
      >
        <label
          className={styles.inputLabel}
          htmlFor="chat-message"
        >
          Kérdés
        </label>

        <textarea
          id="chat-message"
          className={styles.chatInput}
          value={inputValue}
          onChange={(event) =>
            setInputValue(event.target.value)
          }
          onKeyDown={handleKeyDown}
          placeholder="Írd be a recepttel kapcsolatos kérdésedet..."
          maxLength={2000}
          rows={3}
          disabled={isLoading}
        />

        <div className={styles.inputFooter}>
          <span className={styles.characterCount}>
            {inputValue.length} / 2000
          </span>

          <button
            className={styles.sendButton}
            type="submit"
            disabled={
              isLoading ||
              inputValue.trim().length === 0
            }
          >
            {isLoading
              ? "Válasz készül..."
              : "Küldés"}
          </button>
        </div>
      </form>
    </section>
  );
}