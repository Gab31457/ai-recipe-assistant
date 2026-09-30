"use client";

import { useState } from "react";
import styles from "./EvaluationDashboard.module.css";

/**
 * Az Evaluációs Központban elérhető teszttípusok.
 */
type EvaluationType =
  | "single-turn"
  | "multi-turn"
  | "ab-test"
  | "rag";

/**
 * A receptasszisztens jelenlegi rendszerprompt-változatai.
 */
type PromptVariant = "strict" | "conversational";

/**
 * Egy RAG-forrás adatai.
 */
interface Source {
  documentId: number;
  chunkId: number;
  chunkIndex: number;
  originalFilename: string;
  documentTitle: string | null;
  similarity: number;
}

/**
 * A chat API sikeres válaszának típusa.
 */
interface ChatSuccess {
  success: true;
  answer: string;
  model: string;
  systemPromptVariant: PromptVariant;

  retrieval: {
    resultCount: number;
    contextCount: number;
  };

  sources: Source[];
}

/**
 * A chat vagy Judge API hibaválaszának típusa.
 */
interface ApiError {
  success: false;
  message?: string;

  error?: {
    message: string;
  };
}

/**
 * Az LLM Judge által készített értékelés.
 */
interface JudgeResult {
  relevance: number;
  instructionFollowing: number;
  groundedness: number;
  clarity: number;
  overallScore: number;
  passed: boolean;
  explanation: string;
}

/**
 * A Judge API sikeres válaszának típusa.
 */
interface JudgeSuccess {
  success: true;
  model: string;
  result: JudgeResult;
}

/**
 * A teljes single-turn teszteredmény.
 */
interface EvaluationResult {
  answer: string;
  answerModel: string;
  promptVariant: PromptVariant;
  responseTime: number;
  resultCount: number;
  contextCount: number;
  sources: Source[];
  judgeModel: string;
  judge: JudgeResult;
}

/**
 * A mentési API válaszának típusa.
 */
interface SaveResponse {
  success: boolean;
  fileName?: string;
  message?: string;
}

/**
 * Grafikus Evaluációs Központ.
 *
 * Jelenleg a single-turn teszt működik.
 * A többi teszttípus később kerül bekapcsolásra.
 */
