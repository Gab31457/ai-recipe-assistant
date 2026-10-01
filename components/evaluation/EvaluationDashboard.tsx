"use client";

import { useState } from "react";
import styles from "./EvaluationDashboard.module.css";
import HumanReviewForm from "./HumanReviewForm";
import {
  evaluateRagResult,
  type RagCheckResult,
} from "../../lib/evaluation/rag-evaluation";

type EvaluationType =
  | "single-turn"
  | "ab-test"
  | "multi-turn"
  | "rag";

type PromptVariant = "strict" | "conversational";

interface Source {
  documentId: number;
  chunkId: number;
  chunkIndex: number;
  originalFilename: string;
  documentTitle: string | null;
  similarity: number;
}

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

interface ApiError {
  success: false;
  message?: string;
  error?: {
    message: string;
  };
}

interface JudgeResult {
  relevance: number;
  instructionFollowing: number;
  groundedness: number;
  clarity: number;
  contextRetention: number;
  consistency: number;
  overallScore: number;
  passed: boolean;
  explanation: string;
}

interface JudgeSuccess {
  success: true;
  model: string;
  result: JudgeResult;
}

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

interface ConversationTurn {
  user: string;
  assistant: string;
}

interface MultiTurnResult {
  turns: ConversationTurn[];
  finalEvaluation: EvaluationResult;
  totalResponseTime: number;
}

interface RagEvaluationResult {
  evaluation: EvaluationResult;
  ragCheck: RagCheckResult;
  expectedSource: string;
  minimumSimilarity: number;
}

interface SaveResponse {
  success: boolean;
  fileName?: string;
  message?: string;
}

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

  const [expectedSource, setExpectedSource] = useState("");

  const [minimumSimilarity, setMinimumSimilarity] =
    useState(0.5);

  const [multiTurnQuestions, setMultiTurnQuestions] = useState([
    "Ajánlj egy egyszerű vacsorát!",
    "Legyen húsmentes.",
    "Tejterméket sem fogyaszthatok. Mit ajánlasz az eddigi feltételek alapján?",
  ]);

  const [singleResult, setSingleResult] =
    useState<EvaluationResult | null>(null);

  const [abResults, setAbResults] =
    useState<EvaluationResult[]>([]);

  const [multiTurnResult, setMultiTurnResult] =
    useState<MultiTurnResult | null>(null);

  const [ragResult, setRagResult] =
    useState<RagEvaluationResult | null>(null);

  const [savedFileName, setSavedFileName] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [isRunning, setIsRunning] = useState(false);
