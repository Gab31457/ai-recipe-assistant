"use client";

import { useState } from "react";
import styles from "./EvaluationDashboard.module.css";

// Az elérhető teszttípusok.
type EvaluationType =
  | "single-turn"
  | "ab-test"
  | "multi-turn"
  | "rag";

// A receptasszisztens rendszerprompt-változatai.
type PromptVariant = "strict" | "conversational";

// Egy RAG-forrás adatai.
interface Source {
  documentId: number;
  chunkId: number;
  chunkIndex: number;
  originalFilename: string;
  documentTitle: string | null;
  similarity: number;
}

// A chat API sikeres válasza.
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

// A chat vagy Judge API hibaválasza.
interface ApiError {
  success: false;
  message?: string;
  error?: {
    message: string;
  };
}

// Az LLM Judge értékelése.
interface JudgeResult {
  relevance: number;
  instructionFollowing: number;
  groundedness: number;
  clarity: number;
  overallScore: number;
  passed: boolean;
  explanation: string;
}

// A Judge API sikeres válasza.
interface JudgeSuccess {
  success: true;
  model: string;
  result: JudgeResult;
}

// Egy teljes tesztváltozat eredménye.
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

// A mentési API válasza.
interface SaveResponse {
  success: boolean;
  fileName?: string;
  message?: string;
}