export default function EvaluationDashboard() {
  const [evaluationType, setEvaluationType] =
    useState<EvaluationType>("single-turn");

  const [promptVariant, setPromptVariant] =
    useState<PromptVariant>("strict");

  const [question, setQuestion] = useState(
    "Ajánlj egy gyors húsmentes vacsorát!"
  );

  const [expectedBehavior, setExpectedBehavior] = useState(
    "Az asszisztens kizárólag a receptadatbázis alapján válaszoljon."
  );

  const [result, setResult] =
    useState<EvaluationResult | null>(null);

  const [savedFileName, setSavedFileName] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [isRunning, setIsRunning] = useState(false);

  /**
   * Lefuttatja a single-turn tesztet.
   *
   * A folyamat:
   * 1. Meghívja a receptasszisztenst.
   * 2. Megméri a válaszidőt.
   * 3. Az LLM Judge értékeli a választ.
   * 4. Megjeleníti az eredményt.
   * 5. Külön JSON-fájlba menti a futtatást.
   */
  async function runTest() {
    const normalizedQuestion = question.trim();
    const normalizedExpectation = expectedBehavior.trim();

    if (!normalizedQuestion) {
      setError("A tesztkérdés nem lehet üres.");
      return;
    }

    if (evaluationType !== "single-turn") {
      setError(
        "Jelenleg csak a single-turn evaluáció használható."
      );
      return;
    }

    setIsRunning(true);
    setResult(null);
    setSavedFileName("");
    setError("");
    setStatus("A receptasszisztens válaszol...");

    const startTime = performance.now();

    try {
      /*
       * 1. A meglévő receptasszisztens meghívása.
       */
      const chatResponse = await fetch("/api/chat", {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          message: normalizedQuestion,
          systemPromptVariant: promptVariant,
        }),
      });

      const chatData = (await chatResponse.json()) as
        | ChatSuccess
        | ApiError;

      /*
       * A chat API esetleges hibájának kezelése.
       */
      if (!chatResponse.ok || !chatData.success) {
        const message =
          !chatData.success
            ? chatData.error?.message ||
              chatData.message ||
              "A receptasszisztens futtatása sikertelen."
            : "A receptasszisztens futtatása sikertelen.";

        throw new Error(message);
      }

      /*
       * Csak a receptasszisztens válaszidejét mérjük.
       * A Judge futási ideje nem kerül bele.
       */
      const responseTime = performance.now() - startTime;

      setStatus("Az LLM Judge értékeli a választ...");

      /*
       * 2. Az asszisztens válaszának automatikus értékelése.
       */
      const judgeResponse = await fetch(
        "/api/evaluation/judge",
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
          },

          body: JSON.stringify({
            question: normalizedQuestion,
            answer: chatData.answer,
            expectedBehavior: normalizedExpectation,
          }),
        }
      );

      const judgeData = (await judgeResponse.json()) as
        | JudgeSuccess
        | ApiError;

      /*
       * A Judge API esetleges hibájának kezelése.
       */
      if (!judgeResponse.ok || !judgeData.success) {
        const message =
          !judgeData.success
            ? judgeData.message ||
              judgeData.error?.message ||
              "Az LLM Judge értékelése sikertelen."
            : "Az LLM Judge értékelése sikertelen.";

        throw new Error(message);
      }

      /*
       * 3. A teljes teszteredmény összeállítása.
       */
      const completedResult: EvaluationResult = {
        answer: chatData.answer,
        answerModel: chatData.model,
        promptVariant: chatData.systemPromptVariant,
        responseTime,
        resultCount: chatData.retrieval.resultCount,
        contextCount: chatData.retrieval.contextCount,
        sources: chatData.sources,
        judgeModel: judgeData.model,
        judge: judgeData.result,
      };

      /*
       * Az eredmény azonnal megjelenik a weboldalon.
       */
      setResult(completedResult);

      setStatus("A teszteredmény mentése...");

      /*
       * 4. A teszteredmény elküldése
       * a szerveroldali fájlmentő API-nak.
       */
      const saveResponse = await fetch(
        "/api/evaluation/save",
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
          },

          body: JSON.stringify({
            evaluationType,
            question: normalizedQuestion,
            expectedBehavior: normalizedExpectation,
            ...completedResult,
          }),
        }
      );

      const saveData =
        (await saveResponse.json()) as SaveResponse;

      /*
       * A mentési hiba kezelése.
       */
      if (!saveResponse.ok || !saveData.success) {
        throw new Error(
          saveData.message ||
            "A teszt lefutott, de az eredmény mentése sikertelen."
        );
      }

      setSavedFileName(saveData.fileName ?? "");

      setStatus(
        "A teszt, az automatikus értékelés és a mentés elkészült."
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Ismeretlen hiba történt."
      );

      setStatus("");
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>
          Automatikus AI-evaluáció
        </p>

        <h1>Evaluációs Központ</h1>

        <p>
          A meglévő receptasszisztens tesztelése
          automatikus LLM as Judge értékeléssel.
        </p>
      </header>

      <section className={styles.panel}>
        <h2>Tesztbeállítások</h2>

        <label className={styles.field}>
          <span>Teszttípus</span>

          <select
            value={evaluationType}
            onChange={(event) =>
              setEvaluationType(
                event.target.value as EvaluationType
              )
            }
          >
            <option value="single-turn">
              Single-turn evaluáció
            </option>

            <option value="multi-turn" disabled>
              Multi-turn evaluáció, hamarosan
            </option>

            <option value="ab-test" disabled>
              Prompt A/B teszt, hamarosan
            </option>

            <option value="rag" disabled>
              RAG-szintű evaluáció, hamarosan
            </option>
          </select>
        </label>

        <label className={styles.field}>
          <span>System prompt</span>

          <select
            value={promptVariant}
            onChange={(event) =>
              setPromptVariant(
                event.target.value as PromptVariant
              )
            }
          >
            <option value="strict">
              Szigorúan forráshű
            </option>

            <option value="conversational">
              Beszélgető és ajánló
            </option>
          </select>
        </label>

        <label className={styles.field}>
          <span>Tesztkérdés</span>

          <textarea
            value={question}
            onChange={(event) =>
              setQuestion(event.target.value)
            }
            rows={4}
            maxLength={2000}
          />
        </label>

        <label className={styles.field}>
          <span>Elvárt viselkedés</span>

          <textarea
            value={expectedBehavior}
            onChange={(event) =>
              setExpectedBehavior(event.target.value)
            }
            rows={3}
            maxLength={2000}
          />
        </label>

        <button
          className={styles.runButton}
          type="button"
          onClick={runTest}
          disabled={isRunning || !question.trim()}
        >
          {isRunning
            ? "Teszt futtatása..."
            : "Teszt indítása"}
        </button>

        {status && (
          <p className={styles.status}>
            {status}
          </p>
        )}

        {savedFileName && (
          <p className={styles.savedFile}>
            Mentett eredmény:{" "}
            <strong>{savedFileName}</strong>
          </p>
        )}
      </section>

      {error && (
        <section className={styles.error}>
          <strong>Hiba:</strong> {error}
        </section>
      )}

      {result && (
        <>
          <section className={styles.panel}>
            <h2>Futtatási eredmény</h2>

            <div className={styles.metrics}>
              <Metric
                label="Teszttípus"
                value="Single-turn"
              />

              <Metric
                label="Válaszidő"
                value={`${(
                  result.responseTime / 1000
                ).toFixed(2)} s`}
              />

              <Metric
                label="Válaszmodell"
                value={result.answerModel}
              />

              <Metric
                label="Prompt"
                value={result.promptVariant}
              />

              <Metric
                label="Keresési találatok"
                value={String(result.resultCount)}
              />

              <Metric
                label="Kontextusok"
                value={String(result.contextCount)}
              />
            </div>

            <div className={styles.answer}>
              <h3>Asszisztens válasza</h3>

              <p>{result.answer}</p>
            </div>
          </section>

          <section className={styles.panel}>
            <h2>LLM as Judge értékelés</h2>

            <div className={styles.metrics}>
              <Metric
                label="Relevancia"
                value={`${result.judge.relevance}/5`}
              />

              <Metric
                label="Utasításkövetés"
                value={`${result.judge.instructionFollowing}/5`}
              />

              <Metric
                label="Megalapozottság"
                value={`${result.judge.groundedness}/5`}
              />

              <Metric
                label="Érthetőség"
                value={`${result.judge.clarity}/5`}
              />

              <Metric
                label="Összpontszám"
                value={`${result.judge.overallScore}/5`}
              />
            </div>

            <div
              className={
                result.judge.passed
                  ? styles.passed
                  : styles.failed
              }
            >
              {result.judge.passed
                ? "Megfelelt"
                : "Nem felelt meg"}
            </div>

            <div className={styles.answer}>
              <h3>A bíró indoklása</h3>

              <p>{result.judge.explanation}</p>

              <p>
                <strong>Judge modell:</strong>{" "}
                {result.judgeModel}
              </p>
            </div>
          </section>

          <section className={styles.panel}>
            <h2>RAG-források</h2>

            {result.sources.length === 0 ? (
              <p>Nem volt releváns keresési találat.</p>
            ) : (
              <ul className={styles.sourceList}>
                {result.sources.map((source) => (
                  <li key={source.chunkId}>
                    <strong>
                      {source.documentTitle ||
                        source.originalFilename}
                    </strong>

                    <span>
                      {" "}
                      | chunk: {source.chunkIndex}
                      {" | "}
                      hasonlóság:{" "}
                      {source.similarity.toFixed(3)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

/**
 * Egyszerű eredménykártya egy mérőszámhoz.
 */
function Metric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className={styles.metric}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}