// Meghatározza az utolsó futtatás Judge-eredményét.
const currentJudgePassed =
  singleResult?.judge.passed ??
  multiTurnResult?.finalEvaluation.judge.passed ??
  ragResult?.evaluation.judge.passed ??
  (abResults.length === 2
    ? abResults[0].judge.passed &&
      abResults[1].judge.passed
    : false);

  // Meghívja a meglévő receptasszisztens API-t.
  async function requestChat(
    message: string,
    variant: PromptVariant
  ) {
    const startTime = performance.now();

    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message,
        systemPromptVariant: variant,
      }),
    });

    const contentType =
      response.headers.get("content-type") || "";

    if (!contentType.includes("application/json")) {
      throw new Error(
        "A chat API nem JSON-választ adott."
      );
    }

    const data = (await response.json()) as
      | ChatSuccess
      | ApiError;

    if (!response.ok || !data.success) {
      const message =
        !data.success
          ? data.error?.message ||
            data.message ||
            "A receptasszisztens futtatása sikertelen."
          : "A receptasszisztens futtatása sikertelen.";

      throw new Error(message);
    }

    return {
      data,
      responseTime: performance.now() - startTime,
    };
  }

  // Meghívja az LLM as Judge API-t.
  async function requestJudge({
    evaluationType,
    question,
    answer,
    conversation,
    expectedBehavior,
  }: {
    evaluationType: "single-turn" | "multi-turn";
    question?: string;
    answer: string;
    conversation?: string;
    expectedBehavior: string;
  }) {
    const response = await fetch(
      "/api/evaluation/judge",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          evaluationType,
          question,
          answer,
          conversation,
          expectedBehavior,
        }),
      }
    );

    const contentType =
      response.headers.get("content-type") || "";

    if (!contentType.includes("application/json")) {
      throw new Error(
        "A Judge API nem JSON-választ adott."
      );
    }

    const data = (await response.json()) as
      | JudgeSuccess
      | ApiError;

    if (!response.ok || !data.success) {
      const message =
        !data.success
          ? data.message ||
            data.error?.message ||
            "Az LLM Judge értékelése sikertelen."
          : "Az LLM Judge értékelése sikertelen.";

      throw new Error(message);
    }

    return data;
  }

  // Lefuttatja az asszisztenst és a Judge értékelést.
  async function runAssistantAndJudge(
    variant: PromptVariant,
    normalizedQuestion: string,
    normalizedExpectation: string
  ): Promise<EvaluationResult> {
    setStatus(
      variant === "strict"
        ? "A szigorúan forráshű változat fut..."
        : "A beszélgető és ajánló változat fut..."
    );

    const chat = await requestChat(
      normalizedQuestion,
      variant
    );

    setStatus("Az LLM Judge értékeli a választ...");

    const judge = await requestJudge({
      evaluationType: "single-turn",
      question: normalizedQuestion,
      answer: chat.data.answer,
      expectedBehavior: normalizedExpectation,
    });

    return {
      answer: chat.data.answer,
      answerModel: chat.data.model,
      promptVariant: chat.data.systemPromptVariant,
      responseTime: chat.responseTime,
      resultCount: chat.data.retrieval.resultCount,
      contextCount: chat.data.retrieval.contextCount,
      sources: chat.data.sources,
      judgeModel: judge.model,
      judge: judge.result,
    };
  }

  // Elkészíti a következő Multi-turn forduló rövid üzenetét.
  function createMultiTurnMessage(
    turns: ConversationTurn[],
    currentQuestion: string
  ) {
    if (turns.length === 0) {
      return currentQuestion.slice(0, 1900);
    }

    const previousUserRequests = turns
      .map((turn, index) => {
        const shortenedRequest = turn.user.slice(0, 300);

        return (
          `${index + 1}. korábbi kérés: ` +
          shortenedRequest
        );
      })
      .join("\n");

    const shortenedCurrentQuestion =
      currentQuestion.slice(0, 900);

    const message =
      "Korábbi felhasználói feltételek:\n" +
      previousUserRequests +
      "\n\nAktuális kérés:\n" +
      shortenedCurrentQuestion +
      "\n\nVedd figyelembe az összes korábbi feltételt.";

    return message.slice(0, 1900);
  }

  // Lefuttatja a teljes Multi-turn beszélgetést.
  async function runMultiTurnTest(
    questions: string[],
    expectation: string
  ): Promise<MultiTurnResult> {
    const turns: ConversationTurn[] = [];

    let totalResponseTime = 0;
    let lastChat: ChatSuccess | null = null;
    let lastResponseTime = 0;

    for (
      let turnIndex = 0;
      turnIndex < questions.length;
      turnIndex += 1
    ) {
      const currentQuestion = questions[turnIndex];

      setStatus(
        `Multi-turn teszt: ${turnIndex + 1}. forduló fut...`
      );

      const multiTurnMessage = createMultiTurnMessage(
        turns,
        currentQuestion
      );

      const chat = await requestChat(
        multiTurnMessage,
        promptVariant
      );

      lastChat = chat.data;
      lastResponseTime = chat.responseTime;
      totalResponseTime += chat.responseTime;

      turns.push({
        user: currentQuestion,
        assistant: chat.data.answer,
      });
    }

    if (!lastChat || turns.length === 0) {
      throw new Error(
        "A multi-turn beszélgetés nem adott eredményt."
      );
    }

    setStatus(
      "Az LLM Judge értékeli a teljes beszélgetést..."
    );

    const conversationText = turns
      .map(
        (turn, index) =>
          `${index + 1}. forduló\n` +
          `Felhasználó: ${turn.user}\n` +
          `Asszisztens: ${turn.assistant}`
      )
      .join("\n\n");

    const finalAnswer =
      turns[turns.length - 1].assistant;

    const judge = await requestJudge({
      evaluationType: "multi-turn",
      answer: finalAnswer,
      conversation: conversationText,
      expectedBehavior: expectation,
    });

    const finalEvaluation: EvaluationResult = {
      answer: finalAnswer,
      answerModel: lastChat.model,
      promptVariant: lastChat.systemPromptVariant,
      responseTime: lastResponseTime,
      resultCount: lastChat.retrieval.resultCount,
      contextCount: lastChat.retrieval.contextCount,
      sources: lastChat.sources,
      judgeModel: judge.model,
      judge: judge.result,
    };

    return {
      turns,
      finalEvaluation,
      totalResponseTime,
    };
  }

  // Külön JSON-fájlba menti a teszteredményt.
  async function saveEvaluation(data: object) {
    setStatus("A teszteredmény mentése...");

    const response = await fetch(
      "/api/evaluation/save",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      }
    );

    const contentType =
      response.headers.get("content-type") || "";

    if (!contentType.includes("application/json")) {
      throw new Error(
        "A mentési API nem JSON-választ adott."
      );
    }

    const dataFromApi =
      (await response.json()) as SaveResponse;

    if (!response.ok || !dataFromApi.success) {
      throw new Error(
        dataFromApi.message ||
          "A teszteredmény mentése sikertelen."
      );
    }

    setSavedFileName(dataFromApi.fileName ?? "");
  }

  // Lefuttatja a kiválasztott teszttípust.
  async function runTest() {
    const normalizedQuestion = question.trim();
    const normalizedExpectation = expectedBehavior.trim();

    setIsRunning(true);
    setSingleResult(null);
    setAbResults([]);
    setMultiTurnResult(null);
    setRagResult(null);
    setSavedFileName("");
    setStatus("");
    setError("");

    try {
      if (evaluationType === "single-turn") {
        if (!normalizedQuestion) {
          throw new Error(
            "A tesztkérdés nem lehet üres."
          );
        }

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
        if (!normalizedQuestion) {
          throw new Error(
            "A tesztkérdés nem lehet üres."
          );
        }

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
          "Az A/B teszt és a mentés elkészült."
        );

        return;
      }

      if (evaluationType === "multi-turn") {
        const questions = multiTurnQuestions
          .map((item) => item.trim())
          .filter(Boolean);

        if (questions.length < 2) {
          throw new Error(
            "Legalább két beszélgetési fordulót adj meg."
          );
        }

        const result = await runMultiTurnTest(
          questions,
          normalizedExpectation
        );

        setMultiTurnResult(result);

        await saveEvaluation({
          evaluationType: "multi-turn",
          promptVariant,
          expectedBehavior: normalizedExpectation,
          questions,
          turns: result.turns,
          totalResponseTime: result.totalResponseTime,
          finalEvaluation: result.finalEvaluation,
        });

        setStatus(
          "A multi-turn teszt és a mentés elkészült."
        );

        return;
      }

      if (evaluationType === "rag") {
        if (!normalizedQuestion) {
          throw new Error(
            "A tesztkérdés nem lehet üres."
          );
        }

        if (
          minimumSimilarity < 0 ||
          minimumSimilarity > 1
        ) {
          throw new Error(
            "A minimális hasonlóság 0 és 1 közötti érték legyen."
          );
        }

        setStatus("A RAG-teszt fut...");

        const evaluation =
          await runAssistantAndJudge(
            promptVariant,
            normalizedQuestion,
            normalizedExpectation
          );

        const ragCheck = evaluateRagResult({
          sources: evaluation.sources,
          resultCount: evaluation.resultCount,
          contextCount: evaluation.contextCount,
          expectedSource: expectedSource.trim(),
          minimumSimilarity,
        });

        const completedRagResult = {
          evaluation,
          ragCheck,
          expectedSource: expectedSource.trim(),
          minimumSimilarity,
        };

        setRagResult(completedRagResult);

        await saveEvaluation({
          evaluationType: "rag",
          question: normalizedQuestion,
          expectedBehavior: normalizedExpectation,
          expectedSource: expectedSource.trim(),
          minimumSimilarity,
          evaluation,
          ragCheck,
        });

        setStatus(
          "A RAG-szintű teszt és a mentés elkészült."
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

  // Módosítja valamelyik Multi-turn kérdést.
  function updateMultiTurnQuestion(
    index: number,
    value: string
  ) {
    setMultiTurnQuestions((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? value : item
      )
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>
          Automatikus AI-evaluáció
        </p>

        <h1>Evaluációs Központ</h1>

        <p>
          Single-turn, A/B, Multi-turn és RAG-szintű
          tesztelés automatikus értékeléssel.
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

            <option value="multi-turn">
              Multi-turn evaluáció
            </option>

            <option value="rag">
              RAG-szintű evaluáció
            </option>
          </select>
        </label>

        {evaluationType !== "ab-test" && (
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
              A kérdés mindkét rendszerprompttal
              automatikusan lefut.
            </p>
          </div>
        )}

        {evaluationType !== "multi-turn" && (
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
        )}

        {evaluationType === "multi-turn" && (
          <div>
            <div className={styles.answer}>
              <strong>Multi-turn beszélgetés</strong>

              <p>
                A fordulók egymásra épülnek, és a
                korábbi felhasználói feltételek
                továbbadásra kerülnek.
              </p>
            </div>

            {multiTurnQuestions.map(
              (turnQuestion, index) => (
                <label
                  className={styles.field}
                  key={index}
                >
                  <span>
                    {index + 1}. felhasználói forduló
                  </span>

                  <textarea
                    value={turnQuestion}
                    onChange={(event) =>
                      updateMultiTurnQuestion(
                        index,
                        event.target.value
                      )
                    }
                    rows={3}
                    maxLength={900}
                    disabled={isRunning}
                  />
                </label>
              )
            )}
          </div>
        )}

        {evaluationType === "rag" && (
          <>
            <label className={styles.field}>
              <span>
                Elvárt dokumentum vagy recept neve
              </span>

              <input
                type="text"
                value={expectedSource}
                onChange={(event) =>
                  setExpectedSource(event.target.value)
                }
                placeholder="Például: túrós palacsinta"
                disabled={isRunning}
              />
            </label>

            <label className={styles.field}>
              <span>
                Minimális hasonlóság:{" "}
                {minimumSimilarity.toFixed(2)}
              </span>

              <input
                type="number"
                min="0"
                max="1"
                step="0.05"
                value={minimumSimilarity}
                onChange={(event) =>
                  setMinimumSimilarity(
                    Number(event.target.value)
                  )
                }
                disabled={isRunning}
              />
            </label>
          </>
        )}

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
          disabled={isRunning}
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
          showMultiTurnScores={false}
        />
      )}

      {abResults.length === 2 && (
        <>
          <section className={styles.panel}>
            <h2>A/B összehasonlítás</h2>

            <div className={styles.metrics}>
              <Metric
                label="A változat"
                value={`${abResults[0].judge.overallScore}/5`}
              />

              <Metric
                label="B változat"
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
          </section>

          <ResultPanel
            title="A változat: Szigorúan forráshű"
            result={abResults[0]}
            showMultiTurnScores={false}
          />

          <ResultPanel
            title="B változat: Beszélgető és ajánló"
            result={abResults[1]}
            showMultiTurnScores={false}
          />
        </>
      )}

      {multiTurnResult && (
        <>
          <section className={styles.panel}>
            <h2>Multi-turn beszélgetés</h2>

            <div className={styles.metrics}>
              <Metric
                label="Fordulók száma"
                value={String(
                  multiTurnResult.turns.length
                )}
              />

              <Metric
                label="Teljes válaszidő"
                value={`${(
                  multiTurnResult.totalResponseTime /
                  1000
                ).toFixed(2)} s`}
              />

              <Metric
                label="Kontextusmegőrzés"
                value={
                  `${multiTurnResult.finalEvaluation.judge.contextRetention}/5`
                }
              />

              <Metric
                label="Következetesség"
                value={
                  `${multiTurnResult.finalEvaluation.judge.consistency}/5`
                }
              />
            </div>

            {multiTurnResult.turns.map(
              (turn, index) => (
                <div
                  className={styles.answer}
                  key={index}
                >
                  <h3>{index + 1}. forduló</h3>

                  <p>
                    <strong>Felhasználó:</strong>{" "}
                    {turn.user}
                  </p>

                  <p>
                    <strong>Asszisztens:</strong>{" "}
                    {turn.assistant}
                  </p>
                </div>
              )
            )}
          </section>

          <ResultPanel
            title="Multi-turn összesített értékelés"
            result={multiTurnResult.finalEvaluation}
            showMultiTurnScores
          />
        </>
      )}

      {ragResult && (
        <>
          <section className={styles.panel}>
            <h2>RAG-szintű ellenőrzés</h2>

            <div className={styles.metrics}>
              <Metric
                label="Keresési találat"
                value={
                  ragResult.ragCheck.hasResults
                    ? "Igen"
                    : "Nem"
                }
              />

              <Metric
                label="RAG-kontextus"
                value={
                  ragResult.ragCheck.hasContext
                    ? "Igen"
                    : "Nem"
                }
              />

              <Metric
                label="Elvárt forrás"
                value={
                  ragResult.ragCheck.expectedSourceFound
                    ? "Megtalálva"
                    : "Nincs találat"
                }
              />

              <Metric
                label="Legjobb hasonlóság"
                value={
                  ragResult.ragCheck.bestSimilarity.toFixed(3)
                }
              />

              <Metric
                label="Minimum küszöb"
                value={
                  ragResult.minimumSimilarity.toFixed(3)
                }
              />
            </div>

            <div
              className={
                ragResult.ragCheck.passed
                  ? styles.passed
                  : styles.failed
              }
            >
              {ragResult.ragCheck.passed
                ? "A RAG-teszt megfelelt"
                : "A RAG-teszt nem felelt meg"}
            </div>

            <div className={styles.answer}>
              <h3>Szabályalapú értékelés</h3>

              <p>
                {ragResult.ragCheck.explanation}
              </p>

              <p>
                <strong>Elvárt dokumentum:</strong>{" "}
                {ragResult.expectedSource ||
                  "Nem volt külön megadva"}
              </p>
            </div>
          </section>

          <ResultPanel
            title="RAG-teszt asszisztensértékelése"
            result={ragResult.evaluation}
            showMultiTurnScores={false}
          />
        </>
      )}
            {savedFileName && (
        <HumanReviewForm
          key={savedFileName}
          evaluationFileName={savedFileName}
          judgePassed={currentJudgePassed}
        />
      )}
    </div>
  );
}

function ResultPanel({
  title,
  result,
  showMultiTurnScores,
}: {
  title: string;
  result: EvaluationResult;
  showMultiTurnScores: boolean;
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
            value={
              `${result.judge.instructionFollowing}/5`
            }
          />

          <Metric
            label="Megalapozottság"
            value={`${result.judge.groundedness}/5`}
          />

          <Metric
            label="Érthetőség"
            value={`${result.judge.clarity}/5`}
          />

          {showMultiTurnScores && (
            <>
              <Metric
                label="Kontextusmegőrzés"
                value={
                  `${result.judge.contextRetention}/5`
                }
              />

              <Metric
                label="Következetesség"
                value={`${result.judge.consistency}/5`}
              />
            </>
          )}

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