// Az Evaluációs Központ fő komponense.
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

  const [singleResult, setSingleResult] =
    useState<EvaluationResult | null>(null);

  const [abResults, setAbResults] =
    useState<EvaluationResult[]>([]);

  const [savedFileName, setSavedFileName] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [isRunning, setIsRunning] = useState(false);

  // Lefuttatja az asszisztenst és az LLM Judge értékelést.
  async function runAssistantAndJudge(
    variant: PromptVariant,
    normalizedQuestion: string,
    normalizedExpectation: string
  ): Promise<EvaluationResult> {
    if (variant === "strict") {
      setStatus("A szigorúan forráshű változat fut...");
    } else {
      setStatus("A beszélgető és ajánló változat fut...");
    }

    const startTime = performance.now();

    const chatResponse = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: normalizedQuestion,
        systemPromptVariant: variant,
      }),
    });

    const chatContentType =
      chatResponse.headers.get("content-type") || "";

    if (!chatContentType.includes("application/json")) {
      throw new Error(
        "A chat API nem JSON-választ adott."
      );
    }

    const chatData = (await chatResponse.json()) as
      | ChatSuccess
      | ApiError;

    if (!chatResponse.ok || !chatData.success) {
      const message =
        !chatData.success
          ? chatData.error?.message ||
            chatData.message ||
            "A receptasszisztens futtatása sikertelen."
          : "A receptasszisztens futtatása sikertelen.";

      throw new Error(message);
    }

    const responseTime = performance.now() - startTime;

    if (variant === "strict") {
      setStatus("Az LLM Judge értékeli az A változatot...");
    } else {
      setStatus("Az LLM Judge értékeli a B változatot...");
    }

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

    const judgeContentType =
      judgeResponse.headers.get("content-type") || "";

    if (!judgeContentType.includes("application/json")) {
      throw new Error(
        "A Judge API nem JSON-választ adott."
      );
    }

    const judgeData = (await judgeResponse.json()) as
      | JudgeSuccess
      | ApiError;

    if (!judgeResponse.ok || !judgeData.success) {
      const message =
        !judgeData.success
          ? judgeData.message ||
            judgeData.error?.message ||
            "Az LLM Judge értékelése sikertelen."
          : "Az LLM Judge értékelése sikertelen.";

      throw new Error(message);
    }

    return {
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
  }

  // A teszteredményt elküldi a fájlmentő API-nak.
  async function saveEvaluation(data: object) {
    setStatus("A teszteredmény mentése...");

    const saveResponse = await fetch(
      "/api/evaluation/save",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      }
    );

    const saveContentType =
      saveResponse.headers.get("content-type") || "";

    if (!saveContentType.includes("application/json")) {
      throw new Error(
        "A mentési API nem JSON-választ adott."
      );
    }

    const saveData =
      (await saveResponse.json()) as SaveResponse;

    if (!saveResponse.ok || !saveData.success) {
      throw new Error(
        saveData.message ||
          "A teszteredmény mentése sikertelen."
      );
    }

    setSavedFileName(saveData.fileName ?? "");
  }

  // Lefuttatja a kiválasztott teszttípust.
  async function runTest() {
    const normalizedQuestion = question.trim();
    const normalizedExpectation = expectedBehavior.trim();

    if (!normalizedQuestion) {
      setError("A tesztkérdés nem lehet üres.");
      return;
    }

    setIsRunning(true);
    setSingleResult(null);
    setAbResults([]);
    setSavedFileName("");
    setStatus("");
    setError("");

    try {
      if (evaluationType === "single-turn") {
        const result = await runAssistantAndJudge(
          promptVariant,
          normalizedQuestion,
          normalizedExpectation
        );

        setSingleResult(result);

        await saveEvaluation({
          evaluationType: "single-turn",
          question: normalizedQuestion,
          expectedBehavior: normalizedExpectation,
          result,
        });

        setStatus(
          "A single-turn teszt és a mentés elkészült."
        );

        return;
      }

      if (evaluationType === "ab-test") {
        const strictResult = await runAssistantAndJudge(
          "strict",
          normalizedQuestion,
          normalizedExpectation
        );

        const conversationalResult =
          await runAssistantAndJudge(
            "conversational",
            normalizedQuestion,
            normalizedExpectation
          );

        const results = [
          strictResult,
          conversationalResult,
        ];

        setAbResults(results);

        await saveEvaluation({
          evaluationType: "ab-test",
          question: normalizedQuestion,
          expectedBehavior: normalizedExpectation,
          results,
        });

        setStatus(
          "Az A/B teszt és az eredmények mentése elkészült."
        );

        return;
      }

      throw new Error(
        "Ez a teszttípus még nem használható."
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
          Single-turn és prompt A/B tesztelés
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
            disabled={isRunning}
          >
            <option value="single-turn">
              Single-turn evaluáció
            </option>

            <option value="ab-test">
              Prompt A/B teszt
            </option>

            <option value="multi-turn" disabled>
              Multi-turn evaluáció, hamarosan
            </option>

            <option value="rag" disabled>
              RAG-szintű evaluáció, hamarosan
            </option>
          </select>
        </label>

        {evaluationType === "single-turn" && (
          <label className={styles.field}>
            <span>System prompt</span>

            <select
              value={promptVariant}
              onChange={(event) =>
                setPromptVariant(
                  event.target.value as PromptVariant
                )
              }
              disabled={isRunning}
            >
              <option value="strict">
                Szigorúan forráshű
              </option>

              <option value="conversational">
                Beszélgető és ajánló
              </option>
            </select>
          </label>
        )}

        {evaluationType === "ab-test" && (
          <div className={styles.answer}>
            <strong>A/B teszt</strong>

            <p>
              Ugyanaz a kérdés lefut a szigorúan
              forráshű és a beszélgető, ajánló
              prompttal is.
            </p>
          </div>
        )}

        <label className={styles.field}>
          <span>Tesztkérdés</span>

          <textarea
            value={question}
            onChange={(event) =>
              setQuestion(event.target.value)
            }
            rows={4}
            maxLength={2000}
            disabled={isRunning}
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
            disabled={isRunning}
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

      {singleResult && (
        <ResultPanel
          title="Single-turn eredmény"
          result={singleResult}
        />
      )}

      {abResults.length === 2 && (
        <>
          <section className={styles.panel}>
            <h2>A/B összehasonlítás</h2>

            <div className={styles.metrics}>
              <Metric
                label="A változat pontszáma"
                value={`${abResults[0].judge.overallScore}/5`}
              />

              <Metric
                label="B változat pontszáma"
                value={`${abResults[1].judge.overallScore}/5`}
              />

              <Metric
                label="Pontszámkülönbség"
                value={(
                  abResults[1].judge.overallScore -
                  abResults[0].judge.overallScore
                ).toFixed(2)}
              />

              <Metric
                label="Gyorsabb változat"
                value={
                  abResults[0].responseTime <=
                  abResults[1].responseTime
                    ? "A változat"
                    : "B változat"
                }
              />
            </div>

            <p>
              <strong>A változat:</strong>{" "}
              szigorúan forráshű
            </p>

            <p>
              <strong>B változat:</strong>{" "}
              beszélgető és ajánló
            </p>
          </section>

          <ResultPanel
            title="A változat: Szigorúan forráshű"
            result={abResults[0]}
          />

          <ResultPanel
            title="B változat: Beszélgető és ajánló"
            result={abResults[1]}
          />
        </>
      )}
    </div>
  );
}

// Egy tesztváltozat teljes eredményét jeleníti meg.
function ResultPanel({
  title,
  result,
}: {
  title: string;
  result: EvaluationResult;
}) {
  return (
    <>
      <section className={styles.panel}>
        <h2>{title}</h2>

        <div className={styles.metrics}>
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
  );
}

// Egy mérőszámot jelenít meg.
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